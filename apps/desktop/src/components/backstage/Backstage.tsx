import { exportGef } from "../../types/gefWriter";
import { APP_VERSION } from "../../version";
import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { invoke } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";
import { useRecentFiles, type RecentFile } from "../../hooks/useRecentFiles";
import {
  useCptStore,
  newProjectDocument,
  openPathByExtension,
  openContentByFilename,
  markProjectSaved,
} from "../../store/useCptStore";
import { IS_TAURI, files as filesPlatform } from "../../utils/platform";
import { downloadBlobAsFile, saveJsonAsFile } from "../../utils/browserSave";
import { activeProjectPayload, projectNameFromFilename } from "../../store/projectSerialization";
import ExtensionManagerPanel from "./ExtensionManagerPanel";
import "./Backstage.css";
import { OaIcon, oaIcon } from "../icons/oaIcon";

const ICONS = {
  new: oaIcon('file.new'),
  open: oaIcon('file.open'),
  save: oaIcon('file.save'),
  saveAs: oaIcon('file.save-as'),
  print: oaIcon('file.print'),
  export: oaIcon('file.export-options'),
  import: oaIcon('file.import'),
  preferences: oaIcon('ui.settings'),
  about: oaIcon('ui.about'),
  exit: oaIcon('window.close'),
  extensions: oaIcon('extensions.manage'),
};

function MenuItem({
  icon,
  label,
  shortcut,
  active,
  onClick,
}: {
  icon: string;
  label: string;
  shortcut?: string;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className={`backstage-item${active ? " active" : ""}`}
      onClick={onClick}
    >
      <span
        className="backstage-item-icon"
        dangerouslySetInnerHTML={{ __html: icon }}
      />
      <span className="backstage-item-label">{label}</span>
      {shortcut && (
        <span className="backstage-item-shortcut">{shortcut}</span>
      )}
    </button>
  );
}

function Divider() {
  return <div className="backstage-divider" />;
}

interface BackstageProps {
  open: boolean;
  onClose: () => void;
  onOpenSettings: () => void;
  onOpenFile?: (path: string) => void;
}

