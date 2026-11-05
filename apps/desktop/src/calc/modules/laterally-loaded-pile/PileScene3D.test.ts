import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { pileGeometry, pileSceneExtent } from './PileScene3D';
import type { BeamResult } from './beam';

it('houdt sterk uitvergrote vervormingen binnen het camerabereik',()=>{
  const L=12,D=.4,maxY=.45*1000;
  const {reach,maxDistance,far}=pileSceneExtent(L,D,maxY);
  const initialDistance=new Vector3(reach*1.8,L*.6,L*1.4+maxY*2).length();
  const sceneRadius=new Vector3(reach,L/2,reach*.6).length();
  expect(maxDistance).toBeGreaterThan(initialDistance);
  expect(far).toBeGreaterThan(maxDistance+sceneRadius);
});

describe('Continue paalgeometrie bij elementgrenzen',()=>{
  it.each([
    {section:'rond',square:false,inner:0},
    {section:'vierkant',square:true,inner:0},
    {section:'holle buis',square:false,inner:.18},
  ])('heeft voor $section uitsluitend eindige normale driehoeken met oppervlak',({square,inner})=>{
    // Moment en dwarskracht hebben twee elementzijden; de fysieke doorsnede is één ring.
    const samples:BeamResult['samples']=[
      {zM:0,yM:0,momentKnM:3,shearKn:1,reactionKnM:0},
      {zM:1,yM:0,momentKnM:2,shearKn:1,reactionKnM:0},
      {zM:1,yM:0,momentKnM:2,shearKn:2,reactionKnM:0},
      {zM:1+5e-12,yM:0,momentKnM:2,shearKn:2,reactionKnM:0},
      {zM:2,yM:0,momentKnM:0,shearKn:0,reactionKnM:0},
    ];
    const before=structuredClone(samples);
    const geometry=pileGeometry(samples,10,.2,square,inner);
    try {
      const positions=geometry.getAttribute('position'),normals=geometry.getAttribute('normal');
      expect(Array.from(positions.array).every(Number.isFinite)).toBe(true);
      expect(Array.from(normals.array).every(Number.isFinite)).toBe(true);
      for(let index=0;index<normals.count;index++)expect(new Vector3().fromBufferAttribute(normals,index).length()).toBeGreaterThan(.99);
      const indices=geometry.getIndex(),count=indices?.count??positions.count;
      for(let index=0;index<count;index+=3) {
        const a=new Vector3().fromBufferAttribute(positions,indices?indices.getX(index):index);
        const b=new Vector3().fromBufferAttribute(positions,indices?indices.getX(index+1):index+1);
        const c=new Vector3().fromBufferAttribute(positions,indices?indices.getX(index+2):index+2);
        expect(b.sub(a).cross(c.sub(a)).lengthSq()).toBeGreaterThan(1e-16);
      }
      expect(samples).toEqual(before);
      expect(samples[1].shearKn).toBe(1);
      expect(samples[2].shearKn).toBe(2);
    } finally {geometry.dispose();}
  });
});
