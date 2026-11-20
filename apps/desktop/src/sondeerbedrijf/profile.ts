// Bedrijfsprofiel van een sondeerbedrijf: de paar gegevens waaruit de huisstijl van het rapport volgt.
// Opslaan zet de eigen huisstijl (naam, logo, kleur, contactregel) en kiest die als bron voor de rapporten.
import { getSetting, setSetting } from "../store";
import { getOwnBrand, saveOwnBrand, setBrandMode } from "../report/brandSettings";
import type { ReportBrand, Rgb } from "../report/reportBrand";
import type { ReportSections } from "../store/reportSectionsState";

export interface CompanyProfile {
  name: string;
  address: string;
  postalCity: string;
  phone: string;
  email: string;
  website: string;
  /** KvK-nummer, acht cijfers. */
  kvk: string;
  accent: Rgb;
  logoDataUrl?: string;
}

export const EMPTY_PROFILE: CompanyProfile = { name: "", address: "", postalCity: "", phone: "", email: "", website: "", kvk: "", accent: [0, 82, 147] };
const KEY = "sondeerbedrijf.profile";

export async function loadProfile(): Promise<CompanyProfile> {
  const saved = await getSetting<Partial<CompanyProfile> | null>(KEY, null);
  if (saved) return { ...EMPTY_PROFILE, ...saved };
  // Eerste keer: neem over wat er al als eigen huisstijl is ingesteld.
  const own = await getOwnBrand();
  return { ...EMPTY_PROFILE, name: own.organization ?? "", website: own.website ?? "", accent: own.accent ?? EMPTY_PROFILE.accent, logoDataUrl: own.logoDataUrl };
}

/** Contactregel voor de voet van het voorblad: alleen wat is ingevuld. */
export function contactLine(p: CompanyProfile): string {
  return [p.address, p.postalCity, p.phone && `T ${p.phone}`, p.email, p.kvk && `KvK ${p.kvk}`].filter(Boolean).join(" · ");
}

/** Wat er aan het profiel niet klopt; leeg = in orde. */
export function profileProblems(p: CompanyProfile): string[] {
  const out: string[] = [];
  if (!p.name.trim()) out.push("Vul de bedrijfsnaam in.");
  if (p.kvk.trim() && !/^\d{8}$/.test(p.kvk.trim())) out.push("Een KvK-nummer heeft acht cijfers.");
  if (p.email.trim() && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(p.email.trim())) out.push("Het e-mailadres lijkt niet te kloppen.");
  return out;
}

/** De huisstijl die uit het profiel volgt, bovenop wat al was ingesteld (voorblad, briefpapier, tweede kleur). */
export function brandFromProfile(p: CompanyProfile, current: Partial<ReportBrand> = {}): Partial<ReportBrand> {
  return {
    ...current,
    organization: p.name.trim(), tagline: current.tagline ?? "", website: p.website.trim(), accent: p.accent,
    logoDataUrl: p.logoDataUrl, contact: contactLine(p), badges: ["SONDEERRAPPORT"],
  };
}

export async function saveProfile(p: CompanyProfile): Promise<void> {
  await setSetting(KEY, p);
  await saveOwnBrand(brandFromProfile(p, await getOwnBrand()));
  await setBrandMode("eigen");
}

/** Vaste opbouw van het sondeerrapport: voorblad, teksten, coördinaten, kaart, sondeerstaten, testrapporten, legenda en bestandsgegevens. */
export const CPT_REPORT_SECTIONS: ReportSections = {
  coverTitle: "Sondeerrapport", cover: true, coordTable: true, map: true, perCpt: true, sbtLegend: true, metadata: true,
  texts: true, testReport: true, boreLogs: true,
};