export default function Backstage({ open, onClose, onOpenSettings, onOpenFile }: BackstageProps) {
  const { t } = useTranslation("backstage");
  const [activePanel, setActivePanel] = useState<string>("none");
  const { recentFiles, removeRecentFile, clearRecentFiles } = useRecentFiles();
  const documents = useCptStore((s) => s.documents);
  const activeDocId = useCptStore((s) => s.activeDocId);
  const activeDoc = useMemo(
    () => documents.find((d) => d.id === activeDocId),
    [documents, activeDocId],
  );
  const saving = useRef(false);

  const actionAndClose = useCallback(
    (fn?: () => void) => {
      onClose();
      fn?.();
    },
    [onClose]
  );

  // ── .ifcgis project file actions ────────────────────────────
  // Save only makes sense when the active doc is a project.
  // We bouwen een volledig ifcgis-0.2 payload (header + project + cpts
  // + bores + crs + tekening + title_block) en geven dat aan de
  // Rust-command `save_project_ifcgis_full`. Daar wordt het tegen het
  // schema gevalideerd vóór schrijven, zodat een corrupt project niet
  // op schijf belandt.
  const saveProject = useCallback(async () => {
    if (saving.current) return;
    if (!activeDoc || activeDoc.kind !== "project") {
      alert("Geen project actief — open of maak een .ifcgeo project.");
      return;
    }
    saving.current = true;
    try {
      const payload = activeProjectPayload(activeDoc.id);
      const defaultName = `${activeDoc.meta.title || "project"}.ifcgeo`;
      const contentForName = (filename: string) => ({
        ...payload,
        project: { ...payload.project, title: projectNameFromFilename(filename) },
      });
      const tauriDst = IS_TAURI
      ? await save({
          defaultPath: defaultName,
          // `.ifcgeo` is sinds 2026 de officiële extensie voor zowel
          // single-CPT-snapshots als hele projecten. De CONTENT is 100%
          // IFCX-shaped (IFC5 alpha JSON); de loader sniffed het schema
          // om project vs single te onderscheiden. `.ifcgis` en `.ifcx`
          // blijven leesbaar in de open-dialog (legacy bestanden).
          filters: [
            { name: "Open Geotechniek Studio bestand", extensions: ["ifcgeo", "ifcgis", "ifcx"] },
          ],
        })
      : null;
      if (IS_TAURI && !tauriDst) return;
      let savedName: string | null;
      if (IS_TAURI && tauriDst) {
        await invoke("save_project_ifcgis_full", {
          payload: contentForName(tauriDst),
          path: tauriDst,
        });
        savedName = tauriDst;
      } else {
        // Browser-fallback: download het project als JSON via showSaveFilePicker
        // (Chrome/Edge) of <a download> (overige browsers). Geen Rust-zijde
        // validatie — de gebruiker krijgt de raw payload.
        savedName = await saveJsonAsFile(contentForName, defaultName);
      }
      if (!savedName) return;
      markProjectSaved(activeDoc.id, projectNameFromFilename(savedName), tauriDst ?? undefined, activeDoc.meta.title);
      onClose();
    } catch (err) {
      console.error("save_project_ifcgis_full failed", err);
      alert(`Opslaan mislukt: ${err}`);
    } finally {
      saving.current = false;
    }
  }, [activeDoc, onClose]);

  useEffect(() => {
    const onSave = () => { void saveProject(); };
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s" && activeDoc?.kind === "project") {
        event.preventDefault();
        onSave();
      }
    };
    window.addEventListener("ogs:save-project", onSave);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("ogs:save-project", onSave);
      window.removeEventListener("keydown", onKey);
    };
  }, [saveProject, activeDoc?.kind]);

  /// Save-as for a CPT document — offers GEF / BRO-XML / IfcGeo format
  /// conversion. Project documents fall through to `saveProject`.
  const [showCptSaveAsMenu, setShowCptSaveAsMenu] = useState(false);
  const saveCptAs = useCallback(
    async (format: "gef" | "bro" | "ifcgeo") => {
      if (!activeDoc || activeDoc.kind !== "cpt") return;
      const ext = format === "bro" ? "xml" : format;
      const filterName =
        format === "gef"
          ? "GEF (.gef)"
          : format === "bro"
          ? "BRO XML (.xml)"
          : "Geotechniek-object (.ifcgeo)";
      const baseName = activeDoc.cpt.id || "sondering";
      if(format === "ifcgeo") {
        try {
          if(IS_TAURI){
            const path=await save({defaultPath:`${baseName}.ifcgeo`,filters:[{name:'Sondering met brongegevens',extensions:['ifcgeo']}]});
            if(!path)return;
            const {writeTextFile}=await import('@tauri-apps/plugin-fs');await writeTextFile(path,JSON.stringify(activeDoc.cpt,null,2));
          }else downloadBlobAsFile(new Blob([JSON.stringify(activeDoc.cpt,null,2)],{type:'application/json'}),`${baseName}.ifcgeo`);
          setShowCptSaveAsMenu(false);onClose();
        }catch(error){alert(`Snapshot opslaan mislukt: ${String(error)}`);}
        return;
      }
      if(format === "gef") {
        try {
          const result=exportGef(activeDoc.cpt);
          if(result.warnings.length)alert(result.warnings.join("\n"));
          if(IS_TAURI){
            const path=await save({defaultPath:`${baseName}.gef`,filters:[{name:'GEF-CPT 1.1.2',extensions:['gef']}]});
            if(!path)return;
            const {writeTextFile}=await import('@tauri-apps/plugin-fs');await writeTextFile(path,result.text);
          }else downloadBlobAsFile(new Blob([result.text],{type:'text/plain;charset=utf-8'}),`${baseName}.gef`);
          setShowCptSaveAsMenu(false);onClose();
        }catch(error){alert(`GEF-export gestopt: ${String(error)}`);}
        return;
      }

      if (!IS_TAURI) {
        alert("Een nieuwe BRO-levering genereren is alleen beschikbaar via de legacy desktop-export. Gebruik GEF of een JSON-snapshot voor een bronvaste export.");
        return;
      }
      const dst = await save({
        defaultPath: `${baseName}.${ext}`,
        filters: [{ name: filterName, extensions: [ext] }],
      });
      if (!dst) return;
      try {
        await invoke("save_cpt_as", {
          cptId: activeDoc.cpt.id,
          format,
          path: dst,
        });
        setShowCptSaveAsMenu(false);
        onClose();
      } catch (err) {
        console.error("save_cpt_as failed", err);
        alert(`Opslaan mislukt: ${err}`);
      }
    },
    [activeDoc, onClose],
  );

  /// Routes the Save-As button by document kind. CPT docs surface the
  /// format-picker submenu; project docs save .ifcgis directly.
  const onSaveAs = useCallback(() => {
    if (activeDoc?.kind === "cpt") {
      setShowCptSaveAsMenu((v) => !v);
      return;
    }
    void saveProject();
  }, [activeDoc, saveProject]);

  // Single "open anything" entry. Combined filter — the file's extension
  // determines whether we create a CptDocument or a ProjectDocument tab.
  //
  // In Tauri-modus gebruiken we de plugin-dialog (geeft een pad terug)
  // en lezen we via plugin-fs. In browser-modus (npm run dev open in
  // browser i.p.v. Tauri-window) valt-ie terug op een HTML
  // `<input type="file">` zodat de webversie óók bestanden kan openen.
  const openAny = useCallback(async () => {
    // One platform-call handles both desktop (native OS-dialog +
    // plugin-fs) and web (HTML file picker). Returned shape is
    // identical — path is only set in Tauri-modus.
    const picked = await filesPlatform.pickAndRead(true);
    if (picked.length === 0) return;
    let openedAny = false;
    for (const f of picked) {
      try {
        if (f.path) {
          // Desktop: use path-routed loader so de Rust-side weet
          // welk bestand op disk staat (handig voor save-back).
          const handled = await openPathByExtension(f.path);
          if (handled) openedAny = true;
        } else {
          // Web: alleen content beschikbaar, geen pad.
          const handled = await openContentByFilename(f.text, f.name, undefined, f.diagnostics);
          if (handled) openedAny = true;
        }
      } catch (err) {
        console.error("open failed for", f.name, err);
        if (!IS_TAURI) {
          const msg = err instanceof Error ? err.message : String(err);
          alert(
            `Kon ${f.name} niet openen in browser-modus:\n${msg}\n\n` +
            "Tip: BHR-GT XML + GMW XML + GEF + BRO CPT-XML werken wél in de browser. " +
            "Voor .ifcgeo/.ifcgis projectbestanden heb je de desktop-versie nodig.",
          );
        } else {
          alert(`Kon ${f.name} niet openen: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    }
    if (openedAny) onClose();
  }, [onClose]);

  const newProject = useCallback(() => {
    newProjectDocument();
    onClose();
  }, [onClose]);

  useEffect(() => {
    if (!open) {
      setActivePanel("none");
      return;
    }
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const hasActivePanel =
    activePanel === "open" ||
    activePanel === "about" ||
    activePanel === "import" ||
    activePanel === "export" ||
    activePanel === "extensions";

  return (
    <div className="backstage-overlay">
      <div className="backstage-sidebar">
        <button className="backstage-back" onClick={onClose}>
          <OaIcon id="nav.back" />
          <span>{t("file")}</span>
        </button>
        <div className="backstage-items">
          <MenuItem
            icon={ICONS.new}
            label={t("new")}
            shortcut="Ctrl+N"
            onClick={newProject}
          />
          <MenuItem
            icon={ICONS.open}
            label={t("open")}
            shortcut="Ctrl+O"
            onClick={() => void openAny()}
          />
          {/* Recent-files quick list — sits directly under the Open
              menu item so the user can jump straight to a previous
              file without the intermediate Open panel. */}
          {recentFiles.length > 0 && (
            <div className="backstage-recent-list">
              <div className="backstage-recent-header">
                <span>{t("openPanel.title", "Recent")}</span>
                <button
                  type="button"
                  className="backstage-recent-clear"
                  onClick={clearRecentFiles}
                  title={t("openPanel.clearAll", "Clear all")}
                >
                  ✕
                </button>
              </div>
              <ul className="backstage-recent-items">
                {recentFiles.slice(0, 8).map((f) => (
                  <li key={f.path}>
                    <button
                      type="button"
                      className="backstage-recent-item"
                      onClick={() => {
                        onClose();
                        onOpenFile?.(f.path);
                      }}
                      title={f.path}
                    >
                      <span className="backstage-recent-name">{f.name}</span>
                      <span className="backstage-recent-path">{f.path}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <MenuItem
            icon={ICONS.save}
            label={t("save")}
            shortcut="Ctrl+S"
            onClick={() => void saveProject()}
          />
          <MenuItem
            icon={ICONS.saveAs}
            label={t("saveAs")}
            shortcut="Ctrl+Shift+S"
            onClick={onSaveAs}
          />
          {showCptSaveAsMenu && activeDoc?.kind === "cpt" && (
            <div className="backstage-submenu">
              <button
                className="backstage-subitem"
                onClick={() => void saveCptAs("gef")}
              >
                GEF (.gef)
              </button>
              <button
                className="backstage-subitem"
                onClick={() => void saveCptAs("bro")}
              >
                BRO XML (.xml)
              </button>
              <button
                className="backstage-subitem"
                onClick={() => void saveCptAs("ifcgeo")}
              >
                Geotechniek-object (.ifcgeo)
              </button>
            </div>
          )}
          <MenuItem
            icon={ICONS.print}
            label={t("print")}
            shortcut="Ctrl+P"
            onClick={() => actionAndClose()}
          />
          <Divider />
          <MenuItem
            icon={ICONS.import}
            label={t("import")}
            active={activePanel === "import"}
            onClick={() => setActivePanel("import")}
          />
          <MenuItem
            icon={ICONS.export}
            label={t("export")}
            active={activePanel === "export"}
            onClick={() => setActivePanel("export")}
          />
          <MenuItem
            icon={ICONS.extensions}
            label={t("extensions")}
            active={activePanel === "extensions"}
            onClick={() => setActivePanel("extensions")}
          />
          <Divider />
          <MenuItem
            icon={ICONS.preferences}
            label={t("preferences")}
            shortcut="Ctrl+,"
            onClick={() => actionAndClose(onOpenSettings)}
          />
          <Divider />
          <MenuItem
            icon={ICONS.about}
            label={t("about")}
            active={activePanel === "about"}
            onClick={() => setActivePanel("about")}
          />
          <Divider />
          <MenuItem
            icon={ICONS.exit}
            label={t("exit")}
            shortcut="Alt+F4"
            onClick={() => {
              onClose();
              import("@tauri-apps/api/window").then(({ getCurrentWindow }) =>
                getCurrentWindow().close()
              );
            }}
          />
        </div>
      </div>
      {hasActivePanel && (
        <div className="backstage-content">
          {activePanel === "open" && (
            <OpenPanel
              recentFiles={recentFiles}
              onOpenFile={(path) => { onClose(); onOpenFile?.(path); }}
              onRemoveFile={removeRecentFile}
              onClearAll={clearRecentFiles}
              onOpenAny={openAny}
            />
          )}
          {activePanel === "about" && <AboutPanel />}
          {activePanel === "import" && <ImportPanel />}
          {activePanel === "export" && <ExportPanel />}
          {activePanel === "extensions" && <ExtensionManagerPanel />}
        </div>
      )}
      {/* Click anywhere outside the menu/panel to close */}
      <div className="backstage-dismiss-area" onClick={onClose} />
    </div>
  );
}

function AboutPanel() {
  const { t } = useTranslation("backstage");

  const openExternal = (url: string) => async (e: React.MouseEvent) => {
    e.preventDefault();
    try {
      const { openUrl } = await import("@tauri-apps/plugin-opener");
      await openUrl(url);
    } catch {
      window.open(url, "_blank", "noopener,noreferrer");
    }
  };

  return (
    <div className="bs-about-panel">
      <h2 className="bs-about-title">{t("aboutPanel.title")}</h2>
      <div className="bs-about-app">
        <div className="bs-about-logo">
          <svg
            viewBox="0 0 1024 1024"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <rect x="40" y="40" width="944" height="944" rx="180" fill="var(--theme-accent)" />
            <text
              x="512"
              y="600"
              textAnchor="middle"
              dominantBaseline="middle"
              fill="var(--theme-accent-text)"
              fontSize="320"
              fontFamily="'Space Grotesk', 'Inter', Arial, sans-serif"
              fontWeight="700"
            >
              OA
            </text>
          </svg>
        </div>
        <div className="bs-about-app-info">
          <h1 className="bs-about-app-name">{t("aboutPanel.appName")}</h1>
          <p className="bs-about-version">{t("aboutPanel.version")} {APP_VERSION}</p>
        </div>
      </div>
      <p className="bs-about-tagline">{t("aboutPanel.tagline")}</p>
      <p className="bs-about-description">{t("aboutPanel.description")}</p>
      <div className="bs-about-company">
        <h3 className="bs-about-company-name">{t("aboutPanel.companyName")}</h3>
        <p className="bs-about-company-desc">{t("aboutPanel.companyDescription")}</p>
        <p className="bs-about-company-meta">
          {t("aboutPanel.stichting")}
        </p>
      </div>
      <div className="bs-about-links">
        <a
          href="https://www.open-aec.com/"
          className="bs-about-link"
          onClick={openExternal("https://www.open-aec.com/")}
        >
          <OaIcon id="link.open-external" />
          {t("aboutPanel.website")}
        </a>
        <a
          href="https://github.com/OpenAEC-Foundation"
          className="bs-about-link"
          onClick={openExternal("https://github.com/OpenAEC-Foundation")}
        >
          <OaIcon id="link.open-external" />
          {t("aboutPanel.github")}
        </a>
      </div>
      <div className="bs-about-footer">
        <p className="bs-about-copyright">
          {t("aboutPanel.copyright")}
        </p>
      </div>
    </div>
  );
}

function ImportPanel() {
  const { t } = useTranslation("backstage");
  return (
    <div className="bs-export-panel">
      <h2 className="bs-export-title">{t("importPanel.title")}</h2>
      <div className="bs-export-cards">
        <div className="bs-export-card">
          <div className="bs-export-card-icon">
            <OaIcon id="file.import" size={24} />
          </div>
          <div className="bs-export-card-info">
            <h3>{t("importPanel.fromFile")}</h3>
            <p>{t("importPanel.fromFileDesc")}</p>
          </div>
        </div>
        <div className="bs-export-card">
          <div className="bs-export-card-icon">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
          </div>
          <div className="bs-export-card-info">
            <h3>{t("importPanel.fromTemplate")}</h3>
            <p>{t("importPanel.fromTemplateDesc")}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function OpenPanel({
  recentFiles,
  onOpenFile,
  onRemoveFile,
  onClearAll,
  onOpenAny,
}: {
  recentFiles: RecentFile[];
  onOpenFile: (path: string) => void;
  onRemoveFile: (path: string) => void;
  onClearAll: () => void;
  onOpenAny: () => void | Promise<void>;
}) {
  const { t } = useTranslation("backstage");

  const typeIcon = (type: RecentFile["type"]) => {
    // Een projectbestand heeft een eigen typeaanduiding; de rest is een generiek bestand.
    return oaIcon(type === "project" ? "file.type-project" : "file.type-other", 16);
  };

  const formatDate = (ts: number) => {
    const d = new Date(ts);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return t("openPanel.justNow", "Just now");
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h ago`;
    const diffDay = Math.floor(diffHr / 24);
    if (diffDay < 7) return `${diffDay}d ago`;
    return d.toLocaleDateString();
  };

  return (
    <div className="bs-export-panel">
      <h2 className="bs-export-title" style={{ marginTop: 0, marginBottom: 16 }}>
        {t("openPanel.openTitle", "Openen")}
      </h2>

      <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 12, marginBottom: 28 }}>
        <button className="bs-open-card" onClick={() => void onOpenAny()}>
          <div className="bs-open-card-icon">
            <OaIcon id="file.open" size={24} />
          </div>
          <div className="bs-open-card-text">
            <strong>{t("openPanel.openTitle", "Openen")}</strong>
            <span>{t("openPanel.openAnyHint", "Sondering (GEF / BRO-XML) of project/sondering (.ifcgeo) — elk bestand opent in een eigen tab")}</span>
          </div>
        </button>
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <h3 className="bs-export-title" style={{ margin: 0, fontSize: "1rem" }}>{t("openPanel.title", "Recent Files")}</h3>
        {recentFiles.length > 0 && (
          <button
            onClick={onClearAll}
            style={{
              background: "none",
              border: "none",
              color: "var(--theme-text-muted, #888)",
              cursor: "pointer",
              fontSize: "0.8rem",
              textDecoration: "underline",
            }}
          >
            {t("openPanel.clearAll", "Clear all")}
          </button>
        )}
      </div>
      {recentFiles.length === 0 ? (
        <p style={{ color: "var(--theme-text-muted, #888)", fontStyle: "italic" }}>
          {t("openPanel.noRecent", "No recent files")}
        </p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {recentFiles.map((file) => (
            <div
              key={file.path}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "8px 12px",
                borderRadius: 6,
                cursor: "pointer",
                transition: "background 0.15s",
              }}
              className="bs-recent-item"
              onClick={() => onOpenFile(file.path)}
              onMouseEnter={(e) => (e.currentTarget.style.background = "var(--theme-hover, rgba(0,0,0,0.05))")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >
              <span dangerouslySetInnerHTML={{ __html: typeIcon(file.type) }} style={{ display: "flex", color: "var(--theme-text-secondary)", flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 500, fontSize: "0.9rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {file.name}
                </div>
                <div style={{ fontSize: "0.75rem", color: "var(--theme-text-muted, #888)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {file.path}
                </div>
              </div>
              <span style={{ fontSize: "0.75rem", color: "var(--theme-text-muted, #888)", flexShrink: 0 }}>
                {formatDate(file.timestamp)}
              </span>
              <button
                onClick={(e) => { e.stopPropagation(); onRemoveFile(file.path); }}
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  padding: 4,
                  opacity: 0.4,
                  color: "currentColor",
                  flexShrink: 0,
                }}
                title={t("openPanel.remove", "Remove")}
              >
                <OaIcon id="project.forget-recent" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ExportPanel() {
  const { t } = useTranslation("backstage");
  const activeId = useCptStore((s) => s.activeCptId);
  const cptsMap = useCptStore((s) => s.cpts);
  const cptIds = useMemo(() => Array.from(cptsMap.keys()), [cptsMap]);
  const hasActive = activeId != null;
  const hasAny = cptIds.length > 0;

  async function exportCsv() {
    if (!activeId) return;
    const dst = await save({
      defaultPath: `${activeId}.csv`,
      filters: [{ name: "CSV", extensions: ["csv"] }],
    });
    if (!dst) return;
    try {
      await invoke("export_csv", { cptId: activeId, path: dst });
    } catch (e) {
      console.error("export_csv failed", e);
    }
  }

  async function exportGeoJson() {
    if (cptIds.length === 0) return;
    const dst = await save({
      defaultPath: "cpt-locations.geojson",
      filters: [{ name: "GeoJSON", extensions: ["geojson", "json"] }],
    });
    if (!dst) return;
    try {
      await invoke("export_geojson", { cptIds, path: dst });
    } catch (e) {
      console.error("export_geojson failed", e);
    }
  }

  return (
    <div className="bs-export-panel">
      <h2 className="bs-export-title">{t("exportPanel.title")}</h2>
      <div className="bs-export-cards">
        <button
          type="button"
          className="bs-export-card"
          onClick={() => void exportCsv()}
          disabled={!hasActive}
          style={{
            cursor: hasActive ? "pointer" : "not-allowed",
            opacity: hasActive ? 1 : 0.5,
            textAlign: "left",
            font: "inherit",
            color: "inherit",
            width: "100%",
          }}
        >
          <div className="bs-export-card-icon">
            <OaIcon id="file.export" size={24} />
          </div>
          <div className="bs-export-card-info">
            <h3>{t("exportPanel.asCsv")}</h3>
            <p>{t("exportPanel.asCsvDesc")}</p>
          </div>
        </button>
        <button
          type="button"
          className="bs-export-card"
          onClick={() => void exportGeoJson()}
          disabled={!hasAny}
          style={{
            cursor: hasAny ? "pointer" : "not-allowed",
            opacity: hasAny ? 1 : 0.5,
            textAlign: "left",
            font: "inherit",
            color: "inherit",
            width: "100%",
          }}
        >
          <div className="bs-export-card-icon">
            <OaIcon id="file.export" size={24} />
          </div>
          <div className="bs-export-card-info">
            <h3>{t("exportPanel.asGeoJson")}</h3>
            <p>{t("exportPanel.asGeoJsonDesc")}</p>
          </div>
        </button>
      </div>
    </div>
  );
}
