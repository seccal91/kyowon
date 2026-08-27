import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { getToken } from "next-auth/jwt";
import pool from "../../../lib/db";
import { parseAddress } from "../../../lib/address-parser";
import { REGION_MAP } from "../../../lib/regions";

export const runtime = "nodejs";

const BASE_UNIT_PRICE = 32000;

type ExcelRow = Record<string, unknown>;
type RawExcelRow = unknown[];
type ParsedDate = { iso: string; year: number; month: number; day: number };

function readExcel(buffer: Buffer) {
  const wb = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json<ExcelRow>(sheet, { defval: "" });
}

function readExcelRaw(buffer: Buffer): RawExcelRow[] {
  const wb = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json<RawExcelRow>(sheet, { header: 1, defval: "" });
}

function cleanCell(raw: unknown) {
  if (raw === undefined || raw === null) return "";
  const text = String(raw);
  return text
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function firstStr(row: ExcelRow, ...keys: string[]): string {
  for (const key of keys) {
    const value = row[key];
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      return String(value).trim();
    }
  }
  return "";
}

function firstNum(row: ExcelRow, ...keys: string[]): number {
  for (const key of keys) {
    const value = Number(row[key]);
    if (!Number.isNaN(value) && value !== 0) return value;
  }
  return 0;
}

function parseExcelDate(raw: unknown): ParsedDate | null {
  if (raw === null || raw === undefined || raw === "") return null;

  if (raw instanceof Date && !Number.isNaN(raw.getTime())) {
    const year = raw.getFullYear();
    const month = raw.getMonth() + 1;
    const day = raw.getDate();
    return {
      iso: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
      year,
      month,
      day,
    };
  }

  if (typeof raw === "number") {
    const decoded = XLSX.SSF.parse_date_code(raw);
    if (!decoded) return null;
    return {
      iso: `${decoded.y}-${String(decoded.m).padStart(2, "0")}-${String(decoded.d).padStart(2, "0")}`,
      year: decoded.y,
      month: decoded.m,
      day: decoded.d,
    };
  }

  const text = cleanCell(raw);
  const dashed = text.match(/^(\d{4})[-/.](\d{1,2})(?:[-/.](\d{1,2}))?/);
  if (dashed) {
    const year = Number(dashed[1]);
    const month = Number(dashed[2]);
    const day = Number(dashed[3] || 1);
    return {
      iso: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
      year,
      month,
      day,
    };
  }

  const compact = text.match(/^(\d{4})(\d{2})(\d{2})?$/);
  if (compact) {
    const year = Number(compact[1]);
    const month = Number(compact[2]);
    const day = Number(compact[3] || 1);
    return {
      iso: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
      year,
      month,
      day,
    };
  }

  return null;
}

function normalizeOrderType(rawType: unknown, rawNewFlag: unknown) {
  const orderType = cleanCell(rawType).replace(/\s+/g, "").toLowerCase();
  const newFlag = cleanCell(rawNewFlag).toUpperCase();

  if (orderType.includes("초도")) return "초도";
  if (orderType.includes("영업교재") || orderType.includes("영업")) return "영업교재";
  if (orderType.includes("신규") || orderType.includes("new") || orderType.includes("복회")) {
    return newFlag === "Y" ? "신규" : "복회";
  }
  if (orderType.includes("정규") || orderType.includes("regular")) return "정규";
  return orderType || "정규";
}

function isCancelled(raw: unknown) {
  const value = cleanCell(raw).toUpperCase();
  return value.includes("취소완료") || value.includes("취소") || value === "Y" || value === "YES";
}

function isHeaderRow(cols: RawExcelRow) {
  const joined = cols.map((value) => cleanCell(value)).join("|");
  return joined.includes("주문일") || joined.includes("조직코드") || joined.includes("수량");
}

async function ensureBaseTables(client: any) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS organizations (
      id BIGSERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      regions JSONB DEFAULT '[]'::jsonb,
      group_name TEXT DEFAULT '예외',
      business_unit_id BIGINT,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);
  await client.query(`ALTER TABLE organizations ADD COLUMN IF NOT EXISTS business_unit_id BIGINT`);

  await client.query(`
    CREATE TABLE IF NOT EXISTS merchant_mappings (
      merchant_code TEXT PRIMARY KEY,
      org_id BIGINT,
      contract_date DATE,
      member_count INT DEFAULT 0,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS orders (
      id BIGSERIAL PRIMARY KEY,
      source_id BIGINT,
      merchant_code TEXT,
      merchant_name TEXT,
      year INT,
      month INT,
      major TEXT,
      minor TEXT,
      revenue NUMERIC DEFAULT 0,
      quantity NUMERIC DEFAULT 0,
      raw JSONB,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);
  await client.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS merchant_name TEXT`);
  await client.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS order_date DATE`);
  await client.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS order_type TEXT`);
  await client.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS grade TEXT`);
  await client.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS cancelled BOOLEAN DEFAULT FALSE`);
}

