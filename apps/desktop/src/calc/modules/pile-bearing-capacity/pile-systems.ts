// Paalsystemen zoals een constructeur ze kiest. Een systeem bundelt één of
// meer tabelrijen uit de catalogus (pileTypeId) met de vorm van de paal: de
// doorsnede, of de maat over de lengte constant is of verloopt, en welke
// invoervelden erbij horen. De opgeslagen invoer houdt de bestaande
// pileTypeId-waarden; het systeem wordt daaruit afgeleid, zodat bestaande
// projecten ongewijzigd openen en rekenen.
import type { ConcreteExtension, PileInput } from "./types";
import { getPileType } from "./catalog";
import { STEEL_TUBE_OD, TIMBER_HEAD, nearest, seriesFor } from "./standard-sizes";
import { ct } from "../../i18n";

export type PileSystemId =
  | "prefab-concrete" | "steel-tube-closed" | "screw-injection" | "screw-permanent-casing"
  | "screw-lost-tip" | "screw-soil-displacing" | "vibro" | "auger" | "auger-cased" | "bored"
  | "timber" | "timber-extension";

/** Verloop van de schachtmaat over de lengte. */
export type ShaftProfile = "constant" | "tapered" | "extension";

export interface PileSystem {
  id: PileSystemId;
  /** Nederlandse naam (bron voor de vertaling). */
  label: string;
  /** Tabelrijen uit de catalogus; de eerste is de standaard voor een nieuwe keuze. */
  typeIds: string[];
  /** Verloop van de schacht: bepaalt de omtrek per niveau. */
  profile: ShaftProfile;
  /** Invoervelden die bij dit systeem horen. */
  fields: { wall?: boolean; base?: boolean };
}

export const PILE_SYSTEMS: PileSystem[] = [
  { id: "prefab-concrete", label: "Prefab betonpaal", typeIds: ["concrete-prefab-prestressed-driven", "concrete-prefab-round"], profile: "constant", fields: {} },
  { id: "steel-tube-closed", label: "Stalen buispaal, gesloten punt", typeIds: ["steel-pipe-driven-closed-2017", "steel-pipe-driven-closed"], profile: "constant", fields: { wall: true, base: true } },
  { id: "screw-injection", label: "Schroefinjectiepaal", typeIds: ["steel-screw-grout"], profile: "constant", fields: {} },
  { id: "screw-permanent-casing", label: "Schroefpaal, blijvende buis", typeIds: ["steel-screw-permanent-casing"], profile: "constant", fields: { wall: true, base: true } },
  { id: "screw-lost-tip", label: "Schroefpaal, getrokken buis", typeIds: ["concrete-screw-displacement"], profile: "constant", fields: { base: true } },
  { id: "screw-soil-displacing", label: "Grondverdringende schroefpaal", typeIds: ["concrete-screw-soil-displacing"], profile: "constant", fields: { base: true } },
  { id: "vibro", label: "Vibropaal", typeIds: ["concrete-driven-casing-hammered", "concrete-driven-casing-vibrated"], profile: "constant", fields: { base: true } },
  { id: "auger", label: "Avegaarpaal", typeIds: ["concrete-auger"], profile: "constant", fields: {} },
  { id: "auger-cased", label: "DPA-paal", typeIds: ["concrete-auger-cased"], profile: "constant", fields: {} },
  { id: "bored", label: "Boorpaal", typeIds: ["concrete-bored"], profile: "constant", fields: {} },
  { id: "timber", label: "Houten paal", typeIds: ["timber-uniform"], profile: "tapered", fields: {} },
  { id: "timber-extension", label: "Houten paal met betonopzetter", typeIds: ["timber-uniform"], profile: "extension", fields: {} },
];

export function getPileSystem(id: string): PileSystem | undefined {
  return PILE_SYSTEMS.find((s) => s.id === id);
}

/** Naam van een paalsysteem in de actieve taal. */
export function pileSystemName(system: Pick<PileSystem, "id" | "label">): string {
  return ct("calcPileCore", `pileSystems.${system.id}`, system.label);
}

