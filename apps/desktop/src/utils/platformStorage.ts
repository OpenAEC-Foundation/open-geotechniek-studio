export interface PlatformProject { id: string; name: string; version: string; updatedAt?: string }
export interface PlatformFile extends PlatformProject { content: string }
export interface PlatformStorage {
  version: 1;
  label: string;
  list(): Promise<PlatformProject[]>;
  open(id: string, version?: string): Promise<PlatformFile>;
  /** Bij id is expectedVersion verplicht; de host weigert conflicterende wijzigingen. */
  save(request: { id?: string; expectedVersion?: string; name: string; content: string }): Promise<PlatformProject>;
  versions(id: string): Promise<PlatformProject[]>;
}

declare global {
  var openGeotechniekStorage: PlatformStorage | undefined;
}
export const STORAGE_CHANGED = "ogs:storage-adapter-changed";

function validate(adapter: PlatformStorage | undefined) {
  if (adapter && (adapter.version !== 1 || typeof adapter.label !== "string" ||
    ![adapter.list, adapter.open, adapter.save, adapter.versions].every(fn => typeof fn === "function"))) {
    throw new Error("Ongeldige opslagadapter: versie 1 vereist lijst, openen, opslaan en versies");
  }
}

/** De host injecteert de adapter vóór het laden, of registreert hem via deze functie. */
export function registerPlatformStorage(adapter: PlatformStorage | undefined) {
  validate(adapter);
  globalThis.openGeotechniekStorage = adapter;
  if (typeof window !== "undefined") window.dispatchEvent(new Event(STORAGE_CHANGED));
}

export function getPlatformStorage(): PlatformStorage | undefined {
  const adapter = globalThis.openGeotechniekStorage;
  validate(adapter);
  return adapter;
}
