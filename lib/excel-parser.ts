import * as XLSX from "xlsx";

export type ExcelRow = Record<string, unknown>;

export interface ParsedSheet {
  headers: string[];
  rows: ExcelRow[];
  missingRequired: string[];
}

export function parseExcelMatrix(buffer: Buffer): unknown[][] {
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  return XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: null });
}

function cleanHeader(value: unknown): string {
  return String(value ?? "").trim().replace(/\s+/g, "");
}

export function cellToStr(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return toIsoDate(value) ?? "";
  return String(value).trim();
}

export function cellToDate(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;

  if (value instanceof Date) return toIsoDate(value);

  if (typeof value === "number") {
    const decoded = XLSX.SSF.parse_date_code(value);
    if (!decoded) return null;
    return `${decoded.y}-${String(decoded.m).padStart(2, "0")}-${String(decoded.d).padStart(2, "0")}`;
  }

  const text = String(value).trim();
  const normalized = text.replace(/[./]/g, "-");

  const dashed = normalized.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (dashed) {
    return `${dashed[1]}-${String(dashed[2]).padStart(2, "0")}-${String(dashed[3]).padStart(2, "0")}`;
  }

  const compact = text.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (compact) return `${compact[1]}-${compact[2]}-${compact[3]}`;

  if (/^\d{1,5}$/.test(text)) {
    const decoded = XLSX.SSF.parse_date_code(Number(text));
    if (decoded) return `${decoded.y}-${String(decoded.m).padStart(2, "0")}-${String(decoded.d).padStart(2, "0")}`;
  }

  return null;
}

export function cellToNum(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const num = Number(String(value).replace(/,/g, "").trim());
  return Number.isFinite(num) ? num : null;
}

export function parseExcelByHeader(buffer: Buffer, requiredCols: string[]): ParsedSheet {
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rawRows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: null });

  if (!rawRows.length) return { headers: [], rows: [], missingRequired: requiredCols };

  const headers = (rawRows[0] as unknown[]).map(cleanHeader);
  const headerSet = new Set(headers);
  const missingRequired = requiredCols.filter((col) => !headerSet.has(cleanHeader(col)));
  if (missingRequired.length) return { headers, rows: [], missingRequired };

  const rows: ExcelRow[] = [];
  for (let i = 1; i < rawRows.length; i++) {
    const raw = rawRows[i] as unknown[];
    if (!raw || raw.every((value) => value === null || value === undefined || value === "")) continue;

    const row: ExcelRow = {};
    headers.forEach((header, index) => {
      if (header) row[header] = raw[index] ?? null;
    });
    rows.push(row);
  }

  return { headers, rows, missingRequired: [] };
}

export function pick(row: ExcelRow, aliases: string[]): unknown {
  for (const alias of aliases) {
    const key = cleanHeader(alias);
    if (Object.prototype.hasOwnProperty.call(row, key)) return row[key];
  }
  return undefined;
}

export function normalizeOrderType(rawType: unknown, rawNewFlag?: unknown): string {
  const text = cellToStr(rawType).replace(/\s+/g, "");
  const newFlag = cellToStr(rawNewFlag).toUpperCase();

  if (text.includes("초도")) return "초도";
  if (text.includes("영업교재")) return "영업교재";
  if (text.includes("정규")) return "정규";
  if (text.includes("신규") || text.includes("복회")) {
    if (newFlag === "Y") return "신규";
    if (newFlag === "N") return "복회";
    return text.includes("복회") && !text.includes("신규") ? "복회" : "신규";
  }
  return text || "정규";
}

/** 숫자 코드만 4자리 zero-pad. 비숫자("A12345" 등)는 그대로 반환 */
export function normalizeMerchantCode(raw: string): string {
  const s = String(raw || "").trim();
  if (/^\d+$/.test(s)) return s.padStart(4, "0");
  return s;
}

/** DB 조회용 variant 배열. "0001"→["0001","1"], "A1"→["A1"] */
export function merchantCodeVariants(normalized: string): string[] {
  if (/^\d+$/.test(normalized)) {
    return [...new Set([normalized, String(parseInt(normalized, 10))])];
  }
  return [normalized];
}

export function isCancelled(value: unknown): boolean {
  const text = cellToStr(value).toUpperCase();
  return text.includes("취소완료") || text === "Y" || text === "YES" || text === "TRUE" || text === "1";
}

function toIsoDate(date: Date): string | null {
  if (Number.isNaN(date.getTime())) return null;
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
