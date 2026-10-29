import type { Cpt, Layer } from "../types/cpt";
export {classify,zones} from "./soilZones";
import {analyzeLayers} from "./layerAnalysis";
export function detectLayers(cpt:Cpt):Layer[]{return analyzeLayers(cpt).layers;}
