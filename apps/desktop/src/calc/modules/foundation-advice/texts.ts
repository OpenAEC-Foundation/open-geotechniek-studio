// Vaste teksten van het funderingsadvies. Algemene hoofdstukken staan in elk
// advies; de paalsysteemteksten volgen uit de gekozen paaltypen. De teksten
// zijn conceptteksten: de adviseur controleert en vult ze aan.
import type { AdviceInput } from './types';

export const GENERAL = {
  purpose: (structure: string) =>
    `Dit funderingsadvies beschrijft de bodemopbouw op basis van het uitgevoerde grondonderzoek en geeft een advies voor de fundering van ${structure || 'het bouwwerk'}. Het draagvermogen van de palen is bepaald met de sonderingen uit dit project; de berekeningen staan in de bijlagen.`,
  basis: (a: AdviceInput) => [
    `Gevolgklasse ${a.consequenceClass}, ontwerplevensduur ${a.designLifeYears} jaar.`,
    'Het draagvermogen van palen op druk is bepaald volgens de in de berekening vermelde normversie (NEN 9997-1 of een historisch referentieprofiel).',
    'Horizontaal belaste palen zijn berekend als ligger op grondveren met de bedding volgens CUR166; dit is een conceptmodel.',
    a.groundwaterNap !== undefined ? `Grondwaterstand voor het ontwerp: NAP ${fmt(a.groundwaterNap)} m.` : 'De grondwaterstand voor het ontwerp is per berekening opgegeven.',
    a.floorLevelNap !== undefined ? `Peil (bovenkant vloer) = NAP ${fmt(a.floorLevelNap)} m.` : 'Het peil (bovenkant vloer) is niet opgegeven; niveaus staan in m NAP.',
  ],
  investigation: 'Het grondonderzoek bestaat uit de sonderingen in de tabel hieronder. De ligging staat op de situatietekening. De grondlagen zijn indicatief afgeleid uit de conusweerstand en het wrijvingsgetal; boringen en laboratoriumonderzoek zijn hierin niet verwerkt, tenzij vermeld.',
  bearing: (a: AdviceInput) =>
    `Als draagkrachtige laag is indicatief aangehouden: het eerste traject waarin de conusweerstand over minstens ${fmt(a.bearingMinThicknessM, 1)} m boven ${fmt(a.bearingQcMpa, 0)} MPa blijft. Dit is een hulpmiddel voor het overzicht; het puntniveau volgt uit de draagvermogenberekening.`,
  negativeFriction: 'Waar samendrukbare lagen boven de draagkrachtige laag liggen, is rekening gehouden met negatieve kleef tot de opgegeven onderkant. Extra ophoging, verlaging van de grondwaterstand of belasting op het maaiveld vergroot de negatieve kleef; meld zulke wijzigingen voor een nieuwe beoordeling.',
  execution: [
    'Controleer voor de uitvoering de ligging van kabels, leidingen en belendingen, en leg de staat van belendende bouwwerken vast (bouwkundige opname).',
    'Houd bij het aanbrengen van de palen per paal een registratie bij (paalpuntniveau, afwijkingen, bijzonderheden). Wijkt het puntniveau meer dan 0,5 m af van het advies, overleg dan met de adviseur.',
    'Bij afwijkende bodemopbouw tijdens de uitvoering (bijvoorbeeld een draagkrachtige laag die hoger of dieper ligt dan verwacht) is aanvullend onderzoek nodig, zoals een extra sondering.',
    'Een ontgraving naast of tussen de palen verandert de horizontale en verticale belasting op de palen; overleg vooraf met de adviseur.',
  ],
  limits: [
    'Dit advies geldt voor de opgegeven bouwwerken, belastingen en paalsystemen. Wijzigingen in ontwerp, belasting of maaiveldhoogte vragen een nieuwe beoordeling.',
    'De berekeningen zijn conceptberekeningen en zijn indicatief tot ze door de adviseur zijn gecontroleerd.',
    'Zakkingsverschillen tussen paalgroepen, groepswerking en de invloed op belendingen zijn niet berekend, tenzij in dit advies vermeld.',
  ],
};

