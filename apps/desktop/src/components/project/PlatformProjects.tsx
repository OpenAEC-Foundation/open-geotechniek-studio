import { useEffect, useRef, useState } from "react";
import Modal from "../Modal";
import { getPlatformStorage, STORAGE_CHANGED, type PlatformProject } from "../../utils/platformStorage";
import { useCptStore, serializeActiveProject, openProjectFromContent } from "../../store/useCptStore";

/** Opslag in de ingesloten site naast de bestaande lokale bestanden. */
export function PlatformProjects() {
  const [storage, setStorage] = useState(getPlatformStorage);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<PlatformProject[]>([]);
  const [versions, setVersions] = useState<PlatformProject[]>([]);
  const [selected, setSelected] = useState("");
  const [version, setVersion] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const activeDocId = useCptStore(s => s.activeDocId);
  const documents = useCptStore(s => s.documents);
  const active = documents.find(d => d.id === activeDocId);
  const generation = useRef(0);
  const busyRef = useRef(false);
  const bindings = useRef(new Map<string, PlatformProject>());

  useEffect(() => {
    const update = () => { generation.current++; busyRef.current = false; setBusy(false); setError(""); setMessage(""); setStorage(getPlatformStorage()); bindings.current.clear(); setItems([]); setVersions([]); setSelected(""); setVersion(""); };
    window.addEventListener(STORAGE_CHANGED, update);
    return () => { generation.current++; busyRef.current = false; window.removeEventListener(STORAGE_CHANGED, update); };
  }, []);
  const run = async (task: (assertCurrent: () => void) => Promise<void>) => {
    if (busyRef.current) return;
    const startedGeneration = generation.current;
    const isCurrent = () => generation.current === startedGeneration;
    const assertCurrent = () => { if (!isCurrent()) throw new Error("Opslagadapter gewijzigd."); };
    busyRef.current = true;
    setBusy(true); setError(""); setMessage("");
    try { await task(assertCurrent); }
    catch (e) { if (isCurrent()) setError(e instanceof Error ? e.message : String(e)); }
    finally { if (isCurrent()) { busyRef.current = false; setBusy(false); } }
  };
  if (!storage) return null;
  const binding = activeDocId ? bindings.current.get(activeDocId) : undefined;
  const save = async (newCopy: boolean, assertCurrent: () => void) => {
    const docId = activeDocId;
    if (!docId || active?.kind !== "project") throw new Error("Open of maak eerst een project");
    const content = await serializeActiveProject();
    assertCurrent();
    const saved = await storage.save({
      ...(newCopy || !binding ? {} : {id:binding.id,expectedVersion:binding.version}),
      name: active.meta.title || "Project", content,
    });
    assertCurrent();
    bindings.current.set(docId, saved);
    setMessage(`Opgeslagen: ${saved.name} (${saved.version})`);
    const nextItems = await storage.list();
    assertCurrent();
    setItems(nextItems);
  };
  return <>
    <div className="platform-project-toolbar"><button disabled={busy} onClick={() => {setOpen(true); void run(async check => { const next = await storage.list(); check(); setItems(next); });}}>Projecten op {storage.label}</button></div>
    <Modal open={open} onClose={() => {if (!busy) setOpen(false);}} title={`Projecten op ${storage.label}`} width={600}>
      <div style={{padding:16,display:"grid",gap:12}}>
        <label>Project<select disabled={busy} value={selected} onChange={e => {
          const id=e.target.value; setSelected(id); setVersion(""); setVersions([]);
          if (id) void run(async check => { const next = await storage.versions(id); check(); setVersions(next); });
        }}><option value="">Kies een project</option>{items.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
        <label>Versie<select disabled={busy || !selected} value={version} onChange={e=>setVersion(e.target.value)}><option value="">Laatste versie</option>{versions.map(p=><option key={p.version} value={p.version}>{p.version}{p.updatedAt ? ` — ${p.updatedAt}` : ""}</option>)}</select></label>
        <button disabled={busy || !selected} onClick={()=>void run(async check=>{
          const file=await storage.open(selected,version || undefined);
          check();
          await openProjectFromContent(file.content,`${file.name}.ifcgeo`);
          check();
          const docId=useCptStore.getState().activeDocId;
          if(docId && !version) bindings.current.set(docId,file);
          setMessage(version ? "Historische versie geopend; opslaan maakt een nieuw project." : "Project geopend.");
        })}>Openen</button>
        <button disabled={busy || active?.kind !== "project" || !binding} onClick={()=>void run(check=>save(false, check))}>Nieuwe versie opslaan</button>
        <button disabled={busy || active?.kind !== "project"} onClick={()=>void run(check=>save(true, check))}>Actief project als nieuw opslaan</button>
        {busy && <p role="status">Bezig…</p>}{error && <p role="alert">{error}</p>}{message && <p role="status">{message}</p>}
      </div>
    </Modal>
  </>;
}
