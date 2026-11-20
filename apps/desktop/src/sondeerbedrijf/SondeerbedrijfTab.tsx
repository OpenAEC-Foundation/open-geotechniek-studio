// Lint voor sondeerbedrijven: bedrijfsgegevens instellen, coördinaten aanvullen en het sondeerrapport maken.
import { useEffect, useMemo, useState } from "react";
import RibbonGroup from "../components/ribbon/RibbonGroup";
import RibbonButton from "../components/ribbon/RibbonButton";
import { useCptStore } from "../store/useCptStore";
import { reports } from "../utils/platform";
import { useReportBrand } from "../report/reportBrand";
import { COMPANY_CHANGED_EVENT, openCompanyProfile } from "./CompanyDialog";
import { matchCoordinates, parseCoordinates, withPosition } from "./coordinates";
import { CPT_REPORT_SECTIONS, loadProfile } from "./profile";
import BroExportDialog from "../broExport/BroExportDialog";

export default function SondeerbedrijfTab() {
  const cptsMap = useCptStore((s) => s.cpts);
  const projectMeta = useCptStore((s) => s.projectMeta);
  const replaceCpt = useCptStore((s) => s.replaceCpt);
  const organization = useReportBrand((s) => s.brand.organization);
  const brandSource = useReportBrand((s) => s.source);
  const cpts = useMemo(() => Array.from(cptsMap.values()), [cptsMap]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);
  const [company, setCompany] = useState("");
  const [broOpen, setBroOpen] = useState(false);
  useEffect(() => {
    const refresh = () => void loadProfile().then((p) => setCompany(p.name));
    refresh();
    window.addEventListener(COMPANY_CHANGED_EVENT, refresh);
    return () => window.removeEventListener(COMPANY_CHANGED_EVENT, refresh);
  }, []);
  const withoutPosition = cpts.filter((c) => !c.position || (!c.position.x_rd && !c.position.y_rd)).length;

  // Zonder ingevulde opsteller staat het sondeerbedrijf als uitvoerder op het rapport.
  const meta = { ...projectMeta, author: projectMeta.author || company };
  const run = async (job: () => Promise<void>, done: string) => {
    setBusy(true); setMessage(null);
    try { await job(); setMessage({ text: done }); }
    catch (e) { setMessage({ text: e instanceof Error ? e.message : String(e), error: true }); }
    finally { setBusy(false); }
  };
  const importCoordinates = () => {
    const input = document.createElement("input");
    input.type = "file"; input.accept = ".csv,.txt,.xyz,text/csv,text/plain";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      const { rows, skipped } = parseCoordinates(await file.text());
      const r = matchCoordinates(rows, cpts, skipped);
      for (const m of r.matches) replaceCpt(withPosition(cptsMap.get(m.cptId)!, m.row));
      const parts = [`${r.matches.length} van ${cpts.length} sonderingen kregen een positie`];
      if (r.missing.length) parts.push(`niet in het bestand: ${r.missing.join(", ")}`);
      if (r.unmatched.length) parts.push(`geen sondering bij: ${r.unmatched.join(", ")}`);
      if (r.skipped) parts.push(`${r.skipped} regel(s) niet gelezen`);
      setMessage({ text: `${parts.join("; ")}.`, error: r.matches.length === 0 });
    };
    input.click();
  };

  return (
    <div className="ribbon-content">
      <div className="ribbon-groups">
        <RibbonGroup label="Bedrijf">
          <RibbonButton icon="project.properties" label={"Bedrijfs-\ngegevens"} title="Naam, logo, kleur en contactgegevens voor het sondeerrapport" onClick={openCompanyProfile} />
          <div className="ribbon-info-block">
            <div className="ribbon-info-title">{company || "Nog niet ingesteld"}</div>
            <div className="ribbon-info-sub">{company ? `Op het rapport: ${organization} (${brandSource})` : "Stel je bedrijf in voor een rapport in eigen huisstijl."}</div>
          </div>
        </RibbonGroup>
        <RibbonGroup label="Sonderingen">
          <RibbonButton icon="geo.coordinate-tag" label={"Coördinaten\ninlezen"} disabled={!cpts.length}
            title="Lees een bestand met naam; x; y en optioneel de maaiveldhoogte, en vul de posities van de sonderingen aan" onClick={importCoordinates} />
          <div className="ribbon-info-block">
            <div className="ribbon-info-title">{cpts.length} sondering{cpts.length === 1 ? "" : "en"}</div>
            <div className="ribbon-info-sub">{!cpts.length ? "Open eerst sonderingen." : withoutPosition ? `${withoutPosition} zonder coördinaten` : "Alle met coördinaten"}</div>
          </div>
        </RibbonGroup>
        <RibbonGroup label="Sondeerrapport">
          <RibbonButton icon="report.generate" label={"Rapport\nopslaan"} size="large" disabled={!cpts.length || busy}
            title="Sondeerrapport als PDF: voorblad, coördinaten, kaart en per sondering de sondeerstaat"
            onClick={() => void run(() => reports.save(cpts, meta, CPT_REPORT_SECTIONS), "Sondeerrapport gemaakt.")} />
          <RibbonButton icon="report.open-viewer" label={"Rapport\nbekijken"} size="large" disabled={!cpts.length || busy}
            onClick={() => void run(() => reports.generateAndOpen(cpts, meta, CPT_REPORT_SECTIONS), "Sondeerrapport geopend.")} />
          {message && <div className={`ribbon-info-sub${message.error ? " ribbon-info-error" : ""}`} style={{ maxWidth: 320 }} role={message.error ? "alert" : "status"}>{message.text}</div>}
        </RibbonGroup>
        <RibbonGroup label="Basisregistratie Ondergrond">
          <RibbonButton icon="file.export" label="BRO-XML" size="large" disabled={!cpts.length}
            title="Sonderingen als registratieverzoek voor de Basisregistratie Ondergrond opslaan (één XML-bestand per sondering)"
            onClick={() => setBroOpen(true)} />
        </RibbonGroup>
      </div>
      <BroExportDialog open={broOpen} onClose={() => setBroOpen(false)} />
    </div>
  );
}
