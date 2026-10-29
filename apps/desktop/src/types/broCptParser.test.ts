import {expect,it} from 'vitest';
import {parseBroCptXml} from './broCptParser';
import {validationOf} from '../validation/report';
import {outliersOf} from '../validation/depthOutliers';
const row=(depth:number,qc='2')=>[depth,depth,0,qc,...Array(14).fill('-999999'),0.02,...Array(5).fill('-999999'),1].join(',');
const xml=(values:string)=>`<dispatch><CPT_O><broId>CPT-SYNTHETIC</broId><qualityRegime>IMBRO/A</qualityRegime><predrilledDepth>0.5</predrilledDepth><unknownVocabulary>futureValue</unknownVocabulary><deliveredLocation><pos srsName="urn:ogc:def:crs:EPSG::28992">120000 450000</pos></deliveredLocation><cptResult><values>${values}</values></cptResult></CPT_O></dispatch>`;
it('reports invalid tokens without shifting fields, retains vocabulary and typed metadata',()=>{
 const c= parseBroCptXml(xml(row(1,'bad')),'synthetic.xml');
 expect(c.points[0]).toMatchObject({depth:1,fs:0.02,rf:1});expect(c.points[0].qc).toBeUndefined();
 expect(c.metadata).toMatchObject({predrilled_depth_m:0.5,quality_regime:'IMBRO/A',extra:{unknownVocabulary:'futureValue'}});
 expect(c.position?.x_rd).toBe(120000);expect(validationOf(c)?.diagnostics.some(d=>d.code==='INVALID_NUMBER')).toBe(true);
});
it('marks outliers, excludes by default and preserves original records',()=>{
 const c=parseBroCptXml(xml([1,2,200,3,4].map(d=>row(d)).join(';')),'synthetic.xml');
 expect(c.points.map(p=>p.depth)).toEqual([1,2,3,4]);expect(outliersOf(c)?.excluded).toEqual([3]);
});
it('does not silently import only the first object or assume unknown CRS is RD',()=>{
 expect(()=>parseBroCptXml(xml(row(1)).replace('</dispatch>','<CPT_O/></dispatch>'),'multi.xml')).toThrow('meerdere');
 const c=parseBroCptXml(xml(row(1)).replace('28992','4326'),'unknown.xml');expect(c.position).toBeUndefined();expect(validationOf(c)?.diagnostics.some(d=>d.code==='UNKNOWN_XY_CRS')).toBe(true);
});
