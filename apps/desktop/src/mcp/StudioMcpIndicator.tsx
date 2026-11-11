import { useEffect, useState } from "react";
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
const actions: Record<string, string> = {
  studio_get_state: "Projectstatus lezen", studio_get_cpt: "Sondering lezen",
  studio_new_project: "Project maken", studio_open_file: "Bestand openen",
  studio_select_document: "Document selecteren", studio_show_view: "Weergave openen",
  studio_set_project_meta: "Projectgegevens wijzigen", studio_save_project: "Project opslaan",
  studio_add_calculation: "Berekening toevoegen", studio_update_calculation: "Berekening wijzigen",
  studio_select_calculation: "Berekening selecteren", studio_get_calculation: "Berekening lezen",
  studio_get_capacity_table: "Draagvermogentabel lezen", studio_export_report: "Rapport exporteren",
};
export function StudioMcpStatusView({ status, desktop }: { status: StudioMcpStatus | null; desktop: boolean }) {
  let label = "MCP starten…", kind = "idle", title = "Lokale MCP-koppeling wordt gestart.";
  if (!desktop) { label = "MCP niet beschikbaar"; title = "MCP-bediening is beschikbaar in de desktop-app."; }
  else if (status?.activeTool) { label = `MCP bezig · ${actions[status.activeTool] ?? status.activeTool}`; kind = "busy"; title = [actions[status.activeTool] ?? status.activeTool, status.error, status.clientNames.join(", ")].filter(Boolean).join("\n"); }
  else if (status?.error) { label = status.connectedClients ? "MCP verbonden · opdracht mislukt" : status.available ? "MCP beschikbaar · opdracht mislukt" : "MCP fout"; kind = "error"; title = status.error; }
  else if (status?.connectedClients) { label = "MCP verbonden"; kind = "connected"; title = `${status.connectedClients} MCP-client(s): ${status.clientNames.join(", ")}`; }
  else if (status?.available) { label = "MCP beschikbaar"; title = "De lokale Studio MCP-server is beschikbaar. Er is geen MCP-client verbonden."; }
  else if (status) { label = "MCP niet beschikbaar"; title = "De Studio MCP-koppeling is nog niet gereed."; }
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
