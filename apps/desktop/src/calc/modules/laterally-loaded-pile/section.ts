import { ct } from '../../i18n';
/** Doorsnedemechanica met expliciete projectsterkten (MPa).
 * Beton: parabool-rechthoek, eps_c2=2‰, eps_cu=3,5‰ (normaal beton).
 * Staal: elastisch-perfect plastisch; betontrek telt niet mee in ULS.
 * Geen volledige toets van staaf, lokale plooi, dwarskracht of detaillering.
 */
export type SectionKind = 'concrete-round' | 'concrete-square' | 'steel-tube' | 'filled-tube';
export interface PileSection {
  kind:SectionKind; diameterMm:number; wallMm:number;
  concreteEMpa:number; steelEMpa:number; rebarEMpa:number; concreteFactor:number;
  creepCoefficient:number; tubeParticipates:boolean;
  barCount:number; barDiameterMm:number; coverToBarCentreMm:number;
  fckMpa:number; fcdMpa:number; fydMpa:number; tubeFydMpa:number;
}
const circleI=(d:number)=>Math.PI*d**4/64;
const circleA=(d:number)=>Math.PI*d*d/4;
function geometry(s:PileSection) {
  const nums=Object.entries(s).filter(([k])=>!['kind','tubeParticipates'].includes(k)).map(([,v])=>v);
  if(!nums.every(v=>typeof v==='number'&&Number.isFinite(v)) ||
    !['concrete-round','concrete-square','steel-tube','filled-tube'].includes(s.kind) ||
    typeof s.tubeParticipates!=='boolean' || s.diameterMm<=0 ||
    s.concreteEMpa<=0 || s.steelEMpa<=0 || s.rebarEMpa<=0 ||
    s.concreteFactor<=0 || s.concreteFactor>1 || s.creepCoefficient<0 ||
    s.fckMpa<=0 || s.fckMpa>50 || s.fcdMpa<=0 || s.fcdMpa>s.fckMpa || s.fydMpa<=0 || s.tubeFydMpa<=0 ||
    !Number.isInteger(s.barCount) || s.barCount<0 || s.barCount>100 || s.barDiameterMm<=0)
    throw new Error(ct('calcLateral', 'errors.invalidSection', 'Ongeldige doorsnede of materiaalwaarden.'));
  const D=s.diameterMm/1000, tube=s.kind==='steel-tube'||s.kind==='filled-tube';
  if(tube && (s.wallMm<=0 || 2*s.wallMm>=s.diameterMm)) throw new Error(ct('calcLateral', 'errors.invalidWall', 'Ongeldige restwanddikte.'));
  const core=tube ? D-2*s.wallMm/1000 : D, square=s.kind==='concrete-square';
  const bars=s.kind==='steel-tube' ? 0 : s.barCount, d=s.barDiameterMm/1000, c=s.coverToBarCentreMm/1000;
  if(bars && (bars<4 || (square&&bars%4!==0) || c<d/2 || c>=core/2)) throw new Error(ct('calcLateral', 'errors.invalidRebarLayout', 'Ongeldige ligging van de wapening.'));
  const coords:Array<{x:number;y:number}>=[];
  for(let i=0;i<bars;i++) {
    const r=core/2-c;
    if(square) {
      const side=Math.floor(4*i/bars), t=(4*i/bars)%1;
      coords.push(side===0?{x:-r+2*r*t,y:-r}:side===1?{x:r,y:-r+2*r*t}:side===2?{x:r-2*r*t,y:r}:{x:-r,y:r-2*r*t});
    } else coords.push({x:r*Math.cos(2*Math.PI*i/bars),y:r*Math.sin(2*Math.PI*i/bars)});
  }
  for(let i=0;i<coords.length;i++) for(let j=0;j<i;j++)
    if(Math.hypot(coords[i].x-coords[j].x,coords[i].y-coords[j].y)<d) throw new Error(ct('calcLateral', 'errors.barsOverlap', 'Wapeningsstaven overlappen.'));
  const ac=s.kind==='steel-tube'?0:square?core**2:circleA(core);
  if(bars*circleA(d)>=ac && bars) throw new Error(ct('calcLateral', 'errors.tooMuchRebar', 'Te veel wapening voor de doorsnede.'));
  return {D,core,square,tube,coords,d,ac};
}
export function sectionStiffness(s:PileSection) {
  const g=geometry(s), ec=s.concreteEMpa*1000*s.concreteFactor/(1+s.creepCoefficient);
  const steelI=g.tube ? circleI(g.D)-circleI(g.core) : 0;
  const grossConcreteI=s.kind==='steel-tube'?0:g.square?g.core**4/12:circleI(g.core);
  const barI=g.coords.reduce((a,b)=>a+circleA(g.d)*b.y*b.y+circleI(g.d),0);
  const concreteEI=ec*(grossConcreteI-barI), rebarEI=s.rebarEMpa*1000*barI;
  const tubeEI=(s.kind==='steel-tube'||s.tubeParticipates)?s.steelEMpa*1000*steelI:0;
  return {eiKnM2:concreteEI+rebarEI+tubeEI,concreteEI,rebarEI,tubeEI,
    concreteAreaM2:g.ac-g.coords.length*circleA(g.d),steelAreaM2:g.tube?circleA(g.D)-circleA(g.core):0,
    rebarAreaMm2:g.coords.length*circleA(g.d)*1e6};
}
const width=(d:number,y:number)=>2*Math.sqrt(Math.max(0,d*d/4-y*y));
const concreteStress=(eps:number,fcd:number)=>eps<=0?0:eps>=.002?fcd:fcd*(1-(1-eps/.002)**2);
const steelStress=(eps:number,e:number,fy:number)=>Math.max(-fy,Math.min(fy,e*eps));
export function sectionCapacity(s:PileSection,nEdKn:number) {
  const g=geometry(s);
  if(!Number.isFinite(nEdKn)) throw new Error(ct('calcLateral', 'errors.invalidNormalForce', 'Ongeldige normaalkracht.'));
  const fy=s.tubeFydMpa*1000, fc=s.fcdMpa*1000, fr=s.fydMpa*1000;
  // De verplaatsende neutrale as en plastische materiaaldelen worden apart geïntegreerd.
  const response=(x:number) => {
    if(s.kind==='steel-tube') {
      const cap=(diameter:number) => {
        const r=diameter/2, a=Math.max(-r,Math.min(r,x));
        return {area:r*r*Math.acos(a/r)-a*Math.sqrt(Math.max(0,r*r-a*a)),q:2/3*Math.max(0,r*r-a*a)**1.5};
      };
      const outer=cap(g.D),inner=cap(g.core),area=circleA(g.D)-circleA(g.core);
      return {n:fy*(2*(outer.area-inner.area)-area),m:2*fy*(outer.q-inner.q)};
    }
    const depth=g.core, epsTop=x<=depth?.0035:.002/(1-(1-.002/.0035)*depth/x);
    const strain=(y:number)=>epsTop*(1-(depth/2-y)/x);
    let n=0,m=0;
    const count=800, dz=g.D/count;
    for(let i=0;i<count;i++) {
      const y=-g.D/2+(i+.5)*dz;
      const wc=g.square?g.core:width(g.core,y);
      const cs=concreteStress(strain(y),fc);
      n+=cs*wc*dz; m+=cs*wc*dz*y;
      if(g.tube&&s.tubeParticipates) {
        const ws=width(g.D,y)-width(g.core,y);
        const stress=steelStress(strain(y),s.steelEMpa*1000,fy);
        n+=stress*ws*dz;m+=stress*ws*dz*y;
      }
    }
    for(const bar of g.coords) {
      const eps=strain(bar.y), force=(steelStress(eps,s.rebarEMpa*1000,fr)-concreteStress(eps,fc))*circleA(g.d);
      n+=force;m+=force*bar.y;
    }
    return {n,m};
  };
  const pureSteel=s.kind==='steel-tube';
  let lo=pureSteel?-g.D:g.core*1e-9, hi=pureSteel?g.D:g.core*1e9;
  let a=response(lo), b=response(hi);
  const nMin=Math.min(a.n,b.n),nMax=Math.max(a.n,b.n);
  if(nEdKn<nMin-.001 || nEdKn>nMax+.001) throw new Error(ct('calcLateral', 'errors.normalForceOutside', 'Normaalkracht buiten de doorsnedeweerstand.'));
  for(let i=0;i<100;i++) {
    const mid=(lo+hi)/2, r=response(mid);
    if((r.n<nEdKn)===(a.n<b.n)) {lo=mid;a=r;} else {hi=mid;b=r;}
  }
  const r=response((lo+hi)/2);
  return {mRdKnM:Math.abs(r.m),nResidualKn:r.n-nEdKn,nMinKn:nMin,nMaxKn:nMax};
}
