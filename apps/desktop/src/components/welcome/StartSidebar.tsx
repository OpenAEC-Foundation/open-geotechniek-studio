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
  const { recentFiles } = useRecentFiles();

  return (
    <aside className="start-sidebar">
      <div className="start-sidebar-toolbar">
        <span className="start-sidebar-title">Start</span>
        <button
          className="start-sidebar-close-btn"
          onClick={onClose}
          title="Inklappen"
        >
          <OaIcon id="panel.left" />
        </button>
      </div>

      <div className="start-sidebar-body">
        <div className="start-brand">
          <div className="start-brand-icon">
            <svg viewBox="0 0 1024 1024" width="40" height="40" fill="none">
              <rect x="40" y="40" width="944" height="944" rx="180" fill="var(--theme-accent)" />
              <text
                x="512"
                y="600"
                textAnchor="middle"
                dominantBaseline="middle"
                fill="var(--theme-accent-text, #fff)"
                fontSize="340"
                fontFamily="Space Grotesk, Inter, sans-serif"
                fontWeight="700"
              >
                OA
              </text>
            </svg>
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
              <span>Voorbeeldproject</span>
            </button>
          )}
        </div>

        {recentFiles.length > 0 && (
          <div className="start-recent">
            <h3 className="start-recent-title">Recente bestanden</h3>
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
  return (
    <button
      className="start-sidebar-collapsed-tab"
      onClick={onOpen}
      title="Start openen"
    >
      <span>Start</span>
    </button>
  );
}
