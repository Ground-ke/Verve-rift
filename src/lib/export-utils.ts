/**
 * Executive Data Export Utilities (CSV & PDF)
 * Supports Attendee Manifest and Financial Reconciliation reports.
 */

import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import type { DigitalTicketRecord } from "../server/tickets.server";

/**
 * Escapes values for standard RFC 4180 CSV compliance
 */
function escapeCsvValue(val: unknown): string {
  if (val === null || val === undefined) return '""';
  const str = String(val).replace(/"/g, '""');
  return `"${str}"`;
}

/**
 * Trigger direct client-side file download
 */
function triggerDownload(content: BlobPart, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// -----------------------------------------------------------------------------
// 1. ATTENDEE LIST EXPORTS (CSV & PDF)
// -----------------------------------------------------------------------------

export function exportAttendeeListCsv(tickets: DigitalTicketRecord[]): void {
  const headers = [
    "Ticket Code",
    "Attendee Name",
    "Ticket Tier",
    "Admits Count",
    "Check-in Status",
    "Scanned At",
    "Scanned By",
    "Buyer Email",
    "Buyer Phone",
    "Order Number",
    "Price (KES)",
    "Issued At",
  ];

  const rows = tickets.map((t) => [
    escapeCsvValue(t.ticketNumber),
    escapeCsvValue(t.attendeeName),
    escapeCsvValue(t.tierName),
    escapeCsvValue(t.admitsCount),
    escapeCsvValue(t.status.toUpperCase()),
    escapeCsvValue(t.usedAt ? new Date(t.usedAt).toLocaleString("en-KE") : "NOT CHECKED IN"),
    escapeCsvValue(t.scannedBy || "N/A"),
    escapeCsvValue(t.buyerEmail || "N/A"),
    escapeCsvValue(t.buyerPhone),
    escapeCsvValue(t.orderNumber),
    escapeCsvValue(t.priceKes),
    escapeCsvValue(new Date(t.issuedAt).toLocaleString("en-KE")),
  ]);

  // UTF-8 BOM for full Microsoft Excel compatibility
  const csvContent = "\uFEFF" + [headers.join(","), ...rows.map((r) => r.join(","))].join("\r\n");
  const filename = `Hauntings_Rift_Attendees_${new Date().toISOString().slice(0, 10)}.csv`;
  triggerDownload(csvContent, filename, "text/csv;charset=utf-8;");
}

export function exportAttendeeListPdf(tickets: DigitalTicketRecord[]): void {
  const doc = new jsPDF({
    orientation: "landscape",
    unit: "pt",
    format: "a4",
  });

  const primaryColor = [22, 20, 24]; // Dark slate
  const accentColor = [217, 119, 6]; // Amber gold

  // Header Banner
  doc.setFillColor(primaryColor[0], primaryColor[1], primaryColor[2]);
  doc.rect(0, 0, doc.internal.pageSize.width, 65, "F");

  // Title
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("HAUNTINGS OF THE RIFT — OFFICIAL ATTENDEE GATE MANIFEST", 40, 32);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(220, 220, 220);
  doc.text(
    `Generated: ${new Date().toLocaleString("en-KE")} | Venue: Top Cliff Lodge, Nakuru | Total Passes: ${tickets.length}`,
    40,
    48,
  );

  // Table Data
  const tableHeaders = [
    [
      "Ticket Code",
      "Attendee Name",
      "Tier",
      "Admits",
      "Status",
      "Scanned At",
      "Gate Staff",
      "Order #",
    ],
  ];

  const tableData = tickets.map((t) => [
    t.ticketNumber,
    t.attendeeName,
    t.tierName,
    String(t.admitsCount),
    t.status.toUpperCase(),
    t.usedAt
      ? new Date(t.usedAt).toLocaleTimeString("en-KE", { hour: "2-digit", minute: "2-digit" })
      : "—",
    t.scannedBy || "—",
    t.orderNumber,
  ]);

  autoTable(doc, {
    head: tableHeaders,
    body: tableData,
    startY: 80,
    theme: "striped",
    headStyles: {
      fillColor: [35, 30, 42],
      textColor: [255, 255, 255],
      fontStyle: "bold",
      fontSize: 8,
    },
    bodyStyles: {
      fontSize: 8,
      textColor: [40, 40, 40],
    },
    alternateRowStyles: {
      fillColor: [248, 248, 250],
    },
    margin: { left: 40, right: 40 },
    didDrawCell: (data) => {
      // Colorize check-in status
      if (data.section === "body" && data.column.index === 4) {
        const val = String(data.cell.raw);
        if (val === "USED") {
          doc.setTextColor(22, 101, 52); // green
        } else if (val === "VALID") {
          doc.setTextColor(194, 65, 12); // amber
        } else {
          doc.setTextColor(185, 28, 28); // red
        }
      }
    },
  });

  const filename = `Hauntings_Rift_Attendees_${new Date().toISOString().slice(0, 10)}.pdf`;
  doc.save(filename);
}

// -----------------------------------------------------------------------------
// 2. FINANCIAL RECONCILIATION EXPORTS (CSV & PDF)
// -----------------------------------------------------------------------------

export interface FinancialReconciliationRecord {
  transactionId: string;
  orderNumber: string;
  gatewayRef: string;
  attendeeName: string;
  tierName: string;
  amountKes: number;
  gatewayFeeKes: number;
  netRevenueKes: number;
  status: "Matched" | "Discrepancy" | "Refunded" | "Pending Settlement";
  createdAt: string;
}

export interface FinancialSummaryTotals {
  grossRevenueKes: number;
  totalRefundsKes: number;
  platformFeesKes: number;
  netRevenueKes: number;
  totalTicketsSold: number;
  totalRefundsCount: number;
}

export function exportFinancialReconciliationCsv(
  transactions: FinancialReconciliationRecord[],
  totals?: FinancialSummaryTotals,
): void {
  const headers = [
    "Date & Time",
    "Gateway Ref / M-Pesa",
    "Order ID",
    "Customer Name",
    "Ticket Tier",
    "Gross Amount (KES)",
    "Gateway Fee (KES)",
    "Net Payout (KES)",
    "Reconciliation Status",
  ];

  const rows = transactions.map((t) => [
    escapeCsvValue(new Date(t.createdAt).toLocaleString("en-KE")),
    escapeCsvValue(t.gatewayRef),
    escapeCsvValue(t.orderNumber),
    escapeCsvValue(t.attendeeName),
    escapeCsvValue(t.tierName),
    escapeCsvValue(t.amountKes),
    escapeCsvValue(t.gatewayFeeKes),
    escapeCsvValue(t.netRevenueKes),
    escapeCsvValue(t.status),
  ]);

  let summarySection = "";
  if (totals) {
    summarySection = [
      "",
      "--- FINANCIAL RECONCILIATION SUMMARY ---",
      `Gross Volume (KES),${totals.grossRevenueKes}`,
      `Total Refunds (KES),${totals.totalRefundsKes}`,
      `Gateway Fees (KES),${totals.platformFeesKes}`,
      `Net Settled Revenue (KES),${totals.netRevenueKes}`,
      `Total Tickets Issued,${totals.totalTicketsSold}`,
      "",
    ].join("\r\n");
  }

  const csvContent =
    "\uFEFF" +
    (summarySection ? summarySection + "\r\n" : "") +
    [headers.join(","), ...rows.map((r) => r.join(","))].join("\r\n");

  const filename = `Hauntings_Rift_Financial_Reconciliation_${new Date().toISOString().slice(0, 10)}.csv`;
  triggerDownload(csvContent, filename, "text/csv;charset=utf-8;");
}

export function exportFinancialReconciliationPdf(
  transactions: FinancialReconciliationRecord[],
  totals: FinancialSummaryTotals,
): void {
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "pt",
    format: "a4",
  });

  const primaryColor = [22, 20, 24]; // Dark slate
  const pageWidth = doc.internal.pageSize.width;

  // Header Banner
  doc.setFillColor(primaryColor[0], primaryColor[1], primaryColor[2]);
  doc.rect(0, 0, pageWidth, 75, "F");

  // Title
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.text("HAUNTINGS OF THE RIFT 2026 — FINANCIAL RECONCILIATION", 36, 32);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(210, 210, 210);
  doc.text(
    `Financial Reconciliation Report | Presenter: Verve & Co. | Generated: ${new Date().toLocaleString("en-KE")}`,
    36,
    50,
  );

  // Financial KPI Summary Boxes
  const cardY = 90;
  const cardW = (pageWidth - 72 - 30) / 4;
  const cardH = 50;

  const kpis = [
    {
      label: "GROSS REVENUE",
      val: `KES ${totals.grossRevenueKes.toLocaleString()}`,
      color: [30, 41, 59],
    },
    {
      label: "TOTAL REFUNDS",
      val: `KES ${totals.totalRefundsKes.toLocaleString()}`,
      color: [153, 27, 27],
    },
    {
      label: "GATEWAY FEES",
      val: `KES ${totals.platformFeesKes.toLocaleString()}`,
      color: [180, 83, 9],
    },
    {
      label: "NET SETTLED",
      val: `KES ${totals.netRevenueKes.toLocaleString()}`,
      color: [21, 128, 61],
    },
  ];

  kpis.forEach((kpi, idx) => {
    const x = 36 + idx * (cardW + 10);
    doc.setFillColor(245, 245, 247);
    doc.roundedRect(x, cardY, cardW, cardH, 4, 4, "F");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(100, 100, 100);
    doc.text(kpi.label, x + 8, cardY + 16);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(kpi.color[0], kpi.color[1], kpi.color[2]);
    doc.text(kpi.val, x + 8, cardY + 36);
  });

  // Table Data
  const tableHeaders = [
    [
      "Date",
      "M-Pesa / Ref",
      "Order #",
      "Attendee",
      "Gross (KES)",
      "Fee (KES)",
      "Net (KES)",
      "Status",
    ],
  ];

  const tableData = transactions.map((t) => [
    new Date(t.createdAt).toLocaleDateString("en-KE", { month: "short", day: "numeric" }),
    t.gatewayRef,
    t.orderNumber,
    t.attendeeName,
    t.amountKes.toLocaleString(),
    t.gatewayFeeKes.toLocaleString(),
    t.netRevenueKes.toLocaleString(),
    t.status,
  ]);

  autoTable(doc, {
    head: tableHeaders,
    body: tableData,
    startY: 155,
    theme: "striped",
    headStyles: {
      fillColor: [30, 26, 36],
      textColor: [255, 255, 255],
      fontStyle: "bold",
      fontSize: 8,
    },
    bodyStyles: {
      fontSize: 8,
      textColor: [40, 40, 40],
    },
    alternateRowStyles: {
      fillColor: [248, 248, 250],
    },
    margin: { left: 36, right: 36 },
    didDrawCell: (data) => {
      if (data.section === "body" && data.column.index === 7) {
        const val = String(data.cell.raw);
        if (val === "Matched") {
          doc.setTextColor(21, 128, 61);
        } else if (val === "Refunded") {
          doc.setTextColor(185, 28, 28);
        } else {
          doc.setTextColor(194, 65, 12);
        }
      }
    },
  });

  const filename = `Hauntings_Rift_Financial_Reconciliation_${new Date().toISOString().slice(0, 10)}.pdf`;
  doc.save(filename);
}

export const exportFinancialReportPDF = exportFinancialReconciliationPdf;
export const exportFinancialLedgerCSV = exportFinancialReconciliationCsv;
export const exportAttendeeListCSV = exportAttendeeListCsv;
export const exportAttendeeListPDF = exportAttendeeListPdf;
