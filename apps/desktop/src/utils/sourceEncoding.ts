import i18next from "i18next";
import type { Diagnostic } from "../validation/report";

const m = (key: string, nl: string, vars?: Record<string, unknown>) =>
  i18next.t(`import:${key}`, { defaultValue: nl, ...vars }) as string;
export interface DecodedSource {
  text: string;
  diagnostics: Diagnostic[];
}
/** Fatal UTF-8 detection avoids replacement characters; legacy single-byte files
 * are decoded as Windows-1252 with an explicit, position-aware audit trail. */
export function decodeSource(bytes: Uint8Array): DecodedSource {
  if (
    (bytes[0] === 255 && bytes[1] === 254) ||
    (bytes[0] === 254 && bytes[1] === 255)
  )
    throw new Error(
      m("encoding.utf16Unsupported", "UTF-16 wordt niet ondersteund. Sla het bronbestand op als UTF-8."),
    );
  try {
    return {
      text: new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(
        bytes,
      ),
      diagnostics: [],
    };
  } catch {
    const diagnostics: Diagnostic[] = [
      {
        severity: "warning",
        code: "SOURCE_ENCODING",
        message:
          m("encoding.notUtf8", "Bron is geen geldige UTF-8; gedecodeerd als Windows-1252. Controleer de oorspronkelijke tekst."),
        line: 1,
        column: 1,
      },
    ];
    let line = 1,
      column = 1;
    for (const value of bytes) {
      if (value >= 128)
        diagnostics.push({
          severity: "warning",
          code: "ENCODING_CHARACTER",
          message: m("encoding.byteConverted", "Windows-1252 byte 0x{{hex}} omgezet naar Unicode (bytekolom).", { hex: value.toString(16) }),
          line,
          column,
        });
      if (value === 10) {
        line++;
        column = 1;
      } else column++;
    }
    return {
      text: new TextDecoder("windows-1252", { fatal: true }).decode(bytes),
      diagnostics,
    };
  }
}
export async function readSourceFile(path: string): Promise<DecodedSource> {
  const { readFile } = await import("@tauri-apps/plugin-fs");
  return decodeSource(await readFile(path));
}
