#ifndef OPENAEC_GEOTECHNIEK_H
#define OPENAEC_GEOTECHNIEK_H
#include <stddef.h>
#ifdef __cplusplus
extern "C" {
#endif
/* Borrowed UTF-8 static version string. Do not free. */
const char *ogs_core_version(void);
/* UTF-8 JSON request of length bytes. Response is allocated by this library.
   It always has {"ok":true,"result":...} or {"ok":false,"error":"..."}.
   Caller must keep input readable during the call and release the result once. */
char *ogs_core_call(const unsigned char *data, size_t length);
void ogs_core_free(char *response);
#ifdef __cplusplus
}
#endif
#endif
