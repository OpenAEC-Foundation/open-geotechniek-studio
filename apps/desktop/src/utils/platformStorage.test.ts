import { describe, expect, it, afterEach } from "vitest";
import { getPlatformStorage, registerPlatformStorage } from "./platformStorage";

afterEach(() => registerPlatformStorage(undefined));
describe("opslagcontract voor de site", () => {
  it("heeft geen externe opslag zonder geregistreerde adapter", () => {
    expect(getPlatformStorage()).toBeUndefined();
  });
  it("weigert onvolledige adapters", () => {
    expect(() => registerPlatformStorage({version:1} as never)).toThrow(/opslagadapter/i);
  });
  it("geeft versie-identiteit ongewijzigd door voor conflictcontrole", async () => {
    let saved: unknown;
    registerPlatformStorage({version:1,label:"Projectsite",list:async()=>[],open:async(id,version)=>({id,version:version ?? "v2",name:"A",content:"{}"}),versions:async()=>[],save:async request=>{saved=request;return {id:"a",version:"v3",name:request.name};}});
    const storage=getPlatformStorage()!;
    const file=await storage.open("a","v1");
    expect(file.version).toBe("v1");
    await storage.save({id:"a",expectedVersion:"v2",name:"A",content:"{}"});
    expect(saved).toEqual({id:"a",expectedVersion:"v2",name:"A",content:"{}"});
  });
});
