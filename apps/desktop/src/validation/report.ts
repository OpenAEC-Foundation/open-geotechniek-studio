import type { Cpt } from "../types/cpt";
export const VALIDATION_KEY = "ogs:validation";
export interface Diagnostic {
  severity: "error" | "warning" | "info";
  code: string;
  message: string;
  line?: number;
  record?: number;
  column?: number;
}
export interface ValidationReport {
  format: string;
  diagnostics: Diagnostic[];
  records: number;
  points: number;
  voids: number;
  omittedRecords: number;
  depthMethod?: string;
  depthMethods?: Array<{record:number;method:string}>;
  measurementVariables?: Record<
    string,
    { value: number | null; unit: string; description: string }
  >;
  coordinateSystem?: { xy?: string; z?: string };
}
export function validationOf(cpt: Cpt): ValidationReport | null {
  try {
    return JSON.parse(cpt.metadata.extra?.[VALIDATION_KEY] ?? "null");
  } catch {
    return null;
  }
}
export function attachValidation(cpt: Cpt, report: ValidationReport): Cpt {
  return {
    ...cpt,
    metadata: {
      ...cpt.metadata,
      extra: {
        ...cpt.metadata.extra,
        [VALIDATION_KEY]: JSON.stringify(report),
      },
    },
  };
}
