import {describe,it,expect} from 'vitest';
import {computeBaseResistance} from './base-resistance';
import {computeShaftFriction} from './shaft-friction';
import {getPileType} from '../catalog';
import type {Cpt} from '../../../../types/cpt';
const pileType=getPileType('steel-pipe-driven-closed')!;
const cpt=(points:Cpt['points']):Cpt=>({id:'analytisch',metadata:{source_file:'synthetisch',ground_level_nap:0},points});
describe('numerieke draagvermogenberekening',()=>{
 it('behoudt de puntweerstand van een constant profiel',()=>{
  const result=computeBaseResistance(cpt([{depth:0,qc:12},{depth:20,qc:12}]),{pileToeDepth:10,diameterMm:1000,pileType});
  expect(result.qcIGemMpa).toBeCloseTo(12,10);
  expect(result.qbMaxMpaRaw).toBeCloseTo(8.4,10);
 });
 it.each([
  [{depth:0,qc:2},{depth:10,qc:12}],
  Array.from({length:101},(_,i)=>({depth:i/10,qc:2+i/10})),
 ].map(points => [points]))('integreert een lineair profiel onafhankelijk van meetpuntafstand',points=>{
  const result=computeShaftFriction(cpt(points),{pileType,diameterMm:1000,negKleefBottomNap:-2,pileToeNap:-4},[{kind:'sand-wet',startNap:-2,endNap:-4,gammaK:20,gammaW:10,phi:30}]);
  expect(result.perLayer[0].qcGemMpa).toBeCloseTo(5,10);
  expect(result.rsCalMax).toBeCloseTo(Math.PI*2*.008*5*1000,8);
 });
});
