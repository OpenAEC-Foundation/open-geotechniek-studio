import { useTranslation } from "react-i18next";
import type { Cpt } from "../../types/cpt";
import { DISSIPATION_KEY, dissipationTestsOf, summarizeDissipation, type DissipationTest } from "../../types/gefDissipation";
import { useCptStore } from "../../store/useCptStore";
import { OaIcon } from "../icons/oaIcon";
import "./DissipationPanel.css";

const W = 260, H = 150, PAD = { l: 34, r: 8, t: 8, b: 26 };
const nl = (v: number, d = 0) => v.toFixed(d).replace("-", "−").replace(".", ",");
const kpa = (mpa: number) => mpa * 1000;

/** Waterspanning (kPa) tegen de tijd op een logaritmische as, met de t50 als stippellijnen. */
export function DissipationChart({ test }: { test: DissipationTest }) {
  const { t } = useTranslation("panels");
  const pts = test.points.filter((p): p is typeof p & { u: number } => p.u !== undefined);
  if (pts.length < 2) return null;
  const summary = summarizeDissipation(test);
  const positive = pts.map((p) => p.t).concat(summary?.t50 ?? []).filter((v) => v > 0);
  const tMin = positive.length ? Math.min(...positive) : 1;
  const lt = (v: number) => Math.log10(Math.max(v, tMin));
  const l0 = Math.floor(lt(tMin)), l1 = Math.max(l0 + 1, Math.ceil(lt(Math.max(...pts.map((p) => p.t)))));
  const us = pts.map((p) => kpa(p.u));
  let u0 = Math.min(...us), u1 = Math.max(...us);
  if (u1 - u0 < 10) { u0 -= 5; u1 += 5; }
  const pad = (u1 - u0) * 0.08; u0 -= pad; u1 += pad;
  const x = (v: number) => PAD.l + ((lt(v) - l0) / (l1 - l0)) * (W - PAD.l - PAD.r);
  const y = (v: number) => PAD.t + ((u1 - v) / (u1 - u0)) * (H - PAD.t - PAD.b);
  const step = [5, 10, 20, 25, 50, 100, 200, 250, 500].find((s) => (u1 - u0) / s <= 5) ?? 1000;
  const ticks: number[] = [];
  for (let v = Math.ceil(u0 / step) * step; v <= u1 + 1e-9; v += step) ticks.push(v);
  const decades: number[] = [];
  for (let l = l0; l <= l1; l++) decades.push(l);
  const label = t("dissipation.chartLabel", "Waterspanning in kPa tegen de tijd in seconden (logaritmisch)");
  return (
    <svg className="dissipation-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label}>
      {ticks.map((v) => (
        <g key={v}>
          <line x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)} className="grid" />
          <text x={PAD.l - 4} y={y(v) + 3} textAnchor="end">{nl(v)}</text>
        </g>
      ))}
      {decades.map((l) => (
        <g key={l}>
          <line x1={x(10 ** l)} x2={x(10 ** l)} y1={PAD.t} y2={H - PAD.b} className="grid" />
          <text x={x(10 ** l)} y={H - PAD.b + 11} textAnchor="middle">{10 ** l >= 1 ? nl(10 ** l) : String(10 ** l).replace(".", ",")}</text>
        </g>
      ))}
      <text x={(PAD.l + W - PAD.r) / 2} y={H - 3} textAnchor="middle">{t("dissipation.timeAxis", "tijd [s]")}</text>
      <text x={8} y={PAD.t + 2} transform={`rotate(-90 8 ${PAD.t + 2})`} textAnchor="end">u [kPa]</text>
      <line x1={PAD.l} x2={PAD.l} y1={PAD.t} y2={H - PAD.b} className="axis" />
      <line x1={PAD.l} x2={W - PAD.r} y1={H - PAD.b} y2={H - PAD.b} className="axis" />
      {summary?.t50 !== undefined && (
        <g className="t50">
          <line x1={PAD.l} x2={x(summary.t50)} y1={y(kpa(summary.u50))} y2={y(kpa(summary.u50))} />
          <line x1={x(summary.t50)} x2={x(summary.t50)} y1={y(kpa(summary.u50))} y2={H - PAD.b} />
        </g>
      )}
      <polyline className="curve" fill="none" points={pts.map((p) => `${x(p.t).toFixed(1)},${y(kpa(p.u)).toFixed(1)}`).join(" ")} />
    </svg>
  );
}

const seconds = (s: number) => (s < 60 ? `${nl(s, s < 10 ? 1 : 0)} s` : s < 3600 ? `${nl(s / 60, 1)} min` : `${nl(s / 3600, 1)} h`);

/** Dissipatietests bij de sondering: per test diepte, kenmerken, grafiek en een knop om hem te verwijderen. */
export function DissipationPanel({ cpt }: { cpt: Cpt }) {
  const { t } = useTranslation("panels");
  const tests = dissipationTestsOf(cpt);
  const remove = (test: DissipationTest) => {
    const rest = tests.filter((item) => item !== test);
    const extra = { ...cpt.metadata.extra };
    if (rest.length) extra[DISSIPATION_KEY] = JSON.stringify(rest);
    else delete extra[DISSIPATION_KEY];
    useCptStore.getState().replaceCpt({ ...cpt, metadata: { ...cpt.metadata, extra } });
  };
  return (
    <div className="dissipation-list">
      {tests.map((test) => {
        const s = summarizeDissipation(test);
        return (
          <section key={test.source_file} className="dissipation-item">
            <header>
              <strong>{test.depth_m !== undefined ? t("dissipation.atDepth", "Op {{depth}} m", { depth: nl(test.depth_m, 2) }) : test.id}</strong>
              <span title={test.source_file}>{test.u_channel ?? ""}{test.date ? ` · ${test.date}` : ""}</span>
              <button type="button" className="dissipation-remove" onClick={() => remove(test)}
                aria-label={t("dissipation.remove", "Dissipatietest verwijderen")} title={t("dissipation.remove", "Dissipatietest verwijderen")}>
                <OaIcon id="document.close" />
              </button>
            </header>
            <DissipationChart test={test} />
            {s && (
              <dl className="metadata-list">
                <dt>{t("dissipation.uMax", "u max")}</dt><dd>{nl(kpa(s.u_max))} kPa · {seconds(s.t_u_max)}</dd>
                <dt>{t("dissipation.uEnd", "u eind")}</dt><dd>{nl(kpa(s.u_end))} kPa · {seconds(s.t_end)}</dd>
                <dt>t50</dt><dd>{s.t50 !== undefined ? seconds(s.t50) : t("dissipation.noDecay", "geen afname")}</dd>
              </dl>
            )}
          </section>
        );
      })}
      <p className="panel-note">{t("dissipation.note", "t50: tijd tot de helft van de afname tussen de hoogste en de laatste meting. De laatste meting benadert het evenwicht; is de test vroeg gestopt, dan is t50 indicatief.")}</p>
    </div>
  );
}
