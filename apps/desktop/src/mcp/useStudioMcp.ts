import { useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { IS_TAURI } from "../utils/platform";
import { executeStudioTool } from "./studioTools";

interface StudioRequest { id: string; tool: string; arguments: Record<string, unknown> }
let readyQueue: Promise<unknown> = Promise.resolve();
function setReady(ready: boolean) {
  readyQueue = readyQueue.catch(() => {}).then(() => invoke("studio_mcp_ready", { ready }));
  return readyQueue;
}

/** The main window executes MCP operations through its existing stores. */
export function useStudioMcp(changeView: (view: string) => void) {
  useEffect(() => {
    if (!IS_TAURI) return;
    let disposed = false, readySent = false;
    let stop: (() => void) | undefined;
    void listen<StudioRequest>("ogs:mcp-request", event => {
      if (disposed) return;
      void (async () => {
        const request = event.payload;
        if (!request || typeof request.id !== "string") return;
        let result: unknown = null, error: string | null = null;
        try { result = await executeStudioTool(request.tool, request.arguments, changeView); }
        catch (cause) { error = cause instanceof Error ? cause.message : "Studio-opdracht mislukt"; }
        try { await invoke("complete_studio_mcp_request", { id: request.id, result, error }); }
        catch { /* The native session may have ended while an operation completed. */ }
      })();
    }).then(async unlisten => {
      if (disposed) { unlisten(); return; }
      stop = unlisten; readySent = true;
      await setReady(true);
    }).catch(() => { /* The status indicator reports native availability separately. */ });
    return () => { disposed = true; stop?.(); if (readySent) void setReady(false).catch(() => {}); };
  }, [changeView]);
}
