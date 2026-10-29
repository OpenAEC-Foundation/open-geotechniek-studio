import { describe, it, expect } from 'vitest';
import { markersFor, withMarkers } from './markers';
import { pickMarkerAt, moveMarkerTo, hitTestMarkerIndex, type ChartRenderOptions } from './chart-renderer';
import type { Cpt } from '../../types/cpt';
const make = (id: string, ground: number): Cpt => ({ id, metadata: { source_file: `${id}.xml`, ground_level_nap: ground }, points: [{depth:0,qc:1,rf:1},{depth:20,qc:5,rf:2}] });
const a=make('A',2), b=make('B',-4);
const opts: ChartRenderOptions={width:1200,height:700,zoom:1,panX:0,panY:0};
describe('independent reference lines (#2)', () => {
  it('creates and hits a marker only inside its owner column', () => {
    const marker=pickMarkerAt([a,b],opts,300,300)!;
    expect(marker.cptId).toBe('A');
    expect(hitTestMarkerIndex([a,b],{...opts,markers:[marker]},300,300)).toBe(0);
    expect(hitTestMarkerIndex([a,b],{...opts,markers:[marker]},900,300)).toBeNull();
    const second=pickMarkerAt([a,b],opts,900,400)!;
    expect(second.cptId).toBe('B');
    const moved=moveMarkerTo([a,b],opts,marker,900,450);
    expect(moved.cptId).toBe('A');
    expect(second).toEqual(pickMarkerAt([a,b],opts,900,400));
  });
  it('roundtrips each CPT with its own depth and survives JSON save/reopen', () => {
    const marks=[{cptId:'A',depth:3},{cptId:'B',depth:8}];
    const saved=[withMarkers(a,marks),withMarkers(b,marks)];
    const reopened=JSON.parse(JSON.stringify(saved)) as Cpt[];
    expect(reopened.flatMap(markersFor)).toEqual(marks);
    expect(markersFor(withMarkers(a,[]))).toEqual([]);
    expect(markersFor(reopened[1])).toEqual([{cptId:'B',depth:8}]);
  });
});
