import { expect, it, vi } from "vitest";
import { createBroSearch, splitSearchBox } from "./broSearch";
const box = { min_lat: 51, min_lon: 4, max_lat: 52, max_lon: 6 };
it("spatially pages capped results and deduplicates shared boundaries", async () => {
  const request = vi.fn(async (b) =>
    b.max_lon - b.min_lon > 1
      ? Array.from({ length: 2000 }, (_, i) => ({ id: String(i) }))
      : [{ id: "shared" }, { id: String(b.min_lon) }],
  );
  const service = createBroSearch(request);
  expect((await service.search(box)).map((f) => f.id)).toEqual([
    "shared",
    "4",
    "5",
  ]);
  expect(request).toHaveBeenCalledTimes(3);
});
it("also subdivides an explicit service-limit response", async () => {
  const request = vi.fn(async (b) => {
    if (b.max_lon - b.min_lon > 1) throw new Error("OGS_BRO_RESULT_LIMIT");
    return [{ id: String(b.min_lon) }];
  });
  expect(await createBroSearch(request).search(box)).toHaveLength(2);
});
it("reuses concurrent requests, expires cache and protects cached results from caller mutation", async () => {
  let now = 0;
  const request = vi.fn(async () => [
    { id: "first", extra: { regime: "IMBRO/A" } },
  ]);
  const service = createBroSearch(request, { now: () => now, ttlMs: 10 });
  const [a, b] = await Promise.all([service.search(box), service.search(box)]);
  a[0].extra.regime = "changed";
  expect(b[0].extra.regime).toBe("IMBRO/A");
  expect((await service.search(box))[0].extra.regime).toBe("IMBRO/A");
  expect(request).toHaveBeenCalledTimes(1);
  now = 11;
  await service.search(box);
  expect(request).toHaveBeenCalledTimes(2);
  service.clear();
  await service.search(box);
  expect(request).toHaveBeenCalledTimes(3);
});
it("does not cache failures or subdivide unrelated failures", async () => {
  const request = vi.fn(async () => {
    throw new Error("HTTP 503");
  });
  const service = createBroSearch(request);
  await expect(service.search(box)).rejects.toThrow("503");
  await expect(service.search(box)).rejects.toThrow("503");
  expect(request).toHaveBeenCalledTimes(2);
});
it("fails closed when the request budget cannot retrieve a complete area", async () => {
  const request = vi.fn(async () => {
    throw new Error("OGS_BRO_RESULT_LIMIT");
  });
  await expect(
    createBroSearch(request, { maxRequests: 3 }).search(box),
  ).rejects.toThrow("Geen gedeeltelijke");
  expect(request).toHaveBeenCalledTimes(3);
});
it("rejects invalid bounding boxes before making requests", async () => {
  const request = vi.fn(async () => []);
  await expect(
    createBroSearch(request).search({ ...box, max_lat: NaN }),
  ).rejects.toThrow("Ongeldig");
  expect(request).not.toHaveBeenCalled();
  expect(splitSearchBox({ ...box, max_lon: 4.1 })[0].max_lat).toBe(51.5);
});
