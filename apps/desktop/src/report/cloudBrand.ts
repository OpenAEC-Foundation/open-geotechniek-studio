// Huisstijl uit de klantomgeving (OpenAEC SuperCloud, schema `huisstijl/1`).
//
// De gebruiker logt in met het OpenAEC-account, kiest een omgeving en een handelsnaam; de app leest de huisstijl
// en zet die om naar de rapporthuisstijl (voorblad, kop en voet). Het resultaat wordt lokaal bewaard: offline
// gebruikt de app de laatste versie, zonder versie de standaard OpenAEC-stijl. Verversen gebeurt bij het starten en
// op verzoek; alleen bij een ander `bijgewerkt` worden de logo's opnieuw opgehaald.
import { invoke } from "@tauri-apps/api/core";
import { getSetting, setSetting } from "../store";
import { IS_TAURI } from "../utils/platform";
import { mergeBrand, useReportBrand, type ReportBrand, type Rgb } from "./reportBrand";
import { logoToImage, pageToImage } from "./brandAssets";

interface Kleur { hex?: string; rgb?: { r: number; g: number; b: number } }
interface Adres { regel1?: string | null; regel2?: string | null; postcode?: string | null; plaats?: string | null }
export interface Huisstijl {
  schema: string;
  weergave?: "beheer" | "lid" | "publiek";
  handelsnaam?: {
    naam?: string; website?: string | null; telefoon?: string | null; email?: string | null; kvk?: string | null;
    adressen?: { bezoek?: Adres | null; post?: Adres | null } | null;
  };
  merk?: { naam?: string | null; tagline?: string | null };
  logos?: Record<string, Record<string, string>>;
  kleuren?: Record<string, Kleur>;
  /** Paginatype -> achtergrond (PDF of PNG, getekend adres); `cover` = voorblad, `content` = rapportpagina. */
  briefpapier?: Record<string, { bron?: string | null } | null> | null;
  bijgewerkt?: string;
}
export interface Handelsnaam { naam: string; standaard: boolean; actief: boolean; bedrijf: string | null }
export interface Omgeving { host: string; soort?: string | null }
export interface CloudStatus { ingelogd: boolean; email?: string | null; naam?: string | null; omgevingen: Omgeving[] }
export interface CloudBrandCache { host: string; handelsnaam: string | null; bijgewerkt: string | null; opgehaald: string; brand: Partial<ReportBrand> }

const KEY_HOST = "cloudBrand.host", KEY_NAAM = "cloudBrand.handelsnaam", KEY_CACHE = "cloudBrand.cache";

/** Logovarianten voor een lichte achtergrond (kop, voet) en voor het donkere voorblad, in volgorde van voorkeur. */
export const LOGO_ON_LIGHT = ["main", "main_hires", "dark", "tagline", "symbol"];
export const LOGO_ON_DARK = ["white", "light", "symbol_transparent"];

/** Pad van het eerste logo in de gevraagde varianten; PNG gaat voor SVG (PDF kan het rapport niet tonen). */
export function logoPath(h: Huisstijl, variants: string[]): string | null {
  for (const v of variants) {
    const formats = h.logos?.[v];
    const url = formats?.png ?? formats?.svg;
    if (url) return url.replace(/^https?:\/\/[^/]+/, "");
  }
  return null;
}

