import { describe, expect, it } from 'vitest';
import { chartWidthScale, chartAxisZoom } from './chart-zoom';

describe('gekoppelde sonderingszoom', () => {
  it('houdt volledige asbereiken zichtbaar wanneer de kolom zelf wordt vergroot', () => {
    expect(chartAxisZoom(4, true)).toBe(1);
    expect(chartAxisZoom(4, false)).toBe(4);
  });
  it.each([0.2, 0.5, 1])('houdt kolommen gelijk tot de verticale fitdrempel bij zoom %s', (zoom) => {
    expect(chartWidthScale(zoom, true)).toBe(1);
  });
  it('vergroot kolommen na de fitdrempel evenredig met de verticale zoom', () => {
    expect(chartWidthScale(1.25, true)).toBe(1.25);
    expect(chartWidthScale(4, true)).toBe(4);
  });
  it('behoudt de oorspronkelijke kolombreedte wanneer de optie uit staat', () => {
    expect(chartWidthScale(4, false)).toBe(1);
  });
});
