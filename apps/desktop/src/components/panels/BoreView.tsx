import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Bore } from "../../types/bore";
import BoorstaatSvg from "../../boorstaat/BoorstaatSvg";
import { buildBoorstaat } from "../../boorstaat/boorstaat";
import { openBoreEditor } from "../../boorstaat/boreStore";
import { useBoorstaatLabels } from "../../boorstaat/labels";
import "../../boorstaat/boorstaat.css";

const ZOOM_MIN = 0.5;
const ZOOM_MAX = 6;
const ZOOM_STEP = 1.4;
/** Breedte van het blad bij 1×: een A4 op ongeveer schermgrootte. */
const BASE_WIDTH_PX = 760;

/**
 * BoreView — de boorstaat van een boring op het scherm.
 *
 * Het blad is dezelfde tekening als de boorstaat-pagina in het rapport (`buildBoorstaat`): kop,
 * diepteschaal t.o.v. maaiveld en NAP, boorkolom met kleur en arcering per laag, beschrijvingen,
 * grondwaterstand en legenda. Ctrl + scroll zoomt; "Bewerken" opent de editor.
 */
export default function BoreView({ bore }: { bore: Bore }) {
  const { t } = useTranslation("panels");
  const { t: tb } = useTranslation("boring");
  const labels = useBoorstaatLabels();
  const [zoom, setZoom] = useState(1);
  const layout = useMemo(() => buildBoorstaat(bore, { labels }), [bore, labels]);

  const zoomIn = () => setZoom((z) => Math.min(ZOOM_MAX, +(z * ZOOM_STEP).toFixed(2)));
  const zoomOut = () => setZoom((z) => Math.max(ZOOM_MIN, +(z / ZOOM_STEP).toFixed(2)));

  // React's onWheel is passive; alleen een eigen listener kan de paginazoom tegenhouden.
  const bodyRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      setZoom((z) => e.deltaY < 0 ? Math.min(ZOOM_MAX, +(z * ZOOM_STEP).toFixed(2)) : Math.max(ZOOM_MIN, +(z / ZOOM_STEP).toFixed(2)));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  return (
    <div className="boorstaat-view">
      <div className="boorstaat-toolbar">
        <span className="boorstaat-hint">{t("bore.zoomHint", "Ctrl + scroll om in/uit te zoomen")}</span>
        <button type="button" onClick={() => openBoreEditor(bore.id)}>{tb("view.edit", "Bewerken")}</button>
        <button type="button" onClick={zoomOut} disabled={zoom <= ZOOM_MIN} title={t("bore.zoomOut", "Uitzoomen")}>−</button>
        <button type="button" onClick={() => setZoom(1)} title={t("bore.zoomReset", "Reset zoom")}>{`${zoom.toFixed(1)}×`}</button>
        <button type="button" onClick={zoomIn} disabled={zoom >= ZOOM_MAX} title={t("bore.zoomIn", "Inzoomen")}>+</button>
      </div>
      <div className="boorstaat-scroll" ref={bodyRef}>
        <div className="boorstaat-sheet" style={{ width: BASE_WIDTH_PX * zoom }}>
          <BoorstaatSvg scene={layout.scene} width="100%" label={tb("sheet.title", "Boorstaat {{id}}", { id: bore.id || t("bore.fallbackTitle", "Boring") })} />
        </div>
      </div>
    </div>
  );
}
