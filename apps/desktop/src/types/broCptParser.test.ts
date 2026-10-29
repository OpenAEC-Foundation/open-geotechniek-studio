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

it('uses SWE encoding and positional ja/nee masks while preserving source channels (Bedrock)',()=>{
 const source='<dispatch><CPT_O><broId>SYNTHETIC</broId><parameters><penetrationLength>ja</penetrationLength><coneResistance>nee</coneResistance><localFriction>ja</localFriction><depth>ja</depth></parameters><cptResult><TextEncoding tokenSeparator="|" blockSeparator="!" decimalSeparator=","/><values>1|100|0,02|0,95!2|200|0,03|1,9!</values></cptResult></CPT_O></dispatch>';
 const c=parseBroCptXml(source,'synthetic.xml');expect(c.points.map(p=>p.depth)).toEqual([0.95,1.9]);expect(c.points[0].qc).toBeUndefined();expect(c.points[0].fs).toBe(0.02);expect(c.points[0].parameters?.qc).toBe(100);
 expect(validationOf(c)?.diagnostics.some(d=>d.code==='DECIMAL_SEPARATOR')).toBe(true);
});
it('preserves units and converts known metre units without assuming unknown vertical datums',()=>{
 const source=xml(row(1)).replace('<predrilledDepth>0.5</predrilledDepth>','<predrilledDepth uom="cm">50</predrilledDepth><deliveredVerticalPosition><offset uom="cm">200</offset><verticalDatum>NAP</verticalDatum></deliveredVerticalPosition>');
 const c=parseBroCptXml(source,'units.xml');expect(c.metadata.ground_level_nap).toBe(2);expect(c.metadata.predrilled_depth_m).toBe(0.5);expect(c.metadata.measurements).toContainEqual({name:'offset',value:200,unit:'cm'});
 expect(parseBroCptXml(source.replace('>NAP<','>TAW<'),'unknown.xml').metadata.ground_level_nap).toBeUndefined();
});

it('opens all objects of a multi-CPT dispatch without losing namespace context',async()=>{
 const {parseBroCptXmlMany}=await import('./broCptParser');
 const one=xml(row(1)),two=one.replace('CPT-SYNTHETIC','CPT-SECOND');
 const multi='<dispatch xmlns="https://www.broservices.nl/xsd/dscpt/1.1">'+one.replace(/^<dispatch>|<\/dispatch>$/g,'')+two.replace(/^<dispatch>|<\/dispatch>$/g,'')+'</dispatch>';
 const values=parseBroCptXmlMany(multi,'multi.xml');expect(values.map(c=>c.id)).toEqual(['CPT-SYNTHETIC','CPT-SECOND']);
 expect(values[1].points[0].depth).toBe(1);
 expect(()=>parseBroCptXmlMany(multi.replace('CPT-SECOND','CPT-SYNTHETIC'),'duplicate.xml')).toThrow('dubbele');
});

it('imports the upstream public BRO dispatch with real namespaces and channel flags',async()=>{
 const {readFileSync}=await import('node:fs');
 const source=readFileSync('../../tests/fixtures/bro/bedrock-example.xml','utf8');
 const value=parseBroCptXml(source,'bedrock-example.xml');
 expect(value.id).toBe('CPT000000099543');
 expect(value.points.length).toBeGreaterThan(100);
 expect(value.metadata.quality_regime).toBe('IMBRO');
 expect(value.metadata.ground_level_nap).toBeCloseTo(4.410,3);
 expect(validationOf(value)?.diagnostics.filter(d=>d.severity==='error')).toEqual([]);
});
