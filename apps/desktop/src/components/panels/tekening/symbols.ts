import { soortHasFriction, soortHasPorePressure, type SonderingSoort } from "./sonderingSoort";

/**
 * Symbols drawn on the paper, as SVG strings with every colour and width as
 * an attribute: the PDF export rasterises inline SVG on its own, without the
 * page stylesheet, so nothing here may depend on CSS.
 *
 * Geometry (see SYMBOLEN.md next to this file):
 *   - test: triangle pointing down, the apex is the location;
 *   - sleeve friction: short horizontal bar under the apex;
 *   - pore pressure: small ring under the apex (under the bar when both);
 *   - carried out = filled, planned = open;
 *   - borehole: ring with centre dot.
 */

export type SymbolStatus = "uitgevoerd" | "gepland";

export type SymbolSpec =
  | { type: "sondering"; soort: SonderingSoort; status: SymbolStatus }
  | { type: "boring"; status: SymbolStatus };

export interface SymbolColors {
  ink: string;
  paper: string;
  accent: string;
}

export const DEFAULT_SYMBOL_COLORS: SymbolColors = { ink: "#2A2A32", paper: "#FFFFFF", accent: "#D97706" };

/** One line weight for every symbol, in viewBox units (24 wide). */
export const SYMBOL_STROKE = 1.5;
/** Width of a symbol on the paper, in CSS px (about 7 mm). */
export const SYMBOL_SIZE_PX = 28;

const VIEW_W = 24;
const VIEW_H_CPT = 30;
const APEX = { x: 12, y: 16 };

export interface SymbolSvg {
  svg: string;
  width: number;
  height: number;
  /** Pixel inside the box that sits on the location. */
  anchorX: number;
  anchorY: number;
  /** Extent of the drawn shape relative to the anchor, for label placement. */
  box: { left: number; top: number; right: number; bottom: number };
}

export function symbolKey(spec: SymbolSpec): string {
  return spec.type === "boring" ? `boring:${spec.status}` : `sondering:${spec.soort}:${spec.status}`;
}

export function symbolSvg(
  spec: SymbolSpec,
  opts: { size?: number; colors?: SymbolColors; selected?: boolean } = {},
): SymbolSvg {
  const size = opts.size ?? SYMBOL_SIZE_PX;
  const c = opts.colors ?? DEFAULT_SYMBOL_COLORS;
  const k = size / VIEW_W;
  const stroke = opts.selected ? c.accent : c.ink;
  const filled = spec.status === "uitgevoerd";
  const fill = filled ? stroke : c.paper;
  const sw = SYMBOL_STROKE;
  const common = `stroke="${stroke}" stroke-width="${sw}" stroke-linejoin="round" stroke-linecap="round"`;

  if (spec.type === "boring") {
    const body =
      `<circle cx="12" cy="12" r="7" fill="${filled ? stroke : c.paper}" ${common} />` +
      `<circle cx="12" cy="12" r="1.8" fill="${filled ? c.paper : stroke}" />`;
    return {
      svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="${size}" height="${size}" overflow="visible">${body}</svg>`,
      width: size,
      height: size,
      anchorX: 12 * k,
      anchorY: 12 * k,
      box: { left: -8 * k, top: -8 * k, right: 8 * k, bottom: 8 * k },
    };
  }

  const friction = soortHasFriction(spec.soort);
  const pore = soortHasPorePressure(spec.soort);
  let body = `<polygon points="4,3 20,3 12,16" fill="${fill}" ${common} />`;
  let bottom = APEX.y + 1;
  if (friction) {
    body += `<line x1="6" y1="20" x2="18" y2="20" fill="none" ${common} />`;
    bottom = 21;
  }
  if (pore) {
    const cy = friction ? 24.5 : 21;
    body += `<circle cx="12" cy="${cy}" r="2.4" fill="${c.paper}" ${common} />`;
    bottom = cy + 3.2;
  }
  const height = (VIEW_H_CPT * size) / VIEW_W;
  return {
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${VIEW_W} ${VIEW_H_CPT}" width="${size}" height="${height}" overflow="visible">${body}</svg>`,
    width: size,
    height,
    anchorX: APEX.x * k,
    anchorY: APEX.y * k,
    box: { left: -9 * k, top: -14 * k, right: 9 * k, bottom: (bottom - APEX.y) * k },
  };
}

/** Placement of a label relative to the symbol's location, see labelPlacement. */
interface IconLabelPlacement {
  dx: number;
  dy: number;
  leader?: { x1: number; y1: number; x2: number; y2: number };
}

/**
 * HTML of one map marker: the symbol, its label and, when the label had to
 * move aside, a leader line. The leader gets an SVG box of its own size,
 * because the PDF export clips an SVG to its box. `label` must be escaped.
 */
export function markerIconHtml(
  sym: SymbolSvg,
  opts: { label: string; placement?: IconLabelPlacement; className?: string; ink?: string },
): string {
  const ink = opts.ink ?? DEFAULT_SYMBOL_COLORS.ink;
  const p = opts.placement ?? { dx: sym.box.right + 3, dy: sym.box.top };
  const px = (v: number) => `${Math.round(v * 10) / 10}px`;
  let leader = "";
  if (p.leader) {
    const { x1, y1, x2, y2 } = p.leader;
    const pad = 1;
    const left = Math.min(x1, x2) - pad;
    const top = Math.min(y1, y2) - pad;
    const w = Math.abs(x2 - x1) + pad * 2;
    const h = Math.abs(y2 - y1) + pad * 2;
    leader =
      `<svg class="tek-marker-leader" xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" ` +
      `style="left:${px(sym.anchorX + left)};top:${px(sym.anchorY + top)}">` +
      `<line x1="${x1 - left}" y1="${y1 - top}" x2="${x2 - left}" y2="${y2 - top}" stroke="${ink}" stroke-width="0.75" stroke-linecap="round" /></svg>`;
  }
  return (
    `<div class="tek-marker ${opts.className ?? ""}" style="width:${px(sym.width)};height:${px(sym.height)}">` +
    sym.svg +
    leader +
    `<span class="tek-marker-label" style="left:${px(sym.anchorX + p.dx)};top:${px(sym.anchorY + p.dy)};color:${ink}">${opts.label}</span>` +
    `</div>`
  );
}
