import { APP_VERSION } from "../version";
import { useState, useEffect, useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import "./TitleBar.css";
import { OaIcon } from "./icons/oaIcon";

interface TitleBarProps {
  onSettingsClick?: () => void;
  onFeedbackClick?: () => void;
}

function TitleBar({ onSettingsClick, onFeedbackClick }: TitleBarProps) {
  const { t } = useTranslation();
  const [isMaximized, setIsMaximized] = useState(false);
  const [appVersion, setAppVersion] = useState(APP_VERSION);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const appWindowRef = useRef<any>(null);

  const getWindow = useCallback(async () => {
    if (!appWindowRef.current) {
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      appWindowRef.current = getCurrentWindow();
    }
    return appWindowRef.current;
  }, []);

  useEffect(() => {
    import("@tauri-apps/api/app")
      .then(({ getVersion }) => getVersion())
      .then(setAppVersion)
      .catch(() => setAppVersion(APP_VERSION));
  }, []);

  const updateMaximizedState = useCallback(async () => {
    try {
      const win = await getWindow();
      const maximized = await win.isMaximized();
      setIsMaximized(maximized);
    } catch { /* not in Tauri */ }
  }, [getWindow]);

  useEffect(() => {
    updateMaximizedState();

    let cleanup: (() => void) | undefined;
    getWindow()
      .then((win) => win.onResized(() => updateMaximizedState()))
      .then((unlisten) => { cleanup = unlisten; })
      .catch(() => {});

    return () => { cleanup?.(); };
  }, [updateMaximizedState, getWindow]);

  const handleMinimize = async () => (await getWindow()).minimize();
  const handleMaximize = async () => (await getWindow()).toggleMaximize();
  const handleClose = async () => (await getWindow()).close();

  const handleDoubleClick = async (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest(".titlebar-button")) return;
    (await getWindow()).toggleMaximize();
  };

  return (
    <div className="titlebar" onDoubleClick={handleDoubleClick}>
      <div className="titlebar-drag" data-tauri-drag-region />

      <div className="titlebar-left">
        <div className="titlebar-icon">
          {/* Open Geotechniek Studio mark: square CPT chart in OpenAEC house style */}
          <svg width="18" height="18" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
            <rect x="2" y="2" width="60" height="60" fill="#36363E" />
            <line x1="16" y1="14" x2="16" y2="50" stroke="#A1A1AA" strokeWidth="0.6" strokeLinecap="round" />
            <line x1="16" y1="14" x2="48" y2="14" stroke="#FAFAF9" strokeWidth="0.8" strokeLinecap="round" />
            <rect x="46" y="14" width="3" height="9"  fill="#4CAF50" />
            <rect x="46" y="23" width="3" height="8"  fill="#8BC34A" />
            <rect x="46" y="31" width="3" height="11" fill="#F59E0B" />
            <rect x="46" y="42" width="3" height="8"  fill="#EA580C" />
            <polyline
              points="20,15 22,18 26,22 23,26 28,30 25,34 30,38 24,42 31,46 27,50"
              fill="none"
              stroke="#D97706"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <circle cx="27" cy="50" r="1.4" fill="#D97706" />
          </svg>
        </div>

        <div className="titlebar-quick-access">
        <button
          className="titlebar-quick-btn"
          title={`${t("save")} (Ctrl+S)`}
          aria-label={t("save")}
          onClick={() => window.dispatchEvent(new Event("ogs:save-project"))}
          tabIndex={-1}
        >
          <OaIcon id="file.save" />
        </button>
        <button
          className="titlebar-quick-btn"
          title={`${t("undo")} (Ctrl+Z)`}
          aria-label={t("undo")}
          tabIndex={-1}
        >
          <OaIcon id="edit.undo" />
        </button>
        <button
          className="titlebar-quick-btn"
          title={`${t("redo")} (Ctrl+Y)`}
          aria-label={t("redo")}
          tabIndex={-1}
        >
          <OaIcon id="edit.redo" />
        </button>
        <button
          className="titlebar-quick-btn"
          title={`${t("print")} (Ctrl+P)`}
          aria-label={t("print")}
          tabIndex={-1}
        >
          <OaIcon id="file.print" />
        </button>
          <button
            className="titlebar-quick-btn"
            title={t("preferences")}
            aria-label={t("preferences")}
            tabIndex={-1}
            onClick={onSettingsClick}
          >
            <OaIcon id="ui.settings" />
          </button>
        </div>
      </div>

      <span className="titlebar-title" data-tauri-drag-region>
        {t("appName")}
        {appVersion && <span className="titlebar-version">v{appVersion}</span>}
      </span>

      <div className="titlebar-controls">
        <button
          className="send-feedback-btn"
          onClick={onFeedbackClick}
          tabIndex={-1}
        >
          {t("sendFeedback")}
        </button>
        <button
          className="titlebar-button titlebar-minimize"
          onClick={handleMinimize}
          aria-label={t("minimize")}
          tabIndex={-1}
        >
          <OaIcon id="window.minimize" />
        </button>

        <button
          className="titlebar-button titlebar-maximize"
          onClick={handleMaximize}
          aria-label={isMaximized ? t("restore") : t("maximize")}
          tabIndex={-1}
        >
          {isMaximized ? (
            <OaIcon id="window.restore" />
          ) : (
            <OaIcon id="window.maximize" />
          )}
        </button>

        <button
          className="titlebar-button titlebar-close"
          onClick={handleClose}
          aria-label={t("close")}
          tabIndex={-1}
        >
          <OaIcon id="window.close" />
        </button>
      </div>
    </div>
  );
}

export default TitleBar;