async function importBranches(rows: ExcelRow[], client: any) {
  const results: string[] = [];
  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (const row of rows) {
    const orgName = firstStr(row, "지사명", "지사", "name", "조직명");
    if (!orgName) {
      skipped++;
      continue;
    }

    const regionRaw = firstStr(row, "지역", "region", "대분류", "주소");
    const minorRaw = firstStr(row, "중분류", "minor", "구군", "시군구");
    let major = "";
    let minor: string | null = null;

    if (regionRaw) {
      const parsed = parseAddress(`${regionRaw} ${minorRaw}`.trim());
      if (parsed) {
        major = parsed.major;
        minor = parsed.minor ?? (minorRaw || null);
      } else {
        for (const key of Object.keys(REGION_MAP)) {
          if (regionRaw.includes(key) || key.includes(regionRaw)) {
            major = key;
            break;
          }
        }
        minor = minorRaw || null;
      }
    }

    if (!major && regionRaw) {
      results.push(`[건너뜀] ${orgName}: 지역 파싱 실패 (${regionRaw})`);
      skipped++;
      continue;
    }

    const region = major ? { major, minor } : null;
    const existing = await client.query(`SELECT id, regions FROM organizations WHERE name = $1 LIMIT 1`, [orgName]);

    if (existing.rows.length === 0) {
      await client.query(
        `INSERT INTO organizations (name, regions, group_name) VALUES ($1, $2, '예외')`,
        [orgName, JSON.stringify(region ? [region] : [])]
      );
      results.push(`[생성] ${orgName}${region ? ` - ${major} ${minor ?? ""}` : ""}`);
      created++;
      continue;
    }

    if (!region) {
      results.push(`[이미있음] ${orgName} - 지역 없음`);
      skipped++;
      continue;
    }

    const org = existing.rows[0];
    const existingRegions: Array<{ major: string; minor: string | null }> = org.regions ?? [];
    const alreadyHas = existingRegions.some((item) => item.major === major && (item.minor ?? null) === (minor ?? null));
    if (alreadyHas) {
      results.push(`[이미있음] ${orgName} - ${major} ${minor ?? ""}`);
      skipped++;
      continue;
    }

    existingRegions.push(region);
    await client.query(`UPDATE organizations SET regions = $1 WHERE id = $2`, [JSON.stringify(existingRegions), org.id]);
    results.push(`[지역추가] ${orgName} - ${major} ${minor ?? ""}`);
    updated++;
  }

  return { created, updated, skipped, results };
}

async function importMerchants(rows: ExcelRow[], client: any) {
  const results: string[] = [];
  let mapped = 0;
  let skipped = 0;

  const orgRes = await client.query(`SELECT id, name, regions FROM organizations`);
  const orgs: Array<{ id: number; name: string; regions: Array<{ major: string; minor: string | null }> }> =
    orgRes.rows.map((row: any) => ({ id: Number(row.id), name: row.name, regions: row.regions ?? [] }));

  function findOrgByRegion(major: string, minor: string | null): number | null {
    for (const org of orgs) {
      for (const region of org.regions) {
        if (region.major === major && ((region.minor ?? null) === (minor ?? null) || !region.minor || !minor)) {
          return org.id;
        }
      }
    }
    for (const org of orgs) {
      if (org.regions.some((region) => region.major === major)) return org.id;
    }
    return null;
  }

  for (const row of rows) {
    const name = firstStr(row, "가맹점명", "교실명", "name", "상호", "상호명");
    const address = firstStr(row, "주소", "address", "소재지", "주소지");
    const code = firstStr(row, "코드", "조직코드", "code", "가맹점코드", "merchant_code");
    const memberCount = firstNum(row, "회원수", "members", "회원", "member_count");
    const contractDate = firstStr(row, "계약일", "contract_date", "계약");

    if (!code) {
      skipped++;
      results.push(`[건너뜀] 코드 없음 (${name || "이름 없음"})`);
      continue;
    }

    const parsed = address ? parseAddress(address) : null;
    const orgId = parsed ? findOrgByRegion(parsed.major, parsed.minor) : null;

    await client.query(
      `INSERT INTO merchant_mappings (merchant_code, org_id, member_count, contract_date)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (merchant_code) DO UPDATE SET
         org_id = COALESCE(EXCLUDED.org_id, merchant_mappings.org_id),
         member_count = EXCLUDED.member_count,
         contract_date = COALESCE(EXCLUDED.contract_date, merchant_mappings.contract_date)`,
      [code, orgId, memberCount, contractDate || null]
    );

    if (orgId) {
      mapped++;
      results.push(`[가맹점등록] ${code} ${name || ""} - 지사 자동 매핑`);
    } else {
      results.push(`[지사미매칭] ${code} ${name || ""}${parsed ? ` (${parsed.major} ${parsed.minor ?? ""})` : ""}`);
    }
  }

  return { mapped, skipped, results };
}

