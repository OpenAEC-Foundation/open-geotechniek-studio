import { useTranslation } from "react-i18next";
import { setSetting } from "../../store";
import { useRecentFiles } from "../../hooks/useRecentFiles";
import "./WelcomeScreen.css";
import { OaIcon } from "../icons/oaIcon";

interface WelcomeScreenProps {
  onClose: () => void;
  onNewProject: () => void;
  onOpenProject: () => void;
  onOpenFile?: (path: string) => void;
}

export default function WelcomeScreen({ onClose, onNewProject, onOpenProject, onOpenFile }: WelcomeScreenProps) {
  const { t } = useTranslation("common");
  const { recentFiles } = useRecentFiles();

  const handleNewProject = () => {
    onNewProject();
    onClose();
  };

  const handleOpenProject = () => {
    onOpenProject();
    onClose();
  };

  const handleSkip = async () => {
    onClose();
  };

  const handleToggleStartup = async (show: boolean) => {
    await setSetting("showWelcome", show);
  };

  return (
    <div className="welcome-overlay">
      <div className="welcome-dialog">
        <div className="welcome-header">
          <div className="welcome-logo">
            {/* Open GEO Studio mark: square CPT chart in OpenAEC house style */}
            <svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
              <rect x="0" y="0" width="64" height="64" fill="#36363E" />
              <rect x="1.7" y="1.7" width="60.6" height="60.6" fill="none" stroke="#27272A" strokeWidth="0.8" />
              <line x1="16" y1="14" x2="16" y2="50" stroke="#A1A1AA" strokeWidth="0.6" strokeLinecap="round" />
              <g stroke="#A1A1AA" strokeWidth="0.5">
                <line x1="14.5" y1="20" x2="16" y2="20" />
                <line x1="14.5" y1="26" x2="16" y2="26" />
                <line x1="14.5" y1="32" x2="16" y2="32" />
                <line x1="14.5" y1="38" x2="16" y2="38" />
                <line x1="14.5" y1="44" x2="16" y2="44" />
              </g>
              <line x1="16" y1="14" x2="48" y2="14" stroke="#FAFAF9" strokeWidth="0.8" strokeLinecap="round" />
              <rect x="46" y="14" width="3" height="9"  fill="#4CAF50" />
              <rect x="46" y="23" width="3" height="8"  fill="#8BC34A" />
              <rect x="46" y="31" width="3" height="11" fill="#F59E0B" />
              <rect x="46" y="42" width="3" height="8"  fill="#EA580C" />
              <polyline points="20,15 22,18 26,22 23,26 28,30 25,34 30,38 24,42 31,46 27,50"
                        fill="none" stroke="#D97706" strokeWidth="2.2"
                        strokeLinecap="round" strokeLinejoin="round" />
              <circle cx="27" cy="50" r="1.4" fill="#D97706" />
            </svg>
          </div>
          <div className="welcome-title-area">
            <h1 className="welcome-title">{t("appName")}</h1>
            <p className="welcome-subtitle">{t("welcome.subtitle")}</p>
          </div>
        </div>

        <div className="welcome-body">
          <div className="welcome-actions">
            <h2>{t("welcome.getStarted")}</h2>
            <button className="welcome-action-btn primary" onClick={handleNewProject}>
              <OaIcon id="file.new" size={24} />
              <div>
                <strong>{t("welcome.newProject")}</strong>
                <span>{t("welcome.newProjectDesc")}</span>
              </div>
            </button>
            <button className="welcome-action-btn" onClick={handleOpenProject}>
              <OaIcon id="file.open" size={24} />
              <div>
                <strong>{t("welcome.openProject")}</strong>
                <span>{t("welcome.openProjectDesc")}</span>
              </div>
            </button>
          </div>

          <div className="welcome-recent">
            <h2>{t("welcome.recent")}</h2>
            {recentFiles.length === 0 ? (
              <p className="welcome-empty">{t("welcome.noRecent")}</p>
            ) : (
              <div className="welcome-recent-list">
                {recentFiles.map((f, i) => (
                  <button key={i} className="welcome-recent-item" onClick={() => { onOpenFile?.(f.path); onClose(); }}>
                    <OaIcon id="file.type-other" />
                    <div className="welcome-recent-info">
                      <span className="welcome-recent-name">{f.name}</span>
                      <span className="welcome-recent-path">{f.path}</span>
                    </div>
                    <span className="welcome-recent-date">
                      {new Date(f.timestamp).toLocaleDateString()}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="welcome-footer">
          <label className="welcome-checkbox">
            <input
              type="checkbox"
              defaultChecked={true}
              onChange={(e) => handleToggleStartup(e.target.checked)}
            />
            {t("welcome.showOnStartup")}
          </label>
          <button className="welcome-skip-btn" onClick={handleSkip}>
            {t("welcome.skip")}
          </button>
        </div>
      </div>
    </div>
  );
}
