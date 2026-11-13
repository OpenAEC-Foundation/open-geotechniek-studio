import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import RibbonGroup from "./RibbonGroup";
import RibbonButton from "./RibbonButton";
import RibbonButtonStack from "./RibbonButtonStack";
import { useExtension } from "../../hooks/useExtensions";

/**
 * Sonderingstekening ribbon — full toolset.
 *
 * Everything that used to live in the view's right-hand toolbox now lives
 * here: place a sondering, place a raster, drop an RD-coordinate tag,
 * copy / delete / nudge a selected object, and export PDF. The view
 * listens for the global events these buttons dispatch (see the
 * `ogs:tekening-*` handlers) so the ribbon stays purely declarative.
 */


// Sondering — neerwaartse driehoek met een horizontaal kleefmeting-
// streepje eronder. Exact hetzelfde symbool als de geplaatste marker op
// de kaart (Dutch CPT-conventie), zodat de knop leest als "dit plaats je".

// Boring — open cirkel met midden-dot (zelfde conventie als de BRO-laag
// op de Kaart en de geplaatste boring-marker).


// Kader (tekeningframe) — buitenrand met een titelblok-cartouche in de
// rechteronderhoek. Onderscheidt zich duidelijk van het image-icoon.

// Sonderingsraster — een regelmatig rooster van sondeer-driehoekjes (2×2)
// binnen een licht kader, i.p.v. een kaal grid. Leest meteen als "een
// raster vól sonderingen".

// RD-coördinaat — een survey-kruisdraad: cirkel met doorstekende assen en
// een middenpunt. Leest als "prik hier een exact coördinaatpunt".

// ── Bewerken-icons (select / move / copy / delete) ────────────────
// Heroicons-style strokes that match the rest of the ribbon. The Bewerken
// group is back — Open PDF Studio / Open 2D Studio convention is to have
// these four edit acties (selecteren, verplaatsen, kopiëren, verwijderen)
// always one klik away regardless of which sub-tool the user picked.

// Offertes-icon — envelop met handgeschreven streep (snelheid /
// uitgaande mail-symbool). Heroicons "envelope" met arrow.

// Exporteer-DWG-icon — CAD-tekeningbestand: document met omgevouwen hoek
// en een polyline erin (vector-tekening).

// Exporteer-PDF-icon — document met omlaag-pijl (download/opslaan).

// Roteer-icon — een ronde pijl die 270° om een centrum buigt (open
// aan de bovenkant). Heroicons "arrow-path" stijl.



// Select / cursor — arrow icon for the default pick tool.

// Vrije lijn — simpel slash van linksonder naar rechtsboven.

// Vlak — polygon met lichte vulling.

// Opmerking — tekstballon.

// Maatlijn — horizontale lijn met uiteinde-tikken (┤───┤).

// ── CAD-edit-icons ───────────────────────────────────────────────
// Klassieke tekenprogramma-symbolen (Trim / Extend / Mirror / Offset).
// Bewust simpel: één bestaande lijn + een schaartje / verlengpijl /
// spiegelglyf / parallel-streep. Visueel onderscheidbaar in een
// gestackte ribbon-kolom van 22px hoog.

// Trim — schaartje door een lijn. Twee handvatten + middendiagonaal
// "knip"-streep zodat het op het eerste oog leest als een knipgebaar.

// Extend — een korte lijn met een pijlkop die naar een verticale
// referentiestreep wijst (rechts). Suggesties: "trek door tot dáár".

// Mirror — twee tegenovergestelde driehoekjes met een verticale
// spiegelas ertussen. Klassiek CAD-symbool.

// Offset — twee parallelle lijnen met een pijltje tussen.

// Freeze viewport heeft geen ribbon-knop meer — alleen het vinkje in
// TekeningProperties (rechter eigenschappen-paneel) bedient hem nu.

const dispatch = (name: string, detail?: unknown) =>
  window.dispatchEvent(new CustomEvent(name, { detail }));

