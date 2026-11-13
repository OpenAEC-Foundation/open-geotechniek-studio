// apps/desktop/src/calc/modules/pile-bearing-capacity/ui/ResultPanel.tsx
import { useMemo, type ReactNode } from "react";
import { Trans, useTranslation } from "react-i18next";
import type { PanelProps } from "../../../framework/types";
import type { PileInput, PileResult, SettlementResult } from "../types";
import { pileTypeName, resolvePileType } from "../catalog";
import { getStandard, standardLabel } from "../standards";
import { pileGeometry } from "../parts/geometry";
import "./styles.css";
import { OaIcon } from "../../../../components/icons/oaIcon";

// ─── Formula-helper component (Open Calculation Studio stijl) ────
// Toont een berekening in 3 stappen:
//   1. Symbolisch:   F_nk;d = γ_f,nk · ΣF_s;nk
//   2. Ingevuld:           = 1,00 · 318,3
//   3. Uitkomst:           = 318 kN
// Allemaal uitgelijnd op het "=" via CSS-grid zodat de symbolen netjes
// rechts staan en de RHS-waardes mooi naast elkaar.

interface FormulaProps {
  /** LHS — het te berekenen symbool (bv. "R_b;cal;max"). */
  lhs: ReactNode;
  /** Symbolische RHS (formule met variabelen). */
  symbolic: ReactNode;
  /** Ingevulde RHS (variabelen vervangen door getallen). Optioneel — voor
   *  trivial-eenvoudige formules waar ingevuld == uitkomst kan dit weg. */
  filled?: ReactNode;
  /** Eind-uitkomst (bv. "419 kN"). Bold gerendered. */
  result: ReactNode;
}

function Formula({ lhs, symbolic, filled, result }: FormulaProps) {
  return (
    <div className="pile-formula">
      <div className="pile-formula-row">
        <span className="pile-formula-lhs">{lhs}</span>
        <span className="pile-formula-eq">=</span>
        <span className="pile-formula-rhs">{symbolic}</span>
      </div>
      {filled !== undefined && (
        <div className="pile-formula-row pile-formula-row--cont">
          <span className="pile-formula-lhs" aria-hidden="true" />
          <span className="pile-formula-eq">=</span>
          <span className="pile-formula-rhs">{filled}</span>
        </div>
      )}
      <div className="pile-formula-row pile-formula-row--cont pile-formula-row--result">
        <span className="pile-formula-lhs" aria-hidden="true" />
        <span className="pile-formula-eq">=</span>
        <span className="pile-formula-rhs"><strong>{result}</strong></span>
      </div>
    </div>
  );
}

// ─── Lastzakkingsdiagram (bidirectioneel) ────────────────────────
// Conform Referentie stijl (984.pdf blad 27): x-as gaat van -Rs;cal;max
// (links) tot +Rb;cal;max (rechts) met 0 in het midden. Y-as is zakking
// [mm] omlaag. Voor elke werkpunt-zakking wordt Rs (links) en Rb (rechts)
// als horizontale lijn getoond. De volledige mobilisatie-curves (Rs(sb)
// en Rb(sb)) worden ook geplot zodat de gebruiker ziet hoe Rs en Rb
// progressief toenemen met de zakking.

const ZK_W = 360;
const ZK_H = 240;
const ZK_M = { top: 22, right: 14, bottom: 36, left: 14 };
const ZK_PW = ZK_W - ZK_M.left - ZK_M.right;
const ZK_PH = ZK_H - ZK_M.top - ZK_M.bottom;

interface ZakkingsChartProps {
  settlement: SettlementResult;
  rbCalMax: number;
  rsCalMax: number;
}

