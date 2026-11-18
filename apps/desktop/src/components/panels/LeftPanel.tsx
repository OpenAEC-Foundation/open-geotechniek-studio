import LayerPanel from "./LayerPanel";
import ValidationPanel from "../../validation/ValidationPanel";
import { Fragment, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { files } from "../../utils/platform";
import { useCptStore, addCptToActiveProject, addBoreToActiveProject } from "../../store/useCptStore";
import type { BoreDocument, GwpDocument } from "../../store/useCptStore";
import type { Cpt } from "../../types/cpt";
import type { Bore } from "../../types/bore";
import { looksLikeBoringXml } from "../../types/bore";
import { looksLikeGefBore } from "../../types/gefBoreParser";
import type { Gwp } from "../../types/gwp";
import { OaIcon } from "../icons/oaIcon";

/**
 * Document-aware left panel.
 *
 * - When the active document is a ProjectDocument, renders the project
 *   browser (project meta + sondering tree + per-CPT details).
 * - When the active document is a CptDocument, renders just the per-CPT
 *   metadata / layers / measurements (no project tree).
 * - When no doc is active, renders a quiet empty state.
 */
export default function LeftPanel() {
  const { t } = useTranslation("cpt");
  const documents = useCptStore((s) => s.documents);
  const activeDocId = useCptStore((s) => s.activeDocId);
  const activeDoc = useMemo(
    () => documents.find((d) => d.id === activeDocId),
    [documents, activeDocId],
  );

  if (!activeDoc) {
    return (
      <div className="left-panel-body">
        <p className="panel-empty" style={{ padding: "12px 10px" }}>{t("noCpts")}</p>
      </div>
    );
  }

  if (activeDoc.kind === "project") {
    return <ProjectBrowser />;
  }
  if (activeDoc.kind === "bore") {
    return <BoreDetails doc={activeDoc} />;
  }
  if (activeDoc.kind === "gwp") {
    return <GwpDetails doc={activeDoc} />;
  }
  return <CptDetails cpt={activeDoc.cpt} />;
}

// ──────────────────────────────────────────────────────────────
// Standalone Grondwaterput (active doc = GwpDocument)
// ──────────────────────────────────────────────────────────────

function GwpDetails({ doc }: { doc: GwpDocument }) {
  const { t } = useTranslation("panels");
  const g = doc.gwp;
  return (
    <div className="left-panel-body">
      <div className="project-header">
        <div className="project-header-icon"><FileIcon /></div>
        <div className="project-header-text">
          <div className="project-header-title">{g.broId || doc.title}</div>
          <div className="project-header-sub">
            {t("left.gwp.subtitle", "Grondwatermonitoringput (BRO/GMW)")}
            {g.wellCode ? ` · ${g.wellCode}` : ""}
          </div>
        </div>
      </div>

      <PanelSection title={t("left.gwp.wellData", "Putgegevens")} defaultOpen>
        <GwpMetadataList gwp={g} />
      </PanelSection>
      <PanelSection title={t("left.gwp.tubes", "Buizen (filters)")} defaultOpen>
        <GwpTubesList gwp={g} />
      </PanelSection>
      <PanelSection title={t("left.photos.title", "Foto's & inspectie")}>
        <BroPhotos broId={g.broId} kind="gwp" />
      </PanelSection>
      <PanelSection title={t("left.rawXml.title", "Ruwe data (XML)")}>
        <BoreRawXml xml={doc.rawXml} />
      </PanelSection>
    </div>
  );
}

function GwpMetadataList({ gwp }: { gwp: Gwp }) {
  const { t } = useTranslation("panels");
  return (
    <dl className="metadata-list">
      <dt>BRO-id</dt><dd>{gwp.broId || "—"}</dd>
      <dt>{t("left.gwp.wellCode", "Put-code")}</dt><dd>{gwp.wellCode ?? "—"}</dd>
      <dt>{t("left.gwp.manager", "Beheerder")}</dt><dd>{gwp.deliveryAccountableParty ?? "—"}</dd>
      <dt>{t("left.gwp.owner", "Eigenaar")}</dt><dd>{gwp.owner ?? "—"}</dd>
      <dt>{t("left.meta.qualityRegime", "Kwaliteitsregime")}</dt><dd>{gwp.qualityRegime ?? "—"}</dd>
      <dt>{t("left.gwp.constructed", "Geconstrueerd")}</dt><dd>{gwp.constructionDate ?? "—"}</dd>
      <dt>{t("left.gwp.initialFunction", "Initiële functie")}</dt><dd>{gwp.initialFunction ?? "—"}</dd>
      <dt>{t("left.gwp.wellHeadProtector", "Putkop-bescherming")}</dt><dd>{gwp.wellHeadProtector ?? "—"}</dd>
      <dt>RD x/y</dt>
      <dd>
        {typeof gwp.rdX === "number" && typeof gwp.rdY === "number"
          ? `${gwp.rdX.toFixed(1)}, ${gwp.rdY.toFixed(1)}`
          : "—"}
      </dd>
      <dt>WGS84 lat/lon</dt>
      <dd>
        {typeof gwp.lat === "number" && typeof gwp.lon === "number"
          ? `${gwp.lat.toFixed(5)}, ${gwp.lon.toFixed(5)}`
          : "—"}
      </dd>
      <dt>{t("left.meta.groundLevelNap", "Maaiveld NAP")}</dt>
      <dd>
        {typeof gwp.groundLevelNap === "number"
          ? `${gwp.groundLevelNap.toFixed(2)} m`
          : "—"}
      </dd>
      <dt>{t("left.gwp.tubeCount", "Aantal buizen")}</dt><dd>{gwp.numberOfMonitoringTubes ?? gwp.tubes.length}</dd>
    </dl>
  );
}

function GwpTubesList({ gwp }: { gwp: Gwp }) {
  const { t: tr } = useTranslation("panels");
  if (gwp.tubes.length === 0) {
    return <p className="panel-empty">{tr("left.gwp.noTubes", "Geen buizen.")}</p>;
  }
  return (
    <table className="layers-table">
      <thead>
        <tr>
          <th>#</th>
          <th>{tr("left.gwp.filterTop", "Filter top")}</th>
          <th>{tr("left.gwp.filterBottom", "Filter onder")}</th>
          <th>{tr("left.gwp.status", "Status")}</th>
        </tr>
      </thead>
      <tbody>
        {gwp.tubes
          .slice()
          .sort((a, b) => a.tubeNumber - b.tubeNumber)
          .map((t) => (
            <tr key={t.tubeNumber}>
              <td>{t.tubeNumber}</td>
              <td>{t.screenTopPositionNap?.toFixed(2) ?? "—"}</td>
              <td>{t.screenBottomPositionNap?.toFixed(2) ?? "—"}</td>
              <td title={t.material ?? ""}>{t.tubeStatus ?? "—"}</td>
            </tr>
          ))}
      </tbody>
    </table>
  );
}

// ──────────────────────────────────────────────────────────────
// Standalone Boring (active doc = BoreDocument)
// ──────────────────────────────────────────────────────────────

function BoreDetails({ doc }: { doc: BoreDocument }) {
  const { t } = useTranslation("panels");
  const b = doc.bore;
  return (
    <div className="left-panel-body">
      <div className="project-header">
        <div className="project-header-icon"><FileIcon /></div>
        <div className="project-header-text">
          <div className="project-header-title">{b.id || doc.title}</div>
          <div className="project-header-sub">{b.metadata.source_file}</div>
        </div>
      </div>

      <PanelSection title={t("left.bore.boreData", "Boringsgegevens")} defaultOpen>
        <BoreMetadataList bore={b} />
      </PanelSection>
      <PanelSection title={t("left.bore.fileMetadata", "Bestandsmetadata")}>
        <BoreExtraList bore={b} />
      </PanelSection>
      <PanelSection title={t("left.bore.layers", "Lagen")} defaultOpen>
        <BoreLayersList bore={b} />
      </PanelSection>
      <PanelSection title={t("left.photos.title", "Foto's & inspectie")}>
        <BroPhotos broId={b.id} kind="bore" />
      </PanelSection>
      <PanelSection title={t("left.rawXml.title", "Ruwe data (XML)")}>
        <BoreRawXml xml={doc.rawXml} />
      </PanelSection>
    </div>
  );
}

/**
 * BRO-foto's voor sonderingen + boringen. De publieke BRO REST API
 * exposeert (op moment van schrijven) géén foto-bytes — foto's worden
 * door BROloket gehost binnen hun web-viewer. We tonen een directe
 * link daarheen, plus de geprobeerde endpoints voor wanneer een
 * publieke foto-API in de toekomst beschikbaar komt.
 *
 * Werkt voor zowel BHR/CPT als GMW broIds — de BROloket-zoekpagina
 * accepteert alle drie domein-prefixes.
 */
function BroPhotos({ broId, kind }: { broId?: string; kind: "cpt" | "bore" | "gwp" }) {
  const { t } = useTranslation("panels");
  if (!broId || !/^[A-Z]{3}\d{12,}$/.test(broId)) {
    return (
      <p className="panel-empty">
        {t("left.photos.onlyBro", "Foto's zijn alleen beschikbaar voor BRO-objecten (BHR/CPT/GMW-id vereist).")}
      </p>
    );
  }
  const brokloketUrl = `https://www.broloket.nl/ondergrondgegevens?bro-id=${encodeURIComponent(broId)}`;
  const hint =
    kind === "bore" ? t("left.photos.hintBore", "BRO hosts foto's van deze boring (indien aanwezig) op BROloket.") :
    kind === "gwp" ? t("left.photos.hintGwp", "BRO hosts foto's van deze grondwaterput (indien aanwezig) op BROloket.") :
    t("left.photos.hintCpt", "BRO hosts foto's van deze sondering (indien aanwezig) op BROloket.");
  return (
    <div className="bore-photo-wrap">
      <p className="bore-photo-hint">
        {hint}
      </p>
      <a
        className="bore-photo-link"
        href={brokloketUrl}
        target="_blank"
        rel="noopener noreferrer"
      >
        {t("left.photos.link", "Bekijk foto's op BROloket ↗")}
      </a>
    </div>
  );
}

function BoreMetadataList({ bore }: { bore: Bore }) {
  const { t } = useTranslation("panels");
  const m = bore.metadata;
  return (
    <>
    {m.extra?.Gegevenscontrole && <p role="alert" className="panel-error">{m.extra.Gegevenscontrole}</p>}
    <dl className="metadata-list">
      <dt>{t("left.bore.id", "Boring-ID")}</dt><dd>{bore.id || "—"}</dd>
      <dt>{t("left.bore.project", "Project")}</dt><dd>{m.project_name ?? "—"}</dd>
      <dt>{t("left.bore.projectNumber", "Projectnr")}</dt><dd>{m.project_number ?? "—"}</dd>
      <dt>{t("left.bore.accountableParty", "Bronhouder")}</dt><dd>{m.accountable_party ?? "—"}</dd>
      <dt>{t("left.bore.startDate", "Startdatum")}</dt><dd>{m.start_date ?? "—"}</dd>
      <dt>{t("left.bore.endDate", "Einddatum")}</dt><dd>{m.end_date ?? "—"}</dd>
      <dt>{t("left.bore.descriptionDate", "Beschrijfdatum")}</dt><dd>{m.description_date ?? "—"}</dd>
      <dt>{t("left.meta.qualityRegime", "Kwaliteitsregime")}</dt><dd>{m.quality_regime ?? "—"}</dd>
      <dt>{t("left.bore.descriptionProcedure", "Beschrijfprocedure")}</dt><dd>{m.description_procedure ?? "—"}</dd>
      <dt>{t("left.bore.method", "Boormethode")}</dt><dd>{m.bore_method ?? "—"}</dd>
      <dt>{t("left.bore.delivery", "Levering")}</dt><dd>{m.delivered_via ?? "—"}</dd>
      <dt>RD x/y</dt>
      <dd>
        {bore.position
          ? `${bore.position.x_rd.toFixed(1)}, ${bore.position.y_rd.toFixed(1)}`
          : "—"}
      </dd>
      <dt>{t("left.meta.groundLevelNap", "Maaiveld NAP")}</dt>
      <dd>
        {typeof bore.position?.z_nap === "number"
          ? `${bore.position.z_nap.toFixed(2)} m`
          : "—"}
      </dd>
      <dt>{t("left.bore.finalDepth", "Eindiepte")}</dt>
      <dd>
        {typeof bore.final_depth === "number"
          ? `${bore.final_depth.toFixed(2)} m`
          : "—"}
      </dd>
      <dt>{t("left.bore.layerCount", "Aantal lagen")}</dt><dd>{bore.layers.length}</dd>
    </dl>
    </>
  );
}

/** Verbatim BHR-veld → waarde map. Bewust ongefilterd zodat zeldzame
 *  velden (boordiameter, peilbuis-info, organische-stofklasse) ook
 *  zichtbaar zijn. */
function BoreExtraList({ bore }: { bore: Bore }) {
  const { t } = useTranslation("panels");
  const extra = bore.metadata.extra ?? {};
  const entries = Object.entries(extra).filter(([key])=>!key.startsWith("ogs:"));
  if (entries.length === 0) {
    return <p className="panel-empty">{t("left.bore.noExtras", "Geen aanvullende metadata.")}</p>;
  }
  return (
    <dl className="metadata-list metadata-list-extra">
      {entries.map(([k, v]) => (
        <Fragment key={k}>
          <dt title={k}>{k}</dt>
          <dd>{v}</dd>
        </Fragment>
      ))}
    </dl>
  );
}

/** Beknopte tabel met de geïnterpreteerde lagen. De volledige strip-log
 *  staat in BoreView; deze tabel is voor snel scannen vanuit de
 *  verkenner. */
function BoreLayersList({ bore }: { bore: Bore }) {
  const { t } = useTranslation("panels");
  if (bore.layers.length === 0) {
    return <p className="panel-empty">{t("left.bore.noLayers", "Geen lagen.")}</p>;
  }
  return (
    <table className="layers-table">
      <thead>
        <tr>
          <th>{t("left.bore.top", "Top")}</th>
          <th>{t("left.bore.base", "Basis")}</th>
          <th>{t("left.bore.soilType", "Grondsoort")}</th>
        </tr>
      </thead>
      <tbody>
        {bore.layers.map((l, i) => (
          <tr key={i}>
            <td>{l.top_depth.toFixed(2)}</td>
            <td>{l.base_depth.toFixed(2)}</td>
            <td title={l.description}>{l.soil_name}{l.soil_code&&<small style={{display:"block",color:"var(--text-muted)"}}>NEN 5104 · {l.soil_code}</small>}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Read-only viewer voor het origineel BHR-XML. Geen syntax-highlight
 *  voor de eenvoud — wel een copy-knop en monospace font zodat de
 *  inspringing leesbaar blijft. */
function BoreRawXml({ xml }: { xml?: string }) {
  const { t } = useTranslation("panels");
  const [copied, setCopied] = useState(false);
  if (!xml) {
    return <p className="panel-empty">{t("left.rawXml.none", "Geen ruwe XML beschikbaar.")}</p>;
  }
  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(xml);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard refused — silent */
    }
  };
  return (
    <div className="bore-raw-wrap">
      <button
        type="button"
        className="bore-raw-copy"
        onClick={() => void onCopy()}
      >
        {copied ? t("left.rawXml.copied", "Gekopieerd") : t("left.rawXml.copy", "Kopieer XML")}
      </button>
      <pre className="bore-raw-pre">{xml}</pre>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────
// Project browser (active doc = ProjectDocument)
// ──────────────────────────────────────────────────────────────

function ProjectBrowser() {
  const [importError, setImportError] = useState<string | null>(null);
  const { t } = useTranslation("cpt");
  const documents = useCptStore((s) => s.documents);
  const activeDocId = useCptStore((s) => s.activeDocId);
  const setActiveCpt = useCptStore((s) => s.setActive);
  const closeCpt = useCptStore((s) => s.closeCpt);
  const hiddenCptIds = useCptStore((s) => s.hiddenCptIds);
  const toggleHidden = useCptStore((s) => s.toggleHidden);

  // Re-fetch the active project doc on each render so we react to its mutations.
  const project = useMemo(() => {
    const d = documents.find((d) => d.id === activeDocId);
    return d?.kind === "project" ? d : null;
  }, [documents, activeDocId]);

  if (!project) return null;

  const cpts = Array.from(project.cpts.values());
  const activeCptId = project.activeCptId;
  const active = activeCptId ? project.cpts.get(activeCptId) : undefined;

  async function addSonderingen() {
    setImportError(null);
    try {
      const selected=await files.pickAndRead(true);
      const errors:string[]=[];
      for(const f of selected) {
        try {
          if(looksLikeBoringXml(f.text)||looksLikeGefBore(f.text))await addBoreToActiveProject(f.text,f.name,f.diagnostics);
          else await addCptToActiveProject(f.text,f.name,undefined,f.diagnostics);
        } catch(err){errors.push(f.name+': '+String(err));}
      }
      if(errors.length)setImportError(errors.join('\n'));
    } catch(err){setImportError(String(err));}
  }

  return (
    <div className="left-panel-body">
      {importError && <p role="alert" className="panel-error">{importError}</p>}
      {/* Project header */}
      <div className="project-header">
        <div className="project-header-icon">
          <FolderIcon />
        </div>
        <div className="project-header-text">
          <div className="project-header-title">{project.meta.title || t("noTitle", "(geen titel)")}</div>
          {project.meta.client && <div className="project-header-sub">{project.meta.client}</div>}
        </div>
      </div>

      <PanelSection
        title={
          <>
            {t("sonderingen")}
            <span className="ps-count">({cpts.length})</span>
          </>
        }
        defaultOpen
        action={
          <button
            type="button"
            className="panel-section-add"
            onClick={(e) => { e.stopPropagation(); void addSonderingen(); }}
            title={t("addCpt", "Sondering toevoegen")}
            aria-label={t("addCpt", "Sondering toevoegen")}
          >
            <OaIcon id="file.import" />
          </button>
        }
      >
        {cpts.length === 0 ? (
          <p className="panel-empty">{t("noCptsHint", "Geen sonderingen — klik + om toe te voegen of sleep bestanden in het venster")}</p>
        ) : (
          <ul className="cpt-list">
            {cpts.map((c) => {
              const isHidden = hiddenCptIds.has(c.id);
              const liClass = [
                c.id === activeCptId ? "active" : "",
                isHidden ? "hidden" : "",
              ].filter(Boolean).join(" ");
              return (
                <li key={c.id} className={liClass}>
                  <button className="cpt-list-name" onClick={() => setActiveCpt(c.id)} title={c.metadata.source_file}>
                    <FileIcon />
                    <span>{c.id}</span>
                  </button>
                  <button
                    type="button"
                    className={`cpt-list-eye${isHidden ? " is-hidden" : ""}`}
                    onClick={(e) => { e.stopPropagation(); toggleHidden(c.id); }}
                    aria-label={isHidden ? t("show", "Tonen") : t("hide", "Verbergen")}
                    title={isHidden ? t("show", "Tonen") : t("hide", "Verbergen")}
                  >
                    <OaIcon id={isHidden ? "object.show" : "object.hide"} />
                  </button>
                  <button className="cpt-list-close" onClick={() => void closeCpt(c.id)} aria-label={t("close")}><OaIcon id="document.close" /></button>
                </li>
              );
            })}
          </ul>
        )}
      </PanelSection>

      {active && (
        <>
          <PanelSection title={t("sonderingsgegevens")} defaultOpen>
            <MetadataList cpt={active} />
            <ValidationPanel cpt={active} />
          </PanelSection>
          <PanelSection title={t("fileMetadata", "Bestandsmetadata")}>
            <ExtraMetadataList cpt={active} />
          </PanelSection>
          <PanelSection title={t("layers")} defaultOpen>
            <LayerPanel cptId={active.id} />
          </PanelSection>
          <PanelSection title={t("measurements")}>
            <MeasurementsTable cpt={active} />
          </PanelSection>
        </>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────
// Standalone CPT (active doc = CptDocument)
// ──────────────────────────────────────────────────────────────

function CptDetails({ cpt }: { cpt: Cpt }) {
  const { t } = useTranslation("cpt");
  const { t: tp } = useTranslation("panels");
  return (
    <div className="left-panel-body">
      <div className="project-header">
        <div className="project-header-icon"><FileIcon /></div>
        <div className="project-header-text">
          <div className="project-header-title">{cpt.id}</div>
          <div className="project-header-sub">{cpt.metadata.source_file}</div>
        </div>
      </div>

      <PanelSection title={t("sonderingsgegevens")} defaultOpen>
        <MetadataList cpt={cpt} />
        <ValidationPanel cpt={cpt} />
      </PanelSection>
      <PanelSection title={t("fileMetadata", "Bestandsmetadata")}>
        <ExtraMetadataList cpt={cpt} />
      </PanelSection>
      <PanelSection title={t("layers")} defaultOpen>
        <LayerPanel cptId={cpt.id} />
      </PanelSection>
      <PanelSection title={t("measurements")}>
        <MeasurementsTable cpt={cpt} />
      </PanelSection>
      <PanelSection title={tp("left.photos.title", "Foto's & inspectie")}>
        <BroPhotos broId={cpt.id} kind="cpt" />
      </PanelSection>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────
// Reusable sub-components
// ──────────────────────────────────────────────────────────────

function PanelSection({
  title, defaultOpen = false, children, action,
}: {
  title: React.ReactNode;
  defaultOpen?: boolean;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="panel-section">
      <div className="panel-section-header-row">
        <button className="panel-section-header" onClick={() => setOpen(!open)}>
          <span className={`panel-section-chevron${open ? " open" : ""}`}><OaIcon id="tree.collapse" /></span>
          <span className="panel-section-title">{title}</span>
        </button>
        {action}
      </div>
      {open && <div className="panel-section-body">{children}</div>}
    </div>
  );
}

function MetadataList({ cpt }: { cpt: Cpt }) {
  const { t } = useTranslation("cpt");
  return (
    <dl className="metadata-list">
      <dt>{t("projectName")}</dt><dd>{cpt.metadata.project_name ?? "—"}</dd>
      <dt>{t("projectNumber")}</dt><dd>{cpt.metadata.project_number ?? "—"}</dd>
      <dt>{t("date")}</dt><dd>{cpt.metadata.date ?? "—"}</dd>
      <dt>{t("equipment")}</dt><dd>{cpt.metadata.equipment ?? "—"}</dd>
      <dt>{t("groundLevel")}</dt><dd>{cpt.metadata.ground_level_nap?.toFixed(2) ?? "—"} m NAP</dd>
      <dt>{t("position")}</dt>
      <dd>{cpt.position ? `${cpt.position.x_rd.toFixed(1)}, ${cpt.position.y_rd.toFixed(1)}` : "—"}</dd>
    </dl>
  );
}

/**
 * Renders every entry of `metadata.extra` (verbatim file metadata) as a
 * dt/dd row. Falls back to an empty-state placeholder when the parser
 * didn't surface any extras (eg. minimal GEF files).
 *
 * Keys are stored ALL-CAPS for GEF (`COMPANYID`) and camelCase for BRO
 * (`coneSurfaceQuotient`) — we render them as-is to keep the mapping
 * traceable; a future iteration can title-case + translate on demand.
 */
function ExtraMetadataList({ cpt }: { cpt: Cpt }) {
  const { t } = useTranslation("cpt");
  const extra = cpt.metadata.extra ?? {};
  const entries = Object.entries(extra).filter(([key])=>!key.startsWith("ogs:"));
  if (entries.length === 0) {
    return <p className="panel-empty">{t("noExtras", "Geen aanvullende metadata.")}</p>;
  }
  return (
    <dl className="metadata-list metadata-list-extra">
      {entries.map(([k, v]) => (
        <Fragment key={k}>
          <dt title={k}>{k}</dt>
          <dd>{v}</dd>
        </Fragment>
      ))}
    </dl>
  );
}

function MeasurementsTable({ cpt }: { cpt: Cpt | null }) {
  const { t } = useTranslation("panels");
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 50;
  if (!cpt) return <p className="panel-empty">—</p>;
  const total = cpt.points.length;
  const start = page * PAGE_SIZE;
  const slice = cpt.points.slice(start, start + PAGE_SIZE);
  const lastPage = Math.max(0, Math.ceil(total / PAGE_SIZE) - 1);
  return (
    <div>
      <table className="measurements-table">
        <thead>
          <tr>
            <th title={t("left.measurements.depthTitle", "Diepte onder maaiveld")}>{t("left.measurements.depth", "diepte")}</th>
            <th title={t("left.measurements.napTitle", "Diepte t.o.v. NAP")}>m NAP</th>
            <th>qc</th><th>fs</th><th>Rf</th>
          </tr>
        </thead>
        <tbody>
          {slice.map((p, i) => (
            <tr key={start + i}>
              <td>{p.depth.toFixed(2)}</td>
              <td>{p.depth_nap != null ? p.depth_nap.toFixed(2) : "—"}</td>
              <td>{p.qc?.toFixed(2) ?? "—"}</td>
              <td>{p.fs?.toFixed(3) ?? "—"}</td>
              <td>{p.rf?.toFixed(2) ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="pagination">
        <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}>‹</button>
        <span>{start + 1}–{Math.min(start + PAGE_SIZE, total)} / {total}</span>
        <button onClick={() => setPage(p => Math.min(lastPage, p + 1))} disabled={page >= lastPage}>›</button>
      </div>
    </div>
  );
}

function FileIcon() {
  return (
    <OaIcon id="file.type-other" />
  );
}

function FolderIcon() {
  return (
    <OaIcon id="file.type-project" />
  );
}


