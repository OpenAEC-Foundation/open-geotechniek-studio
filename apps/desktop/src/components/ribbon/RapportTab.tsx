import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import RibbonGroup from "./RibbonGroup";
import RibbonButton from "./RibbonButton";
import { useCptStore } from "../../store/useCptStore";
import { getCurrentReportSections } from "../../store/reportSectionsState";
import { reports } from "../../utils/platform";


// `onOpenProjectSettings` is no longer used here — the Projectinfo
// button has moved to the Home tab. Kept in the prop signature so the
// Ribbon wiring (which still forwards it) doesn't have to change.
interface RapportTabProps {
  onOpenProjectSettings?: () => void;
}

export default function RapportTab(_props: RapportTabProps) {
  const { t } = useTranslation("ribbon");
  const cptsMap = useCptStore((s) => s.cpts);
  const cpts = useMemo(() => Array.from(cptsMap.values()), [cptsMap]);
  const projectMeta = useCptStore((s) => s.projectMeta);
  const [busy, setBusy] = useState(false);
  const [error,setError] = useState<string|null>(null);

  async function generatePdf() {
setBusy(true);
    try {
      setError(null);
      await reports.save(cpts,projectMeta,getCurrentReportSections());
    } catch (e) {
      setError(String(e));
      console.error("generate_report failed", e);
    } finally {
      setBusy(false);
    }
  }

  /** Genereer met de actuele vinkjes en open direct in de systeem-viewer
   *  (via temp-bestand — window.open werkt niet in de Tauri-webview). */
  async function openPdf() {
    setBusy(true);
    try {
      setError(null);
      await reports.generateAndOpen(cpts,projectMeta,getCurrentReportSections());
    } catch (e) {
      setError(String(e));
      console.error("open_report_pdf failed", e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="ribbon-content">
      {error && <p role="alert">{error}</p>}
      <div className="ribbon-groups">
        <RibbonGroup label={t("output")}>
          <RibbonButton
            icon="report.generate"
            label={t("generatePdf")}
            size="large"
            onClick={() => void generatePdf()}
            disabled={cpts.length === 0 || busy}
          />
          <RibbonButton
            icon="report.open-viewer"
            label={t("openPdf", "Open PDF")}
            size="large"
            onClick={() => void openPdf()}
            disabled={cpts.length === 0 || busy}
          />
        </RibbonGroup>
      </div>
    </div>
  );
}
