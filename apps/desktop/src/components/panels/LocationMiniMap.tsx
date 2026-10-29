import {rdToWgs84} from "../../utils/coordinates";
import { useEffect, useRef } from "react";
import * as L from "leaflet";
import "leaflet/dist/leaflet.css";

import type { Cpt } from "../../types/cpt";

/**
 * Mini Leaflet map — shows the active CPT's location on PDOK BRT tiles.
 * Converts RD (EPSG:28992) → WGS84 inline using the same Schreutelkamp
 * polynomial as `cpt-core::coords` (kept simple and dependency-free).
 *
 * Re-centers when `cpt` changes. Re-uses the map instance across renders.
 */
export default function LocationMiniMap({ cpts, activeId }: { cpts: Cpt[]; activeId: string | null }) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    if (!ref.current || mapRef.current) return;
    const map = L.map(ref.current, { zoomControl: false, attributionControl: false }).setView([52.156, 5.388], 8);
    L.tileLayer(
      "https://service.pdok.nl/brt/achtergrondkaart/wmts/v2_0/standaard/EPSG:3857/{z}/{x}/{y}.png",
      { maxZoom: 19 },
    ).addTo(map);
    L.control.zoom({ position: "bottomright" }).addTo(map);
    markersRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    return () => { map.remove(); mapRef.current = null; };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const layer = markersRef.current;
    if (!map || !layer) return;
    layer.clearLayers();
    const positions: L.LatLng[] = [];
    for (const cpt of cpts) {
      if (!cpt.position) continue;
      const { lat, lon } = rdToWgs84(cpt.position.x_rd, cpt.position.y_rd);
      const isActive = cpt.id === activeId;
      const fill = isActive ? "#F59E0B" : "#D97706";
      const html = `
        <div class="cpt-sondeer-marker${isActive ? " active" : ""}">
          <svg width="18" height="18" viewBox="0 0 22 22" overflow="visible">
            <polygon points="2,2 20,2 11,20" fill="${fill}" stroke="#36363E" stroke-width="1.6" stroke-linejoin="round" />
          </svg>
          <span class="cpt-sondeer-label">${cpt.id}</span>
        </div>
      `;
      const marker = L.marker([lat, lon], {
        icon: L.divIcon({
          className: "cpt-sondeer-icon",
          html,
          iconSize: [18, 18],
          iconAnchor: [9, 16],
        }),
      }).bindTooltip(cpt.id, { direction: "top", offset: [0, -6] });
      layer.addLayer(marker);
      positions.push(L.latLng(lat, lon));
    }
    if (positions.length === 0) return;
    if (positions.length === 1) {
      map.setView(positions[0], 16);
    } else {
      map.fitBounds(L.latLngBounds(positions), { padding: [20, 20], maxZoom: 16 });
    }
  }, [cpts, activeId]);

  return <div ref={ref} className="mini-map" />;
}

// Inline RD → WGS84 (Schreutelkamp 2001). Mirrors cpt-core::coords::rd_to_wgs84.
