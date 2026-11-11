import {gauss,shape,roots,polynomial,solveBeam,type BeamInput,type BeamResult} from './beam';
import {evaluateSpring,springLawAtDepth,equivalentLayers} from './nonlinear-soil';
import type {AnalysisMode,LayerCorrection,SoilSpringProfile,EquivalentLayer,SpringState,SpringLaw,ConvergenceInfo} from './spring-types';

type Options={maxIterations?:number;loadSteps?:number;tolerance?:number};
type Point={z:number;weight:number;n:number[];law:SpringLaw|null;equivalentDepth:number;layer:number};
type Element={a:number;b:number;kb:number[][];q:number;points:Point[]};

/** Symmetrisch geschaalde band-Cholesky; ligger-elementen koppelen maximaal vier opeenvolgende vrijheidsgraden. */
function solveIncrement(band:Float64Array[],residual:Float64Array,free:number[]):number[] {
 const n=free.length,l=Array.from({length:n},()=>new Float64Array(4)),scale=free.map(i=>Math.sqrt(band[i][0]));
 if(scale.some(v=>!(v>0)||!Number.isFinite(v)))throw new Error('Instabiele tangentstijfheid.');
 const at=(i:number,j:number)=>i>=j&&i-j<=3?l[i][i-j]:0;
 for(let i=0;i<n;i++)for(let j=Math.max(0,i-3);j<=i;j++){
  const delta=free[i]-free[j];let s=(delta<=3?band[free[i]][delta]:0)/(scale[i]*scale[j]);
  for(let k=Math.max(0,i-3,j-3);k<j;k++)s-=at(i,k)*at(j,k);
  if(i===j){if(!(s>1e-13))throw new Error('Instabiel model: tangentweerstand uitgeput.');l[i][0]=Math.sqrt(s);}
  else l[i][i-j]=s/l[j][0];
 }
 const y=new Float64Array(n),x=new Float64Array(n);
 for(let i=0;i<n;i++){let s=-residual[free[i]]/scale[i];for(let j=Math.max(0,i-3);j<i;j++)s-=at(i,j)*y[j];y[i]=s/l[i][0];}
 for(let i=n-1;i>=0;i--){let s=y[i];for(let j=i+1;j<=Math.min(n-1,i+3);j++)s-=at(j,i)*x[j];x[i]=s/l[i][0];}
 return Array.from(x,(v,i)=>v/scale[i]);
}
const gaussT=gauss.map(([g])=>(g+1)/2);
const lagrange=gaussT.map((v,i)=>{
 let c=[1],denominator=1;
 gaussT.forEach((w,j)=>{if(i===j)return;const next=Array(c.length+1).fill(0);c.forEach((x,k)=>{next[k]-=w*x;next[k+1]+=x;});c=next;denominator*=v-w;});
 return c.map(x=>x/denominator);
});

