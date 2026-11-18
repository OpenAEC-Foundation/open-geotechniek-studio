// Huisstijl van het rapport (voorblad, achterblad, voettekst).
//
// Standaard OpenAEC. Een organisatie kan haar eigen huisstijl leveren via
// een bron (bijvoorbeeld de instance van het bedrijf in de cloud); die bron
// wordt geregistreerd met `registerBrandSource` en bij het opstarten of
// inloggen geladen met `loadOrganizationBrand`. Ontbrekende velden vallen
// terug op de standaard, zodat een half ingevulde huisstijl nooit een kaal
// voorblad geeft.
import { create } from "zustand";

export type Rgb = [number, number, number];

export interface ReportBrand {
  /** Naam linksboven op het voorblad. */
  organization: string;
  tagline: string;
  website: string;
  /** Accentkleur voor naam, blokjes en labels. */
  accent: Rgb;
  /** Tweede kleur (verloop en patroon op het voorblad); ontbrekend = afgeleid van het accent. */
  secondary?: Rgb;
  /** Donkere vlakkleur van het voorblad; ontbrekend = de standaard. */
  dark?: Rgb;
  /** Optioneel logo als PNG/JPEG data-URL, voor een lichte achtergrond. */
  logoDataUrl?: string;
  /** Optioneel logo voor de donkere kop van het voorblad (wit of licht). */
  logoOnDarkDataUrl?: string;
  /** Eigen voorblad als paginagrote afbeelding (uit een PDF); vervangt de getekende opmaak. */
  coverImage?: string;
  /** Briefpapier voor de vervolgpagina's als paginagrote afbeelding (uit een PDF). */
  pageImage?: string;
  /** Contactregel onder op het voorblad (adres, telefoon, e-mail, KvK). */
  contact?: string;
  /** Labels rechts op het voorblad, maximaal drie. */
  badges: string[];
}

export const DEFAULT_BRAND: ReportBrand = {
  organization: "OpenAEC",
  tagline: "Build free. Build together.",
  website: "openaec.org",
  accent: [217, 119, 6],
  badges: ["OPEN SOURCE", "ENGINEERING"],
};

/** Een bron die de huisstijl van de organisatie levert. */
export interface BrandSource {
  id: string;
  label: string;
  load: () => Promise<Partial<ReportBrand>>;
}

interface BrandState {
  brand: ReportBrand;
  /** Waar de huisstijl vandaan komt: 'standaard' of de id van de bron. */
  source: string;
  error: string | null;
  setBrand: (patch: Partial<ReportBrand>, source: string) => void;
  reset: () => void;
}

export const useReportBrand = create<BrandState>((set) => ({
  brand: DEFAULT_BRAND,
  source: "standaard",
  error: null,
  setBrand: (patch, source) => set({ brand: mergeBrand(patch), source, error: null }),
  reset: () => set({ brand: DEFAULT_BRAND, source: "standaard", error: null }),
}));

const filled = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0;

/** Vult ontbrekende of ongeldige velden aan met de standaard. */
const isRgb = (c: unknown): c is Rgb => Array.isArray(c) && c.length === 3 && c.every((v) => Number.isInteger(v) && v >= 0 && v <= 255);
const isImage = (v: unknown): v is string => filled(v) && /^data:image\/(png|jpe?g);base64,/.test(v);

export function mergeBrand(patch: Partial<ReportBrand>): ReportBrand {
  const accent = isRgb(patch.accent) ? patch.accent : DEFAULT_BRAND.accent;
  return {
    secondary: isRgb(patch.secondary) ? patch.secondary : undefined,
    dark: isRgb(patch.dark) ? patch.dark : undefined,
    logoOnDarkDataUrl: isImage(patch.logoOnDarkDataUrl) ? patch.logoOnDarkDataUrl : undefined,
    contact: filled(patch.contact) ? patch.contact.trim() : undefined,
    coverImage: isImage(patch.coverImage) ? patch.coverImage : undefined,
    pageImage: isImage(patch.pageImage) ? patch.pageImage : undefined,
    organization: filled(patch.organization) ? patch.organization.trim() : DEFAULT_BRAND.organization,
    tagline: typeof patch.tagline === "string" ? patch.tagline.trim() : DEFAULT_BRAND.tagline,
    website: typeof patch.website === "string" ? patch.website.trim() : DEFAULT_BRAND.website,
    accent,
    logoDataUrl: isImage(patch.logoDataUrl) ? patch.logoDataUrl : undefined,
    badges: Array.isArray(patch.badges) ? patch.badges.filter(filled).slice(0, 3) : DEFAULT_BRAND.badges,
  };
}

let registered: BrandSource | null = null;
export function registerBrandSource(source: BrandSource | null) { registered = source; }

/** Laadt de huisstijl uit de geregistreerde bron; bij een fout blijft de vorige staan. */
export async function loadOrganizationBrand(): Promise<boolean> {
  if (!registered) return false;
  const source = registered;
  try {
    const patch = await source.load();
    useReportBrand.getState().setBrand(patch, source.id);
    return true;
  } catch (err) {
    useReportBrand.setState({ error: `Huisstijl van ${source.label} niet geladen: ${err instanceof Error ? err.message : String(err)}` });
    return false;
  }
}

export const currentBrand = () => useReportBrand.getState().brand;
