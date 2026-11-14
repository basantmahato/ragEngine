import { extractText, getDocumentProxy } from "unpdf";
import type { PdfTextExtractor } from "../../types/ingestion.types.js";

export class UnpdfTextExtractor implements PdfTextExtractor {
  async extract(buffer: Buffer): Promise<string> {
    const pdf = await getDocumentProxy(new Uint8Array(buffer));
    const result = await extractText(pdf, { mergePages: true });
    return result.text.trim();
  }
}
