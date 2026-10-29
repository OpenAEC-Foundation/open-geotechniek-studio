import { APP_VERSION } from "../version";
import type { Cpt, Layer } from "../types/cpt";
import { classify, zones } from "./soilZones";
export const LAYER_KEY = "ogs:layer-interpretation";
export interface LayerSettings {
  minimumThicknessM: number;
  hysteresisM: number;
}
export interface LayerInterpretation {
  schema: "ogs.layers/1";
  softwareVersion?: string;
  cptId: string;
  sourceFile: string;
  method: "manual" | "indicative-qc-rf";
  settings: LayerSettings;
  layers: Layer[];
  editedAt?: string;
}
export const DEFAULT_LAYER_SETTINGS: LayerSettings = {
  minimumThicknessM: 0.1,
  hysteresisM: 0.1,
};
export function validateLayerSettings(value: LayerSettings): void {
  if (
    !value ||
    ![value.minimumThicknessM, value.hysteresisM].every(
      (v) => Number.isFinite(v) && v >= 0 && v <= 50,
    )
  )
    throw new Error(
      "Minimumdikte en hysterese moeten tussen 0 en 50 m liggen.",
    );
}
export function validateLayerRanges(layers: Layer[], cpt: Cpt): void {
  if (!Array.isArray(layers))
    throw new Error("Laagindeling moet een lijst zijn.");
  const bottom = cpt.points.reduce((max, p) => Math.max(max, p.depth), 0);
  let previous = -Infinity;
  for (const layer of layers) {
    if (
      !layer ||
      ![layer.depth_top, layer.depth_bottom].every(Number.isFinite) ||
      layer.depth_top < 0 ||
      layer.depth_bottom <= layer.depth_top ||
      layer.depth_bottom > bottom + 1e-6 ||
      layer.depth_top < previous - 1e-6 ||
      !zones.some((z) => z.number === layer.zone_number)
    )
      throw new Error(
        "Lagen moeten positief dik, op volgorde, zonder overlap en binnen de meetdiepte liggen; kies zone 1–9.",
      );
    previous = layer.depth_bottom;
  }
}
function layerAt(zone: number, top: number, bottom: number): Layer {
  const value = zones.find((z) => z.number === zone)!;
  return {
    depth_top: top,
    depth_bottom: bottom,
    zone_number: zone,
    zone_name: value.name,
    zone_color: value.color,
  };
}
export function analyzeLayers(
  cpt: Cpt,
  explicitSettings?: LayerSettings,
): { layers: Layer[]; provenance: LayerInterpretation; warnings: string[] } {
  const warnings: string[] = [];
  let saved: LayerInterpretation | undefined;
  try {
    if (cpt.metadata.extra?.[LAYER_KEY]) {
      saved = JSON.parse(cpt.metadata.extra[LAYER_KEY]);
      if (
        !saved ||
        saved.schema !== "ogs.layers/1" ||
        saved.cptId !== cpt.id ||
        saved.sourceFile !== cpt.metadata.source_file ||
        !["manual", "indicative-qc-rf"].includes(saved.method)
      )
        throw new Error(
          "Onbekende of niet passende herkomst van opgeslagen laagindeling.",
        );
      validateLayerSettings(saved.settings);
      if (saved.method === "manual" && !explicitSettings) {
        validateLayerRanges(saved.layers, cpt);
        return {
          layers: saved.layers.map((l) =>
            layerAt(l.zone_number, l.depth_top, l.depth_bottom),
          ),
          provenance: saved,
          warnings,
        };
      }
    }
  } catch (error) {
    return {
      layers: [],
      provenance: {
        schema: "ogs.layers/1",
        softwareVersion: APP_VERSION,
        cptId: cpt.id,
        sourceFile: cpt.metadata.source_file,
        method: "indicative-qc-rf",
        settings: DEFAULT_LAYER_SETTINGS,
        layers: [],
      },
      warnings: [`Opgeslagen laagindeling ongeldig: ${String(error)}`],
    };
  }
  const settings =
    explicitSettings ?? saved?.settings ?? DEFAULT_LAYER_SETTINGS;
  validateLayerSettings(settings);
  const raw: Layer[] = [];
  let current: Layer | undefined,
    candidate: { zone: number; top: number; samples: number } | undefined,
    previousDepth: number | undefined;
  for (let i = 0; i < cpt.points.length; i++) {
    const point = cpt.points[i],
      zone = classify(point.qc, point.rf);
    if (
      !Number.isFinite(point.depth) ||
      point.depth < 0 ||
      (previousDepth != null && point.depth < previousDepth)
    ) {
      warnings.push(
        `Bronpunt ${i + 1}: ongeldige of afnemende diepte niet gebruikt voor laaginterpretatie.`,
      );
      continue;
    }
    if (!zone) {
      current = undefined;
      candidate = undefined;
      previousDepth = undefined;
      continue;
    }
    if (!current) {
      current = layerAt(zone.number, point.depth, point.depth);
      raw.push(current);
    } else if (zone.number === current.zone_number) {
      candidate = undefined;
      current.depth_bottom = point.depth;
    } else {
      if (candidate?.zone !== zone.number)
        candidate = {
          zone: zone.number,
          top: ((previousDepth ?? point.depth) + point.depth) / 2,
          samples: 1,
        };
      else candidate.samples++;
      if (
        (settings.hysteresisM === 0 || candidate.samples >= 2) &&
        point.depth - candidate.top + 1e-9 >= settings.hysteresisM
      ) {
        current.depth_bottom = candidate.top;
        current = layerAt(zone.number, candidate.top, point.depth);
        raw.push(current);
        candidate = undefined;
      } else current.depth_bottom = point.depth;
    }
    previousDepth = point.depth;
  }
  const layers: Layer[] = [];
  for (let i = 0; i < raw.length; i++) {
    const layer = { ...raw[i] },
      last = layers[layers.length - 1],
      next = raw[i + 1];
    if (layer.depth_bottom <= layer.depth_top) {
      warnings.push("Los meetpunt zonder dikte niet als laag geïnterpreteerd.");
      continue;
    }
    const contiguous =
      last && Math.abs(last.depth_bottom - layer.depth_top) < 1e-8;
    if (
      contiguous &&
      (last.zone_number === layer.zone_number ||
        layer.depth_bottom - layer.depth_top < settings.minimumThicknessM)
    )
      last.depth_bottom = layer.depth_bottom;
    else if (
      layer.depth_bottom - layer.depth_top < settings.minimumThicknessM &&
      next &&
      Math.abs(layer.depth_bottom - next.depth_top) < 1e-8
    )
      next.depth_top = layer.depth_top;
    else {
      if (layer.depth_bottom - layer.depth_top < settings.minimumThicknessM)
        warnings.push(
          "Dunne geïsoleerde laag behouden; geen buurlaag over een meetgat verondersteld.",
        );
      layers.push(layer);
    }
  }
  const provenance: LayerInterpretation = {
    schema: "ogs.layers/1",
    softwareVersion: APP_VERSION,
    cptId: cpt.id,
    sourceFile: cpt.metadata.source_file,
    method: "indicative-qc-rf",
    settings,
    layers,
  };
  return { layers, provenance, warnings };
}
export function withLayerInterpretation(
  cpt: Cpt,
  settings: LayerSettings,
  manual?: Layer[],
): Cpt {
  validateLayerSettings(settings);
  if (manual) validateLayerRanges(manual, cpt);
  const interpretation: LayerInterpretation = {
    schema: "ogs.layers/1",
    softwareVersion: APP_VERSION,
    cptId: cpt.id,
    sourceFile: cpt.metadata.source_file,
    method: manual ? "manual" : "indicative-qc-rf",
    settings,
    layers: manual ?? [],
    editedAt: new Date().toISOString(),
  };
  return {
    ...cpt,
    metadata: {
      ...cpt.metadata,
      extra: {
        ...cpt.metadata.extra,
        [LAYER_KEY]: JSON.stringify(interpretation),
      },
    },
  };
}
