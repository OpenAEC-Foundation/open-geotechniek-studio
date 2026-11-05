/** Lineaire Euler–Bernoulli-ligger. z naar beneden, rotatie = dy/dz.
 * Eenheden: m, kN, kNm, EI in kNm²; bedding per lengte in kN/m².
 * Consistente bedding en lasten met vierpunts Gauss-integratie.
 */
export interface BeamLayer { topM: number; bottomM: number; lineSpringKnM2: number; lineLoadKnM: number }
export interface BeamInput {
  lengthM: number; eiKnM2: number; maxElementM: number;
  headForceKn: number; headMomentKnM: number;
  headFixedRotation: boolean; toeFixed: boolean; layers: BeamLayer[];
}
export interface BeamNode { zM: number; yM: number; rotationRad: number }
export interface BeamElement {
  topM: number; bottomM: number; momentTopKnM: number; momentBottomKnM: number;
  shearTopKn: number; shearBottomKn: number; soilReactionKn: number;
}
export interface BeamResult {
  nodes: BeamNode[]; elements: BeamElement[];
  samples: Array<{zM:number;yM:number;momentKnM:number;shearKn:number;reactionKnM:number}>;
  toeReactionKn: number; toeMomentKnM: number; headReactionMomentKnM: number;
  forceResidualKn: number; momentResidualKnM: number;
}
const gauss = [
  [-.8611363115940526, .3478548451374538], [-.3399810435848563, .6521451548625461],
  [.3399810435848563, .6521451548625461], [.8611363115940526, .3478548451374538],
];
function shape(t: number, l: number) {
  return [1 - 3*t*t + 2*t*t*t, l*(t - 2*t*t + t*t*t), 3*t*t - 2*t*t*t, l*(-t*t + t*t*t)];
}
const polynomial=(c:number[],t:number)=>c.reduceRight((s,v)=>s*t+v,0);
/** Alle reële nulpunten op [0,1], via monotone intervallen tussen afgeleide nulpunten. */
function roots(coefficients:number[]):number[] {
  const norm=Math.max(...coefficients.map(Math.abs));
  if(norm===0)return [];
  const c=coefficients.map(v=>v/norm);
  while(c.length>1&&Math.abs(c[c.length-1])<1e-14)c.pop();
  if(c.length<2)return [];
  const cuts=[0,...roots(c.slice(1).map((v,i)=>v*(i+1))).filter(t=>t>0&&t<1),1];
  const found=cuts.filter(t=>Math.abs(polynomial(c,t))<1e-12);
  for(let i=1;i<cuts.length;i++) {
    let a=cuts[i-1],b=cuts[i],fa=polynomial(c,a),fb=polynomial(c,b);
    if(fa*fb>=0)continue;
    for(let j=0;j<55;j++) {const m=(a+b)/2,fm=polynomial(c,m);if(fa*fm<=0){b=m;fb=fm;}else{a=m;fa=fm;}}
    found.push((a+b)/2);
  }
  return found.sort((a,b)=>a-b).filter((v,i,all)=>i===0||Math.abs(v-all[i-1])>1e-10);
}
function cholesky(a: Float64Array[], b: Float64Array): number[] {
  const n = b.length, l = Array.from({ length: n }, () => new Float64Array(n));
  // Symmetrisch schalen vermijdt een eenhedenafhankelijke singulariteitsgrens.
  const scale = a.map((r, i) => Math.sqrt(r[i]));
  if (scale.some(v => !(v > 0) || !Number.isFinite(v))) throw new Error('Instabiel model: onvoldoende steun.');
  for (let i=0; i<n; i++) for (let j=0; j<=i; j++) {
    let s = a[i][j] / (scale[i]*scale[j]);
    for (let k=0; k<j; k++) s -= l[i][k]*l[j][k];
    if (i === j) {
      if (s < 1e-12 || !Number.isFinite(s)) throw new Error('Instabiel of te slecht geconditioneerd model.');
      l[i][j] = Math.sqrt(s);
    } else l[i][j] = s/l[j][j];
  }
  const x = new Float64Array(n), y = new Float64Array(n);
  for (let i=0; i<n; i++) { let s=b[i]/scale[i]; for(let j=0;j<i;j++) s-=l[i][j]*y[j]; y[i]=s/l[i][i]; }
  for (let i=n-1; i>=0; i--) { let s=y[i]; for(let j=i+1;j<n;j++) s-=l[j][i]*x[j]; x[i]=s/l[i][i]; }
  return Array.from(x, (v,i) => v/scale[i]);
}
export function solveBeam(input: BeamInput): BeamResult {
  const { lengthM:L, eiKnM2:ei, maxElementM:step, headForceKn:H, headMomentKnM:M } = input;
  if (![L,ei,step,H,M].every(Number.isFinite) || L<=0 || ei<=0 || step<=0 ||
      typeof input.headFixedRotation !== 'boolean' || typeof input.toeFixed !== 'boolean' || !Array.isArray(input.layers))
    throw new Error('Ongeldige liggerinvoer.');
  const layers = [...input.layers].sort((a,b) => a.topM-b.topM);
  layers.forEach((v,i) => {
    if (![v.topM,v.bottomM,v.lineSpringKnM2,v.lineLoadKnM].every(Number.isFinite) ||
        v.topM<0 || v.bottomM>L || v.bottomM<=v.topM || v.lineSpringKnM2<0)
      throw new Error('Ongeldige laag of bedding.');
    if (i>0 && v.topM<layers[i-1].bottomM) throw new Error('Overlappende grondlagen.');
  });
  const cuts = [...new Set([0,L,...layers.flatMap(v => [v.topM,v.bottomM])])].sort((a,b)=>a-b);
  const zs = [0];
  for(let i=1;i<cuts.length;i++) {
    const n=Math.ceil((cuts[i]-cuts[i-1])/step);
    if (zs.length+n>201) throw new Error('Maximaal 200 elementen; kies een grotere elementlengte.');
    for(let j=1;j<=n;j++) zs.push(j===n ? cuts[i] : cuts[i-1]+(cuts[i]-cuts[i-1])*j/n);
  }
  const nd=2*zs.length;
  const K=Array.from({length:nd},()=>new Float64Array(nd)), F=new Float64Array(nd);
  F[0]=H; F[1]=M;
  const data: Array<{kb:number[][]; ks:number[][]; f:number[]; k:number; q:number}> = [];
  let loadForce=H, loadMoment=M;
  for(let e=0;e<zs.length-1;e++) {
    const a=zs[e], b=zs[e+1], l=b-a, mid=(a+b)/2;
    const layer=layers.find(v=>v.topM<=mid && v.bottomM>=mid), k=layer?.lineSpringKnM2??0, q=layer?.lineLoadKnM??0;
    const kb=[[12,6*l,-12,6*l],[6*l,4*l*l,-6*l,2*l*l],[-12,-6*l,12,-6*l],[6*l,2*l*l,-6*l,4*l*l]].map(r=>r.map(v=>v*ei/l**3));
    const ks=Array.from({length:4},()=>Array(4).fill(0)), f=Array(4).fill(0);
    for(const [g,w] of gauss) {
      const N=shape((g+1)/2,l), dx=w*l/2;
      for(let i=0;i<4;i++) { f[i]+=N[i]*q*dx; for(let j=0;j<4;j++) ks[i][j]+=N[i]*N[j]*k*dx; }
    }
    for(let i=0;i<4;i++) { F[2*e+i]+=f[i]; for(let j=0;j<4;j++) K[2*e+i][2*e+j]+=kb[i][j]+ks[i][j]; }
    loadForce+=q*l; loadMoment+=q*l*mid;
    data.push({kb,ks,f,k,q});
  }
  const fixed=new Set<number>();
  if(input.toeFixed) { fixed.add(nd-2); fixed.add(nd-1); }
  if(input.headFixedRotation) fixed.add(1);
  const free=Array.from({length:nd},(_,i)=>i).filter(i=>!fixed.has(i));
  const uf=cholesky(free.map(i=>Float64Array.from(free,j=>K[i][j])),Float64Array.from(free,i=>F[i]));
  if(!uf.every(Number.isFinite))throw new Error('Numerieke overloop; controleer eenheden en invoer.');
  const u=Array(nd).fill(0); free.forEach((v,i)=>u[v]=uf[i]);
  const reactions=Array(nd).fill(0);
  for(const i of fixed) reactions[i]=K[i].reduce((s,v,j)=>s+v*u[j],0)-F[i];
  let soilForce=0, soilMoment=0;
  const samples:BeamResult['samples']=[];
  const elements=data.map((d,e) => {
    const a=zs[e], b=zs[e+1], l=b-a, ue=u.slice(2*e,2*e+4);
    const r=d.kb.map((row,i)=>row.reduce((s,v,j)=>s+(v+d.ks[i][j])*ue[j],0)-d.f[i]);
    let reaction=0;
    for(const [g,w] of gauss) {
      const t=(g+1)/2, y=shape(t,l).reduce((s,v,i)=>s+v*ue[i],0), df=-d.k*y*w*l/2;
      reaction+=df; soilMoment+=df*(a+t*l);
    }
    soilForce+=reaction;
    const yc=[ue[0],l*ue[1],-3*ue[0]-2*l*ue[1]+3*ue[2]-l*ue[3],2*ue[0]+l*ue[1]-2*ue[2]+l*ue[3]];
    const pc=yc.map((v,i)=>(i===0?d.q:0)-d.k*v);
    const vc=[-r[0],...pc.map((v,i)=>-l*v/(i+1))];
    const mc=[-r[1],r[0]*l,...pc.map((v,i)=>l*l*v/((i+1)*(i+2)))];
    const positions=[...new Set([...Array.from({length:9},(_,j)=>j/8),...roots(vc),...roots(pc),...roots(yc.slice(1).map((v,j)=>v*(j+1)))])].sort((x,y)=>x-y);
    for(const t of positions) {
      const y=polynomial(yc,t);
      samples.push({zM:a+l*t,yM:y,momentKnM:polynomial(mc,t),shearKn:polynomial(vc,t),reactionKnM:-d.k*y});
    }
    return {topM:a,bottomM:b,momentTopKnM:-r[1],momentBottomKnM:r[3],shearTopKn:-r[0],shearBottomKn:r[2],soilReactionKn:reaction};
  });
  const toeReactionKn=reactions[nd-2], toeMomentKnM=reactions[nd-1], headReactionMomentKnM=reactions[1];
  return { nodes:zs.map((zM,i)=>({zM,yM:u[2*i],rotationRad:u[2*i+1]})), elements,samples,
    toeReactionKn,toeMomentKnM,headReactionMomentKnM,
    forceResidualKn:loadForce+soilForce+toeReactionKn,
    momentResidualKnM:loadMoment+soilMoment+toeReactionKn*L+toeMomentKnM+headReactionMomentKnM };
}
