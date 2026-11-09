import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { IS_TAURI } from "../../utils/platform";
import { useReportBrand, type ReportBrand, type Rgb } from "../../report/reportBrand";
import {
  cloudLogin, cloudLogout, cloudStatus, getCloudCache, getCloudTarget, listHandelsnamen, refreshCloudBrand, resetCloudBrand, setCloudTarget,
  type CloudBrandCache, type CloudStatus, type Handelsnaam,
} from "../../report/cloudBrand";
import { BRAND_MODES, getBrandMode, getOwnBrand, saveOwnBrand, setBrandMode, type BrandMode } from "../../report/brandSettings";
import { logoToImage, pageToImage, readFileAsDataUrl } from "../../report/brandAssets";
import ThemedSelect from "../ThemedSelect";

const rgb = (c?: Rgb) => (c ? `rgb(${c.join(",")})` : "transparent");
const toHex = (c?: Rgb) => (c ? `#${c.map((v) => v.toString(16).padStart(2, "0")).join("")}` : "#000000");
const fromHex = (h: string): Rgb => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) as Rgb;

/**
 * Huisstijl van de rapporten: standaard OpenAEC, een eigen huisstijl (naam, kleuren, logo en een eigen voorblad of
 * briefpapier als PDF) of die van de organisatie uit de OpenAEC SuperCloud. Wijzigingen zijn direct actief.
 */
export function BrandTabContent() {
  const { t } = useTranslation("settings");
  const [mode, setMode] = useState<BrandMode | null>(null);
  useEffect(() => { void getBrandMode().then(setMode); }, []);
  const choose = (m: BrandMode) => { setMode(m); void setBrandMode(m); };
  const label: Record<BrandMode, [string, string]> = {
    standaard: [t("brand.modeStandard", "Standaard OpenAEC"), t("brand.modeStandardHint", "De vaste OpenAEC-stijl.")],
    eigen: [t("brand.modeOwn", "Eigen huisstijl"), t("brand.modeOwnHint", "Naam, kleuren en logo, met je eigen voorblad en briefpapier als PDF.")],
    supercloud: [t("brand.modeCloud", "OpenAEC SuperCloud"), t("brand.modeCloudHint", "Log in en neem de huisstijl van je organisatie over.")],
  };
  return (
    <div className="settings-section brand-tab">
      <h3>{t("brand.title", "Huisstijl")}</h3>
      <p className="settings-description" style={{ marginBottom: 10 }}>{t("brand.introModes", "Voorblad, kop en voet van de rapporten volgen de gekozen huisstijl.")}</p>
      <div className="brand-modes" role="radiogroup" aria-label={t("brand.title", "Huisstijl")}>
        {BRAND_MODES.map((m) => (
          <label key={m} className={`brand-mode${mode === m ? " active" : ""}`}>
            <input type="radio" name="brand-mode" checked={mode === m} onChange={() => choose(m)} />
            <span><b>{label[m][0]}</b><small>{label[m][1]}</small></span>
          </label>
        ))}
      </div>
      {mode === "eigen" && <OwnBrandForm />}
      {mode === "supercloud" && <CloudSection />}
      <BrandPreview />
    </div>
  );
}

