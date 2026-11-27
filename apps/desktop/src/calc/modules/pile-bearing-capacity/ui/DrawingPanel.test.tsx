import { afterEach, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import * as THREE from "three";
import { DrawingPanel } from "./DrawingPanel";
import { buildKoppejanObjects, disposeObjects, fitPose } from "./koppejan-three";
import { buildKoppejanScene } from "../parts/koppejan-scene";
import { computePile } from "../compute";
import { getPileType } from "../catalog";
import { useCptStore } from "../../../../store/useCptStore";
import fixture from "../__fixtures__/sondering-3bm-cgeo1.json";
import type { PileInput } from "../types";
import type { Cpt } from "../../../../types/cpt";

afterEach(() => { cleanup(); useCptStore.setState({ cpts: new Map() }); });

const cpt: Cpt = {
  id: "S1",
  metadata: { source_file: "test", ground_level_nap: -0.5 },
  points: Array.from({ length: 251 }, (_, i) => ({ depth: i * 0.1, depth_nap: -0.5 - i * 0.1, qc: i < 75 ? 5 : 12 })),
};
const input = { ...fixture.input, cptId: cpt.id, soilProfile: [...fixture.input.soilProfile, { kind: "sand-wet", startNap: -8, endNap: -14, gammaK: 20, gammaW: 10, phi: 32.5 }] } as PileInput;
const result = computePile(input, cpt);

it("schakelt tussen 2D en 3D en meldt het als WebGL ontbreekt", () => {
  useCptStore.setState({ cpts: new Map([[cpt.id, cpt]]) });
  render(<DrawingPanel input={input} result={result} />);
  expect(screen.getByRole("button", { name: "2D + 3D" })).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByText(`Sondering: ${cpt.id}`)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "3D" }));
  expect(screen.getByRole("button", { name: "3D" })).toHaveAttribute("aria-pressed", "true");
  // jsdom heeft geen WebGL: de weergave valt terug op een melding.
  expect(screen.getByRole("status")).toHaveTextContent("3D is op dit apparaat niet beschikbaar");
  fireEvent.click(screen.getByRole("button", { name: "2D", exact: true }));
  expect(screen.getByText(`Sondering: ${cpt.id}`)).toBeInTheDocument();
});

it("toont een melding in 3D als de berekening geen resultaat heeft", () => {
  useCptStore.setState({ cpts: new Map([[cpt.id, cpt]]) });
  render(<DrawingPanel input={input} result={{ ...result, ok: false, error: "Sondering te ondiep" }} />);
  fireEvent.click(screen.getByRole("button", { name: "3D" }));
  expect(screen.getByRole("status")).toHaveTextContent("geen 3D-weergave zolang de berekening geen resultaat heeft");
});

it("bouwt uit het model de paal, de drie trajecten en de qc-lijnen", () => {
  const model = buildKoppejanScene(input, result, cpt, getPileType(input.pileTypeId))!;
  const { root } = buildKoppejanObjects(model, { text: "#111111", muted: "#777777", background: "#ffffff" });
  try {
    for (const name of ["pile", "zone-I", "zone-II", "zone-III", "critical-depth", "qc-raw", "qc-clipped", "average-I", "average-II", "average-III", "shaft-positive", "ground"]) {
      expect(root.getObjectByName(name), name).toBeDefined();
    }
    // Het volume van traject III loopt van de paalpunt tot 8 Deq erboven.
    const box = new THREE.Box3().setFromObject(root.getObjectByName("zone-III")!);
    expect(box.min.y).toBeCloseTo(input.pileToeNap, 6);
    expect(box.max.y).toBeCloseTo(input.pileToeNap + 8 * model.deqM, 6);
    const pile = new THREE.Box3().setFromObject(root.getObjectByName("pile")!);
    expect(pile.max.x - pile.min.x).toBeCloseTo(input.diameterMm / 1000, 3);
    root.traverse((object) => {
      const position = (object as THREE.Mesh).geometry?.getAttribute?.("position");
      if (position) expect(Array.from(position.array).every(Number.isFinite), object.name).toBe(true);
    });
  } finally { disposeObjects(root); }
});

it("zet de uitsnede geheel in beeld", () => {
  const focus = { x0: -2, x1: 4, bottomNap: -16, topNap: -12 };
  // 600 px breed, waarvan 200 px voor de labels links: 400 px voor 6 m, 400 px hoog voor 4 m.
  const { target, position, distance, pxPerM } = fitPose(focus, 32, 600, 400, 200, 0.5);
  expect(pxPerM * 6).toBeLessThanOrEqual(400);
  expect(pxPerM * 4).toBeLessThanOrEqual(400);
  expect(pxPerM).toBeCloseTo(400 / 6.6, 9);
  // Linkerrand van de uitsnede valt rechts van de labelruimte, de rechterrand binnen beeld.
  const left = 300 + (focus.x0 - target.x) * pxPerM, right = 300 + (focus.x1 - target.x) * pxPerM;
  expect(left).toBeGreaterThanOrEqual(200);
  expect(right).toBeLessThanOrEqual(600);
  expect(target.y).toBe(-14);
  expect(position.distanceTo(target)).toBeCloseTo(distance, 9);
});
