import type { Cpt, MeasurementPoint } from '../types/cpt';
export const REPORT_PLOT_HEIGHT_MM = 653 * 297 / 841;
export function paginateCpt(cpt: Cpt, scale?: number | null): Array<{ cpt: Cpt; span?: number }> {
  if (scale == null) return [{cpt}];
  if (!Number.isFinite(scale) || scale < 50 || scale > 5000) throw new Error('Rapportschaal moet tussen 1:50 en 1:5000 liggen.');
  const max=cpt.points.reduce((value,p)=>Math.max(value,p.depth),0);
  const span=REPORT_PLOT_HEIGHT_MM * scale / 1000;
  const count=Math.max(1,Math.ceil(max/span));
  if (count > 1000) throw new Error('Deze combinatie van diepte en schaal maakt meer dan 1000 bladen.');
  const boundary=(depth:number):MeasurementPoint|undefined=>{
    const after=cpt.points.findIndex(p=>p.depth>=depth);
    if(after<0)return undefined;
    const b=cpt.points[after], a=cpt.points[after-1];
    if(b.depth===depth)return {...b};
    if(!a)return undefined;
    const t=(depth-a.depth)/(b.depth-a.depth),result:MeasurementPoint={depth};
    for(const key of ['qc','fs','rf','u2','inclination'] as const){if(a[key]!=null&&b[key]!=null)result[key]=a[key]!+(b[key]!-a[key]!)*t;}
    return result;
  };
  return Array.from({length:count},(_,i)=>{
    const start=i*span,end=(i+1)*span;
    const inside=cpt.points.filter(p=>p.depth>=start&&p.depth<=end);
    const first=boundary(start),last=boundary(end);
    const points=[...(first?[first]:[]),...inside,...(last?[last]:[])].filter((p,j,all)=>j===0||p.depth!==all[j-1].depth).map(p=>({...p,depth:p.depth-start}));
    return {span,cpt:{...cpt,id:count>1?`${cpt.id} (${i+1}/${count})`:cpt.id,metadata:{...cpt.metadata,ground_level_nap:cpt.metadata.ground_level_nap==null?undefined:cpt.metadata.ground_level_nap-start},points}};
  });
}
