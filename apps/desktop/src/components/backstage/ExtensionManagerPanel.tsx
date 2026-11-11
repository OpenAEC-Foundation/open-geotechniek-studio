import { APP_VERSION } from "../../version";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import i18next from "i18next";
import {
  useAllExtensions,
  setExtension,
  isExtensionSelectable,
  type ExtensionId,
} from "../../hooks/useExtensions";
import { CALC_REGISTRY } from "../../calc/framework/registry";
import { moduleName, moduleText } from "../../calc/framework/moduleText";
import "./ExtensionManagerPanel.css";

/**
 * Beschrijving van één extensie zoals getoond in het Extensions-paneel.
 * Bij elke nieuwe ExtensionId die in `useExtensions.ts` wordt
 * toegevoegd hoort hier ook een entry — anders verschijnt-ie wel in de
 * lijst (via useAllExtensions) maar zónder naam/beschrijving.
 *
 * Calc-module entries worden automatisch gegenereerd uit
 * `CALC_REGISTRY` zodat een nieuwe module alleen in de registry
 * geregistreerd hoeft te worden (en als ExtensionId in
 * useExtensions.ts) om hier te verschijnen.
 */
interface ExtensionMeta {
  id: ExtensionId;
  name: string;
  version: string;
  description: string;
  author: string;
  category: string;
}

const extT = (key: string, nl: string) => i18next.t(`app:extensions.${key}`, { defaultValue: nl });

// Getters: naam en beschrijving volgen de actieve taal.
const TEKENING_EXT: ExtensionMeta = {
  id: "tekening",
  get name() { return extT("tekening.name", "Situatietekening"); },
  version: APP_VERSION,
  get description() {
    return extT("tekening.description", "CAD-papier (A2/A3/A4) met sonderingen, snap-systeem, overlays en PDF-export.");
  },
  author: "OpenAEC Foundation",
  category: "Tekening",
};
const OFFERTES_EXT: ExtensionMeta = {
  id: "offertes",
  get name() { return extT("offertes.name", "Offertes opvragen"); },
  version: APP_VERSION,
  get description() {
    return extT("offertes.description", "Vraagt offertes op bij dichtsbijzijnde sondeerbedrijven.");
  },
  author: "OpenAEC Foundation",
  category: "Werkflow",
};

const INSTALLED_EXTENSIONS: ExtensionMeta[] = [
  TEKENING_EXT,
  OFFERTES_EXT,
  ...CALC_REGISTRY.map<ExtensionMeta>((m) => ({
    id: `calc.${m.id}` as ExtensionId,
    // Getters: naam en beschrijving volgen de actieve taal.
    get name() { return moduleName(m); },
    version: APP_VERSION,
    get description() { return `${moduleText(m, "subtitle")} — ${moduleText(m, "norm")}`; },
    author: "OpenAEC Foundation",
    category: "Berekening",
  })),
];

const CATEGORY_COLORS: Record<string, string> = {
  "Tekening": "#22d3ee",
  "Werkflow": "#a78bfa",
  "Berekening": "#f59e0b",
  "Import/Export": "#60a5fa",
  "Reporting": "#a78bfa",
  "Utility": "#a1a1aa",
  "Other": "#71717a",
};

/** Vertaalsleutel + Nederlandse brontekst per categorie (de categorie zelf blijft de kleur-sleutel). */
const CATEGORY_LABELS: Record<string, [string, string]> = {
  "Tekening": ["drawing", "Tekening"],
  "Werkflow": ["workflow", "Werkflow"],
  "Berekening": ["calculation", "Berekening"],
};

export default function ExtensionManagerPanel() {
  const { t } = useTranslation("backstage");
  const { t: ta } = useTranslation("app");
  const [tab, setTab] = useState<"installed" | "browse">("installed");
  const [search, setSearch] = useState("");
  const enabledMap = useAllExtensions();

  const toggleExtension = (id: ExtensionId) => {
    void setExtension(id, !enabledMap[id]);
  };

  const filteredInstalled = INSTALLED_EXTENSIONS.filter(
    (e) =>
      !search ||
      e.name.toLowerCase().includes(search.toLowerCase()) ||
      e.description.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="ext-manager">
      <h2 className="ext-manager-title">{t("extensions")}</h2>

      <div className="ext-tabs">
        <button
          className={`ext-tab${tab === "installed" ? " active" : ""}`}
          onClick={() => setTab("installed")}
        >
          {t("extInstalled")} ({INSTALLED_EXTENSIONS.length})
        </button>
        <button
          className={`ext-tab${tab === "browse" ? " active" : ""}`}
          onClick={() => setTab("browse")}
        >
          {t("extBrowse")}
        </button>
      </div>

      <div className="ext-search-row">
        <input
          type="text"
          className="ext-search"
          placeholder={t("extSearchPlaceholder")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="ext-list">
        {tab === "installed" &&
          filteredInstalled.map((ext) => {
            const enabled = enabledMap[ext.id];
            const selectable = isExtensionSelectable(ext.id);
            const lockedLabel = ta("extensions.lockedLabel", "Nog niet productie-gereed");
            const categoryLabel = CATEGORY_LABELS[ext.category];
            return (
              <div
                key={ext.id}
                className={`ext-card${enabled ? "" : " disabled"}${selectable ? "" : " ext-card--locked"}`}
              >
                <div className="ext-card-header">
                  <span
                    className="ext-category-badge"
                    style={{ background: CATEGORY_COLORS[ext.category] || "#71717a" }}
                  >
                    {categoryLabel ? ta(`extensions.category.${categoryLabel[0]}`, categoryLabel[1]) : ext.category}
                  </span>
                  {!selectable && (
                    <span className="ext-locked-badge" title={lockedLabel}>
                      🚧 {ta("extensions.inDevelopment", "In ontwikkeling")}
                    </span>
                  )}
                  <span className="ext-version">v{ext.version}</span>
                </div>
                <div className="ext-card-body">
                  <strong className="ext-name">{ext.name}</strong>
                  <p className="ext-desc">{ext.description}</p>
                  {!selectable && (
                    <p className="ext-desc-locked">
                      {ta(
                        "extensions.lockedDescription",
                        "Deze berekening is nog in ontwikkeling — getallen zijn nog niet productie-geverifieerd. De toggle is daarom uitgeschakeld.",
                      )}
                    </p>
                  )}
                  <span className="ext-author">{ext.author}</span>
                </div>
                <div className="ext-card-actions">
                  <label
                    className={`ext-toggle${selectable ? "" : " ext-toggle--disabled"}`}
                    title={selectable ? "" : lockedLabel}
                  >
                    <input
                      type="checkbox"
                      checked={enabled && selectable}
                      disabled={!selectable}
                      onChange={() => selectable && toggleExtension(ext.id)}
                    />
                    <span className="ext-toggle-slider" />
                  </label>
                </div>
              </div>
            );
          })}

        {tab === "browse" && (
          <div
            style={{
              padding: 24,
              textAlign: "center",
              color: "var(--theme-text-secondary, #71717a)",
              fontSize: 13,
              lineHeight: 1.6,
            }}
          >
            <p style={{ margin: 0 }}>
              {ta("extensions.noCatalog", "Geen externe extensie-catalogus beschikbaar.")}
            </p>
            <p style={{ margin: "8px 0 0", fontSize: 12 }}>
              {ta(
                "extensions.builtInOnly",
                "Open Geotechniek Studio gebruikt momenteel alleen ingebouwde extensies (zie tab \"{{tab}}\"). Een community-catalogus volgt in een latere versie.",
                { tab: t("extInstalled") },
              )}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