async function importOrders(buffer: Buffer, client: any) {
  const rows = readExcelRaw(buffer);
  const results: string[] = [];
  let inserted = 0;
  let skipped = 0;
  let cancelled = 0;
  let excluded = 0;

  for (const cols of rows) {
    if (isHeaderRow(cols)) {
      skipped++;
      continue;
    }

    const parsedDate = parseExcelDate(cols[1]); // B: 주문일
    const orderType = normalizeOrderType(cols[5], cols[6]); // F/G
    const merchantCode = cleanCell(cols[9]); // J: 조직코드
    const grade = cleanCell(cols[12]); // M: 학년
    const quantity = Number(cleanCell(cols[14])) || 0; // O: 수량
    const wasCancelled = isCancelled(cols[17]); // R: 취소여부

    if (!parsedDate || !merchantCode || quantity === 0) {
      skipped++;
      continue;
    }

    const isExcludedType = orderType === "초도" || orderType === "영업교재";
    if (isExcludedType) excluded++;
    if (wasCancelled) cancelled++;

    // 개인정보 최소화: 교실명, 원장명, 학생명, 교재명, 금액, raw row는 저장하지 않습니다.
    await client.query(
      `INSERT INTO orders (
         merchant_code, order_date, year, month, order_type, grade,
         revenue, quantity, cancelled
       )
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        merchantCode,
        parsedDate.iso,
        parsedDate.year,
        parsedDate.month,
        orderType,
        grade || null,
        quantity * BASE_UNIT_PRICE,
        quantity,
        wasCancelled,
      ]
    );

    inserted++;
    if (results.length < 200) {
      results.push(`[주문] ${merchantCode} ${parsedDate.iso} ${orderType} ${quantity}건${wasCancelled ? " (취소)" : ""}`);
    }
  }

  return {
    inserted,
    skipped,
    cancelled,
    excluded,
    results,
    message: `주문 ${inserted.toLocaleString()}건 등록, ${skipped.toLocaleString()}건 건너뜀`,
  };
}

export async function POST(req: NextRequest) {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  if (!token || token.role !== "admin") {
    return NextResponse.json({ message: "권한이 없습니다." }, { status: 401 });
  }

  let client;
  try {
    const formData = await req.formData();
    const file = formData.get("file");
    const mode = String(formData.get("mode") || "orders");

    if (!file || !(file instanceof File)) {
      return NextResponse.json({ message: "파일이 없습니다." }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const rows = readExcel(buffer);
    const rawRows = readExcelRaw(buffer);

    if (!rows.length && !rawRows.length) {
      return NextResponse.json({ message: "데이터가 없습니다." }, { status: 400 });
    }

    client = await pool.connect();
    await ensureBaseTables(client);

    let result: any;
    if (mode === "branches") {
      result = await importBranches(rows, client);
    } else if (mode === "merchants") {
      result = await importMerchants(rows, client);
    } else {
      result = await importOrders(buffer, client);
    }

    return NextResponse.json({ ok: true, rowCount: mode === "orders" ? rawRows.length : rows.length, ...result });
  } catch (err) {
    console.error("import error:", err);
    const message = err instanceof Error ? err.message : "알 수 없는 오류";
    return NextResponse.json({ message }, { status: 500 });
  } finally {
    if (client) client.release();
  }
}
