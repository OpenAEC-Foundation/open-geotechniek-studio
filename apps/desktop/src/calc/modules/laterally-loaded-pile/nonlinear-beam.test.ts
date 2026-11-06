import {expect,it} from 'vitest';
import {solveBeam,type BeamInput} from './beam';
import {solveFoundationBeam} from './nonlinear-beam';
import {equivalentLayers} from './nonlinear-soil';
import type {SoilSpringProfile} from './spring-types';
const b:BeamInput={lengthM:8,eiKnM2:30000,maxElementM:.5,headForceKn:30,headMomentKnM:20,headFixedRotation:false,toeFixed:false,
 layers:[{topM:0,bottomM:8,lineSpringKnM2:4000,lineLoadKnM:2}]};
const p:SoilSpringProfile[]=[{topM:0,bottomM:8,initialKnM2:4000,ultimate:{atSurfaceKnM:40,gradientKnM2:10,capKnM:200}}];
const run=(beam=b,mode:'linear'|'nonlinear'='nonlinear',profiles=p,options={})=>solveFoundationBeam(beam,profiles,equivalentLayers(profiles,'georgiadis'),mode,'georgiadis',options);
it('reduceert exact tot de bestaande lineaire berekening',()=>{
 const a=solveBeam(b),c=run(b,'linear');
 c.nodes.forEach((n,i)=>expect(n.yM).toBeCloseTo(a.nodes[i].yM,10));
 expect(c.springs).toHaveLength(4*c.elements.length);
 expect(c.convergence.converged).toBe(true);
});
it('maakt na mobilisatie meer verplaatsing en behoudt evenwicht',()=>{
 const a=run(b,'linear'),c=run();
 expect(c.nodes[0].yM).toBeGreaterThan(a.nodes[0].yM);
 expect(Math.abs(c.forceResidualKn)).toBeLessThan(1e-4);
 expect(Math.abs(c.momentResidualKnM)).toBeLessThan(1e-3);
 for(const s of c.springs){expect(Math.abs(s.resistanceKnM)).toBeLessThanOrEqual(s.ultimateKnM!+1e-8);expect(s.tangentKnM2).toBeLessThanOrEqual(s.initialKnM2);}
});
it('rekent gespiegeld voor negatieve belastingen',()=>{
 const a=run(),c=run({...b,headForceKn:-b.headForceKn,headMomentKnM:-b.headMomentKnM,layers:b.layers.map(l=>({...l,lineLoadKnM:-l.lineLoadKnM}))});
 expect(c.nodes[0].yM).toBeCloseTo(-a.nodes[0].yM,9);
});
it('weigert belasting boven de gezamenlijke grondweerstand',()=>{
 expect(()=>run({...b,headForceKn:1e5,headMomentKnM:0,layers:b.layers.map(l=>({...l,lineLoadKnM:0}))})).toThrow(/converg|weerstand|instabiel/i);
});
it('geeft geen gedeeltelijke of lineaire uitkomst bij mislukte iteratie',()=>{
 expect(()=>run(b,'nonlinear',p,{maxIterations:0})).toThrow(/iteratie|converg/i);
});
it('behoudt unieke veer-ID en werkpunt bij netverfijning',()=>{
 const a=run(),c=run({...b,maxElementM:.25});
 expect(Math.abs(a.nodes[0].yM/c.nodes[0].yM-1)).toBeLessThan(.002);
 expect(new Set(c.springs.map(s=>s.id)).size).toBe(c.springs.length);
 for(const s of c.springs)expect(s.resistanceKnM*s.displacementM).toBeGreaterThanOrEqual(0);
});
it('weigert onverenigbare grondprofielen en equivalente diepten',()=>{
 expect(()=>run(b,'nonlinear',[{...p[0],bottomM:7}])).toThrow(/profiel|laag/i);
 expect(()=>run(b,'nonlinear',[{...p[0],initialKnM2:3000}])).toThrow(/profiel|stijfheid/i);
 expect(()=>solveFoundationBeam(b,p,[{topEquivalentM:2,bottomEquivalentM:10,cumulativeUltimateKn:500}],'nonlinear','georgiadis')).toThrow(/equivalente/i);
});
it('heeft aan één Newton-update genoeg voor een lineair model',()=>{
 expect(run(b,'linear',p,{maxIterations:1}).convergence.iterations).toBe(1);
});
