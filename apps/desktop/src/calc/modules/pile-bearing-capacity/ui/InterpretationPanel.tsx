// Aanpassingen van de grondlaaginterpretatie bij de sonderingstekening van de
// paalberekening. Het paneel zelf is gedeeld met de andere modules
// (calc/shared/interpretation/InterpretationEditor.tsx); hier komen de
// grondsoorten en de invoer van de paalberekening erbij.
import type { AppliedOverride, PileInput, SoilKind } from "../types";
import { SOIL_DEFAULTS, soilLabel } from "../catalog";
import { InterpretationEditor, type OverrideDraft as SharedDraft } from "../../../shared/interpretation/InterpretationEditor";

export { draftOf, draftProblem, emptyDraft, overrideOf, type DraftProblem } from "../../../shared/interpretation/InterpretationEditor";

/** Aanpassing in bewerking; `id` is null bij een nieuwe. */
export type OverrideDraft = SharedDraft<SoilKind>;

const SOIL_KINDS = Object.keys(SOIL_DEFAULTS) as SoilKind[];

interface Props {
  cptId: string;
  input: PileInput;
  /** Aanpassingen van deze sondering zoals ze in de berekening zijn verwerkt. */
  applied: AppliedOverride[];
  draft: OverrideDraft | null;
  setDraft: (draft: OverrideDraft | null) => void;
  onChange?: (next: PileInput) => void;
}

export function InterpretationPanel({ cptId, input, applied, draft, setDraft, onChange }: Props) {
  return (
    <InterpretationEditor<SoilKind>
      cptId={cptId} overrides={input.interpretationOverrides ?? []} applied={applied} draft={draft} setDraft={setDraft}
      soilKinds={SOIL_KINDS} soilLabel={soilLabel}
      onWrite={onChange && ((next) => onChange({ ...input, interpretationOverrides: next.length ? next : undefined }))}
    />
  );
}
