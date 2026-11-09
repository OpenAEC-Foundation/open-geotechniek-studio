import { useEffect, useState } from "react";
import { useSubsurfaceStore } from "./store";
import { aquifers } from "./regis";
import { LITHOCLASSES } from "./geotop";
import { levelsFromWells } from "./actions";

/** Getal invullen; vastgelegd bij Enter of verlaten van het veld, leeg = niet vastgelegd. */
function LevelInput({ value, onCommit, label }: { value: number | null; onCommit: (v: number | null) => void; label: string }) {
  const show = (v: number | null) => (v === null ? "" : String(Math.round(v * 100) / 100));
  const [text, setText] = useState(show(value));
  useEffect(() => setText(show(value)), [value]);
  const commit = () => {
    const t = text.trim().replace(",", ".");
    if (t === "") { if (value !== null) onCommit(null); return; }
    const v = Number(t);
    if (Number.isFinite(v)) { if (v !== value) onCommit(v); } else setText(show(value));
  };
  return (
    <label className="soil3d-level">
      <span>{label}</span>
      <input inputMode="decimal" value={text} placeholder="—" onChange={(e) => setText(e.target.value)} onBlur={commit}
        onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") setText(show(value)); }} />
      <small>m NAP</small>
    </label>
  );
}

const range = (vs: (number | null)[]) => { const v = vs.filter((x): x is number => x !== null); return v.length ? [Math.min(...v), Math.max(...v)] : null; };

/** Grondwaterstanden: freatisch en stijghoogte per pakket, in te vullen of over te nemen uit de peilbuizen. */
export function GroundwaterLevels({ docId }: { docId: string }) {
  const data = useSubsurfaceStore((s) => s.byDoc.get(docId) ?? null);
  const setGroundwater = useSubsurfaceStore((s) => s.setGroundwater);
  const gw = data?.groundwater ?? { phreaticNap: null, heads: [], source: null };
  const packs = data?.regis ? aquifers(data.regis) : [];
  const nHeads = packs.length > 0 ? Math.min(packs.length, 3) : 2;
  const measured = (data?.wells ?? []).filter((w) => w.stats);
  const setHead = (i: number, v: number | null) => {
    const heads = Array.from({ length: nHeads }, (_, k) => gw.heads[k] ?? null);
    heads[i] = v;
    setGroundwater(docId, { heads, source: "handmatig" });
  };
  return (
    <div className="soil3d-details">
      <LevelInput label="Freatisch" value={gw.phreaticNap} onCommit={(v) => setGroundwater(docId, { phreaticNap: v, source: "handmatig" })} />
      {Array.from({ length: nHeads }, (_, i) => (
        <LevelInput key={i} label={`φ ${i + 1}e pakket`} value={gw.heads[i] ?? null} onCommit={(v) => setHead(i, v)} />
      ))}
      <div className="soil3d-note soil3d-muted">
        {gw.source === "metingen" ? "Afgeleid uit peilbuizen (gemiddelde laatste vijf meetjaren)." : gw.source === "handmatig" ? "Handmatig vastgelegd." : "Vul in, of zet Peilbuizen aan om uit metingen af te leiden."}
        {measured.length > 0 && gw.source === "handmatig" && (
          <> <button type="button" className="soil3d-link" onClick={() => setGroundwater(docId, { phreaticNap: null, heads: [], ...levelsFromWells(data!.wells!, nHeads) })}>Uit metingen overnemen</button></>
        )}
      </div>
    </div>
  );
}

/** De watervoerende pakketten met diepte en doorlaatvermogen. */
export function AquiferList({ docId }: { docId: string }) {
  const data = useSubsurfaceStore((s) => s.byDoc.get(docId) ?? null);
  if (!data?.regis) return null;
  return (
    <div className="soil3d-details">
      {aquifers(data.regis).map((p) => {
        const t = range(p.top), b = range(p.bottom), kd = range(p.kD);
        return (
          <div key={p.index} className="soil3d-note">
            <b>{p.index}e</b> NAP {t?.[1].toFixed(1)} tot {b?.[0].toFixed(1)} m{kd && <> · kD {Math.round(kd[0])}–{Math.round(kd[1])} m²/d</>}
          </div>
        );
      })}
    </div>
  );
}

/** De peilbuizen met filter, pakket en meetgegevens. */
export function WellList({ docId }: { docId: string }) {
  const wells = useSubsurfaceStore((s) => s.byDoc.get(docId)?.wells ?? null);
  if (!wells?.length) return wells ? <div className="soil3d-details soil3d-note soil3d-muted">Geen peilbuizen binnen 500 m.</div> : null;
  return (
    <div className="soil3d-details">
      {wells.slice(0, 8).map((w) => (
        <div key={w.id} className="soil3d-note" title={w.stats ? `${w.stats.n} metingen ${w.stats.first} – ${w.stats.last}` : "geen meetreeks"}>
          {w.id.replace(/^GMW0+/, "GMW ")} · filter {w.screenTop?.toFixed(1)}/{w.screenBottom?.toFixed(1)}
          {w.aquifer !== null && <> · {w.aquifer === 0 ? "deklaag" : `${w.aquifer}e WVP`}</>}
          {w.stats && <><br /><span className="soil3d-muted">gem. NAP {w.stats.recentMean.toFixed(2)}{w.stats.ghg !== null && <> · GHG {w.stats.ghg.toFixed(2)} · GLG {w.stats.glg!.toFixed(2)}</>} · t/m {w.stats.last.slice(0, 4)}</span></>}
        </div>
      ))}
    </div>
  );
}

/** Legenda van de lithoklassen die in het GeoTOP-blok voorkomen. */
export function GeotopLegend({ docId }: { docId: string }) {
  const geotop = useSubsurfaceStore((s) => s.byDoc.get(docId)?.geotop ?? null);
  if (!geotop) return null;
  const classes = [...new Set(geotop.lithok.filter((v): v is number => v !== null))].sort((a, b) => a - b);
  return (
    <div className="soil3d-details">
      {classes.map((lk) => (
        <div key={lk} className="soil3d-zone"><span className="soil3d-swatch" style={{ background: LITHOCLASSES[lk]?.color }} />{LITHOCLASSES[lk]?.name ?? lk}</div>
      ))}
    </div>
  );
}
