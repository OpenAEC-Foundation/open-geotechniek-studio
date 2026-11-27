import { describe, expect, it } from 'vitest';
import { computeLateral, lateralExample, type LateralInput } from './compute';
import { buildLateralReport } from './report-pdf';
import { needsMethodPage, renderMethod } from './report-method';
import { jsPDF } from 'jspdf';
import { makeCursor } from '../pile-bearing-capacity/parts/pile-report-pdf';

const ctx = { cpts: new Map(), activeCptId: null, projectMeta: { title: 'Kade', client: '', location: '', project_number: '9', author: '', date: '2026-11-06' } };
function report(input: LateralInput) {
  const r = computeLateral(input);
  if (!r.ok) throw new Error(r.error);
  const text = new TextDecoder('latin1').decode(buildLateralReport(input, r, ctx));
  return { r, text, pages: text.split('/Type /Page\n').length - 1 };
}
const linear: LateralInput = { ...lateralExample, analysisMode: 'linear', layerCorrection: 'none' };

describe('rekenconcept vooraan in het rapport', () => {
  it('geeft bij een niet-lineaire berekening met laagcorrectie een eigen pagina', () => {
    const a = report(lateralExample), b = report(linear);
    expect(needsMethodPage(lateralExample, a.r)).toBe(true);
    for (const part of ['Rekenconcept', 'Waarom de veer niet-lineair is', 'grenswaarde pu', 'beginstijfheid k0', 'Hoe het evenwicht wordt gevonden',
      'Gelaagde grond: equivalente diepte', 'zeq,top laag 2', 'VERIFICATIE.md', 'Georgiadis, M. \\(1983\\)', 'Hetenyi, M. \\(1946\\)']) expect(a.text).toContain(part);
    // De equivalente diepte op de pagina is die van de berekening.
    expect(a.text).toContain(`${a.r.layering[1].topEquivalentM.toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} m`);
    // Het concept past op één pagina: daarna begint de berekening op blad 2.
    const doc = new jsPDF({ unit: 'mm', format: 'a4' }), c = makeCursor(doc, { number: '9', description: 'Kade', norm: '-', date: '06-11-2026', author: 'x' });
    expect(renderMethod(c, lateralExample, a.r)).toBe(true);
    expect(doc.getNumberOfPages()).toBe(2);
    expect(b.pages).toBeLessThan(a.pages);
    // De berekening zelf begint na het concept.
    expect(a.text.indexOf('Controle en bronnen')).toBeLessThan(a.text.indexOf('1. Uitgangspunten'));
  });

  it('volstaat bij een zuiver lineaire berekening met een alinea over de ligger op veren', () => {
    const { r, text } = report(linear);
    expect(needsMethodPage(linear, r)).toBe(false);
    expect(text).toContain('Rekenconcept: ligger op veren');
    expect(text).toContain('p = k0 x y, zonder grenswaarde');
    for (const part of ['Waarom de veer niet-lineair is', 'equivalente diepte', 'Controle en bronnen']) expect(text).not.toContain(part);
    expect(text.indexOf('Rekenconcept: ligger op veren')).toBeLessThan(text.indexOf('1. Uitgangspunten'));
  });

  it('legt bij lineair rekenen met laagcorrectie alleen de laagcorrectie uit', () => {
    const { text } = report({ ...lateralExample, analysisMode: 'linear' });
    expect(text).toContain('Gelaagde grond: equivalente diepte');
    expect(text).toMatch(/is lineair|uitkomst niet/);
    expect(text).not.toContain('Waarom de veer niet-lineair is');
  });

  it('noemt zonder laagcorrectie de werkelijke diepte', () => {
    const { text } = report({ ...lateralExample, layerCorrection: 'none' });
    expect(text).toContain('Er is geen laagcorrectie toegepast');
    expect(text).not.toContain('zeq,top laag 2');
  });
});
