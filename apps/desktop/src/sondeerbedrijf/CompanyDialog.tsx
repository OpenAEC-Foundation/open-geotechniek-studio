// Bedrijfsgegevens voor het sondeerrapport: naam, logo, kleur en contactgegevens in één scherm.
import { useEffect, useState } from "react";
import Modal from "../components/Modal";
import { logoToImage, readFileAsDataUrl } from "../report/brandAssets";
import type { Rgb } from "../report/reportBrand";
import { EMPTY_PROFILE, contactLine, loadProfile, profileProblems, saveProfile, type CompanyProfile } from "./profile";
import "./sondeerbedrijf.css";

const toHex = (c: Rgb) => `#${c.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
const fromHex = (h: string): Rgb => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) as Rgb;

/** Open het scherm Bedrijfsgegevens, vanaf elke plek in de app. */
export const OPEN_COMPANY_EVENT = "ogs:open-company-profile";
/** De bedrijfsgegevens zijn opgeslagen of het scherm is gesloten. */
export const COMPANY_CHANGED_EVENT = "ogs:company-profile-changed";
export const openCompanyProfile = () => window.dispatchEvent(new Event(OPEN_COMPANY_EVENT));

/** Eén exemplaar van het scherm voor de hele app; het lint, de instellingen en het rapportscherm openen het. */
export function CompanyDialogHost() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const show = () => setOpen(true);
    window.addEventListener(OPEN_COMPANY_EVENT, show);
    return () => window.removeEventListener(OPEN_COMPANY_EVENT, show);
  }, []);
  return <CompanyDialog open={open} onClose={() => { setOpen(false); window.dispatchEvent(new Event(COMPANY_CHANGED_EVENT)); }} />;
}

export function CompanyDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [p, setP] = useState<CompanyProfile>(EMPTY_PROFILE);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { if (open) { setError(null); void loadProfile().then(setP); } }, [open]);
  const problems = profileProblems(p);
  const field = (key: "name" | "address" | "postalCity" | "phone" | "email" | "website" | "kvk", label: string, placeholder = "") => (
    <label className="sb-field"><span>{label}</span>
      <input value={p[key]} placeholder={placeholder} onChange={(e) => setP({ ...p, [key]: e.target.value })} /></label>
  );
  const pickLogo = () => {
    const input = document.createElement("input");
    input.type = "file"; input.accept = "image/png,image/jpeg,image/svg+xml";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      setBusy(true); setError(null);
      try { const logoDataUrl = await logoToImage(await readFileAsDataUrl(file)); setP((cur) => ({ ...cur, logoDataUrl })); }
      catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
    };
    input.click();
  };
  const save = async () => {
    setBusy(true); setError(null);
    try { await saveProfile(p); onClose(); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  };
  return (
    <Modal open={open} onClose={onClose} title="Bedrijfsgegevens sondeerbedrijf" width={560}
      footer={<><button className="settings-btn settings-btn-secondary" onClick={onClose}>Annuleren</button>
        <button className="settings-btn" disabled={busy || problems.length > 0} onClick={() => void save()}>Opslaan en gebruiken</button></>}>
      <div className="sb-dialog">
        <p className="sb-intro">Vul dit één keer in. Naam, logo, kleur en contactgegevens komen daarna op elk sondeerrapport.</p>
        <div className="sb-logo-row">
          <div className="sb-logo-box">{p.logoDataUrl ? <img src={p.logoDataUrl} alt="Logo" /> : <span>Geen logo</span>}</div>
          <div className="sb-logo-actions">
            <button className="settings-btn settings-btn-secondary" disabled={busy} onClick={pickLogo}>{p.logoDataUrl ? "Ander logo" : "Logo kiezen"}</button>
            {p.logoDataUrl && <button className="settings-btn settings-btn-secondary" onClick={() => setP({ ...p, logoDataUrl: undefined })}>Verwijderen</button>}
            <label className="sb-color"><input type="color" value={toHex(p.accent)} onChange={(e) => setP({ ...p, accent: fromHex(e.target.value) })} /> Huiskleur</label>
            <small>PNG, JPEG of SVG, voor een lichte achtergrond.</small>
          </div>
        </div>
        {field("name", "Bedrijfsnaam", "Sondeerbedrijf …")}
        <div className="sb-two">{field("address", "Adres")}{field("postalCity", "Postcode en plaats")}</div>
        <div className="sb-two">{field("phone", "Telefoon")}{field("email", "E-mail")}</div>
        <div className="sb-two">{field("website", "Website", "www.…")}{field("kvk", "KvK-nummer", "8 cijfers")}</div>
        {contactLine(p) && <p className="sb-preview"><span>Onder op het voorblad:</span> {contactLine(p)}</p>}
        {problems.map((m) => <p key={m} className="sb-problem">{m}</p>)}
        {error && <p className="sb-problem" role="alert">{error}</p>}
        <p className="sb-note">Een eigen voorblad of briefpapier (PDF) stel je in onder Instellingen › Huisstijl; die blijven behouden.</p>
      </div>
    </Modal>
  );
}
