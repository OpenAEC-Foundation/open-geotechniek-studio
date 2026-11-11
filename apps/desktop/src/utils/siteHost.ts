/**
 * De OpenAEC SuperCloud-werkplek (contract: OpenAEC-Blueprint, docs/supercloud-koppeling.md). Daar zet de omgeving
 * `window.openaecHost` neer: opslaan en openen gaan dan naar Docs in plaats van naar de downloadmap of de
 * bestandskiezer van de browser. Opslaan onder dezelfde naam maakt in de werkplek een nieuwe versie van dat bestand.
 */
import i18next from "i18next";

interface DocsRef { id: string; name: string; version: string | number }
export interface SiteHost {
  open(id: string, version?: string | number): Promise<DocsRef & { readOnly: boolean; bytes: ArrayBuffer | Uint8Array }>;
  save(bytes: Uint8Array, options: { id?: string; name?: string }): Promise<DocsRef>;
  list(): Promise<{ id: string; name: string; modified: string }[]>;
}

export function siteHost(): SiteHost | null {
  const host = typeof window !== "undefined" ? (window as { openaecHost?: SiteHost }).openaecHost : undefined;
  return host && typeof host.open === "function" && typeof host.save === "function" && typeof host.list === "function"
    ? host : null;
}

/** Bewaar in Docs onder een naam die de gebruiker bevestigt; null bij annuleren. */
export async function bewaarInDocs(host: SiteHost, blob: Blob | ((naam: string) => Blob), voorstel: string): Promise<string | null> {
  const naam = window.prompt(i18next.t("common:docs.nameInDocs"), voorstel);
  if (!naam) return null;
  const inhoud = typeof blob === "function" ? blob(naam) : blob;
  const ref = await host.save(new Uint8Array(await inhoud.arrayBuffer()), { name: naam });
  return ref.name;
}

/** Kies bestanden uit dezelfde map in Docs die passen bij de HTML-accept-string (".gef,.ifcgeo"). */
export async function kiesUitDocs(host: SiteHost, accept?: string): Promise<{ name: string; text: string }[]> {
  const soorten = (accept ?? "").split(",").map((s) => s.trim().toLowerCase()).filter((s) => s.startsWith("."));
  const lijst = (await host.list()).filter((f) => !soorten.length || soorten.some((s) => f.name.toLowerCase().endsWith(s)));
  if (!lijst.length) {
    window.alert(i18next.t("common:docs.noFiles"));
    return [];
  }
  const keuze = window.prompt(
    `${i18next.t("common:docs.choose")}\n\n${lijst.map((f, i) => `${i + 1}. ${f.name}`).join("\n")}`,
    "1",
  );
  const nummer = keuze ? Number.parseInt(keuze, 10) : Number.NaN;
  if (!Number.isInteger(nummer) || nummer < 1 || nummer > lijst.length) return [];
  const f = await host.open(lijst[nummer - 1].id);
  const bytes = f.bytes instanceof Uint8Array ? f.bytes : new Uint8Array(f.bytes);
  return [{ name: f.name, text: new TextDecoder().decode(bytes) }];
}
