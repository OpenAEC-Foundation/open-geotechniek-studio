/** Existing Schreutelkamp polynomial map approximation. Not survey-grade RDNAPTRANS.
 * Regression references are public BRO ETRS89/RD pairs; see tests/fixtures/bro/coordinates.json. */
export function rdToWgs84(x: number, y: number): { lat: number; lon: number } {
  const X0 = 155_000.0,
    Y0 = 463_000.0;
  const PHI0 = 52.1551744,
    LAM0 = 5.38720621;
  const dx = (x - X0) * 1e-5;
  const dy = (y - Y0) * 1e-5;
  const kp: [number, number, number][] = [
    [0, 1, 3235.65389],
    [2, 0, -32.58297],
    [0, 2, -0.2475],
    [2, 1, -0.84978],
    [0, 3, -0.0655],
    [2, 2, -0.01709],
    [1, 0, -0.00738],
    [4, 0, 0.0053],
    [2, 3, -0.00039],
    [4, 1, 0.00033],
    [1, 1, -0.00012],
  ];
  const lp: [number, number, number][] = [
    [1, 0, 5260.52916],
    [1, 1, 105.94684],
    [1, 2, 2.45656],
    [3, 0, -0.81885],
    [1, 3, 0.05594],
    [3, 1, -0.05607],
    [0, 1, 0.01199],
    [3, 2, -0.00256],
    [1, 4, 0.00128],
    [0, 2, 0.00022],
    [2, 0, -0.00022],
    [5, 0, 0.00026],
  ];
  let dphi = 0,
    dlam = 0;
  for (const [p, q, k] of kp) dphi += k * Math.pow(dx, p) * Math.pow(dy, q);
  for (const [p, q, l] of lp) dlam += l * Math.pow(dx, p) * Math.pow(dy, q);
  return { lat: PHI0 + dphi / 3600, lon: LAM0 + dlam / 3600 };
}