export default function SonderingstekeningTab() {
  const { t } = useTranslation("ribbon");
  const { t: td } = useTranslation("drawing");
  const extOffertes = useExtension("offertes");

  // Houd lokaal bij of select-mode aan staat in de view, zodat de
  // Selecteren-knop kan highlighten (active-style). De view dispatcht
  // `ogs:tekening-select-mode-changed` zodra de gebruiker hem toggelt.
  const [selectActive, setSelectActive] = useState(false);
  useEffect(() => {
    const onChange = (e: Event) => {
      const ce = e as CustomEvent<{ active: boolean }>;
      setSelectActive(!!ce.detail?.active);
    };
    window.addEventListener("ogs:tekening-select-mode-changed", onChange);
    return () => {
      window.removeEventListener("ogs:tekening-select-mode-changed", onChange);
    };
  }, []);

  return (
    <div className="ribbon-content ribbon-drawing">
      <div className="ribbon-groups">
        <RibbonGroup label={t("tekening.selectGroup", "Selecteer")}>
          <RibbonButton
            icon="selection.box"
            label={t("tekening.selectMode", "Selecteren")}
            size="large"
            active={selectActive}
            onClick={() => dispatch("ogs:tekening-select-mode")}
          />
        </RibbonGroup>

        {/* Bewerken-groep: TWEE gestackte kolommen.
            Kolom 1: Verplaatsen / Kopiëren / Roteren / Verwijderen.
            Kolom 2: Trim / Extend / Mirror / Offset (de CAD-edit-tools
            die voorheen in een aparte "Tekenen"-groep zaten — verzoek
            gebruiker: bij elkaar onder Bewerken). */}
        <RibbonGroup label={t("tekening.editGroup", "Bewerken")}>
          <RibbonButtonStack>
            <RibbonButton
              icon="transform.move"
              label={t("tekening.moveSelection", "Verplaatsen")}
              size="small"
              title={t(
                "tekening.moveHint",
                "Klik Verplaatsen en dan het object (of selecteer eerst), beweeg de muis en klik om neer te zetten. Pijltjestoetsen = 1 m (Shift = 5 m).",
              )}
              onClick={() => dispatch("ogs:tekening-begin-move")}
            />
            <RibbonButton
              icon="edit.duplicate"
              label={t("tekening.copySelection", "Kopiëren")}
              size="small"
              title={t("tekening.copyHint", "Dupliceer naast het geselecteerde object (Ctrl+D)")}
              onClick={() => dispatch("ogs:tekening-copy")}
            />
            <RibbonButton
              icon="transform.rotate"
              label={t("tekening.rotate", "Roteren…")}
              size="small"
              title={t(
                "tekening.rotateHint",
                "Vraag de gewenste hoek in graden (negatief = tegen de klok in).",
              )}
              onClick={() => {
                const raw = window.prompt(
                  td("rotate.prompt", "Roteer met hoeveel graden? (negatief = tegen de klok in)"),
                  "90",
                );
                if (raw === null) return;
                const deg = parseFloat(raw.replace(",", "."));
                if (!Number.isFinite(deg) || deg === 0) return;
                dispatch("ogs:tekening-rotate", { deg });
              }}
            />
            <RibbonButton
              icon="edit.delete"
              label={t("tekening.deleteSelection", "Verwijderen")}
              size="small"
              title={t("tekening.deleteHint", "Verwijder het geselecteerde object (Delete)")}
              onClick={() => dispatch("ogs:tekening-delete")}
            />
          </RibbonButtonStack>
          <RibbonButtonStack>
            <RibbonButton
              icon="transform.corner-join"
              label={t("tekening.cadTrim", "Trim")}
              size="small"
              title={t(
                "tekening.cadTrimHint",
                "Klik eerst een referentielijn, dan het deel van een andere lijn dat WEG moet (op het snijpunt geknipt).",
              )}
              onClick={() => dispatch("ogs:tekening-cad-trim")}
            />
            <RibbonButton
              icon="transform.corner-join"
              label={t("tekening.cadExtend", "Extend")}
              size="small"
              title={t(
                "tekening.cadExtendHint",
                "Klik eerst een referentielijn, dan het uiteinde van de lijn dat verlengd moet worden.",
              )}
              onClick={() => dispatch("ogs:tekening-cad-extend")}
            />
            <RibbonButton
              icon="transform.mirror"
              label={t("tekening.cadMirror", "Mirror")}
              size="small"
              title={t(
                "tekening.cadMirrorHint",
                "Selecteer eerst een lijn, klik dan twee punten op de kaart om de spiegelas vast te zetten.",
              )}
              onClick={() => dispatch("ogs:tekening-cad-mirror")}
            />
            <RibbonButton
              icon="transform.offset"
              label={t("tekening.cadOffset", "Offset")}
              size="small"
              title={t(
                "tekening.cadOffsetHint",
                "Klik een lijn, geef de afstand in m, klik aan de zijde waar de parallel-kopie moet komen.",
              )}
              onClick={() => dispatch("ogs:tekening-cad-offset")}
            />
          </RibbonButtonStack>
        </RibbonGroup>

        <RibbonGroup label={t("tekening.placeGroup", "Plaatsen")}>
          <RibbonButton
            icon="geo.sondering"
            label={t("tekening.placeMode", "Sondering")}
            size="large"
            onClick={() => dispatch("ogs:tekening-toggle-place")}
          />
          <RibbonButton
            icon="geo.bore"
            label={t("tekening.placeBore", "Boring")}
            size="large"
            onClick={() => dispatch("ogs:tekening-toggle-place-bore")}
          />
          <RibbonButton
            icon="geo.sounding-grid"
            label={t("tekening.placeRaster", "Sonderingsraster")}
            size="large"
            onClick={() => dispatch("ogs:tekening-place-raster")}
          />
          <RibbonButton
            icon="draw.line"
            label={t("tekening.drawLine", "Lijn")}
            size="large"
            onClick={() => dispatch("ogs:tekening-draw-line")}
          />
          <RibbonButton
            icon="draw.dimension"
            label={t("tekening.drawDim", "Maatlijn")}
            size="large"
            onClick={() => dispatch("ogs:tekening-draw-dimension")}
          />
          <RibbonButton
            icon="geo.coordinate-tag"
            label={t("tekening.coordTag", "RD-coördinaat")}
            size="large"
            onClick={() => dispatch("ogs:tekening-coord-tag")}
          />
          <RibbonButton
            icon="draw.polygon"
            label={t("tekening.drawVlak", "Vlak")}
            size="large"
            onClick={() => dispatch("ogs:tekening-draw-vlak")}
          />
          <RibbonButton
            icon="draw.note"
            label={t("tekening.addNote", "Opmerking")}
            size="large"
            onClick={() => dispatch("ogs:tekening-add-note")}
          />
        </RibbonGroup>

        <RibbonGroup label={t("tekening.overlayGroup", "Overlay")}>
          <RibbonButton
            icon="file.import"
            label={t("tekening.addOverlay", "Image/PDF import")}
            size="large"
            onClick={() => dispatch("ogs:tekening-add-overlay")}
          />
          <RibbonButton
            icon="drawing.frame-import"
            label={t("tekening.loadFrame", "Kader (SVG)")}
            size="large"
            onClick={() => dispatch("ogs:tekening-load-frame")}
          />
          <RibbonButton
            icon="edit.clear-all"
            label={t("tekening.clearAll", "Wis alles")}
            size="small"
            onClick={() => dispatch("ogs:tekening-clear-all")}
          />
        </RibbonGroup>

        <RibbonGroup label={t("tekening.exportGroup", "Export")}>
          <RibbonButton
            icon="export.cad"
            label={t("tekening.exportDwg", "Exporteer DWG")}
            size="large"
            title={t(
              "tekening.exportDwgHint",
              "Exporteer de tekening inclusief GIS-lagen (gebouwen, percelen) naar DWG/DXF. Kies RD- of lokale coördinaten; kies .dwg of .dxf in de opslaan-dialoog.",
            )}
            onClick={() => dispatch("ogs:tekening-export-dwg")}
          />
          <RibbonButton
            icon="file.export"
            label={t("tekening.exportPdf", "Exporteer PDF")}
            size="large"
            onClick={() => dispatch("ogs:tekening-export-pdf")}
          />
          <RibbonButton
            icon="file.print"
            label={t("tekening.print", "Print")}
            size="large"
            onClick={() => dispatch("ogs:tekening-print")}
          />
        </RibbonGroup>

        {extOffertes && (
          <RibbonGroup label={t("tekening.offertesGroup", "Offertes")}>
            <RibbonButton
              icon="geo.quote-request"
              label={t("tekening.requestQuotes", "Offertes opvragen")}
              size="large"
              title={t(
                "tekening.requestQuotesHint",
                "Open een dialog met de dichtstbijzijnde sondeerbedrijven en open een mailto-offerte-aanvraag in Outlook",
              )}
              onClick={() => dispatch("ogs:tekening-request-quotes")}
            />
          </RibbonGroup>
        )}
      </div>
    </div>
  );
}
