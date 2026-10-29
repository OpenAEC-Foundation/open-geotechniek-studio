"""Independent ctypes consumer: exported symbols, ownership and hand calculation."""
import ctypes, json, sys
from pathlib import Path
sdk=ctypes.CDLL(str(Path(sys.argv[1]).resolve()))
sdk.ogs_core_version.restype=ctypes.c_char_p
sdk.ogs_core_call.argtypes=[ctypes.c_void_p,ctypes.c_size_t]
sdk.ogs_core_call.restype=ctypes.c_void_p
sdk.ogs_core_free.argtypes=[ctypes.c_void_p]
sdk.ogs_core_free.restype=None
request=json.dumps({'operation':'settlement','input':{'thicknessM':2,'stressIncreaseKpa':50,'constrainedModulusMpa':5}}).encode()
for _ in range(100):
    pointer=sdk.ogs_core_call(request,len(request))
    try:
        response=json.loads(ctypes.string_at(pointer))
        assert response['ok'] and response['result']['settlementMm']==20
    finally: sdk.ogs_core_free(pointer)
pointer=sdk.ogs_core_call(None,0)
try: assert not json.loads(ctypes.string_at(pointer))['ok']
finally: sdk.ogs_core_free(pointer)
sdk.ogs_core_free(None)
print('Native external consumer passed:',sdk.ogs_core_version().decode())
