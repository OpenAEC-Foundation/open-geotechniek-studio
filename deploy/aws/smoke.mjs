import assert from "node:assert/strict";
const base = process.env.OGS_BASE_URL,
  token = process.env.OGS_API_TOKEN;
if (!base?.startsWith("https://") || !token)
  throw new Error("HTTPS OGS_BASE_URL and existing OGS_API_TOKEN required");
const request = (path, options = {}) =>
  fetch(new URL(path, base), {
    ...options,
    signal: AbortSignal.timeout(15000),
  });
assert.equal((await request("/health")).status, 200);
assert.equal((await request("/version")).status, 401);
const headers = {
  authorization: `Bearer ${token}`,
  "content-type": "application/json",
};
const version = await request("/version", { headers });
assert.equal(version.status, 200);
const response = await request("/settlement", {
  method: "POST",
  headers,
  body: JSON.stringify({
    thicknessM: 2,
    stressIncreaseKpa: 50,
    constrainedModulusMpa: 5,
  }),
});
assert.equal(response.status, 200);
assert.equal((await response.json()).settlementMm, 20);
console.log("AWS runtime smoke passed", await version.json());
