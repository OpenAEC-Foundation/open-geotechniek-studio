import { useTranslation } from "react-i18next";
import { useRecentFiles } from "../../hooks/useRecentFiles";
import { ReleaseNotesPanel } from "./ReleaseNotesPanel";
import "./StartSidebar.css";
import { OaIcon } from "../icons/oaIcon";

interface StartSidebarProps {
  onNewFile: () => void;
  onOpenFile: () => void;
  onLoadExample?: () => void;
  onOpenRecentFile?: (path: string) => void;
  onClose: () => void;
}

export function StartSidebar({
  onNewFile,
  onOpenFile,
  onLoadExample,
  onOpenRecentFile,
  onClose,
}: StartSidebarProps) {
  const { t } = useTranslation();
  const { t: ta } = useTranslation("app");
  const { recentFiles } = useRecentFiles();

  return (
    <aside className="start-sidebar">
      <div className="start-sidebar-toolbar">
        <span className="start-sidebar-title">{ta("startSidebar.title", "Start")}</span>
        <button
          className="start-sidebar-close-btn"
          onClick={onClose}
          title={ta("startSidebar.collapse", "Inklappen")}
        >
          <OaIcon id="panel.left" />
        </button>
      </div>

      <div className="start-sidebar-body">
        <div className="start-brand">
          <div className="start-brand-icon">
            <img src={`${import.meta.env.BASE_URL}open-geo-studio-icon.svg`} width="40" height="40" alt="" />
          </div>
          <div className="start-brand-text">
            <h2>{t("appName", "OpenAEC")}</h2>
            <p>{t("welcome.subtitle", "Build free. Build together.")}</p>
          </div>
        </div>

        <div className="start-actions">
          <button className="start-action-btn" onClick={onNewFile}>
            <OaIcon id="file.new" />
            <span>{t("welcome.newProject", "Nieuw bestand")}</span>
          </button>
          <button className="start-action-btn" onClick={onOpenFile}>
            <OaIcon id="file.open" />
            <span>{t("open", "Openen")}</span>
          </button>
          {onLoadExample && (
            <button className="start-action-btn" onClick={onLoadExample}>
              <OaIcon id="file.examples" />
              <span>{ta("startSidebar.exampleProject", "Voorbeeldproject")}</span>
            </button>
          )}
        </div>

        {recentFiles.length > 0 && (
          <div className="start-recent">
            <h3 className="start-recent-title">{t("welcome.recent", "Recente bestanden")}</h3>
            <div className="start-recent-list">
              {recentFiles.map((file) => {
                const name = file.name.replace(/\.(ifcx?|json|oaec|oaecproj)$/i, "");
                return (
                  <button
                    key={file.path}
                    className="start-recent-item"
                    onClick={() => onOpenRecentFile?.(file.path)}
                    title={file.path}
                  >
                    <OaIcon id="file.type-other" />
                    <span>{name}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div className="start-releases">
          <ReleaseNotesPanel />
        </div>
      </div>
    </aside>
  );
}

/** Vertical collapsed tab — shown when the sidebar is closed. */
export function StartSidebarCollapsedTab({ onOpen }: { onOpen: () => void }) {
  const { t } = useTranslation("app");
  return (
    <button
      className="start-sidebar-collapsed-tab"
      onClick={onOpen}
      title={t("startSidebar.expand", "Start openen")}
    >
      <span>{t("startSidebar.title", "Start")}</span>
    </button>
  );
}