/** Formulier voor de eigen huisstijl; teksten worden bewaard bij het verlaten van het veld. */
function OwnBrandForm() {
  const { t } = useTranslation("settings");
  const [own, setOwn] = useState<Partial<ReportBrand> | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const latest = useRef<Partial<ReportBrand>>({});
  useEffect(() => { void getOwnBrand().then((b) => { latest.current = b; setOwn(b); }); }, []);
  if (!own) return null;

  const save = (patch: Partial<ReportBrand>) => {
    const next = { ...latest.current, ...patch };
    latest.current = next; setOwn(next);
    void saveOwnBrand(next);
  };
  const upload = (key: "logoDataUrl" | "logoOnDarkDataUrl" | "coverImage" | "pageImage", accept: string) => {
    const input = document.createElement("input");
    input.type = "file"; input.accept = accept;
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      setBusy(key); setError(null);
      try {
        const raw = await readFileAsDataUrl(file);
        save({ [key]: key.startsWith("logo") ? await logoToImage(raw) : await pageToImage(raw) });
      } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setBusy(null); }
    };
    input.click();
  };
  const text = (key: "organization" | "tagline" | "website" | "contact", labelText: string, placeholder: string) => (
    <div className="settings-row">
      <span className="settings-label">{labelText}</span>
      <input className="settings-input brand-text" defaultValue={own[key] ?? ""} placeholder={placeholder}
        onBlur={(e) => { if ((own[key] ?? "") !== e.target.value) save({ [key]: e.target.value }); }} />
    </div>
  );
  const color = (key: "accent" | "secondary" | "dark", labelText: string, fallback: Rgb) => (
    <label className="brand-color">
      <input type="color" value={toHex(own[key] ?? fallback)} onChange={(e) => save({ [key]: fromHex(e.target.value) })} />
      {labelText}
    </label>
  );
  const file = (key: "logoDataUrl" | "logoOnDarkDataUrl" | "coverImage" | "pageImage", labelText: string, hint: string, accept: string) => (
    <div className="settings-row brand-file">
      <span className="settings-label">{labelText}<small className="settings-description">{hint}</small></span>
      <span className="brand-inline">
        {own[key] && <img className={key.startsWith("logo") ? "brand-thumb" : "brand-thumb page"} src={own[key]} alt="" />}
        <button className="settings-btn settings-btn-secondary" disabled={!!busy} onClick={() => upload(key, accept)}>
          {busy === key ? t("brand.processing", "Verwerken…") : t("brand.chooseFile", "Kies bestand")}
        </button>
        {own[key] && <button className="settings-btn settings-btn-secondary" onClick={() => save({ [key]: undefined })}>{t("brand.remove", "Verwijderen")}</button>}
      </span>
    </div>
  );

  return (
    <div className="brand-own">
      {text("organization", t("brand.name", "Naam"), "Ingenieursbureau …")}
      {text("tagline", t("brand.tagline", "Ondertitel"), "")}
      {text("website", t("brand.website", "Website"), "www.…")}
      {text("contact", t("brand.contact", "Contactregel"), t("brand.contactPlaceholder", "Adres · telefoon · e-mail · KvK"))}
      <div className="settings-row">
        <span className="settings-label">{t("brand.colors", "Kleuren")}</span>
        <span className="brand-inline">
          {color("accent", t("brand.primary", "hoofd"), [217, 119, 6])}
          {color("secondary", t("brand.secondary", "tweede"), [245, 158, 11])}
          {color("dark", t("brand.dark", "donker vlak"), [54, 54, 62])}
        </span>
      </div>
      {file("logoDataUrl", t("brand.logo", "Logo"), t("brand.logoHint", "PNG, JPEG of SVG; voor een lichte achtergrond"), "image/png,image/jpeg,image/svg+xml")}
      {file("logoOnDarkDataUrl", t("brand.logoDark", "Logo op donker"), t("brand.logoDarkHint", "optioneel; wit of licht logo voor het voorblad"), "image/png,image/jpeg,image/svg+xml")}
      {file("coverImage", t("brand.cover", "Eigen voorblad"), t("brand.coverHint", "PDF (eerste pagina) of afbeelding op A4; titel en projectgegevens komen erop"), "application/pdf,image/png,image/jpeg")}
      {file("pageImage", t("brand.stationery", "Briefpapier"), t("brand.stationeryHint", "PDF of afbeelding op A4 als achtergrond van de vervolgpagina's"), "application/pdf,image/png,image/jpeg")}
      {error && <p className="settings-description brand-error" role="alert">{error}</p>}
    </div>
  );
}

