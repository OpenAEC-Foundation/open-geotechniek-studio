import type { Diagnostic } from "../validation/report";
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
      "UTF-16 wordt niet ondersteund. Sla het bronbestand op als UTF-8.",
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
          "Bron is geen geldige UTF-8; gedecodeerd als Windows-1252. Controleer de oorspronkelijke tekst.",
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
          message: `Windows-1252 byte 0x${value.toString(16)} omgezet naar Unicode (bytekolom).`,
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
