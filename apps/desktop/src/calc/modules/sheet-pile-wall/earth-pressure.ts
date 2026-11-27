// Gronddrukcoëfficiënten voor een verticale wand met horizontaal maaiveld. Alle coëfficiënten geven de
// horizontale component van de korreldruk. Bronnen en controlegetallen: VERIFICATIE.md.

const rad = (deg: number) => (deg * Math.PI) / 180;

export type PassiveMethod = "auto" | "straight" | "curved";

/** Neutrale gronddruk volgens Jaky: K0 = 1 − sin φ'. */
export const k0Jaky = (phiDeg: number): number => 1 - Math.sin(rad(phiDeg));

const root = (phiDeg: number, deltaDeg: number) => Math.sqrt((Math.sin(rad(phiDeg + deltaDeg)) * Math.sin(rad(phiDeg))) / Math.cos(rad(deltaDeg)));

/** Actief, recht glijvlak (Coulomb, Müller-Breslau): Ka;h = cos²φ / (1 + √(sin(φ+δ)·sin φ / cos δ))². */
export function kaStraight(phiDeg: number, deltaDeg: number): number {
  return Math.cos(rad(phiDeg)) ** 2 / (1 + root(phiDeg, deltaDeg)) ** 2;
}

/** Passief, recht glijvlak (Coulomb, Müller-Breslau): Kp;h = cos²φ / (1 − √(sin(φ+δ)·sin φ / cos δ))². */
export function kpStraight(phiDeg: number, deltaDeg: number): number {
  return Math.cos(rad(phiDeg)) ** 2 / (1 - root(phiDeg, deltaDeg)) ** 2;
}

/**
 * Gekromd glijvlak volgens de analytische procedure van NEN-EN 1997-1 bijlage C.2, voor een verticale wand en
 * horizontaal maaiveld: een logaritmische spiraal tussen twee Rankine-zones. Passief met positieve φ en δ,
 * actief met dezelfde formules en negatieve φ en δ. Geeft de coëfficiënt op de korrelspanning (kn, gelijk aan
 * Kγ en Kq) en die op de cohesie (kc).
 */
export function kCurved(phiDeg: number, deltaDeg: number, passive: boolean): { kn: number; kc: number } {
  const sign = passive ? 1 : -1, phi = sign * rad(Math.max(phiDeg, 1e-6)), delta = sign * rad(Math.max(0, Math.min(deltaDeg, phiDeg)));
  const mt = Math.PI / 4 - phi / 2; // cos(2mt + φ) = 0 bij horizontaal, onbelast maaiveld
  const mw = (Math.acos(Math.max(-1, Math.min(1, Math.sin(delta) / Math.sin(phi)))) - phi - delta) / 2;
  const v = mt - mw;
  const kn = ((1 + Math.sin(phi) * Math.sin(2 * mw + phi)) / (1 - Math.sin(phi) * Math.sin(2 * mt + phi))) * Math.exp(2 * v * Math.tan(phi));
  return { kn, kc: Math.abs((kn - 1) / Math.tan(phi)) };
}

export interface PressureCoefficients {
  k0: number;
  ka: number;
  kp: number;
  /** Bijdrage van de cohesie: σ'a = Ka·σ'v − kac·c' en σ'p = Kp·σ'v + kpc·c'. */
  kac: number;
  kpc: number;
  /** Glijvlak waarmee Kp is bepaald. */
  passive: "straight" | "curved";
}

/**
 * Coëfficiënten van één laag. Actief altijd met het rechte glijvlak; passief met het rechte glijvlak zolang
 * δ ≤ φ'/3 en anders met het gekromde (keuze "auto", de regel van CUR 166), of met de opgegeven methode.
 */
export function coefficients(phiDeg: number, deltaDeg: number, method: PassiveMethod): PressureCoefficients {
  // Een negatieve wandwrijving (de grond beweegt langs de wand de andere kant op) mag, tot −φ′.
  const delta = Math.max(-0.999 * phiDeg, Math.min(deltaDeg, phiDeg));
  const ka = kaStraight(phiDeg, delta);
  const curved = method === "curved" || (method === "auto" && delta > phiDeg / 3 + 1e-9);
  if (curved) {
    const p = kCurved(phiDeg, delta, true);
    return { k0: k0Jaky(phiDeg), ka, kp: p.kn, kac: 2 * Math.sqrt(ka), kpc: p.kc, passive: "curved" };
  }
  const kp = kpStraight(phiDeg, delta);
  return { k0: k0Jaky(phiDeg), ka, kp, kac: 2 * Math.sqrt(ka), kpc: 2 * Math.sqrt(kp), passive: "straight" };
}