export function kleurRgb(k: Kleur | undefined): Rgb | undefined {
  if (k?.rgb && [k.rgb.r, k.rgb.g, k.rgb.b].every((v) => Number.isInteger(v) && v >= 0 && v <= 255)) return [k.rgb.r, k.rgb.g, k.rgb.b];
  const m = k?.hex?.match(/^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : undefined;
}

const luminance = ([r, g, b]: Rgb) => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
const filled = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0;

/** Zet een `huisstijl/1`-antwoord om naar de rapporthuisstijl. */
export function huisstijlToBrand(h: Huisstijl, logos: { onLight?: string; onDark?: string } = {}): Partial<ReportBrand> {
  const k = h.kleuren ?? {};
  const accent = kleurRgb(k.primary) ?? kleurRgb(k.accent);
  const darkCandidates = [kleurRgb(k.dark), kleurRgb(k.donker), kleurRgb(k.text), kleurRgb(k.secondary)].filter((c): c is Rgb => !!c && luminance(c) < 0.3);
  const hn = h.handelsnaam ?? {};
  const adres = hn.adressen?.bezoek ?? hn.adressen?.post ?? null;
  const adresTekst = adres ? [adres.regel1, [adres.postcode, adres.plaats].filter(filled).join(" ")].filter(filled).join(", ") : "";
  const contact = [adresTekst, hn.telefoon, hn.email, filled(hn.kvk) ? `KvK ${hn.kvk}` : ""].filter(filled).join(" · ");
  return {
    organization: (filled(h.merk?.naam) ? h.merk!.naam! : hn.naam ?? "").trim(),
    tagline: (h.merk?.tagline ?? "").trim(),
    website: (hn.website ?? "").replace(/^https?:\/\//, "").replace(/\/$/, ""),
    accent,
    secondary: kleurRgb(k.secondary),
    dark: darkCandidates[0],
    contact,
    badges: [],
    logoDataUrl: logos.onLight,
    logoOnDarkDataUrl: logos.onDark,
  };
}

async function fetchLogo(host: string, path: string | null): Promise<string | undefined> {
  if (!path) return undefined;
  try { return await logoToImage(await invoke<string>("cloud_file", { host, pad: path })); } catch { return undefined; }
}

/** Briefpapier van een paginatype (`cover`, `content`) als achtergrond; alleen leden krijgen het getekende adres. */
async function fetchStationery(host: string, h: Huisstijl, type: string): Promise<string | undefined> {
  const url = h.briefpapier?.[type]?.bron;
  if (!url) return undefined;
  const pad = url.replace(/^https?:\/\/[^/]+/, "");
  try { return await pageToImage(await invoke<string>("cloud_file", { host, pad })); } catch { return undefined; }
}

export const cloudStatus = () => (IS_TAURI ? invoke<CloudStatus>("cloud_status") : Promise.resolve<CloudStatus>({ ingelogd: false, omgevingen: [] }));
export const cloudLogin = () => invoke<CloudStatus>("cloud_login");
export const cloudLogout = () => invoke<void>("cloud_logout");
export const listHandelsnamen = (host: string) =>
  invoke<Handelsnaam[]>("cloud_method", { host, methode: "openaec_beheer.huisstijl.handelsnamen", query: [] });

export const getCloudTarget = async () => ({ host: await getSetting<string | null>(KEY_HOST, null), handelsnaam: await getSetting<string | null>(KEY_NAAM, null) });
export async function setCloudTarget(host: string | null, handelsnaam: string | null) {
  await setSetting(KEY_HOST, host);
  await setSetting(KEY_NAAM, handelsnaam);
}
export const getCloudCache = () => getSetting<CloudBrandCache | null>(KEY_CACHE, null);

function apply(cache: CloudBrandCache) {
  useReportBrand.getState().setBrand(cache.brand, `SuperCloud · ${mergeBrand(cache.brand).organization}`);
}

/** Bij het starten: de bewaarde huisstijl van de gekozen omgeving, als die er is. */
export async function applyCachedCloudBrand(): Promise<boolean> {
  const { host, handelsnaam } = await getCloudTarget();
  const cache = await getCloudCache();
  if (!host || !cache || cache.host !== host || cache.handelsnaam !== handelsnaam) return false;
  apply(cache);
  return true;
}

/**
 * Leest de huisstijl opnieuw. Gelijk `bijgewerkt` (en niet `force`): de bewaarde versie blijft. Lukt het niet
 * (offline, niet ingelogd, cloud onbereikbaar), dan blijft de bewaarde versie staan en volgt een fout.
 */
export async function refreshCloudBrand(force = false): Promise<CloudBrandCache> {
  const { host, handelsnaam } = await getCloudTarget();
  if (!host) throw new Error("Kies eerst een omgeving.");
  const h = await invoke<Huisstijl>("cloud_method", {
    host, methode: "openaec_beheer.huisstijl.get", query: handelsnaam ? [["handelsnaam", handelsnaam]] : [],
  });
  if (h?.schema !== "huisstijl/1") throw new Error(`Onbekend antwoord van ${host} (schema ${String(h?.schema)}).`);
  const cached = await getCloudCache();
  if (!force && cached && cached.host === host && cached.handelsnaam === handelsnaam && cached.bijgewerkt === (h.bijgewerkt ?? null)) {
    apply(cached);
    return cached;
  }
  const [onLight, onDark, coverImage, pageImage] = await Promise.all([
    fetchLogo(host, logoPath(h, LOGO_ON_LIGHT)), fetchLogo(host, logoPath(h, LOGO_ON_DARK)),
    fetchStationery(host, h, "cover"), fetchStationery(host, h, "content"),
  ]);
  const cache: CloudBrandCache = {
    host, handelsnaam, bijgewerkt: h.bijgewerkt ?? null, opgehaald: new Date().toISOString(),
    brand: { ...huisstijlToBrand(h, { onLight, onDark }), coverImage, pageImage },
  };
  await setSetting(KEY_CACHE, cache);
  apply(cache);
  return cache;
}

/** Terug naar de standaard OpenAEC-stijl; de gekozen omgeving en de cache vervallen. */
export async function resetCloudBrand() {
  await setCloudTarget(null, null);
  await setSetting(KEY_CACHE, null);
  useReportBrand.getState().reset();
}

/** Opstarten: eerst de cache, daarna stil verversen als de gebruiker is ingelogd. */
export async function initCloudBrand() {
  if (!IS_TAURI) return;
  await applyCachedCloudBrand();
  try {
    const status = await cloudStatus();
    if (status.ingelogd && (await getCloudTarget()).host) await refreshCloudBrand();
  } catch (err) {
    useReportBrand.setState({ error: `Huisstijl niet ververst: ${err instanceof Error ? err.message : String(err)}` });
  }
}
