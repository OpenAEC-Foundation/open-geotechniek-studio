import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { IS_TAURI } from "../utils/platform";

export interface StudioMcpStatus {
  available: boolean;
  connectedClients: number;
  clientNames: string[];
  activeTool: string | null;
  lastActivity: number | null;
  error: string | null;
}
const ACTIONS: Record<string, string> = {
  studio_get_state: "Projectstatus lezen", studio_get_cpt: "Sondering lezen",
  studio_new_project: "Project maken", studio_open_file: "Bestand openen",
  studio_select_document: "Document selecteren", studio_show_view: "Weergave openen",
  studio_set_project_meta: "Projectgegevens wijzigen", studio_save_project: "Project opslaan",
  studio_add_calculation: "Berekening toevoegen", studio_update_calculation: "Berekening wijzigen",
  studio_select_calculation: "Berekening selecteren", studio_get_calculation: "Berekening lezen",
  studio_get_capacity_table: "Draagvermogentabel lezen", studio_export_report: "Rapport exporteren",
  studio_export_ifcx: "IFCX exporteren",
};
const actionText = (t: TFunction, tool: string) => (ACTIONS[tool] ? t(`mcp.actions.${tool}`, ACTIONS[tool]) : tool);
export function StudioMcpStatusView({ status, desktop }: { status: StudioMcpStatus | null; desktop: boolean }) {
  const { t } = useTranslation("common");
  let label = t("mcp.starting", "MCP starten…"), kind = "idle", title = t("mcp.startingHint", "Lokale MCP-koppeling wordt gestart.");
  if (!desktop) { label = t("mcp.unavailable", "MCP niet beschikbaar"); title = t("mcp.desktopOnly", "MCP-bediening is beschikbaar in de desktop-app."); }
  else if (status?.activeTool) { const action = actionText(t, status.activeTool); label = t("mcp.busy", "MCP bezig · {{action}}", { action }); kind = "busy"; title = [action, status.error, status.clientNames.join(", ")].filter(Boolean).join("\n"); }
  else if (status?.error) { label = status.connectedClients ? t("mcp.connectedFailed", "MCP verbonden · opdracht mislukt") : status.available ? t("mcp.availableFailed", "MCP beschikbaar · opdracht mislukt") : t("mcp.error", "MCP fout"); kind = "error"; title = status.error; }
  else if (status?.connectedClients) { label = t("mcp.connected", "MCP verbonden"); kind = "connected"; title = t("mcp.clients", "{{count}} MCP-client(s): {{names}}", { count: status.connectedClients, names: status.clientNames.join(", ") }); }
  else if (status?.available) { label = t("mcp.available", "MCP beschikbaar"); title = t("mcp.availableHint", "De lokale Studio MCP-server is beschikbaar. Er is geen MCP-client verbonden."); }
  else if (status) { label = t("mcp.unavailable", "MCP niet beschikbaar"); title = t("mcp.notReady", "De Studio MCP-koppeling is nog niet gereed."); }
  return <span className={`studio-mcp-status studio-mcp-${kind}`} role="status" aria-live="polite" title={title}><span className="studio-mcp-dot" aria-hidden="true" />{label}</span>;
}

export function StudioMcpIndicator() {
  const [status, setStatus] = useState<StudioMcpStatus | null>(null);
  useEffect(() => {
    if (!IS_TAURI) return;
    let disposed = false, revision = 0;
    let unlisten: (() => void) | undefined;
    const refresh = async () => {
      const current = ++revision;
      try {
        const next = await invoke<StudioMcpStatus>("get_studio_mcp_status");
        if (!disposed && current === revision) setStatus(next);
      } catch {
        if (!disposed && current === revision) setStatus({ available: false, connectedClients: 0, clientNames: [], activeTool: null, lastActivity: null, error: "MCP-status kon niet worden opgehaald" });
      }
    };
    void listen<StudioMcpStatus>("ogs:mcp-status", event => {
      if (!disposed) { revision++; setStatus(event.payload); }
    }).then(stop => { if (disposed) stop(); else unlisten = stop; }).catch(() => { /* Polling also supports detached windows. */ });
    void refresh();
    const timer = setInterval(() => { void refresh(); }, 5000);
    return () => { disposed = true; clearInterval(timer); unlisten?.(); };
  }, []);
  return <StudioMcpStatusView status={status} desktop={IS_TAURI} />;
}
