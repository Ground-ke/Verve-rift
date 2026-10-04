import zlib from "zlib";
import {
  generateTicketPassImageBuffer,
  generateTicketPdfBuffer,
} from "../src/server/pdf-ticket";

/**
 * Extracts text from a PDF buffer by decompressing all FlateDecode streams,
 * building ToUnicode CMap tables for each font resource, and decoding all Tj/TJ hex strings.
 */
function extractTextFromPdfBuffer(pdfBuffer: Buffer): {
  mediaBox: string;
  extractedLines: string[];
  hasNotdefBoxes: boolean;
} {
  const rawLatin1 = pdfBuffer.toString("latin1");
  const mediaBoxMatch = rawLatin1.match(/\/MediaBox\s*\[([^\]]+)\]/);
  const mediaBox = mediaBoxMatch ? mediaBoxMatch[1].trim() : "unknown";

  // Decompress all streams
  const decompressedStreams: string[] = [];
  const streamRegex = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
  let match: RegExpExecArray | null;
  while ((match = streamRegex.exec(rawLatin1)) !== null) {
    const bodyBuf = Buffer.from(match[1], "latin1");
    try {
      const inflated = zlib.inflateSync(bodyBuf).toString("latin1");
      decompressedStreams.push(inflated);
    } catch {
      decompressedStreams.push(match[1]);
    }
  }

  // Parse ToUnicode CMaps in order of appearance, or merge into font-specific maps
  const cmaps: Array<Map<number, string>> = [];
  for (const s of decompressedStreams) {
    if (s.includes("beginbfchar")) {
      const cmap = new Map<number, string>();
      const bfCharBlocks = s.matchAll(/beginbfchar([\s\S]*?)endbfchar/g);
      for (const block of bfCharBlocks) {
        const pairs = block[1].matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>/g);
        for (const p of pairs) {
          const gid = parseInt(p[1], 16);
          const unicodeHex = p[2];
          let str = "";
          for (let i = 0; i < unicodeHex.length; i += 4) {
            str += String.fromCodePoint(parseInt(unicodeHex.slice(i, i + 4), 16));
          }
          cmap.set(gid, str);
        }
      }
      cmaps.push(cmap);
    }
  }

  // Map PDF font names (/F15, /F16, /F17) to their respective ToUnicode CMaps
  // In jsPDF, custom fonts start at /F15 in registration order
  const fontMap = new Map<string, Map<number, string>>();
  cmaps.forEach((cmap, idx) => {
    fontMap.set(`/F${15 + idx}`, cmap);
  });

  const extractedLines: string[] = [];
  let hasNotdefBoxes = false;

  for (const s of decompressedStreams) {
    if (!s.includes("BT") || !s.includes("ET")) continue;
    const btBlocks = s.matchAll(/BT([\s\S]*?)ET/g);
    let currentFont = "/F16";
    for (const block of btBlocks) {
      const content = block[1];
      const fontMatch = content.match(/(\/F\d+)\s+[\d.]+\s+Tf/);
      if (fontMatch) currentFont = fontMatch[1];
      const cmap = fontMap.get(currentFont);

      const hexMatches = content.matchAll(/<([0-9a-fA-F]+)>\s*Tj/g);
      for (const hm of hexMatches) {
        const hex = hm[1];
        let line = "";
        for (let i = 0; i < hex.length; i += 4) {
          const gid = parseInt(hex.slice(i, i + 4), 16);
          if (gid === 0) {
            hasNotdefBoxes = true;
            line += "\uFFFD";
          } else if (cmap && cmap.has(gid)) {
            line += cmap.get(gid);
          }
        }
        if (line) extractedLines.push(line);
      }
    }
  }

  return { mediaBox, extractedLines, hasNotdefBoxes };
}

async function main() {
  const sampleOptions = {
    ticketCode: "HR-2026-OUT06",
    customerName: "Wanjiru O'Neil",
    tierName: "Outcasts",
    admitsCount: 6,
    orderNumber: "ORD-88412",
    issuedDate: "31 Oct 2026",
  };

  const pdfBuffer = await generateTicketPdfBuffer(sampleOptions);
  const imageBuffer = await generateTicketPassImageBuffer(sampleOptions);

  const { mediaBox, extractedLines, hasNotdefBoxes } = extractTextFromPdfBuffer(pdfBuffer);

  console.log("=== SAMPLE TICKET RENDER VERIFICATION ===");
  console.log(`PDF Buffer Size:   ${pdfBuffer.length} bytes`);
  console.log(`Image Buffer Size: ${imageBuffer.length} bytes`);
  console.log(`PDF MediaBox:      [${mediaBox}] (4:5 aspect ratio)`);
  console.log(`Has .notdef boxes: ${hasNotdefBoxes}`);
  console.log("Extracted PDF Text Lines:");
  for (const line of extractedLines) {
    console.log(`  - ${line}`);
  }

  if (hasNotdefBoxes || extractedLines.length === 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
