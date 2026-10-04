import { jsPDF } from "jspdf";
import QRCode from "qrcode";
import sharp from "sharp";
import { Resvg } from "@resvg/resvg-js";
import * as opentype from "opentype.js";
import fs from "fs";
import os from "os";
import path from "path";
import {
  BARLOW_CONDENSED_BOLD_TTF_B64,
  BARLOW_CONDENSED_REGULAR_TTF_B64,
  CORMORANT_BOLD_OTF_B64,
  CORMORANT_REGULAR_OTF_B64,
  DEJAVU_SANS_MONO_BOLD_TTF_B64,
  TICKET_DESIGN_JPG_B64,
} from "./ticket-fonts.generated";

export interface TicketPdfOptions {
  ticketCode: string;
  customerName: string;
  tierName: string;
  admitsCount?: number;
  orderNumber?: string;
  totalKes?: number;
  qrHash?: string;
  eventDate?: string;
  issuedDate?: string;
  venueName?: string;
  venueCity?: string;
  venueAddress?: string;
}

const ARTWORK_WIDTH = 927;
const ARTWORK_HEIGHT = 1152;
// 4:5 portrait PDF page dimensions in points (740 / 925 === 4 / 5)
const PDF_PAGE_WIDTH_PT = 740;
const PDF_PAGE_HEIGHT_PT = 925;

interface LoadedFontAssets {
  fontFiles: string[];
  barlowRegularFont: opentype.Font;
  barlowBoldFont: opentype.Font;
  monoBoldFont: opentype.Font;
}

let cachedFontAssets: LoadedFontAssets | null = null;
let cachedDesignImageBuffer: Buffer | null = null;

function readFileOrFallback(relPublicPath: string, fallbackBase64: string): Buffer {
  try {
    const diskPath = path.resolve(process.cwd(), relPublicPath);
    if (fs.existsSync(diskPath)) {
      const buf = fs.readFileSync(diskPath);
      if (buf.length > 1000) return buf;
    }
  } catch {
    // Fallback to embedded base64 buffer in serverless environment
  }
  return Buffer.from(fallbackBase64, "base64");
}

function ensureFontFileOnDisk(fileName: string, relPublicPath: string | null, buf: Buffer): string {
  if (relPublicPath) {
    try {
      const diskPath = path.resolve(process.cwd(), relPublicPath);
      if (fs.existsSync(diskPath) && fs.statSync(diskPath).size > 1000) {
        return diskPath;
      }
    } catch {
      // Fallback to tmpdir
    }
  }
  const tmpFontDir = path.join(os.tmpdir(), "rift-ticket-fonts");
  fs.mkdirSync(tmpFontDir, { recursive: true });
  const targetPath = path.join(tmpFontDir, fileName);
  if (!fs.existsSync(targetPath) || fs.statSync(targetPath).size !== buf.length) {
    fs.writeFileSync(targetPath, buf);
  }
  return targetPath;
}

function parseOpentypeFont(buf: Buffer): opentype.Font {
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  const parseFn =
    typeof opentype.parse === "function"
      ? opentype.parse
      : (opentype as unknown as { default: typeof opentype }).default.parse;
  return parseFn(ab);
}

function getFontAssets(): LoadedFontAssets {
  if (cachedFontAssets) return cachedFontAssets;

  const barlowRegularBuf = readFileOrFallback(
    "public/fonts/BarlowCondensed-Regular.ttf",
    BARLOW_CONDENSED_REGULAR_TTF_B64,
  );
  const barlowBoldBuf = readFileOrFallback(
    "public/fonts/BarlowCondensed-Bold.ttf",
    BARLOW_CONDENSED_BOLD_TTF_B64,
  );
  const cormorantRegularBuf = readFileOrFallback(
    "public/fonts/Cormorant-Regular.otf",
    CORMORANT_REGULAR_OTF_B64,
  );
  const cormorantBoldBuf = readFileOrFallback(
    "public/fonts/Cormorant-Bold.otf",
    CORMORANT_BOLD_OTF_B64,
  );
  const monoBoldBuf = Buffer.from(DEJAVU_SANS_MONO_BOLD_TTF_B64, "base64");

  const fontFiles = [
    ensureFontFileOnDisk(
      "BarlowCondensed-Regular.ttf",
      "public/fonts/BarlowCondensed-Regular.ttf",
      barlowRegularBuf,
    ),
    ensureFontFileOnDisk(
      "BarlowCondensed-Bold.ttf",
      "public/fonts/BarlowCondensed-Bold.ttf",
      barlowBoldBuf,
    ),
    ensureFontFileOnDisk(
      "Cormorant-Regular.otf",
      "public/fonts/Cormorant-Regular.otf",
      cormorantRegularBuf,
    ),
    ensureFontFileOnDisk(
      "Cormorant-Bold.otf",
      "public/fonts/Cormorant-Bold.otf",
      cormorantBoldBuf,
    ),
    ensureFontFileOnDisk("DejaVuSansMono-Bold.ttf", null, monoBoldBuf),
  ];

  cachedFontAssets = {
    fontFiles,
    barlowRegularFont: parseOpentypeFont(barlowRegularBuf),
    barlowBoldFont: parseOpentypeFont(barlowBoldBuf),
    monoBoldFont: parseOpentypeFont(monoBoldBuf),
  };

  return cachedFontAssets;
}

