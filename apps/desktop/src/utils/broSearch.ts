/** BRO CPT interface §6.2: at most 2000 dispatch documents per search.
 * No offset pagination is defined. Subdivide the spatial criteria and deduplicate
 * shared boundaries; stop with an explicit error instead of returning a partial set.
 * https://www.bro-productomgeving.nl/bpo/latest/bodem-en-grondonderzoek/geotechnisch-sondeeronderzoek-cpt/koppelvlakbeschrijving-uitgifteservice-cpt
 */
export interface SearchBBox {
  min_lat: number;
  min_lon: number;
  max_lat: number;
  max_lon: number;
}
export const BRO_SEARCH_LIMIT = 2000;
export const isBroLimit = (error: unknown) =>
  /OGS_BRO_RESULT_LIMIT|\b2000\b|too.?many.*(?:objects|documents|results)|(?:maximum|limiet|result.?limit).*(?:objects|documents|results)|te.?veel.*(?:objecten|documenten|resultaten)/i.test(
    String(error),
  );
export function splitSearchBox(box: SearchBBox): [SearchBBox, SearchBBox] {
  if (box.max_lon - box.min_lon >= box.max_lat - box.min_lat) {
    const mid = (box.min_lon + box.max_lon) / 2;
    return [
      { ...box, max_lon: mid },
      { ...box, min_lon: mid },
    ];
  }
  const mid = (box.min_lat + box.max_lat) / 2;
  return [
    { ...box, max_lat: mid },
    { ...box, min_lat: mid },
  ];
}
export function createBroSearch<T extends { id: string }>(
  request: (box: SearchBBox) => Promise<T[]>,
  options: {
    ttlMs?: number;
    maxCache?: number;
    maxRequests?: number;
    now?: () => number;
  } = {},
) {
  const cache = new Map<string, { until: number; value: Promise<T[]> }>();
  const now = options.now ?? Date.now;
  const search = async (box: SearchBBox): Promise<T[]> => {
    if (
      !Object.values(box).every(Number.isFinite) ||
      box.min_lat >= box.max_lat ||
      box.min_lon >= box.max_lon
    )
      throw new Error("Ongeldig BRO-zoekgebied.");
    const key = [box.min_lat, box.min_lon, box.max_lat, box.max_lon].join(",");
    const cached = cache.get(key);
    if (cached && cached.until > now())
      return structuredClone(await cached.value);
    let count = 0;
    const walk = async (area: SearchBBox, depth: number): Promise<T[]> => {
      if (++count > (options.maxRequests ?? 63))
        throw new Error(
          "BRO-zoekgebied blijft te groot; zoom verder in. Geen gedeeltelijke resultaten weergegeven.",
        );
      try {
        const values = await request(area);
        if (values.length < BRO_SEARCH_LIMIT) return values;
      } catch (error) {
        if (!isBroLimit(error)) throw error;
      }
      if (
        depth >= 12 ||
        Math.max(area.max_lat - area.min_lat, area.max_lon - area.min_lon) <
          1e-7
      )
        throw new Error(
          "BRO-limiet blijft bereikt op dezelfde locatie; verklein periode of gebied. Geen gedeeltelijke resultaten weergegeven.",
        );
      const [left, right] = splitSearchBox(area);
      // Sequential requests bound API load and keep the shared request budget exact.
      return [
        ...(await walk(left, depth + 1)),
        ...(await walk(right, depth + 1)),
      ];
    };
    const value = walk(box, 0).then((values) => [
      ...new Map(values.map((value) => [value.id, value])).values(),
    ]);
    const entry = { until: now() + (options.ttlMs ?? 300000), value };
    cache.delete(key);
    cache.set(key, entry);
    while (cache.size > (options.maxCache ?? 32))
      cache.delete(cache.keys().next().value!);
    try {
      return structuredClone(await value);
    } catch (error) {
      if (cache.get(key) === entry) cache.delete(key);
      throw error;
    }
  };
  return { search, clear: () => cache.clear() };
}