export function solveFoundationBeam(input:BeamInput,profiles:SoilSpringProfile[],equivalents:EquivalentLayer[],mode:AnalysisMode,correction:LayerCorrection,options:Options={}):BeamResult&{springs:SpringState[];convergence:ConvergenceInfo} {
 const maxIterations=options.maxIterations??40,initialSteps=options.loadSteps??8,tol=options.tolerance??1e-7;
 if(!Number.isInteger(maxIterations)||maxIterations<1||maxIterations>200||!Number.isInteger(initialSteps)||initialSteps<1||initialSteps>100||!Number.isFinite(tol)||tol<=0||tol>1e-3)
  throw new Error('Ongeldige iteratie-instellingen.');
 if(!['linear','nonlinear'].includes(mode)||!['none','georgiadis'].includes(correction)||profiles.length!==equivalents.length)throw new Error('Ongeldig grondmodel.');
 const orderedLayers=[...input.layers].sort((a,b)=>a.topM-b.topM),expectedEquivalent=equivalentLayers(profiles,correction);
 const close=(a:number,b:number)=>Number.isFinite(a)&&Number.isFinite(b)&&Math.abs(a-b)<=1e-9*Math.max(1,Math.abs(a),Math.abs(b));
 if(orderedLayers.length!==profiles.length||profiles.some((p,i)=>!close(p.topM,orderedLayers[i].topM)||!close(p.bottomM,orderedLayers[i].bottomM)||!close(p.initialKnM2,orderedLayers[i].lineSpringKnM2)))
  throw new Error('Grondprofiel en liggerlagen of initiële stijfheid komen niet overeen.');
 if(equivalents.some((e,i)=>!close(e.topEquivalentM,expectedEquivalent[i].topEquivalentM)||!close(e.bottomEquivalentM,expectedEquivalent[i].bottomEquivalentM)||!close(e.cumulativeUltimateKn,expectedEquivalent[i].cumulativeUltimateKn)))
  throw new Error('Equivalente diepten komen niet overeen met de gekozen laagcorrectie.');
 // Bestaande invoer- en stabiliteitsvalidatie levert exact hetzelfde elementnet.
 const seed=solveBeam(input),zs=seed.nodes.map(n=>n.zM),nd=zs.length*2,L=input.lengthM;
 const F=new Float64Array(nd);F[0]=input.headForceKn;F[1]=input.headMomentKnM;
 const elements:Element[]=zs.slice(0,-1).map((a,e)=>{
  const b=zs[e+1],l=b-a,mid=(a+b)/2;
  const layer=input.layers.find(v=>v.topM<=mid&&v.bottomM>=mid),layerIndex=profiles.findIndex(v=>v.topM<=mid&&v.bottomM>=mid),q=layer?.lineLoadKnM??0;
  const kb=[[12,6*l,-12,6*l],[6*l,4*l*l,-6*l,2*l*l],[-12,-6*l,12,-6*l],[6*l,2*l*l,-6*l,4*l*l]].map(r=>r.map(v=>v*input.eiKnM2/l**3));
  const points=gauss.map(([g,w])=>{
   const t=(g+1)/2,z=a+l*t,weight=w*l/2,n=shape(t,l),model=layerIndex>=0?springLawAtDepth(profiles,equivalents,layerIndex,z,mode):null;
   for(let i=0;i<4;i++)F[2*e+i]+=n[i]*q*weight;
   return {z,weight,n,law:model?.law??null,equivalentDepth:model?.equivalentDepthM??z,layer:layerIndex};
  });
  return {a,b,kb,q,points};
 });
 const fixed=new Set<number>();if(input.headFixedRotation)fixed.add(1);if(input.toeFixed){fixed.add(nd-2);fixed.add(nd-1);}
 const free=Array.from({length:nd},(_,i)=>i).filter(i=>!fixed.has(i));
 const loadScale=Math.max(1,...Array.from(F,(v,i)=>Math.abs(v)/(i%2?L:1)));
 const norm=(r:Float64Array)=>Math.max(0,...free.map(i=>Math.abs(r[i])/(i%2?L:1)));
 function assemble(u:number[],factor:number,matrix:boolean){
  const residual=Float64Array.from(F,v=>-factor*v),band=matrix?Array.from({length:nd},()=>new Float64Array(4)):[];
  elements.forEach((el,e)=>{
   for(let i=0;i<4;i++)for(let j=0;j<4;j++){
    residual[2*e+i]+=el.kb[i][j]*u[2*e+j];
    if(matrix&&j<=i)band[2*e+i][i-j]+=el.kb[i][j];
   }
   for(const p of el.points){if(!p.law)continue;const y=p.n.reduce((s,v,j)=>s+v*u[2*e+j],0),r=evaluateSpring(p.law,y);
    for(let i=0;i<4;i++){residual[2*e+i]+=p.n[i]*r.resistanceKnM*p.weight;
     if(matrix)for(let j=0;j<=i;j++)band[2*e+i][i-j]+=p.n[i]*p.n[j]*r.tangentKnM2*p.weight;}
   }
  });
  if(!residual.every(Number.isFinite))throw new Error('Numerieke overloop in het niet-lineaire model.');
  return {residual,band};
 }
 let u=Array(nd).fill(0),factor=0,increment=mode==='linear'?1:1/initialSteps,iterations=0,loadSteps=0,cutbacks=0;
 // Ook bij nulbelasting moet de oplossing uniek bepaald zijn.
 solveIncrement(assemble(u,0,true).band,new Float64Array(nd),free);
 while(factor<1-1e-12){
  const target=Math.min(1,factor+increment);let trial=[...u],converged=false;
  for(let k=0;k<maxIterations;k++){
   const current=assemble(trial,target,true),r=norm(current.residual);
   if(r<=tol*loadScale){converged=true;break;}
   let du:number[];try{du=solveIncrement(current.band,current.residual,free);}catch{break;}
   iterations++;let improved=false;
   for(let alpha=1;alpha>=1/256;alpha/=2){
    const candidate=[...trial];free.forEach((i,j)=>candidate[i]+=alpha*du[j]);
    const nr=norm(assemble(candidate,target,false).residual);
    if(nr<r*(1-1e-4*alpha)||nr<=tol*loadScale){trial=candidate;improved=true;if(nr<=tol*loadScale)converged=true;break;}
   }
   if(converged||!improved)break;
  }
  if(converged){u=trial;factor=target;loadSteps++;cutbacks=0;increment=Math.min(1-factor,increment*1.5);}
  else {increment/=2;cutbacks++;if(cutbacks>12||increment<1/65536)throw new Error('Geen convergentie: controleer belasting, beschikbare grondweerstand en veerparameters.');}
  if(loadSteps>200)throw new Error('Geen convergentie binnen het maximale aantal belastingstappen.');
 }
 const final=assemble(u,1,false),residualKn=norm(final.residual);
 if(residualKn>tol*loadScale)throw new Error('Geen convergentie van het volledige belastingsgeval.');
 const springs:SpringState[]=[],samples:BeamResult['samples']=[];
 let soilForce=0,soilMoment=0,loadForce=input.headForceKn,loadMoment=input.headMomentKnM;
 const responseElements=elements.map((el,e)=>{
  const l=el.b-el.a,ue=u.slice(2*e,2*e+4),end=el.kb.map(row=>row.reduce((s,v,j)=>s+v*ue[j],0)),loads:number[]=[];
  let reaction=0;
  el.points.forEach((p,g)=>{
   const y=p.n.reduce((s,v,j)=>s+v*ue[j],0),r=p.law?evaluateSpring(p.law,y):{resistanceKnM:0,tangentKnM2:0,secantKnM2:0};
   const df=-r.resistanceKnM*p.weight;reaction+=df;soilMoment+=df*p.z;
   const net=el.q-r.resistanceKnM;loads.push(net);for(let j=0;j<4;j++)end[j]-=p.n[j]*net*p.weight;
   if(p.law){
    const limit=Math.max(.001,Math.abs(y)*1.2,p.law.kind==='hyperbolic'&&p.law.initialKnM2>0?4*(p.law.ultimateKnM??0)/p.law.initialKnM2:0);
    springs.push({...r,id:`e${e}:g${g}`,elementIndex:e,gaussIndex:g,layerIndex:p.layer,zM:p.z,equivalentDepthM:p.equivalentDepth,displacementM:y,tributaryLengthM:p.weight,
     initialKnM2:p.law.initialKnM2,ultimateKnM:p.law.ultimateKnM,mode,correction,
     modelLabel:mode==='linear'?'Lineaire bedding':'Hyperbolisch projectmodel',source:'k0 = kh × werkende breedte; pu-profiel = projectinvoer',
     formula:mode==='linear'?'p = k0 y':'p = pu tanh(k0 y / pu)',
     curvePoints:Array.from({length:61},(_,j)=>{const yM=limit*(j/30-1);return {yM,pKnM:evaluateSpring(p.law!,yM).resistanceKnM};})});
   }
  });
  soilForce+=reaction;loadForce+=el.q*l;loadMoment+=el.q*l*(el.a+el.b)/2;
  const pc=Array(4).fill(0);loads.forEach((p,g)=>lagrange[g].forEach((v,i)=>pc[i]+=p*v));
  const yc=[ue[0],l*ue[1],-3*ue[0]-2*l*ue[1]+3*ue[2]-l*ue[3],2*ue[0]+l*ue[1]-2*ue[2]+l*ue[3]];
  const vc=[-end[0],...pc.map((v,i)=>-l*v/(i+1))],mc=[-end[1],end[0]*l,...pc.map((v,i)=>l*l*v/((i+1)*(i+2)))];
  const positions=[...new Set([...Array.from({length:9},(_,j)=>j/8),...roots(vc),...roots(pc),...roots(yc.slice(1).map((v,j)=>v*(j+1)))])].sort((a,b)=>a-b);
  for(const t of positions){
   const zM=el.a+l*t,yM=polynomial(yc,t),layerIndex=el.points[0].layer;
   const local=layerIndex>=0?springLawAtDepth(profiles,equivalents,layerIndex,Math.max(profiles[layerIndex].topM,Math.min(profiles[layerIndex].bottomM,zM)),mode):null;
   samples.push({zM,yM,momentKnM:polynomial(mc,t),shearKn:polynomial(vc,t),reactionKnM:local?-evaluateSpring(local.law,yM).resistanceKnM:0});
  }
  return {topM:el.a,bottomM:el.b,momentTopKnM:-end[1],momentBottomKnM:end[3],shearTopKn:-end[0],shearBottomKn:end[2],soilReactionKn:reaction};
 });
 const toeReactionKn=input.toeFixed?final.residual[nd-2]:0,toeMomentKnM=input.toeFixed?final.residual[nd-1]:0,headReactionMomentKnM=input.headFixedRotation?final.residual[1]:0;
 return {nodes:zs.map((zM,i)=>({zM,yM:u[2*i],rotationRad:u[2*i+1]})),elements:responseElements,samples,springs,
  toeReactionKn,toeMomentKnM,headReactionMomentKnM,forceResidualKn:loadForce+soilForce+toeReactionKn,
  momentResidualKnM:loadMoment+soilMoment+toeReactionKn*L+toeMomentKnM+headReactionMomentKnM,
  convergence:{converged:true,iterations,loadSteps,residualKn,relativeResidual:residualKn/loadScale}};
}
