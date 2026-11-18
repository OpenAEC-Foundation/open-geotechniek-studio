// OpenAEC B2-iconen uit de vaste Blueprint-kopie in assets/openaec-icons (zie OPENAEC-ICONS.json).
// De hoofdkleur is currentColor (grijs, de tekstkleur), het accent var(--icon-accent): oranje uit het thema.
import sprite from "../../assets/openaec-icons/geotechniek.svg?raw";

export type OaIconSize = 16 | 24;

const symbols = new Map<string, string>();
for (const m of sprite.matchAll(/<symbol id="i(16|24)-([^"]+)" viewBox="[^"]*">([\s\S]*?)<\/symbol>/g)) {
  symbols.set(`${m[1]}:${m[2]}`, m[3]);
}

/** Of een tekst een B2-id is ("view.fit") en geen svg-tekst. */
export function isOaIconId(icon: string): boolean {
  return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(icon);
}

/** Alle ids in de kopie (voor de test die nagaat dat de code alleen bestaande ids gebruikt). */
export function oaIconIds(): string[] {
  return [...new Set([...symbols.keys()].map((k) => k.split(":")[1]))];
}

function inner(id: string, size: OaIconSize): string {
  const body = symbols.get(`${size}:${id}`);
  if (body === undefined) {
    if (import.meta.env.DEV) console.error(`OpenAEC-icoon ontbreekt in de kopie: ${id}`);
    return "";
  }
  return body;
}

/** Svg-tekst voor plekken die een icoon als string krijgen (lintknoppen, Bestand-menu). */
export function oaIcon(id: string, size: OaIconSize = 24): string {
  return `<svg class="oa-icon${size === 24 ? " oa-icon--24" : ""}" data-icon="${id}" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" aria-hidden="true" focusable="false">${inner(id, size)}</svg>`;
}

/** Het icoon als React-element. Tot en met 18 px de 16 px-tekening, daarboven de 24 px-tekening. */
export function OaIcon({ id, size = 16, className }: { id: string; size?: OaIconSize; className?: string }) {
  return (
    <svg className={`oa-icon${size === 24 ? " oa-icon--24" : ""}${className ? ` ${className}` : ""}`} data-icon={id}
      viewBox={`0 0 ${size} ${size}`} width={size} height={size} aria-hidden="true" focusable="false"
      dangerouslySetInnerHTML={{ __html: inner(id, size) }} />
  );
}