/** Inloggen bij de SuperCloud, omgeving en handelsnaam kiezen en de huisstijl ophalen. */
function CloudSection() {
  const { t } = useTranslation("settings");
  const [status, setStatus] = useState<CloudStatus>({ ingelogd: false, omgevingen: [] });
  const [host, setHost] = useState<string | null>(null);
  const [naam, setNaam] = useState<string | null>(null);
  const [namen, setNamen] = useState<Handelsnaam[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async (label: string, job: () => Promise<void>) => {
    setBusy(label); setError(null);
    try { await job(); } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setBusy(null); }
  }, []);

  useEffect(() => {
    if (!IS_TAURI) return;
    void (async () => {
      setStatus(await cloudStatus());
      const target = await getCloudTarget();
      setHost(target.host); setNaam(target.handelsnaam);
    })();
  }, []);

  useEffect(() => {
    if (!status.ingelogd || !host) { setNamen([]); return; }
    void run("namen", async () => setNamen((await listHandelsnamen(host)).filter((n) => n.actief)));
  }, [status.ingelogd, host, run]);

  if (!IS_TAURI) return <p className="settings-description">{t("brand.desktopOnly", "De huisstijl uit de SuperCloud is alleen in de desktop-app beschikbaar.")}</p>;

  return (
    <div className="brand-cloud">
      <div className="settings-row">
        <span className="settings-label">{t("brand.account", "OpenAEC-account")}</span>
        {status.ingelogd ? (
          <span className="brand-inline">
            <span className="settings-description">{status.email ?? status.naam ?? t("brand.loggedIn", "ingelogd")}</span>
            <button className="settings-btn settings-btn-secondary" disabled={!!busy} onClick={() => run("afmelden", async () => { await cloudLogout(); setStatus(await cloudStatus()); })}>
              {t("brand.logout", "Afmelden")}
            </button>
          </span>
        ) : (
          <button className="settings-btn settings-btn-primary" disabled={!!busy} onClick={() => run("inloggen", async () => setStatus(await cloudLogin()))}>
            {busy === "inloggen" ? t("brand.waiting", "Wacht op de browser…") : t("brand.login", "Inloggen met OpenAEC")}
          </button>
        )}
      </div>
      {status.ingelogd && (
        <div className="settings-row">
          <span className="settings-label">{t("brand.environment", "Omgeving")}</span>
          {status.omgevingen.length ? (
            <ThemedSelect
              value={host ?? ""}
              options={[{ value: "", label: t("brand.choose", "— kies —") }, ...status.omgevingen.map((o) => ({ value: o.host, label: o.soort ? `${o.host} (${o.soort})` : o.host }))]}
              onChange={(v) => { const h = v || null; setHost(h); setNaam(null); void setCloudTarget(h, null); }}
              style={{ width: 260 }}
            />
          ) : <span className="settings-description">{t("brand.noEnvironments", "Dit account heeft geen omgevingen.")}</span>}
        </div>
      )}
      {status.ingelogd && host && (
        <div className="settings-row">
          <span className="settings-label">{t("brand.tradeName", "Handelsnaam")}</span>
          <ThemedSelect
            value={naam ?? ""}
            options={[{ value: "", label: t("brand.defaultTradeName", "standaard") }, ...namen.map((n) => ({ value: n.naam, label: n.standaard ? `${n.naam} (${t("brand.defaultTradeName", "standaard")})` : n.naam }))]}
            onChange={(v) => { const n = v || null; setNaam(n); void setCloudTarget(host, n); }}
            style={{ width: 260 }}
          />
        </div>
      )}
      {status.ingelogd && host && (
        <div className="settings-row">
          <span className="settings-label" />
          <span className="brand-inline">
            <button className="settings-btn settings-btn-primary" disabled={!!busy} onClick={() => run("ophalen", async () => { await refreshCloudBrand(true); })}>
              {busy === "ophalen" ? t("brand.fetching", "Ophalen…") : t("brand.fetch", "Huisstijl ophalen")}
            </button>
            <button className="settings-btn settings-btn-secondary" disabled={!!busy} onClick={() => run("reset", async () => { await resetCloudBrand(); setHost(null); setNaam(null); })}>
              {t("brand.forget", "Omgeving vergeten")}
            </button>
          </span>
        </div>
      )}
      {error && <p className="settings-description brand-error" role="alert">{error}</p>}
    </div>
  );
}

/** Zo ziet de huidige rapporthuisstijl eruit. */
function BrandPreview() {
  const { t } = useTranslation("settings");
  const brand = useReportBrand((s) => s.brand);
  const source = useReportBrand((s) => s.source);
  const [cache, setCache] = useState<CloudBrandCache | null>(null);
  useEffect(() => { if (IS_TAURI) void getCloudCache().then(setCache); }, [brand]);
  const logo = brand.logoOnDarkDataUrl ?? brand.logoDataUrl;
  return (
    <>
      <h3 style={{ marginTop: 16 }}>{t("brand.current", "Huidige rapporthuisstijl")}</h3>
      <div className="brand-preview-row">
        {brand.coverImage ? <img className="brand-cover-thumb" src={brand.coverImage} alt="" /> : (
          <div className="brand-preview" style={{ background: brand.dark ? rgb(brand.dark) : "#36363e" }}>
            {logo && <img src={logo} alt="" />}
            <span style={{ color: rgb(brand.accent) }}>{brand.organization}</span>
            <span className="brand-swatches">
              <i style={{ background: rgb(brand.accent) }} />
              {brand.secondary && <i style={{ background: rgb(brand.secondary) }} />}
            </span>
          </div>
        )}
        {brand.pageImage && <img className="brand-cover-thumb" src={brand.pageImage} alt="" />}
      </div>
      <p className="settings-description">
        {t("brand.source", "Bron")}: {source}
        {source.startsWith("SuperCloud") && cache?.bijgewerkt && <> · {t("brand.updated", "bijgewerkt")} {cache.bijgewerkt.slice(0, 16)}</>}
      </p>
      {brand.contact && <p className="settings-description">{brand.contact}</p>}
    </>
  );
}