function ZakkingsChart({ settlement, rbCalMax, rsCalMax }: ZakkingsChartProps) {
  const { t } = useTranslation("calcPile");
  const { curve, sls, uls } = settlement;

  // Snap x-as range op nette ronde-getallen op basis van max(Rs, Rb).
  const bounds = useMemo(() => {
    const xMaxRaw = Math.max(rsCalMax, rbCalMax) * 1.05;
    const xStep = Math.max(50, Math.ceil(xMaxRaw / 4 / 50) * 50);
    const xMax = xStep * 4; // 4 ticks elke kant van 0
    const yVals = curve.map((p) => p.sbMm).concat([sls.sbMm, uls.sbMm, 20]);
    const yMax = Math.max(20, Math.max(...yVals) * 1.10);
    return { xMax, yMax, xStep };
  }, [curve, sls, uls, rbCalMax, rsCalMax]);

  // X-projectie: kn van -xMax tot +xMax → 0..PW.
  const xCenter = ZK_M.left + ZK_PW / 2;
  const xToPx = (kn: number) => xCenter + (kn / bounds.xMax) * (ZK_PW / 2);
  const yToPx = (mm: number) => ZK_M.top + (mm / bounds.yMax) * ZK_PH;

  // X-ticks: van -xMax tot +xMax met xStep tussenruimte.
  const xTicks = useMemo(() => {
    const ticks: number[] = [];
    for (let v = -bounds.xMax; v <= bounds.xMax + 0.001; v += bounds.xStep) {
      ticks.push(Math.round(v));
    }
    return ticks;
  }, [bounds.xMax, bounds.xStep]);
  const yTicks = useMemo(() => {
    const step = bounds.yMax / 4;
    return Array.from({ length: 5 }, (_, i) => i * step);
  }, [bounds.yMax]);

  // Mobilisatie-curves: Rs(sb) links (negatieve x) en Rb(sb) rechts.
  const rsPath = curve.length === 0
    ? ""
    : curve
        .map((p, i) => `${i === 0 ? "M" : "L"}${xToPx(-p.rsKn).toFixed(1)},${yToPx(p.sbMm).toFixed(1)}`)
        .join(" ");
  const rbPath = curve.length === 0
    ? ""
    : curve
        .map((p, i) => `${i === 0 ? "M" : "L"}${xToPx(p.rbKn).toFixed(1)},${yToPx(p.sbMm).toFixed(1)}`)
        .join(" ");

  const ySls = yToPx(sls.sbMm);
  const yUls = yToPx(uls.sbMm);
  const yMaxLine = yToPx(bounds.yMax * 0.92); // Rs/Rb max-label-positie

  return (
    <svg
      className="pile-zakking-chart-svg"
      viewBox={`0 0 ${ZK_W} ${ZK_H}`}
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label={t("chart.loadSettlement", "Lastzakkingsdiagram")}
    >
      <rect
        x={ZK_M.left} y={ZK_M.top} width={ZK_PW} height={ZK_PH}
        className="pile-zakking-plot-bg"
      />

      {/* Grid + ticks */}
      {xTicks.map((kn) => {
        const x = xToPx(kn);
        const isZero = kn === 0;
        return (
          <g key={`zx-${kn}`}>
            <line
              x1={x} x2={x} y1={ZK_M.top} y2={ZK_M.top + ZK_PH}
              className={isZero ? "pile-zakking-grid pile-zakking-grid--axis" : "pile-zakking-grid"}
            />
            <text
              x={x} y={ZK_M.top + ZK_PH + 12}
              className="pile-zakking-axis-label" textAnchor="middle"
            >
              {Math.abs(kn)}
            </text>
          </g>
        );
      })}
      {yTicks.map((mm, i) => {
        const y = yToPx(mm);
        return (
          <g key={`zy-${i}`}>
            <line
              x1={ZK_M.left} x2={ZK_M.left + ZK_PW} y1={y} y2={y}
              className="pile-zakking-grid"
            />
            <text
              x={ZK_M.left + 2} y={y - 2}
              className="pile-zakking-axis-label" textAnchor="start"
            >
              {mm.toFixed(1)}
            </text>
          </g>
        );
      })}

      {/* As-titels */}
      <text
        x={ZK_M.left + ZK_PW / 2} y={ZK_H - 2}
        className="pile-zakking-axis-title" textAnchor="middle"
      >
        {t("chart.loadAxis", "Belasting [kN]")}
      </text>
      <text
        x={xCenter - 60} y={ZK_M.top - 6}
        className="pile-zakking-axis-side-label" textAnchor="middle"
        fill="#16a34a"
      >
        {t("chart.shaftSide", "← R_s schacht")}
      </text>
      <text
        x={xCenter + 60} y={ZK_M.top - 6}
        className="pile-zakking-axis-side-label" textAnchor="middle"
        fill="#1e3a8a"
      >
        {t("chart.baseSide", "R_b punt →")}
      </text>

      {/* Mobilisatie-curves */}
      {rsPath && <path d={rsPath} className="pile-zakking-curve-rs" fill="none" />}
      {rbPath && <path d={rbPath} className="pile-zakking-curve-rb" fill="none" />}

      {/* SLS werkpunt: horizontale lijn op sb-niveau met Rs en Rb markers */}
      <line
        x1={xToPx(-sls.rsMobil)} x2={xToPx(sls.rbMobil)}
        y1={ySls} y2={ySls}
        className="pile-zakking-workpoint"
      />
      <circle cx={xToPx(-sls.rsMobil)} cy={ySls} r={2.5} className="pile-zakking-marker-rs" />
      <circle cx={xToPx(sls.rbMobil)} cy={ySls} r={2.5} className="pile-zakking-marker-rb" />
      <text
        x={xToPx(-sls.rsMobil) - 3} y={ySls - 3}
        className="pile-zakking-ref-label pile-zakking-ref-label--rs" textAnchor="end"
      >
        Rs;sls={sls.rsMobil.toFixed(0)}
      </text>
      <text
        x={xToPx(sls.rbMobil) + 3} y={ySls - 3}
        className="pile-zakking-ref-label pile-zakking-ref-label--rb" textAnchor="start"
      >
        Rb;sls={sls.rbMobil.toFixed(0)}
      </text>
      <text
        x={xCenter} y={ySls + 10}
        className="pile-zakking-ref-label pile-zakking-ref-label--total" textAnchor="middle"
      >
        SLS Fc={sls.fcTot.toFixed(0)} · s_b={sls.sbMm.toFixed(1)} mm
      </text>

      {/* ULS werkpunt — zelfde stijl iets dimer */}
      {uls.sbMm > sls.sbMm + 0.1 && (
        <>
          <line
            x1={xToPx(-uls.rsMobil)} x2={xToPx(uls.rbMobil)}
            y1={yUls} y2={yUls}
            className="pile-zakking-workpoint pile-zakking-workpoint--uls"
          />
          <text
            x={xCenter} y={yUls + 10}
            className="pile-zakking-ref-label pile-zakking-ref-label--total-uls" textAnchor="middle"
          >
            ULS Fc={uls.fcTot.toFixed(0)} · s_b={uls.sbMm.toFixed(1)} mm
          </text>
        </>
      )}

      {/* Max-capacity onderaan: -Rs;cal;max en +Rb;cal;max */}
      <line
        x1={xToPx(-rsCalMax)} x2={xToPx(rbCalMax)}
        y1={yMaxLine} y2={yMaxLine}
        className="pile-zakking-maxcap"
      />
      <text
        x={xToPx(-rsCalMax)} y={yMaxLine - 3}
        className="pile-zakking-ref-label pile-zakking-ref-label--max-rs" textAnchor="start"
      >
        Rs;cal;max={rsCalMax.toFixed(0)}
      </text>
      <text
        x={xToPx(rbCalMax)} y={yMaxLine - 3}
        className="pile-zakking-ref-label pile-zakking-ref-label--max-rb" textAnchor="end"
      >
        Rb;cal;max={rbCalMax.toFixed(0)}
      </text>

      {/* Plot border */}
      <rect
        x={ZK_M.left} y={ZK_M.top} width={ZK_PW} height={ZK_PH}
        className="pile-zakking-plot-border" fill="none"
      />
    </svg>
  );
}

