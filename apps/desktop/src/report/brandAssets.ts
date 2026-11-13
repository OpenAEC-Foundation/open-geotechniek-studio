// Bestanden van een huisstijl omzetten naar afbeeldingen die jsPDF kan tekenen.
//
// - Logo: PNG of JPEG blijft, SVG wordt een PNG.
// - Voorblad en briefpapier: de eerste pagina van een PDF wordt een JPEG op A4 (150 dpi); PNG of JPEG blijft.
//   jsPDF kan geen PDF-pagina's invoegen, dus de achtergrond gaat als afbeelding het rapport in.

/** Leest een gekozen bestand als data-URL. */
export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("bestand niet leesbaar"));
    reader.readAsDataURL(file);
  });
}

function dataUrlBytes(dataUrl: string): Uint8Array {
  const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
  const bin = atob(base64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** SVG-logo naar PNG; PNG en JPEG blijven zoals ze zijn. */
export async function logoToImage(dataUrl: string, width = 1200): Promise<string> {
  if (/^data:image\/(png|jpe?g);/.test(dataUrl)) return dataUrl;
  if (!dataUrl.startsWith("data:image/svg+xml")) throw new Error("Logo moet PNG, JPEG of SVG zijn.");
  const img = new Image();
  img.src = dataUrl;
  await img.decode();
  const ratio = img.naturalWidth && img.naturalHeight ? img.naturalHeight / img.naturalWidth : 0.33;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = Math.max(1, Math.round(width * ratio));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Logo kan niet worden omgezet.");
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/png");
}

/** Eerste pagina van een PDF (of een PNG/JPEG) als paginagrote achtergrond. */
export async function pageToImage(dataUrl: string, dpi = 150): Promise<string> {
  if (/^data:image\/(png|jpe?g);/.test(dataUrl)) return dataUrl;
  if (!dataUrl.startsWith("data:application/pdf")) throw new Error("Kies een PDF, PNG of JPEG.");
  const { getDocument } = await import("../utils/pdfjsSetup");
  const pdf = await getDocument({ data: dataUrlBytes(dataUrl) }).promise;
  try {
    const page = await pdf.getPage(1);
    const viewport = page.getViewport({ scale: dpi / 72 });
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("PDF kan niet worden omgezet.");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport, canvas } as Parameters<typeof page.render>[0]).promise;
    return canvas.toDataURL("image/jpeg", 0.9);
  } finally {
    void pdf.cleanup();
  }
}
