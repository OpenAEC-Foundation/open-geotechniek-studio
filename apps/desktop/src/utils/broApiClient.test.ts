import {afterEach,expect,it,vi} from 'vitest';
import {fetchBroCpts} from './broApiClient';
const box={min_lat:51,min_lon:4,max_lat:52,max_lon:5};
afterEach(()=>vi.unstubAllGlobals());
it('detects a result-limit rejection even after a long XML namespace prelude',async()=>{
 const xml=`<response xmlns:test="https://example.org/${'namespace'.repeat(100)}"><rejectionReason>More than 2000 documents found</rejectionReason></response>`;
 vi.stubGlobal('fetch',vi.fn(async()=>({ok:false,status:400,text:async()=>xml})));
 await expect(fetchBroCpts(box)).rejects.toThrow('OGS_BRO_RESULT_LIMIT');
});
it('does not confuse an XML namespace year with a result cap',async()=>{
 const xml='<response xmlns:sig="http://www.w3.org/2000/09/xmldsig#"><rejectionReason>Invalid area</rejectionReason></response>';
 vi.stubGlobal('fetch',vi.fn(async()=>({ok:false,status:400,text:async()=>xml})));
 await expect(fetchBroCpts(box)).rejects.toThrow('BRO HTTP 400: Invalid area');
});
