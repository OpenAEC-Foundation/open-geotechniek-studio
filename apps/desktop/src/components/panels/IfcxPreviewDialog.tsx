import { useEffect, useMemo, useState } from "react";
import Modal from "../Modal";
import { useCptStore, serializeActiveProject } from "../../store/useCptStore";
import "./IfcxPreviewDialog.css";

/** Preview of the same project snapshot used by local and connected storage. */

export interface IfcxPreviewDialogProps {
  open: boolean;
  onClose: () => void;
}

export default function IfcxPreviewDialog({ open, onClose }: IfcxPreviewDialogProps) {
  const documents = useCptStore((s) => s.documents);
  const activeDocId = useCptStore((s) => s.activeDocId);
  const activeDoc = useMemo(
    () => documents.find((d) => d.id === activeDocId),
    [documents, activeDocId],
  );

  const [ifcxText, setIfcxText] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setIfcxText("");
    setCopied(false);
    setLoading(false);
    setError(null);
    if (!open) return;
    if (!activeDoc || activeDoc.kind !== "project") {
      setError("Open of maak een project om de projectinhoud te bekijken.");
      return;
    }
    setLoading(true);
    void (async () => {
      try {
        const text = await serializeActiveProject();
        if (!cancelled) setIfcxText(text);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open, activeDoc]);

  const onCopy = async () => {
    if (!ifcxText) return;
    try {
      await navigator.clipboard.writeText(ifcxText);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch (err) {
      console.error("clipboard write failed", err);
    }
  };

  if (!open) return null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Projectpreview — inhoud van het .ifcgeo-bestand"
      width={900}
      height="78vh"
      className="ifcx-preview-modal"
      footer={
        <div className="ifcx-preview-footer">
          <span className="ifcx-preview-info">
            {ifcxText
              ? `${new TextEncoder().encode(ifcxText).length.toLocaleString("nl-NL")} bytes JSON`
              : ""}
          </span>
          <button
            type="button"
            className="ifcx-preview-btn-secondary"
            onClick={onClose}
          >
            Sluiten
          </button>
          <button
            type="button"
            className="ifcx-preview-btn-primary"
            onClick={() => void onCopy()}
            disabled={!ifcxText}
          >
            {copied ? "Gekopieerd" : "Kopieer JSON"}
          </button>
        </div>
      }
    >
      <p className="ifcx-preview-hint">
        Deze JSON bevat dezelfde projectgegevens als het opgeslagen <code>.ifcgeo</code>-bestand,
        inclusief sonderingen, boringen, tekeningen en berekeningen.
        De preview is geen validatie tegen het officiële IFC-schema.
      </p>
      {loading && (
        <div className="ifcx-preview-status">Projectinhoud laden…</div>
      )}
      {error && (
        <div className="ifcx-preview-error">
          <strong>Kon geen preview maken:</strong>
          <pre>{error}</pre>

        </div>
      )}
      {ifcxText && !error && (
        <pre className="ifcx-preview-content">{ifcxText}</pre>
      )}
    </Modal>
  );
}