function getDesignArtworkBuffer(): Buffer {
  if (cachedDesignImageBuffer) return cachedDesignImageBuffer;
  cachedDesignImageBuffer = readFileOrFallback("public/ticket-design.jpg", TICKET_DESIGN_JPG_B64);
  return cachedDesignImageBuffer;
}

function escapeXml(unsafe: string): string {
  return (unsafe || "").replace(/[<>&'"]/g, (c) => {
    switch (c) {
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case "&":
        return "&amp;";
      case "'":
        return "&apos;";
      case '"':
        return "&quot;";
      default:
        return c;
    }
  });
}

/**
 * Replaces unsupported characters with ASCII equivalents and ensures every glyph
 * exists in the target bundled TTF font (never allowing glyph index 0 / empty box).
 */
export function sanitizeForFont(raw: string, font: opentype.Font): string {
  const normalized = (raw || "")
    .replace(/[\u2018\u2019\u201B\u2032`]/g, "'")
    .replace(/[\u201C\u201D\u201F\u2033]/g, '"')
    .replace(/[\u2013\u2014\u2212]/g, "-")
    .replace(/\u2026/g, "...")
    .replace(/\u00A0/g, " ");

  let result = "";
  for (const ch of normalized) {
    if (ch === " ") {
      result += " ";
      continue;
    }
    const glyph = font.charToGlyph(ch);
    if (glyph && glyph.index > 0) {
      result += ch;
      continue;
    }
    // Decompose accented characters to base ASCII
    const ascii = ch
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^\x20-\x7E]/g, "");
    if (ascii) {
      for (const aCh of ascii) {
        const aGlyph = font.charToGlyph(aCh);
        if (aGlyph && aGlyph.index > 0) {
          result += aCh;
        }
      }
    }
  }
  return result.trim();
}

/**
 * Formats an issued date string to "31 Oct 2026" format.
 */
export function formatIssuedDate(input?: string): string {
  if (!input || !input.trim()) return "31 Oct 2026";
  const trimmed = input.trim();
  // Already in "DD MMM YYYY" format
  if (/^\d{1,2}\s+[A-Za-z]{3}\s+\d{4}$/.test(trimmed)) {
    return trimmed;
  }
  const parsed = new Date(trimmed);
  if (!Number.isNaN(parsed.getTime())) {
    const months = [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
    ];
    const day = parsed.getUTCDate();
    const month = months[parsed.getUTCMonth()] || "Oct";
    const year = parsed.getUTCFullYear();
    return `${day} ${month} ${year}`;
  }
  return "31 Oct 2026";
}

/**
 * Shrinks font size so the rendered advance width never exceeds maxWidthPx.
 */
function fitFontSize(
  text: string,
  font: opentype.Font,
  baseSizePx: number,
  minSizePx: number,
  maxWidthPx: number,
  letterSpacingPx = 0,
): number {
  if (!text) return baseSizePx;
  let size = baseSizePx;
  while (size > minSizePx) {
    const width =
      font.getAdvanceWidth(text, size) + Math.max(0, text.length - 1) * letterSpacingPx;
    if (width <= maxWidthPx) break;
    size -= 0.5;
  }
  return Math.max(minSizePx, Number(size.toFixed(1)));
}

interface PreparedTicketFields {
  buyerName: string;
  tierName: string;
  admitsText: string;
  ticketCode: string;
  orderNumber: string;
  issuedDate: string;
  footerLine: string;
  nameFontSize: number;
  tierFontSize: number;
  codeFontSize: number;
  orderFontSize: number;
  qrPayload: string;
}

function prepareTicketFields(options: TicketPdfOptions): PreparedTicketFields {
  const fonts = getFontAssets();
  const admitsCount = Math.max(1, Number(options.admitsCount) || 1);

  const buyerName =
    sanitizeForFont(options.customerName || "Valued Attendee", fonts.barlowBoldFont) ||
    "Valued Attendee";
  const tierName =
    sanitizeForFont(options.tierName || "General Admission", fonts.barlowBoldFont) ||
    "General Admission";
  const admitsText = sanitizeForFont(`Admits ${admitsCount}`, fonts.barlowRegularFont);
  const ticketCode =
    sanitizeForFont(options.ticketCode || "HR-2026", fonts.monoBoldFont) || "HR-2026";
  const rawOrder = (options.orderNumber || options.ticketCode || "").replace(/^#/, "");
  const orderNumber = sanitizeForFont(rawOrder, fonts.barlowRegularFont) || ticketCode;
  const issuedDate = sanitizeForFont(
    formatIssuedDate(options.issuedDate),
    fonts.barlowRegularFont,
  );
  const footerLine = sanitizeForFont(
    `Admits ${admitsCount} \u00B7 One entry per person \u00B7 Non-transferable`,
    fonts.barlowRegularFont,
  );

  // Shrink-to-fit calculations against artwork column bounds (927x1152 space)
  const nameFontSize = fitFontSize(buyerName, fonts.barlowBoldFont, 30, 13, 285);
  const tierFontSize = fitFontSize(tierName, fonts.barlowBoldFont, 26, 13, 240);
  const codeFontSize = fitFontSize(ticketCode, fonts.monoBoldFont, 28, 14, 340, 2);
  const orderFontSize = fitFontSize(orderNumber, fonts.barlowRegularFont, 17.5, 11.5, 110);

  const qrPayload = JSON.stringify({
    code: ticketCode,
    order: orderNumber,
    tier: tierName,
    holder: buyerName,
    admits: admitsCount,
    hash: options.qrHash || "SECURE-VERIFIED-HMAC",
    event: "HALLOWEEN_RIFT_2026",
  });

  return {
    buyerName,
    tierName,
    admitsText,
    ticketCode,
    orderNumber,
    issuedDate,
    footerLine,
    nameFontSize,
    tierFontSize,
    codeFontSize,
    orderFontSize,
    qrPayload,
  };
}

/**
 * Builds the dynamic SVG overlay (927x1152) containing ONLY the dynamic values:
 * - Opaque white rounded tile + QR code (dark on white, >= 4-module quiet margin)
 * - Buyer name (bold, left column below TICKET HOLDER)
 * - Tier name (bold) and "Admits N" (right column below TICKET TYPE)
 * - Ticket code (monospace, centred below RSVP CODE)
 * - Order # value and Issued date (31 Oct 2026) immediately after their labels
 * - Footer line: "Admits N · One entry per person · Non-transferable"
 */
async function buildDynamicOverlaySvg(fields: PreparedTicketFields): Promise<string> {
  const qrDataUrl = await QRCode.toDataURL(fields.qrPayload, {
    width: 196,
    margin: 4,
    errorCorrectionLevel: "M",
    color: {
      dark: "#000000",
      light: "#FFFFFF",
    },
  });

  const textColor = "#E4E4E3";

  return `<svg width="${ARTWORK_WIDTH}" height="${ARTWORK_HEIGHT}" viewBox="0 0 ${ARTWORK_WIDTH} ${ARTWORK_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
  <!-- Opaque white rounded tile inside top-centre QR frame -->
  <rect x="360" y="123" width="207" height="208" rx="18" ry="18" fill="#FFFFFF" />
  <image href="${qrDataUrl}" x="365.5" y="128.5" width="196" height="196" />

  <!-- Ticket Holder (left column below TICKET HOLDER label) -->
  <text
    x="268.5"
    y="1022"
    text-anchor="middle"
    font-family="Barlow Condensed"
    font-weight="700"
    font-size="${fields.nameFontSize}"
    fill="${textColor}"
  >${escapeXml(fields.buyerName)}</text>

  <!-- Ticket Type (right column below TICKET TYPE label: tier in bold, below it Admits N) -->
  <text
    x="674"
    y="1015"
    text-anchor="middle"
    font-family="Barlow Condensed"
    font-weight="700"
    font-size="${fields.tierFontSize}"
    fill="${textColor}"
  >${escapeXml(fields.tierName)}</text>
  <text
    x="674"
    y="1037"
    text-anchor="middle"
    font-family="Barlow Condensed"
    font-weight="400"
    font-size="19"
    fill="#D8D8D7"
  >${escapeXml(fields.admitsText)}</text>

  <!-- Ticket Code (centred below RSVP CODE label in monospace font) -->
  <text
    x="463.5"
    y="1093"
    text-anchor="middle"
    font-family="DejaVu Sans Mono"
    font-weight="700"
    font-size="${fields.codeFontSize}"
    letter-spacing="2"
    fill="${textColor}"
  >${escapeXml(fields.ticketCode)}</text>

  <!-- Order # and Issued values immediately after their labels -->
  <text
    x="166"
    y="1125"
    text-anchor="start"
    font-family="Barlow Condensed"
    font-weight="700"
    font-size="${fields.orderFontSize}"
    fill="${textColor}"
  >${escapeXml(fields.orderNumber)}</text>
  <text
    x="346"
    y="1125"
    text-anchor="start"
    font-family="Barlow Condensed"
    font-weight="700"
    font-size="17.5"
    fill="${textColor}"
  >${escapeXml(fields.issuedDate)}</text>

  <!-- Mask placeholder footer text in artwork and draw dynamic footer line -->
  <rect x="424" y="1108" width="412" height="22" fill="#393D3E" />
  <text
    x="832"
    y="1125"
    text-anchor="end"
    font-family="Barlow Condensed"
    font-weight="400"
    font-size="16.5"
    fill="#D8D8D7"
  >${escapeXml(fields.footerLine)}</text>
</svg>`;
}

/**
 * Renders the dynamic SVG overlay to a transparent PNG buffer using @resvg/resvg-js
 * with bundled TTF/OTF fonts explicitly loaded, system fonts disabled, and default family set.
 */
async function renderOverlayPngBuffer(fields: PreparedTicketFields): Promise<Buffer> {
  const fonts = getFontAssets();
  const overlaySvg = await buildDynamicOverlaySvg(fields);

  const resvg = new Resvg(overlaySvg, {
    fitTo: {
      mode: "width",
      value: ARTWORK_WIDTH,
    },
    font: {
      fontFiles: fonts.fontFiles,
      loadSystemFonts: false,
      defaultFontFamily: "Barlow Condensed",
      sansSerifFamily: "Barlow Condensed",
      serifFamily: "Cormorant",
      monospaceFamily: "DejaVu Sans Mono",
    },
  });

  return Buffer.from(resvg.render().asPng());
}

/**
 * Generates high-resolution JPEG ticket pass image by compositing the @resvg/resvg-js
 * overlay onto public/ticket-design.jpg.
 * Used by GET /api/tickets/:code/image and PDF generation.
 */
export async function generateTicketPassImageBuffer(options: TicketPdfOptions): Promise<Buffer> {
  const fields = prepareTicketFields(options);
  const overlayPng = await renderOverlayPngBuffer(fields);
  const designBuffer = getDesignArtworkBuffer();

  return await sharp(designBuffer)
    .resize(ARTWORK_WIDTH, ARTWORK_HEIGHT, { fit: "fill" })
    .composite([{ input: overlayPng, left: 0, top: 0 }])
    .jpeg({ quality: 94 })
    .toBuffer();
}

/**
 * Generates an SVG representation of the complete ticket pass.
 */
export async function generateTicketPassSvg(options: TicketPdfOptions): Promise<string> {
  const fields = prepareTicketFields(options);
  const overlaySvg = await buildDynamicOverlaySvg(fields);
  const designB64 = getDesignArtworkBuffer().toString("base64");
  const innerOverlay = overlaySvg
    .replace(/^<svg[^>]*>/i, "")
    .replace(/<\/svg>\s*$/i, "");

  return `<svg width="${ARTWORK_WIDTH}" height="${ARTWORK_HEIGHT}" viewBox="0 0 ${ARTWORK_WIDTH} ${ARTWORK_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
  <image href="data:image/jpeg;base64,${designB64}" x="0" y="0" width="${ARTWORK_WIDTH}" height="${ARTWORK_HEIGHT}" />
  ${innerOverlay}
</svg>`;
}

/**
 * Generates a 4:5 portrait PDF ticket pass with zero margins.
 * Embeds the high-res composited ticket image AND embeds the bundled TTF fonts into
 * the PDF stream with real extractable text at the exact matching coordinates.
 */
export async function generateTicketPdfBuffer(options: TicketPdfOptions): Promise<Buffer> {
  const fields = prepareTicketFields(options);
  const passImageBuffer = await generateTicketPassImageBuffer(options);

  const doc = new jsPDF({
    orientation: "portrait",
    unit: "pt",
    format: [PDF_PAGE_WIDTH_PT, PDF_PAGE_HEIGHT_PT],
    compress: true,
  });

  // Register bundled TTF fonts inside the PDF document so PDF text is real and never boxes
  doc.addFileToVFS("BarlowCondensed-Regular.ttf", BARLOW_CONDENSED_REGULAR_TTF_B64);
  doc.addFont("BarlowCondensed-Regular.ttf", "BarlowCondensed", "normal");
  doc.addFileToVFS("BarlowCondensed-Bold.ttf", BARLOW_CONDENSED_BOLD_TTF_B64);
  doc.addFont("BarlowCondensed-Bold.ttf", "BarlowCondensed", "bold");
  doc.addFileToVFS("DejaVuSansMono-Bold.ttf", DEJAVU_SANS_MONO_BOLD_TTF_B64);
  doc.addFont("DejaVuSansMono-Bold.ttf", "DejaVuSansMono", "bold");

  // Full-bleed 4:5 ticket pass image (zero margins)
  doc.addImage(passImageBuffer, "JPEG", 0, 0, PDF_PAGE_WIDTH_PT, PDF_PAGE_HEIGHT_PT);

  // Scale factor from 927x1152 artwork space to 740x925 pt PDF space
  const sx = PDF_PAGE_WIDTH_PT / ARTWORK_WIDTH;
  const sy = PDF_PAGE_HEIGHT_PT / ARTWORK_HEIGHT;

  // Write real extractable PDF text objects using the embedded TTF fonts
  doc.setFont("BarlowCondensed", "bold");
  doc.setFontSize(fields.nameFontSize * sy);
  doc.text(fields.buyerName, 268.5 * sx, 1022 * sy, {
    align: "center",
    renderingMode: "invisible",
  });

  doc.setFont("BarlowCondensed", "bold");
  doc.setFontSize(fields.tierFontSize * sy);
  doc.text(fields.tierName, 674 * sx, 1015 * sy, {
    align: "center",
    renderingMode: "invisible",
  });

  doc.setFont("BarlowCondensed", "normal");
  doc.setFontSize(19 * sy);
  doc.text(fields.admitsText, 674 * sx, 1037 * sy, {
    align: "center",
    renderingMode: "invisible",
  });

  doc.setFont("DejaVuSansMono", "bold");
  doc.setFontSize(fields.codeFontSize * sy);
  doc.text(fields.ticketCode, 463.5 * sx, 1093 * sy, {
    align: "center",
    renderingMode: "invisible",
  });

  doc.setFont("BarlowCondensed", "bold");
  doc.setFontSize(fields.orderFontSize * sy);
  doc.text(`Order # ${fields.orderNumber}`, 166 * sx, 1125 * sy, {
    align: "left",
    renderingMode: "invisible",
  });

  doc.setFont("BarlowCondensed", "bold");
  doc.setFontSize(17.5 * sy);
  doc.text(`Issued ${fields.issuedDate}`, 346 * sx, 1125 * sy, {
    align: "left",
    renderingMode: "invisible",
  });

  doc.setFont("BarlowCondensed", "normal");
  doc.setFontSize(16.5 * sy);
  doc.text(fields.footerLine, 832 * sx, 1125 * sy, {
    align: "right",
    renderingMode: "invisible",
  });

  return Buffer.from(doc.output("arraybuffer"));
}

/**
 * Alias kept for callers that import generatePureJsPdfTicket (such as email.server.ts fallback).
 * Uses the same unified 4:5 ticket renderer and bundled TTF fonts.
 */
export async function generatePureJsPdfTicket(options: TicketPdfOptions): Promise<Buffer> {
  return await generateTicketPdfBuffer(options);
}
