// Schetsjes van de paalvorm per paalsysteem: zijaanzicht, kop boven. Ze
// laten zien wat de berekening met de schacht doet: constante maat, een
// bredere voet, een tapse houten paal of een betonopzetter erboven.
import type { ReactNode } from "react";
import type { PileSystemId } from "../pile-systems";

const line = { fill: "none", stroke: "currentColor", strokeWidth: 1.5, strokeLinejoin: "round" as const, strokeLinecap: "round" as const };
const solid = { ...line, fill: "currentColor", fillOpacity: 0.18 };
const thin = { ...line, strokeWidth: 0.8, opacity: 0.65 };

/** Schroefblad rond de as op hoogte y. */
const blade = (y: number, half: number) => <path d={`M${16 - half} ${y + 1.5}L${16 + half} ${y - 1.5}`} {...line} strokeWidth={2} />;
/** Avegaarwindingen tussen twee hoogten. */
const flights = (x0: number, x1: number, from: number, to: number) =>
  Array.from({ length: Math.floor((to - from) / 5) + 1 }, (_, i) => <path key={i} d={`M${x0} ${from + i * 5 + 2}L${x1} ${from + i * 5}`} {...thin} />);

const SKETCHES: Record<PileSystemId, ReactNode> = {
  // Vierkante schacht met heipunt; de doorsnede ernaast.
  "prefab-concrete": <><path d="M11 3h9v27l-4.5 6-4.5-6z" {...solid} /><rect x="23" y="4" width="6" height="6" {...solid} strokeWidth={1} /></>,
  // Holle buis met voetplaat.
  "steel-tube-closed": <><path d="M11 3v30M21 3v30" {...line} /><path d="M13.5 3v30M18.5 3v30" {...thin} /><path d="M10 34h12" {...line} strokeWidth={3} /><circle cx="26" cy="7" r="3" {...line} strokeWidth={1} /></>,
  // Buis met groutschil (stippellijn) en schroefpunt.
  "screw-injection": <><path d="M13 3v28M19 3v28" {...line} /><path d="M10 5v27M22 5v27" {...thin} strokeDasharray="2 2" />{blade(33, 7)}<path d="M16 31v6" {...line} /></>,
  // Blijvende stalen buis op een bredere schroefpunt.
  "screw-permanent-casing": <><path d="M12 3v27M20 3v27" {...line} /><path d="M14 3v27M18 3v27" {...thin} /><path d="M9 30h14l-7 7z" {...solid} />{blade(32, 8)}</>,
  // Betonschacht, de buis is getrokken; de schroefpunt blijft achter.
  "screw-lost-tip": <><path d="M12 3h8v27h-8z" {...solid} /><path d="M9 30h14l-7 7z" {...solid} />{blade(32, 8)}</>,
  // Betonschacht met verdringerlichaam boven een korte avegaar.
  "screw-soil-displacing": <><path d="M12.5 3h7v19l2.5 4v4h-12v-4l2.5-4z" {...solid} />{flights(11, 21, 31, 36)}<path d="M16 30v7" {...line} /></>,
  // In de grond gevormde betonschacht op een bredere voetplaat.
  vibro: <><path d="M11.5 3h9v30h-9z" {...solid} /><path d="M9 34h14" {...line} strokeWidth={3} /></>,
  // Avegaar over de hele lengte.
  auger: <><path d="M12 3h8v32h-8z" {...solid} />{flights(12, 20, 5, 31)}<path d="M12 35l4 3 4-3" {...line} /></>,
  // Avegaar binnen een boorbuis.
  "auger-cased": <><path d="M10 3v32M22 3v32" {...line} /><path d="M12.5 3h7v32h-7z" {...solid} strokeWidth={0.8} />{flights(12.5, 19.5, 5, 31)}<path d="M12.5 35l3.5 3 3.5-3" {...line} /></>,
  // Brede geboorde schacht met vlakke voet.
  bored: <><path d="M9 3h14v33H9z" {...solid} /><path d="M9 9h14M9 15h14" {...thin} strokeDasharray="1.5 2.5" /></>,
  // Ronde houten paal, taps naar de punt.
  timber: <><path d="M10.5 3h11l-3 34h-5z" {...solid} /><path d="M14.5 6l1 28M17.5 6l-1 28" {...thin} /></>,
  // Betonopzetter boven de las, daaronder het tapse hout.
  "timber-extension": <><path d="M9 3h14v10H9z" {...solid} fillOpacity={0.4} /><path d="M11.5 13h9l-2.5 24h-4z" {...solid} /><path d="M6 13h3M23 13h3" {...thin} /><path d="M15 16l.6 18M17 16l-.6 18" {...thin} /></>,
};

export function PileSketch({ system }: { system: PileSystemId }) {
  return <svg className="pile-sketch" viewBox="0 0 32 40" aria-hidden="true">{SKETCHES[system]}</svg>;
}
