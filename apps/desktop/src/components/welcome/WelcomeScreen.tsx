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
            {/* Approved Snap Store app logo */}
            <img src={`${import.meta.env.BASE_URL}open-geo-studio-icon.svg`} width="56" height="56" alt="" />
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
