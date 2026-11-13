// Welke huisstijl de rapporten gebruiken: de standaard OpenAEC-stijl, een eigen huisstijl die de gebruiker in de
// app instelt (naam, kleuren, logo, voorblad- en briefpapier-PDF), of die uit de OpenAEC SuperCloud.
//
// De eigen huisstijl staat in een eigen bestand (huisstijl.json) naast de voorkeuren, omdat logo's en
// achtergronden als afbeelding erin staan en dat bestand dus groter is.
import { load, type Store } from "@tauri-apps/plugin-store";
import { getSetting, setSetting } from "../store";
import { IS_TAURI } from "../utils/platform";
import { useReportBrand, type ReportBrand } from "./reportBrand";
import { applyCachedCloudBrand, getCloudTarget, initCloudBrand } from "./cloudBrand";

export type BrandMode = "standaard" | "eigen" | "supercloud";
export const BRAND_MODES: BrandMode[] = ["standaard", "eigen", "supercloud"];
const KEY_MODE = "brand.mode", KEY_OWN = "eigen", BROWSER_KEY = "ogs:huisstijl.eigen";

let store: Store | null = null;
async function brandStore() {
  if (!store) store = await load("huisstijl.json", { autoSave: true, defaults: {} });
  return store;
}

export async function getOwnBrand(): Promise<Partial<ReportBrand>> {
  try {
    if (IS_TAURI) return (await (await brandStore()).get<Partial<ReportBrand>>(KEY_OWN)) ?? {};
    return JSON.parse(window.localStorage.getItem(BROWSER_KEY) ?? "{}");
  } catch { return {}; }
}

export async function saveOwnBrand(brand: Partial<ReportBrand>) {
  if (IS_TAURI) await (await brandStore()).set(KEY_OWN, brand);
  else window.localStorage.setItem(BROWSER_KEY, JSON.stringify(brand));
  if ((await getBrandMode()) === "eigen") useReportBrand.getState().setBrand(brand, "Eigen huisstijl");
}

export async function getBrandMode(): Promise<BrandMode> {
  const mode = await getSetting<BrandMode | null>(KEY_MODE, null);
  if (mode && BRAND_MODES.includes(mode)) return mode;
  // Van voor de keuze: wie al een omgeving had gekozen, gebruikt de SuperCloud.
  return (await getCloudTarget()).host ? "supercloud" : "standaard";
}

/** Zet de bron en past de huisstijl direct toe. */
export async function setBrandMode(mode: BrandMode) {
  await setSetting(KEY_MODE, mode);
  await applyBrandMode(mode);
}

export async function applyBrandMode(mode: BrandMode) {
  const state = useReportBrand.getState();
  if (mode === "eigen") state.setBrand(await getOwnBrand(), "Eigen huisstijl");
  else if (mode === "supercloud") { if (!(await applyCachedCloudBrand())) state.reset(); }
  else state.reset();
}

/** Bij het starten van de app. */
export async function initBrand() {
  const mode = await getBrandMode();
  if (mode === "supercloud") await initCloudBrand();
  else await applyBrandMode(mode);
}
