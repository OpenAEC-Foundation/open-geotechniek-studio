import { useCptStore } from "../store/useCptStore";
import "./DocumentBar.css";
import { OaIcon } from "./icons/oaIcon";

interface DocumentBarProps {
  /** Optional handler for the "+" button — wired by App.tsx to open Backstage. */
  onOpenClick?: () => void;
}

export default function DocumentBar({ onOpenClick }: DocumentBarProps) {
  const documents = useCptStore((s) => s.documents);
  const activeDocId = useCptStore((s) => s.activeDocId);
  const setActiveDoc = useCptStore((s) => s.setActiveDoc);
  const closeDoc = useCptStore((s) => s.closeDoc);

  return (
    <div className="document-bar">
      <div className="document-tabs">
        {documents.map((doc) => {
          const active = doc.id === activeDocId;
          return (
            <button
              key={doc.id}
              type="button"
              className={`document-tab${active ? " active" : ""}`}
              onClick={() => setActiveDoc(doc.id)}
              title={doc.path ?? doc.title}
            >
              <span className="document-tab-icon">
                <OaIcon id={doc.kind === "project" ? "file.type-project" : "file.type-other"} />
              </span>
              <span className="document-tab-title">{doc.title}</span>
              <span
                className="document-tab-close"
                role="button"
                tabIndex={-1}
                aria-label="Sluiten"
                onClick={(e) => {
                  e.stopPropagation();
                  void closeDoc(doc.id);
                }}
              >
                <OaIcon id="document.close" />
              </span>
            </button>
          );
        })}
        {onOpenClick && (
          <button
            type="button"
            className="document-tab document-tab-add"
            onClick={onOpenClick}
            title="Openen"
            aria-label="Openen"
          >
            <OaIcon id="file.open" />
          </button>
        )}
      </div>
    </div>
  );
}