/** Teksten per paalsysteem, op materiaal en type. */
export function systemTexts(pileTypeId: string, material: string, hasExtension: boolean): { title: string; paragraphs: string[] } {
  if (material === 'wood') return {
    title: hasExtension ? 'Houten heipalen met betonopzetter' : 'Houten heipalen',
    paragraphs: [
      'Houten palen moeten over hun volle lengte permanent onder de laagste grondwaterstand blijven; boven water worden ze aangetast door schimmels.',
      hasExtension ? 'De las tussen hout en betonopzetter ligt daarom minstens 0,5 m onder de laagste grondwaterstand. Controleer bij de uitvoering het niveau van de las.' : 'Controleer dat de paalkop onder de laagste grondwaterstand ligt; anders is een betonopzetter nodig.',
      'Gebruik hout van een kwaliteit en soort die voor heipalen geschikt is en controleer de puntdiameter en de tapsheid bij levering.',
      'Het heien veroorzaakt trillingen; beoordeel vooraf het risico op schade aan belendingen.',
    ],
  };
  if (material === 'steel') return {
    title: pileTypeId.includes('screw') ? 'Stalen schroefpalen' : 'Stalen buispalen',
    paragraphs: pileTypeId.includes('screw') ? [
      'Schroefpalen worden trillingsarm en geluidsarm aangebracht en zijn geschikt bij gevoelige belendingen.',
      'Controleer bij de uitvoering het indraaimoment als maat voor de vastheid van de draagkrachtige laag.',
      'Houd rekening met corrosie: de rekenwaarde gaat uit van de opgegeven (rest)wanddikte.',
    ] : [
      'Stalen buispalen worden geheid of getrild; dit veroorzaakt trillingen en geluid. Beoordeel vooraf het risico op schade aan belendingen.',
      'Houd rekening met corrosie van de buiswand: de berekening gaat uit van de opgegeven (rest)wanddikte.',
      'Bij een betongevulde buis draagt het beton bij aan de doorsnede; vul de buis na het aanbrengen volledig.',
    ],
  };
  if (pileTypeId.includes('prefab')) return {
    title: 'Prefab betonpalen (geheid)',
    paragraphs: [
      'Prefab betonpalen worden geheid. Dit veroorzaakt trillingen en geluid; beoordeel vooraf het risico op schade aan belendingen en houd de wettelijke geluidsgrenzen aan.',
      'Kalenderen van de palen (het meten van de zakking per klap) geeft een controle op het bereiken van de draagkrachtige laag.',
      'Ligt de draagkrachtige laag hoger dan voorzien, dan mag de paal niet verder worden doorgeheid dan nodig; bij een lagere laag is een langere paal of een andere oplossing nodig.',
    ],
  };
  if (pileTypeId.includes('auger')) return {
    title: 'Avegaarpalen (in de grond gevormd)',
    paragraphs: [
      'Avegaarpalen worden trillingsvrij aangebracht. Het boren kan de grond rond de paal ontspannen; dit is in de paalfactoren verwerkt.',
      'Registreer per paal de betondruk en het betonvolume; een te klein volume kan op insnoering wijzen.',
      'Zakking en veerstijfheid zijn afhankelijk van de projectspecifieke axiale stijfheid EA.',
    ],
  };
  if (pileTypeId.includes('screw')) return {
    title: 'Schroefpalen (in de grond gevormd)',
    paragraphs: [
      'Schroefpalen worden trillingsarm aangebracht met een verloren punt en een teruggetrokken mantelbuis.',
      'Registreer per paal het indraaimoment en het betonvolume.',
    ],
  };
  if (pileTypeId.includes('casing')) return {
    title: 'Betonpalen met mantelbuis (in de grond gevormd)',
    paragraphs: [
      'De mantelbuis wordt geheid of getrild en na het storten van het beton teruggetrokken; dit veroorzaakt trillingen.',
      'Registreer per paal het betonvolume; het beton moet direct tegen de grond drukken.',
    ],
  };
  if (pileTypeId.includes('bored')) return {
    title: 'Boorpalen',
    paragraphs: [
      'Boorpalen worden trillingsvrij aangebracht met een steunvloeistof. De draagkracht is gevoelig voor de uitvoering; een controle op de paalvoet en het betonvolume is nodig.',
    ],
  };
  return { title: 'Paalsysteem', paragraphs: ['Zie de berekening voor de uitgangspunten van dit paalsysteem.'] };
}

export function fmt(v: number, d = 2): string {
  return Number.isFinite(v) ? v.toFixed(d).replace('.', ',') : '-';
}
