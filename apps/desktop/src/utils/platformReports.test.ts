import { afterEach, expect, it, vi } from "vitest";
import { reports } from "./platform";
const project = {title:"Rapport",client:"",location:"",project_number:"",author:"",date:"2026-10-14"};
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();vi.useRealTimers();});
it("reserveert het venster vóór asynchrone PDF-generatie",async()=>{
  vi.useFakeTimers();
  const opened = {location:{href:"about:blank"},close:vi.fn(),closed:false,opener:window};
  const open = vi.spyOn(window,"open").mockReturnValue(opened as unknown as Window);
  vi.stubGlobal("URL",{createObjectURL:vi.fn(()=>"blob:rapport"),revokeObjectURL:vi.fn()});
  let complete!: (bytes:Uint8Array)=>void;
  const preview = vi.spyOn(reports,"preview").mockImplementation(()=>new Promise(resolve=>{complete=resolve;}));
  const pending = reports.generateAndOpen([],project);
  expect(open).toHaveBeenCalledWith("about:blank","_blank");
  expect(open.mock.invocationCallOrder[0]).toBeLessThan(preview.mock.invocationCallOrder[0]);
  expect(opened.location.href).toBe("about:blank");
  complete(new Uint8Array([1,2]));
  await pending;
  expect(opened.location.href).toBe("blob:rapport");
  expect(opened.close).not.toHaveBeenCalled();
  vi.advanceTimersByTime(60000);
  expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:rapport");
});
it("sluit het gereserveerde venster bij een generatiefout",async()=>{
  const opened = {close:vi.fn(),opener:window};
  vi.spyOn(window,"open").mockReturnValue(opened as unknown as Window);
  vi.spyOn(reports,"preview").mockRejectedValue(new Error("Generatie mislukt"));
  await expect(reports.generateAndOpen([],project)).rejects.toThrow("Generatie mislukt");
  expect(opened.close).toHaveBeenCalledOnce();
});
it("meldt een geblokkeerd venster voordat generatie begint",async()=>{
  vi.spyOn(window,"open").mockReturnValue(null);
  const preview=vi.spyOn(reports,"preview");
  await expect(reports.generateAndOpen([],project)).rejects.toThrow("pop-ups");
  expect(preview).not.toHaveBeenCalled();
});