/**
 * Vertaling van opgeslagen invoer naar het paalsysteem. Elke bestaande
 * pileTypeId hoort bij precies één systeem; alleen bij hout beslist de
 * betonopzetter. Onbekende ids geven undefined: de invoer blijft dan
 * zoals hij is.
 */
export function pileSystemIdOf(input: Pick<PileInput, "pileTypeId" | "concreteExtension">): PileSystemId | undefined {
  if (input.pileTypeId === "timber-uniform") return input.concreteExtension ? "timber-extension" : "timber";
  return PILE_SYSTEMS.find((s) => s.typeIds.includes(input.pileTypeId))?.id;
}

/** Standaard betonopzetter voor een houten paal: de eerste uit de reeks, met
 *  de kortste gangbare lengte waarbij de las minstens 0,5 m onder de
 *  grondwaterstand komt, zodat het hout permanent nat blijft. */
export function defaultExtension(input: PileInput): ConcreteExtension {
  const { extensions, extensionLengths } = seriesFor("timber-uniform", input.presets);
  const length = extensionLengths.find((l) => input.pileTopNap - l <= input.waterNap - 0.5) ?? extensionLengths[extensionLengths.length - 1];
  const joint = Math.max(input.pileToeNap + 1, input.pileTopNap - length);
  return { jointNap: +joint.toFixed(2), sizeMm: extensions[0].sizeMm, isCircular: extensions[0].isCircular };
}

/**
 * Wissel van tabelrij (paaltype). Een ander paaltype erft geen
 * projectfactoren, voetmaat, EA of tapsheid van het vorige: die horen bij
 * één paalsysteem. `extension` kiest bij hout tussen met en zonder
 * betonopzetter (standaard met).
 */
export function switchPileType(input: PileInput, pileTypeId: string, extension = true): PileInput {
  const material = getPileType(pileTypeId)?.material ?? "steel", wood = material === "wood";
  const series = seriesFor(pileTypeId, input.presets);
  // Hout: gangbare kopmaat, punt Ø150 over het hele houten deel. Staal: maat uit de buisreeks.
  const diameterMm = wood ? ((series.sizes ?? TIMBER_HEAD).includes(input.diameterMm) ? input.diameterMm : nearest(series.sizes ?? TIMBER_HEAD, 220))
    : material === "steel" ? nearest(series.sizes ?? STEEL_TUBE_OD, input.diameterMm) : input.diameterMm;
  const concreteExtension = wood && extension ? defaultExtension(input) : undefined;
  const woodTop = concreteExtension?.jointNap ?? input.pileTopNap;
  const timberTaper = wood ? { toeDiameterMm: series.timberToeMm, lengthM: +(woodTop - input.pileToeNap).toFixed(2) } : undefined;
  return { ...input, pileTypeId, diameterMm, projectFactors: undefined, axialStiffnessKn: undefined, baseDiameterMm: undefined, timberTaper, concreteExtension };
}

/** Kies een paalsysteem: de tabelrij `pileTypeId` (standaard de eerste van het systeem) met de bijbehorende vorm. */
export function applyPileSystem(input: PileInput, systemId: PileSystemId, pileTypeId?: string): PileInput {
  const system = getPileSystem(systemId);
  if (!system) return input;
  const typeId = pileTypeId && system.typeIds.includes(pileTypeId) ? pileTypeId : system.typeIds[0];
  if (pileSystemIdOf(input) === systemId && input.pileTypeId === typeId) return input;
  if (system.profile === "extension" && input.pileTypeId === typeId) {
    // Zelfde hout, opzetter erbij: een bestaande tapsheid moet binnen het houten deel blijven.
    const concreteExtension = input.concreteExtension ?? defaultExtension(input);
    const woodLength = +(concreteExtension.jointNap - input.pileToeNap).toFixed(2);
    return { ...input, concreteExtension, timberTaper: input.timberTaper && { ...input.timberTaper, lengthM: Math.min(input.timberTaper.lengthM, woodLength) } };
  }
  if (system.profile === "tapered" && input.pileTypeId === typeId) return { ...input, concreteExtension: undefined };
  return switchPileType(input, typeId, system.profile === "extension");
}
