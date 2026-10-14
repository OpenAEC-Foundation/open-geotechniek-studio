import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ProjectTreePanel } from "./ProjectTreePanel";
import { useCptStore, newProjectDocument } from "../../../store/useCptStore";
import { useCalculationsStore } from "../store";
import { parseGef } from "../../../types/gefParser";

beforeEach(() => {
  useCptStore.setState({ documents: [], activeDocId: null, cpts: new Map(), activeCptId: null });
  useCalculationsStore.setState({ byDoc: new Map(), activeCalcId: null });
});
afterEach(cleanup);

describe("paaldraagvermogen toevoegen", () => {
  it("maakt een project en een volledig ingevulde actieve berekening vanuit een lege werkruimte", () => {
    render(<ProjectTreePanel onAddClick={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Paaldraagvermogen toevoegen" }));
    const docId = useCptStore.getState().activeDocId!;
    expect(useCptStore.getState().documents).toHaveLength(1);
    const [calc] = useCalculationsStore.getState().getList(docId);
    expect(calc.moduleId).toBe("pile-bearing-capacity");
    expect(calc.input).toEqual(expect.objectContaining({ cptId: null, diameterMm: 219, standard: "nen-9997-2017" }));
    expect(useCalculationsStore.getState().activeCalcId).toBe(calc.id);
  });

  it("gebruikt het actieve project en de sondering met diens NAP-niveau", () => {
    newProjectDocument();
    const docId = useCptStore.getState().activeDocId!;
    const cpt = parseGef("#GEFID=1,1,0\n#TESTID=S1\n#ZID=31000,2.5\n#COLUMNINFO=1,m,diepte,1\n#COLUMNINFO=2,MPa,qc,2\n#EOH=\n0.1 2\n0.2 3", "S1.gef");
    useCptStore.setState({ cpts: new Map([[cpt.id, cpt]]), activeCptId: cpt.id });
    render(<ProjectTreePanel onAddClick={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Paaldraagvermogen toevoegen" }));
    expect(useCptStore.getState().documents).toHaveLength(1);
    expect(useCalculationsStore.getState().getList(docId)[0].input).toEqual(expect.objectContaining({ cptId: cpt.id, pileToeNap: -11.5, excavationNap: 2.5 }));
  });
});