// ─── ResultPanel ─────────────────────────────────────────────────

export function ResultPanel({ input, result }: PanelProps<PileInput, PileResult>) {
  const { t } = useTranslation("calcPile");
  if (!result.ok) {
    const missingEA = !!resolvePileType(input)?.requiresEA && !input.timberTaper && !input.concreteExtension && input.axialStiffnessKn === undefined;
    return (
      <div className="pile-result-pending" role="status">
        <h2>{missingEA ? t("result.pending.missingOne", "Nog één gegeven nodig") : t("result.pending.notYet", "Nog niet te berekenen")}</h2>
        {missingEA
          ? <p><Trans t={t} i18nKey="result.pending.missingEA" defaults="Vul bij <strong>Paal</strong> de axiale stijfheid <strong>EA</strong> in. Voor dit paaltype wordt EA niet uit de doorsnede afgeleid; de waarde volgt uit het gekozen paalsysteem." components={{ strong: <strong /> }} /></p>
          : <p>{result.error}</p>}
        <p className="pile-result-pending-note">{t("result.pending.note", "Zodra de invoer compleet is, verschijnt hier de uitgewerkte berekening.")}</p>
      </div>
    );
  }
  const { negKleef, base, shaft, settlement, spring, summary } = result;
  const rcCalMine = base.rbCalMax + shaft.rsCalMax;
  const D = input.diameterMm / 1000; // m
  const pileType = resolvePileType(input);
  const isCircular = pileType?.isCircular ?? true;
  const factors = input.projectFactors ?? {
    alphaP: pileType?.alphaP ?? 0, alphaS: pileType?.alphaS ?? 0, beta: pileType?.beta ?? 1, s: pileType?.s ?? 1,
  };
  const Os = negKleef.meanPerimeterM ?? pileGeometry(input.diameterMm, isCircular).perimeterM;
  return (
    <div className="pile-result">
      <header className="pile-sheet-title">
        <h2>{t("result.title", "Paaldraagvermogen")}{input.cptId ? <> — {input.cptId}</> : null}</h2>
        <p>{standardLabel(getStandard(input.standard)) ?? t("result.existingModel", "Bestaand projectmodel")} · {pileType ? pileTypeName(pileType) : input.pileTypeId}</p>
      </header>

      {result.warnings.length > 0 && (
        <div className="pile-warnings">
          {result.warnings.map((w, i) => <div key={i} className="pile-warning"><OaIcon id="status.warning" /> {w}</div>)}
        </div>
      )}


      <section>
        <h3>{t("result.facts.title", "Uitgangspunten")}</h3>
        <table className="pile-sheet-facts">
          <tbody>
            <tr><th>{t("standard.version", "Normversie")}</th><td colSpan={3}>{standardLabel(getStandard(input.standard)) ?? t("result.existingModel", "Bestaand projectmodel")}</td></tr>
            <tr><th>{t("cpt.title", "Sondering")}</th><td colSpan={3}>{input.cptId ?? "—"}</td></tr>
            <tr><th>{t("pile.type", "Paaltype")}</th><td colSpan={3}>{pileType ? pileTypeName(pileType) : input.pileTypeId}</td></tr>
            {input.concreteExtension && <tr><th>{t("extension.title", "Betonopzetter")}</th><td colSpan={3}>{t("result.facts.extensionValue", "{{size}} mm, van paalkop tot de las op NAP {{joint}} m", { size: `${input.concreteExtension.isCircular ? "Ø" : `${input.concreteExtension.sizeMm} × `}${input.concreteExtension.sizeMm}`, joint: fmtNap(input.concreteExtension.jointNap) })}</td></tr>}
            <tr><th>{input.concreteExtension ? t("result.facts.woodAtJoint", "Hout bij de las") : isCircular ? t("result.facts.diameterD", "Diameter D") : t("result.facts.sideA", "Zijde a")}</th><td>{input.diameterMm} mm</td><th>{t("pile.baseSize", "Puntafmeting")}</th><td>{input.timberTaper ? t("result.facts.tapered", "{{size}} mm (taps)", { size: input.timberTaper.toeDiameterMm }) : input.baseDiameterMm ? `${input.baseDiameterMm} mm` : t("result.facts.equalToShaft", "gelijk aan schacht")}</td></tr>
            <tr><th>{t("levels.pileTop", "Paalkop")}</th><td>NAP {fmtNap(input.pileTopNap)} m</td><th>{t("levels.pileToe", "Paalpunt")}</th><td>NAP {fmtNap(input.pileToeNap)} m</td></tr>
            <tr><th>{t("levels.water", "Grondwater")}</th><td>NAP {fmtNap(input.waterNap)} m</td><th>{t("levels.excavation", "Ontgraving")}</th><td>NAP {fmtNap(input.excavationNap)} m</td></tr>
            <tr><th>N<sub>Ed</sub></th><td>{input.nEd.toFixed(0)} kN</td><th>N<sub>Ek</sub></th><td>{input.nEk.toFixed(0)} kN</td></tr>
            <tr><th>γ<sub>m</sub></th><td>{input.gammaM.toFixed(2)}</td><th>γ<sub>f,nk</sub></th><td>{input.gammaFnk.toFixed(2)}</td></tr>
            <tr><th>{t("factors.title", "Paalfactoren")}</th><td colSpan={3}>α<sub>p</sub> = {factors.alphaP} · α<sub>s</sub> = {factors.alphaS} · β = {factors.beta} · s = {factors.s}{input.projectFactors ? ` (${t("result.facts.projectFactors", "projectfactoren")})` : ""}</td></tr>
          </tbody>
        </table>
      </section>

      <section>
        <h3>{t("result.negSkin.title", "Negatieve kleef")}</h3>
        <p className="pile-result-input">
          {t("result.negSkin.zone", "Zone: paalkop NAP {{top}} tot NAP {{bottom}} —", { top: input.pileTopNap.toFixed(2), bottom: input.negKleefBottomNap.toFixed(2) })}{" "}
          ΔL<sub>nk</sub> = {negKleef.deltaLnk.toFixed(2)} m
        </p>
        <Formula
          lhs={<>O<sub>s</sub></>}
          symbolic={input.concreteExtension ? <>Σ (O<sub>s;i</sub> · h<sub>i</sub>) / ΔL<sub>nk</sub> <small>{t("result.negSkin.extensionAndWood", "(opzetter en hout)")}</small></> : input.timberTaper ? <>π · D<sub>gem;nk</sub></> : isCircular ? <>π · D</> : <>4 · a</>}
          filled={input.concreteExtension ? undefined : <>{isCircular ? "π" : "4"} · {(input.timberTaper ? Os / Math.PI : D).toFixed(3)}</>}
          result={<>{Os.toFixed(3)} m</>}
        />
        <div className="pile-formula-scroll">
          <table className="pile-formula-table pile-formula-table--wide">
            <thead>
              <tr>
                <th>{t("result.negSkin.layer", "Laag")}</th>
                <th>h [m]</th>
                <th>γ<sub>k</sub></th>
                <th>γ<sub>w</sub></th>
                <th>σ<sub>top</sub></th>
                <th>σ<sub>bot</sub></th>
                <th>σ<sub>gem</sub></th>
                <th>K<sub>0</sub></th>
                <th>tan(δ)</th>
                <th>K<sub>0</sub>tanδ</th>
                <th>F<sub>s;nk</sub> [kN]</th>
              </tr>
            </thead>
            <tbody>
              {negKleef.layers.map((l, i) => {
                const tanDelta = Math.tan(l.delta);
                return (
                  <tr key={i}>
                    <td>{l.layer.kind}</td>
                    <td>{l.thickness.toFixed(2)}</td>
                    <td>{l.layer.gammaK}</td>
                    <td>{l.layer.gammaW}</td>
                    <td>{l.sigmaRepTop.toFixed(1)}</td>
                    <td>{l.sigmaRepBottom.toFixed(1)}</td>
                    <td>{(l.sigmaGemRep / l.thickness).toFixed(1)}</td>
                    <td>{l.k0.toFixed(3)}</td>
                    <td>{tanDelta.toFixed(3)}</td>
                    <td>
                      {l.k0TanDelta.toFixed(3)}
                      {l.k0TanDelta === input.ksMinFactor && (
                        <em title={t("result.negSkin.cappedTitle", "Gecapt op ksMin={{v}}", { v: input.ksMinFactor })}> *</em>
                      )}
                    </td>
                    <td><strong>{l.fsNkRep.toFixed(1)}</strong></td>
                  </tr>
                );
              })}
              {negKleef.layers.length > 1 && (
                <tr className="pile-formula-table-sum">
                  <td colSpan={10}>Σ F<sub>s;nk</sub></td>
                  <td><strong>{negKleef.fnkRep.toFixed(1)} kN</strong></td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="pile-result-footnote">
          F<sub>s;nk;i</sub> = σ<sub>gem;i</sub> · O<sub>s</sub> · K<sub>0</sub>tan(δ)<sub>i</sub> · h<sub>i</sub>
          {negKleef.layers.some((l) => l.k0TanDelta === input.ksMinFactor) && (
            <em> &nbsp;· * = K<sub>0</sub>tanδ {t("result.negSkin.cappedNote", "gecapt op ksMin = {{v}}", { v: input.ksMinFactor })}</em>
          )}
        </p>
        <Formula
          lhs={<>F<sub>nk;rep</sub></>}
          symbolic={<>Σ F<sub>s;nk;i</sub></>}
          filled={
            negKleef.layers.length > 0
              ? <>{negKleef.layers.map((l) => l.fsNkRep.toFixed(1)).join(" + ")}</>
              : <>0</>
          }
          result={<>{negKleef.fnkRep.toFixed(1)} kN</>}
        />
        <Formula
          lhs={<>F<sub>nk;d</sub></>}
          symbolic={<>γ<sub>f,nk</sub> · F<sub>nk;rep</sub></>}
          filled={<>{input.gammaFnk.toFixed(2)} · {negKleef.fnkRep.toFixed(1)}</>}
          result={<>{negKleef.fnkD.toFixed(0)} kN</>}
        />
      </section>

      <section>
        <h3>{t("result.base.title", "Puntdraagvermogen")}</h3>
        <p className="pile-result-input">
          q<sub>c;I;gem</sub> = {base.qcIGemMpa.toFixed(2)} MPa, &nbsp;
          q<sub>c;II;gem</sub> = {base.qcIIGemMpa.toFixed(2)} MPa, &nbsp;
          q<sub>c;III;gem</sub> = {base.qcIIIGemMpa.toFixed(2)} MPa
        </p>
        <Formula
          lhs={<>q<sub>b;max</sub></>}
          symbolic={<>½ · α<sub>p</sub> · β · s · ((q<sub>c;I</sub>+q<sub>c;II</sub>)/2 + q<sub>c;III</sub>)</>}
          filled={
            <>
              ½ · {resolvePileType(input)?.alphaP} · {resolvePileType(input)?.beta} · {resolvePileType(input)?.s} · ((
              {base.qcIGemMpa.toFixed(2)}+{base.qcIIGemMpa.toFixed(2)})/2 + {base.qcIIIGemMpa.toFixed(2)})
            </>
          }
          result={
            <>
              {base.qbMaxMpa.toFixed(2)} MPa
              {base.qbMaxMpaRaw > 15 && <em> &nbsp;{t("result.base.capped", "(gecapt op 15 MPa)")}</em>}
            </>
          }
        />
        <Formula
          lhs={<>R<sub>b;cal;max</sub></>}
          symbolic={<>A<sub>b</sub> · q<sub>b;max</sub></>}
          filled={<>{base.abMm2.toFixed(0)} · {base.qbMaxMpa.toFixed(2)} · 10⁻³</>}
          result={<>{base.rbCalMax.toFixed(0)} kN</>}
        />
      </section>

      <section>
        <h3>{t("result.shaft.title", "Maximumschachtwrijving")}</h3>
        <Formula
          lhs={<>R<sub>s;cal;max</sub></>}
          symbolic={<>Σ O<sub>s;gem;j</sub> · q<sub>s;j</sub> · Δh<sub>j</sub></>}
          filled={
            <>
              {t("result.shaft.layers", "{{n}} laag/lagen — Σ van per-laag bijdragen", { n: shaft.perLayer.length })}
            </>
          }
          result={<>{shaft.rsCalMax.toFixed(0)} kN</>}
        />
      </section>

      <section>
        <h3>{t("result.total.title", "Maximum gronddraagvermogen")}</h3>
        <Formula
          lhs={<>R<sub>c;cal</sub></>}
          symbolic={<>R<sub>b;cal;max</sub> + R<sub>s;cal;max</sub></>}
          filled={<>{base.rbCalMax.toFixed(0)} + {shaft.rsCalMax.toFixed(0)}</>}
          result={<>{rcCalMine.toFixed(0)} kN</>}
        />
      </section>

      {settlement.available !== false && <>
      <section>
        <h3>{t("result.settlement.title", "Zakking (art. 7.6.4.2, lastzakkingslijn 1)")}</h3>
        {(() => {
          const wp = settlement.sls;
          const L = settlement.lM ?? input.pileTopNap - input.pileToeNap;
          const ell = settlement.ellM ?? input.pileTopNap - input.negKleefBottomNap;
          const dL = settlement.deltaLM ?? input.negKleefBottomNap - input.pileToeNap;
          const eaKn = settlement.eaKn ?? 0;
          const rbPct = base.rbCalMax > 0 ? (wp.rbMobil / base.rbCalMax) * 100 : 0;
          const rsPct = shaft.rsCalMax > 0 ? (wp.rsMobil / shaft.rsCalMax) * 100 : 0;
          return (
            <>
              <Formula
                lhs={<>F<sub>c;tot</sub></>}
                symbolic={<>N<sub>k</sub> + F<sub>nk</sub></>}
                filled={<>{input.nEk} + {negKleef.fnkD.toFixed(0)}</>}
                result={<>{wp.fcTot.toFixed(0)} kN</>}
              />
              <Formula
                lhs={<>s<sub>b</sub>/D<sub>eq</sub> · 100</>}
                symbolic={<>{wp.sbMm.toFixed(1)} / {base.deqMm.toFixed(1)} · 100 = {((wp.sbMm / base.deqMm) * 100).toFixed(1)} %</>}
                filled={<>→ R<sub>b;1</sub> = {rbPct.toFixed(0)}% · R<sub>b;cal;max</sub> (Fig. 7.n)</>}
                result={<>{wp.rbMobil.toFixed(0)} kN</>}
              />
              <Formula
                lhs={<>s<sub>b</sub> = {wp.sbMm.toFixed(1)} mm</>}
                symbolic={<>→ R<sub>s;1</sub> = {rsPct.toFixed(0)}% · R<sub>s;cal;max</sub> (Fig. 7.o)</>}
                result={<>{wp.rsMobil.toFixed(0)} kN</>}
              />
              <Formula
                lhs={<>F<sub>gem</sub></>}
                symbolic={<>(λ·F<sub>c;tot</sub> + 0,5·ΔL·(F<sub>c;tot</sub> − R<sub>b;1</sub>)) / L</>}
                filled={<>({ell.toFixed(1)} · {wp.fcTot.toFixed(0)} + 0,5 · {dL.toFixed(1)} · ({wp.fcTot.toFixed(0)} − {wp.rbMobil.toFixed(0)})) / {L.toFixed(1)}</>}
                result={<>{wp.fgem.toFixed(0)} kN</>}
              />
              <Formula
                lhs={<>s<sub>el</sub></>}
                symbolic={<>L · F<sub>gem</sub> / EA</>}
                filled={<>{L.toFixed(1)} · {wp.fgem.toFixed(0)} · 10³ / {eaKn.toFixed(0)}</>}
                result={<>{wp.selMm.toFixed(1)} mm</>}
              />
              <Formula
                lhs={<>s<sub>1</sub></>}
                symbolic={<>s<sub>b</sub> + s<sub>el</sub></>}
                filled={<>{wp.sbMm.toFixed(1)} + {wp.selMm.toFixed(1)}</>}
                result={<>{wp.s1Mm.toFixed(1)} mm</>}
              />
              <p className="pile-result-input">
                ULS: s<sub>b</sub>={settlement.uls.sbMm.toFixed(1)} mm, s<sub>1</sub>={settlement.uls.s1Mm.toFixed(1)} mm
              </p>
            </>
          );
        })()}
        <div className="pile-zakking-chart">
          <ZakkingsChart
            settlement={settlement}
            rbCalMax={base.rbCalMax}
            rsCalMax={shaft.rsCalMax}
          />
        </div>
      </section>

      <section>
        <h3>{t("result.spring.title", "Veerwaarde")}</h3>
        <Formula
          lhs={<>k<sub>1</sub></>}
          symbolic={<>F<sub>c;tot</sub> / s<sub>1</sub></>}
          filled={<>{settlement.sls.fcTot.toFixed(0)} · 10³ / {settlement.sls.s1Mm.toFixed(1)}</>}
          result={<>{spring.kSlsKnPerM.toFixed(0)} kN/m</>}
        />
        <Formula
          lhs={<>k<sub>min</sub></>}
          symbolic={<>k<sub>1</sub> / √2</>}
          filled={<>{spring.kSlsKnPerM.toFixed(0)} / 1,414</>}
          result={<>{spring.kMinKnPerM.toFixed(0)} kN/m</>}
        />
        <Formula
          lhs={<>k<sub>max</sub></>}
          symbolic={<>k<sub>1</sub> · √2</>}
          filled={<>{spring.kSlsKnPerM.toFixed(0)} · 1,414</>}
          result={<>{spring.kMaxKnPerM.toFixed(0)} kN/m</>}
        />
      </section>
      </>}

      <section>
        <h3>{t("result.summary.title", "Samenvatting")}</h3>
        <p>{standardLabel(getStandard(input.standard))}</p>
        <Formula lhs={<>R<sub>c;rep/k</sub></>}
          symbolic={summary.historicalXi === undefined ? <>R<sub>c;cal</sub> / ξ₃</> : <>ξ · R<sub>c;cal</sub></>}
          filled={summary.historicalXi === undefined ? <>{summary.rcCal.toFixed(1)} / {summary.xi3}</> : <>{summary.historicalXi} · {summary.rcCal.toFixed(1)}</>}
          result={<>{summary.rcK.toFixed(1)} kN</>} />
        <Formula
          lhs={<>R<sub>c;d</sub></>}
          symbolic={<>R<sub>c;k</sub> / γ<sub>m</sub></>}
          filled={<>{(summary.rcK ?? summary.rcCal).toFixed(0)} / {input.gammaM.toFixed(2)}</>}
          result={<>{summary.rcD.toFixed(0)} kN</>}
        />
        <Formula
          lhs={<>R<sub>c;net;d</sub></>}
          symbolic={<>R<sub>c;d</sub> − F<sub>nk;d</sub></>}
          filled={<>{summary.rcD.toFixed(0)} − {negKleef.fnkD.toFixed(0)}</>}
          result={<>{summary.rcNetD.toFixed(0)} kN</>}
        />
        <Formula
          lhs={<>U.C.</>}
          symbolic={<>N<sub>Ed</sub> / R<sub>c;net;d</sub></>}
          filled={<>{input.nEd.toFixed(0)} / {summary.rcNetD.toFixed(0)}</>}
          result={
            <span className={summary.passes ? "pile-pass" : "pile-fail"}>
              {summary.unityCheck.toFixed(2)} {" "}<OaIcon id={summary.passes ? "status.success" : "status.error"} />{summary.passes ? ` ${t("result.summary.passesShort", "voldoet")}` : ` ${t("result.summary.failsShort", "voldoet NIET")}`}
            </span>
          }
        />
        <table className="pile-sheet-checks">
          <thead><tr><th>{t("result.summary.check", "Toets")}</th><th>{t("result.summary.quantity", "Grootheid")}</th><th>u.c.</th><th>{t("result.summary.result", "Resultaat")}</th></tr></thead>
          <tbody>
            <tr>
              <td>{t("result.summary.compression", "Draagvermogen op druk")}</td>
              <td>N<sub>Ed</sub> ≤ R<sub>c;net;d</sub></td>
              <td className="num">{summary.unityCheck.toFixed(2)}</td>
              <td className={summary.passes ? "pile-pass" : "pile-fail"}>{summary.passes ? t("result.summary.passes", "Voldoet") : t("result.summary.fails", "Voldoet niet")}</td>
            </tr>
          </tbody>
        </table>
        <p className="pile-sheet-conclusion">
          <strong>{t("result.summary.conclusion", "Conclusie:")}</strong>{" "}
          {input.nEd > 0
            ? summary.passes
              ? <Trans t={t} i18nKey="result.summary.conclusionPass" defaults="de paal voldoet; N<sub>Ed</sub> = {{nEd}} kN is {{pct}}% van R<sub>c;net;d</sub> = {{rc}} kN." values={{ nEd: input.nEd.toFixed(0), pct: Math.round(summary.unityCheck * 100), rc: summary.rcNetD.toFixed(0) }} components={{ sub: <sub /> }} />
              : <Trans t={t} i18nKey="result.summary.conclusionFail" defaults="de paal voldoet niet; N<sub>Ed</sub> = {{nEd}} kN overschrijdt R<sub>c;net;d</sub> = {{rc}} kN." values={{ nEd: input.nEd.toFixed(0), rc: summary.rcNetD.toFixed(0) }} components={{ sub: <sub /> }} />
            : <Trans t={t} i18nKey="result.summary.conclusionNoLoad" defaults="geen ontwerpbelasting ingevoerd; het netto draagvermogen is R<sub>c;net;d</sub> = {{rc}} kN." values={{ rc: summary.rcNetD.toFixed(0) }} components={{ sub: <sub /> }} />}
        </p>
      </section>
    </div>
  );
}

/** NAP-niveau met teken en twee decimalen, b.v. "−14.00". */
function fmtNap(v: number): string {
  return (v < 0 ? "−" : "+") + Math.abs(v).toFixed(2);
}
