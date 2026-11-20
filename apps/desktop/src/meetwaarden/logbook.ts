// Het logboek in woorden: per bewerking wat er is gedaan en wat het opleverde, voor het paneel en het rapport.
import i18next from "i18next";
import type { Cpt } from "../types/cpt";
import { editLogOf } from "./state";
import { CHANNEL_UNIT, type Channel, type EditEffect, type EditKind, type EditOp, type MeasurementEdit } from "./types";

/** Vertaalde tekst; `lng` dwingt een taal af (het rapport is Nederlands). */
const tr = (key: string, nl: string, vars: Record<string, unknown> = {}, lng?: string) =>
  i18next.t(`meetwaarden:${key}`, { defaultValue: nl, ...vars, ...(lng ? { lng } : {}) }) as string;

/** Getal zonder overbodige nullen, hooguit `decimals` decimalen. */
export const num = (v: number, decimals = 3) => String(Number(v.toFixed(decimals)));
const signed = (v: number, decimals = 4) => `${v > 0 ? "+" : ""}${num(v, decimals)}`;
const depth = (v: number) => v.toFixed(2);

const KIND_NL: Record<EditKind, string> = {
  "remove-range": "Traject verwijderen",
  "invalidate-range": "Traject ongeldig maken",
  "trim-top": "Bovenkant afkappen",
  "trim-bottom": "Onderkant afkappen",
  "zero-shift": "Nulpuntverschuiving",
  "depth-shift": "Diepteverschuiving",
  "set-value": "Meetwaarde corrigeren",
  "remove-outliers": "Uitschieters verwijderen",
};
export const kindLabel = (kind: EditKind, lng?: string) => tr(`kind.${kind}`, KIND_NL[kind], {}, lng);

const CHANNEL_NL: Record<Channel, string> = { qc: "qc", fs: "fs", rf: "Rf", u2: "u2", inclination: "helling" };
export const channelLabel = (channel: Channel, lng?: string) => tr(`channel.${channel}`, CHANNEL_NL[channel], {}, lng);

/** Wat de bewerking doet, met traject en kanaal. */
export function describeOp(op: EditOp, lng?: string): string {
  switch (op.kind) {
    case "remove-range":
      return tr("op.removeRange", "Traject {{from}} tot {{to}} m verwijderd", { from: depth(op.from), to: depth(op.to) }, lng);
    case "invalidate-range":
      return tr("op.invalidateRange", "{{channels}} ongeldig gemaakt van {{from}} tot {{to}} m", {
        channels: op.channels.length ? op.channels.map((c) => channelLabel(c, lng)).join(", ") : tr("channel.all", "Alle kanalen", {}, lng),
        from: depth(op.from), to: depth(op.to),
      }, lng);
    case "trim-top":
      return tr("op.trimTop", "Bovenkant afgekapt: alles boven {{depth}} m vervalt", { depth: depth(op.depth) }, lng);
    case "trim-bottom":
      return tr("op.trimBottom", "Onderkant afgekapt: alles onder {{depth}} m vervalt", { depth: depth(op.depth) }, lng);
    case "zero-shift": {
      const vars = { channel: channelLabel(op.channel, lng), offset: signed(op.offset), unit: CHANNEL_UNIT[op.channel] };
      return op.from !== undefined || op.to !== undefined
        ? tr("op.zeroShiftRange", "Nulpuntverschuiving {{channel}} {{offset}} {{unit}} van {{from}} tot {{to}} m",
          { ...vars, from: op.from !== undefined ? depth(op.from) : "…", to: op.to !== undefined ? depth(op.to) : "…" }, lng)
        : tr("op.zeroShift", "Nulpuntverschuiving {{channel}} {{offset}} {{unit}}", vars, lng);
    }
    case "depth-shift":
      return tr("op.depthShift", "Diepteverschuiving {{offset}} m", { offset: signed(op.offset, 3) }, lng);
    case "set-value":
      return tr("op.setValue", "{{channel}} op {{depth}} m gecorrigeerd", { channel: channelLabel(op.channel, lng), depth: depth(op.depth) }, lng);
    case "remove-outliers":
      return tr("op.removeOutliers", "Uitschieters in {{channel}} ongeldig gemaakt van {{from}} tot {{to}} m (venster ±{{window}}, drempel {{threshold}})", {
        channel: channelLabel(op.channel, lng), from: depth(op.from), to: depth(op.to), window: num(op.halfWindow, 0), threshold: num(op.threshold, 2),
      }, lng);
  }
}

/** Wat het opleverde: oude en nieuwe waarde bij een losse meetwaarde, anders het aantal geraakte punten. */
export function describeEffect(op: EditOp, effect: EditEffect, lng?: string): string {
  if (op.kind === "set-value" && effect.affected) {
    const none = tr("result.noValue", "geen waarde", {}, lng);
    const show = (v: number | null | undefined) => (v == null ? none : `${num(v, 4)} ${CHANNEL_UNIT[op.channel]}`);
    return `${show(effect.before)} → ${show(effect.after)}`;
  }
  return tr("result.points", "geraakte meetpunten: {{n}}", { n: effect.affected }, lng);
}

/** Tijdstip in de vorm dd-mm-jjjj uu:mm (lokale tijd). */
export function logTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const two = (v: number) => String(v).padStart(2, "0");
  return `${two(d.getDate())}-${two(d.getMonth() + 1)}-${d.getFullYear()} ${two(d.getHours())}:${two(d.getMinutes())}`;
}

export interface LogRow {
  edit: MeasurementEdit;
  index: number;
  time: string;
  what: string;
  result: string;
}

/** De regels van het logboek, in de volgorde van toepassen. */
export function logRows(cpt: Cpt, lng?: string): LogRow[] {
  const { edits, effects } = editLogOf(cpt);
  return edits.map((edit, i) => ({ edit, index: i + 1, time: logTime(edit.at), what: describeOp(edit.op, lng), result: describeEffect(edit.op, effects[i], lng) }));
}

/**
 * De tabel "Bewerkingen" voor het testrapport van de sondering: per bewerking het tijdstip, en daarnaast
 * wat, het resultaat, de reden en wie. Geen bewerkingen: geen tabel.
 */
export function editReportGroup(cpt: Cpt): { title: string; rows: Array<{ label: string; value: string | null }> } | null {
  const rows = logRows(cpt, "nl");
  if (!rows.length) return null;
  const { originalCount } = editLogOf(cpt);
  return {
    title: "Bewerkingen op de meetwaarden",
    rows: [
      { label: "Meetpunten", value: `${originalCount} in het bronbestand, ${cpt.points.length} na bewerking; de oorspronkelijke meetwaarden zijn bewaard.` },
      ...rows.map((row) => ({
        // Het label is één regel breed; de naam staat daarom bij de tekst, die wel doorloopt.
        label: `${row.index}. ${row.time}`,
        value: `${row.what}; ${row.result}. Reden: ${row.edit.reason}${row.edit.by ? ` (${row.edit.by})` : ""}`,
      })),
    ],
  };
}
