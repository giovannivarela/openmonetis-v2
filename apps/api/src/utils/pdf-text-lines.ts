import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

export class PdfTextError extends Error {
  readonly code = "INVALID_PDF";
}

/** Text items whose baselines differ by up to this many points belong to the same line. */
const sameLineTolerance = 2;

type PositionedText = { x: number; y: number; text: string };

function joinLines(items: PositionedText[]) {
  const lines: PositionedText[][] = [];
  for (const item of [...items].sort((a, b) => b.y - a.y || a.x - b.x)) {
    const current = lines.at(-1);
    if (current?.[0] && Math.abs(current[0].y - item.y) <= sameLineTolerance) current.push(item);
    else lines.push([item]);
  }
  return lines.map((line) =>
    line
      .sort((a, b) => a.x - b.x)
      .map((item) => item.text)
      .join(" "),
  );
}

/** Extracts the text of a PDF as lines in reading order (top to bottom, left to right), page by page. */
export async function extractPdfTextLines(pdf: Uint8Array): Promise<string[]> {
  const loadingTask = getDocument({ data: new Uint8Array(pdf), verbosity: 0 });
  const document = await loadingTask.promise.catch(() => {
    throw new PdfTextError("INVALID_PDF");
  });
  try {
    const lines: string[] = [];
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber++) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      const items: PositionedText[] = [];
      for (const item of content.items) {
        if (!("str" in item) || item.str.trim() === "") continue;
        items.push({ x: item.transform[4] ?? 0, y: item.transform[5] ?? 0, text: item.str.trim() });
      }
      lines.push(...joinLines(items));
    }
    return lines;
  } finally {
    await loadingTask.destroy();
  }
}
