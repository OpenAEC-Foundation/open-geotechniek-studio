// One colour palette for every calculation report.
//
// The accent comes from the active house style (default: the OpenAEC amber) and
// is used for the rule under titles and for the result box. Everything else is
// black and greys. "Voldoet" and "voldoet niet" use the success and error
// colours of the light theme in styles/blueprint/openaec-tokens.css.
import { currentBrand, type ReportBrand, type Rgb } from "./reportBrand";

export interface ReportPalette {
  /** Accent of the house style: rules under titles, bar of the result box. */
  accent: Rgb;
  /** Darkened accent that stays readable as small text on white. */
  accentStrong: Rgb;
  /** Very light wash of the accent, for a zone in a chart. */
  accentTint: Rgb;
  /** A slightly stronger wash of the accent. */
  accentTintStrong: Rgb;
  /** Body text. */
  ink: Rgb;
  /** Secondary text: labels, filled-in numbers, notes. */
  secondary: Rgb;
  /** Tertiary text: references, footer, axis labels. */
  muted: Rgb;
  /** Hairlines between table rows and grid lines in charts. */
  rule: Rgb;
  /** Frames of charts and the line under a table header. */
  ruleStrong: Rgb;
  /** Background of a table header and of the result box. */
  surface: Rgb;
  /** Background of every other table row. */
  zebra: Rgb;
  /** Neutral wash for a zone in a chart. */
  neutralTint: Rgb;
  /** --oa-success and its tint. */
  success: Rgb;
  successTint: Rgb;
  /** --oa-error and its tint. */
  error: Rgb;
  errorTint: Rgb;
  /** --oa-info: water levels and a second line in a chart. */
  info: Rgb;
}

const WHITE: Rgb = [255, 255, 255];

const mix = (a: Rgb, b: Rgb, t: number): Rgb => [0, 1, 2].map((i) => Math.round(a[i] + (b[i] - a[i]) * t)) as Rgb;

function luminance([r, g, b]: Rgb): number {
  const lin = (v: number) => (v / 255 <= 0.03928 ? v / 255 / 12.92 : ((v / 255 + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** Darkens a colour until it has a contrast of at least 4.5 on white. */
function readable(c: Rgb): Rgb {
  let out = c;
  for (let i = 0; i < 40 && 1.05 / (luminance(out) + 0.05) < 4.5; i++) out = mix(out, [0, 0, 0], 0.06);
  return out;
}

export function reportPalette(brand: Pick<ReportBrand, "accent"> = currentBrand()): ReportPalette {
  const accent = brand.accent;
  return {
    accent,
    accentStrong: readable(accent),
    accentTint: mix(accent, WHITE, 0.9),
    accentTintStrong: mix(accent, WHITE, 0.78),
    ink: [0, 0, 0],
    secondary: [72, 72, 78],
    muted: [112, 112, 118],
    rule: [222, 222, 224],
    ruleStrong: [127, 127, 132],
    surface: [245, 245, 244],
    zebra: [250, 250, 249],
    neutralTint: [234, 234, 236],
    success: [22, 101, 52],
    successTint: [232, 240, 235],
    error: [185, 28, 28],
    errorTint: [248, 232, 232],
    info: [29, 78, 216],
  };
}
