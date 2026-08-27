import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import pool from "../../../../lib/db";
import { REGION_MAP } from "../../../../lib/regions";
import {
  cellToDate,
  cellToNum,
  cellToStr,
  isCancelled,
  merchantCodeVariants,
  normalizeMerchantCode,
  normalizeOrderType,
  parseExcelByHeader,
  parseExcelMatrix,
  pick,
} from "../../../../lib/excel-parser";

export const runtime = "nodejs";

type Mode = "merchants" | "merchant_patch" | "orders" | "branches";

const BASE_UNIT_PRICE = 32000;

const ALIASES = {
  merchantCode: ["조직코드", "가맹교실ID", "가맹점코드", "코드", "merchant_code", "code"],
  merchantName: ["교실명", "가맹점명", "가맹교실명", "상호", "name"],
  address: ["주소", "address"],
  contractDate: ["계약일", "계약일자", "contract_date"],
  terminationDate: ["해지일자", "해지일", "termination_date"],
  orderDate: ["주문일", "주문일자", "주문연도월일", "order_date", "date"],
  orderType: ["주문구분", "주문종류", "주문유형", "order_type", "type"],
  quantity: ["수량", "주문수", "quantity", "qty"],
  cancelled: ["취소여부", "취소", "cancelled"],
  grade: ["학년", "grade"],
  newFlag: ["신규여부", "신규", "new_flag"],
  branchName: ["지사명", "branch", "branch_name"],
  regionMajor: ["지역", "대분류", "시도", "주소(대분류)", "major"],
  regionMinor: ["중분류", "시군구", "주소(중분류)", "minor"],
};

function legacyOrderRowsFromMatrix(buffer: Buffer) {
  const matrix = parseExcelMatrix(buffer);
  const rows: Record<string, unknown>[] = [];
  for (let index = 0; index < matrix.length; index++) {
    const cols = matrix[index] || [];
    const orderDate = cols[1];
    const orderType = cols[5];
    const newFlag = cols[6];
    const merchantCode = cols[9];
    const grade = cols[12];
    const quantity = cols[14];
    const cancelled = cols[17];

    const joined = [orderDate, orderType, merchantCode, quantity].map(cellToStr).join("");
    if (!joined) continue;
    if (joined.includes("주문일") || joined.includes("조직코드") || joined.includes("가맹교실ID")) continue;

    rows.push({
      [ALIASES.orderDate[0]]: orderDate,
      [ALIASES.orderType[0]]: orderType,
      [ALIASES.newFlag[0]]: newFlag,
      [ALIASES.merchantCode[0]]: merchantCode,
      [ALIASES.grade[0]]: grade,
      [ALIASES.quantity[0]]: quantity,
      [ALIASES.cancelled[0]]: cancelled,
    });
  }
  return rows;
}

function hasAnyHeader(headers: string[], aliases: string[]) {
  const headerSet = new Set(headers.map((header) => header.replace(/\s+/g, "")));
  return aliases.some((alias) => headerSet.has(alias.replace(/\s+/g, "")));
}

async function ensureHistory(client: any) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS upload_history (
      id BIGSERIAL PRIMARY KEY,
      filename TEXT NOT NULL,
      mode TEXT NOT NULL,
      uploaded_at TIMESTAMP DEFAULT NOW(),
      uploaded_by TEXT,
      total_rows INT DEFAULT 0,
      inserted INT DEFAULT 0,
      updated INT DEFAULT 0,
      errors INT DEFAULT 0,
      skipped INT DEFAULT 0,
      unmatched INT DEFAULT 0
    )
  `);
  await client.query(`ALTER TABLE upload_history ADD COLUMN IF NOT EXISTS unmatched INT DEFAULT 0`);
}

async function ensureOrders(client: any) {
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
  await client.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS order_date DATE`);
  await client.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS order_type TEXT`);
  await client.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS grade TEXT`);
  await client.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS cancelled BOOLEAN DEFAULT FALSE`);
}

async function ensureMerchants(client: any) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS merchants (
      merchant_code TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      status TEXT DEFAULT 'active',
      contract_date DATE,
      termination_date DATE,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);
  await client.query(`
    CREATE TABLE IF NOT EXISTS merchant_mappings (
      merchant_code TEXT PRIMARY KEY,
      org_id BIGINT,
      contract_date DATE,
      member_count INT DEFAULT 0,
      major TEXT,
      minor TEXT,
      status TEXT DEFAULT 'active',
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);
  await client.query(`ALTER TABLE merchant_mappings ADD COLUMN IF NOT EXISTS major TEXT`);
  await client.query(`ALTER TABLE merchant_mappings ADD COLUMN IF NOT EXISTS minor TEXT`);
  await client.query(`ALTER TABLE merchant_mappings ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active'`);
}

async function confirmOrders(rows: Record<string, unknown>[], client: any) {
  await ensureOrders(client);

  let inserted = 0;
  let errors = 0;
  let skipped = 0;

  for (const row of rows) {
    try {
      const merchantCode = normalizeMerchantCode(cellToStr(pick(row, ALIASES.merchantCode)));
      const orderDate = cellToDate(pick(row, ALIASES.orderDate));
      const quantity = cellToNum(pick(row, ALIASES.quantity));
      const rawType = pick(row, ALIASES.orderType);
      const orderType = normalizeOrderType(rawType, pick(row, ALIASES.newFlag));
      const grade = cellToStr(pick(row, ALIASES.grade)) || null;
      const cancelled = isCancelled(pick(row, ALIASES.cancelled));

      if (!merchantCode || !orderDate || quantity === null || quantity === 0 || !cellToStr(rawType)) {
        skipped++;
        continue;
      }

      const date = new Date(`${orderDate}T00:00:00`);
      const year = date.getFullYear();
      const month = date.getMonth() + 1;

      await client.query(
        `INSERT INTO orders (
           merchant_code, order_date, year, month, order_type, grade, revenue, quantity, cancelled
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [merchantCode, orderDate, year, month, orderType, grade, Number(quantity) * BASE_UNIT_PRICE, quantity, cancelled]
      );
      inserted++;
    } catch (error) {
      console.error("order confirm row error:", error);
      errors++;
    }
  }

  return { inserted, updated: 0, errors, skipped };
}

function normalizeMajor(raw: string | null): string | null {
  if (!raw) return null;
  return Object.keys(REGION_MAP).find((r) => raw.includes(r) || r.includes(raw)) || raw;
}

async function confirmMerchants(rows: Record<string, unknown>[], client: any) {
  await ensureMerchants(client);

  const orgsRes = await client.query(`SELECT id, regions FROM organizations`);
  const regionToOrgId: Record<string, number> = {};
  for (const org of orgsRes.rows) {
    for (const region of org.regions || []) {
      regionToOrgId[`${region.major}||${region.minor}`] = Number(org.id);
    }
  }

  let inserted = 0;
  let updated = 0;
  let errors = 0;
  let skipped = 0;

  for (const row of rows) {
    try {
      const code = normalizeMerchantCode(cellToStr(pick(row, ALIASES.merchantCode)));
      const name = cellToStr(pick(row, ALIASES.merchantName));
      const contractDate = cellToDate(pick(row, ALIASES.contractDate));
      const terminationDate = cellToDate(pick(row, ALIASES.terminationDate));
      const status = terminationDate ? "terminated" : "active";

      if (!code) {
        errors++;
        continue;
      }

      // "1"/"0001" 모두 매칭하도록 variant 배열로 조회
      const variants = merchantCodeVariants(code);
      const existingRes = await client.query(
        `SELECT merchant_code FROM merchants WHERE merchant_code = ANY($1) LIMIT 1`,
        [variants]
      );
      const isNew = existingRes.rows.length === 0;
      // DB에 실제 저장된 코드 (예: "1") — UPDATE는 이 코드로, INSERT는 정규화 코드 사용
      const dbCode = isNew ? code : existingRes.rows[0].merchant_code;

      if (isNew && !name) {
        errors++;
        continue;
      }

      if (isNew) {
        await client.query(
          `INSERT INTO merchants (merchant_code, name, status, contract_date, termination_date)
           VALUES ($1, $2, $3, $4, $5)`,
          [code, name, status, contractDate, terminationDate]
        );
        inserted++;
      } else {
        const sets: string[] = [];
        const values: unknown[] = [dbCode];
        if (name) {
          sets.push(`name = $${values.length + 1}`);
          values.push(name);
        }
        if (contractDate) {
          sets.push(`contract_date = $${values.length + 1}`);
          values.push(contractDate);
        }
        if (terminationDate) {
          sets.push(`termination_date = $${values.length + 1}`);
          values.push(terminationDate);
          sets.push(`status = 'terminated'`);
        }
        if (sets.length > 0) {
          await client.query(`UPDATE merchants SET ${sets.join(", ")} WHERE merchant_code = $1`, values);
        }
        updated++;
      }

      const majorRaw = cellToStr(pick(row, ALIASES.regionMajor)) || null;
      const minor = cellToStr(pick(row, ALIASES.regionMinor)) || null;
      const major = normalizeMajor(majorRaw);
      let orgId: number | null = null;
      if (major && minor) {
        orgId = regionToOrgId[`${major}||${minor}`] ?? null;
      }

      const statusValue = terminationDate ? "terminated" : null;

      await client.query(
        `INSERT INTO merchant_mappings (merchant_code, org_id, major, minor, contract_date, status)
         VALUES ($1, $2, $3, $4, $5, COALESCE($6, 'active'))
         ON CONFLICT (merchant_code) DO UPDATE SET
           org_id = COALESCE(EXCLUDED.org_id, merchant_mappings.org_id),
           major = COALESCE(EXCLUDED.major, merchant_mappings.major),
           minor = COALESCE(EXCLUDED.minor, merchant_mappings.minor),
           contract_date = COALESCE(EXCLUDED.contract_date, merchant_mappings.contract_date),
           status = CASE WHEN $6 IS NOT NULL THEN $6 ELSE merchant_mappings.status END`,
        [dbCode, orgId, major, minor, contractDate, statusValue]
      );
    } catch (error) {
      console.error("merchant confirm row error:", error);
      errors++;
    }
  }

  return { inserted, updated, errors, skipped };
}

async function confirmMerchantPatch(rows: Record<string, unknown>[], client: any) {
  await ensureMerchants(client);

  const orgsRes = await client.query(`SELECT id, regions FROM organizations`);
  const regionToOrgId: Record<string, number> = {};
  for (const org of orgsRes.rows) {
    for (const region of org.regions || []) {
      regionToOrgId[`${region.major}||${region.minor}`] = Number(org.id);
    }
  }

  let updated = 0;
  let unmatched = 0;
  let errors = 0;
  let skipped = 0;

  for (const row of rows) {
    try {
      const code = normalizeMerchantCode(cellToStr(pick(row, ALIASES.merchantCode)));
      const name = cellToStr(pick(row, ALIASES.merchantName));
      const directMajorRaw = cellToStr(pick(row, ALIASES.regionMajor)) || null;
      const directMinor = cellToStr(pick(row, ALIASES.regionMinor)) || null;
      const directMajor = normalizeMajor(directMajorRaw);

      if (!code) {
        errors++;
        continue;
      }

      const variants = merchantCodeVariants(code);
      const existingRes = await client.query(
        `SELECT merchant_code FROM merchants WHERE merchant_code = ANY($1) LIMIT 1`,
        [variants]
      );
      if (existingRes.rows.length === 0) {
        unmatched++;
        continue;
      }
      const dbCode = existingRes.rows[0].merchant_code;

      let hasChange = false;

      if (name) {
        await client.query(`UPDATE merchants SET name = $2 WHERE merchant_code = $1`, [dbCode, name]);
        hasChange = true;
      }

      const orgId =
        directMajor && directMinor ? (regionToOrgId[`${directMajor}||${directMinor}`] ?? null) : null;

      await client.query(
        `INSERT INTO merchant_mappings (merchant_code, org_id, major, minor, status)
         VALUES ($1, $2, $3, $4, 'active')
         ON CONFLICT (merchant_code) DO UPDATE SET
           org_id = CASE WHEN $2 IS NOT NULL THEN $2 ELSE merchant_mappings.org_id END,
           major = CASE WHEN $3 IS NOT NULL THEN $3 ELSE merchant_mappings.major END,
           minor = CASE WHEN $4 IS NOT NULL THEN $4 ELSE merchant_mappings.minor END`,
        [dbCode, orgId, directMajor, directMinor]
      );
      if (directMajor || directMinor) hasChange = true;

      if (hasChange) updated++;
      else skipped++;
    } catch (error) {
      console.error("merchant patch row error:", error);
      errors++;
    }
  }

  return { inserted: 0, updated, errors, skipped, unmatched };
}

async function confirmBranches(rows: Record<string, unknown>[], client: any) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS organizations (
      id BIGSERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      regions JSONB DEFAULT '[]'::jsonb,
      group_name TEXT DEFAULT '예외',
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);

  let inserted = 0;
  let updated = 0;
  let errors = 0;
  let skipped = 0;

  for (const row of rows) {
    try {
      const name = cellToStr(pick(row, ALIASES.branchName));
      const majorRaw = cellToStr(pick(row, ALIASES.regionMajor));
      const minor = cellToStr(pick(row, ALIASES.regionMinor)) || null;
      if (!name) {
        errors++;
        continue;
      }

      const major = Object.keys(REGION_MAP).find((region) => majorRaw.includes(region) || region.includes(majorRaw)) || "";
      const existing = await client.query(`SELECT id, regions FROM organizations WHERE name = $1`, [name]);
      const regionArray = major ? [{ major, minor }] : [];

      if (existing.rows.length === 0) {
        await client.query(`INSERT INTO organizations (name, regions, group_name) VALUES ($1, $2, '예외')`, [
          name,
          JSON.stringify(regionArray),
        ]);
        inserted++;
      } else if (regionArray.length > 0) {
        const current = existing.rows[0].regions ?? [];
        const hasRegion = current.some((region: any) => region.major === major && region.minor === minor);
        if (hasRegion) {
          skipped++;
        } else {
          current.push({ major, minor });
          await client.query(`UPDATE organizations SET regions = $1 WHERE id = $2`, [
            JSON.stringify(current),
            existing.rows[0].id,
          ]);
          updated++;
        }
      } else {
        skipped++;
      }
    } catch (error) {
      console.error("branch confirm row error:", error);
      errors++;
    }
  }

  return { inserted, updated, errors, skipped };
}

export async function POST(req: NextRequest) {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  if (!token) return NextResponse.json({ message: "권한 없음" }, { status: 401 });

  let client;
  try {
    const formData = await req.formData();
    const file = formData.get("file");
    const mode = String(formData.get("mode") || "") as Mode;

    if (!file || !(file instanceof File)) return NextResponse.json({ message: "파일이 없습니다." }, { status: 400 });
    if (!["merchants", "merchant_patch", "orders", "branches"].includes(mode)) {
      return NextResponse.json({ message: "업로드 종류가 올바르지 않습니다." }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const parsed = parseExcelByHeader(buffer, []);
    let rows = parsed.rows;
    if (
      mode === "orders" &&
      !(
        hasAnyHeader(parsed.headers, ALIASES.merchantCode) &&
        hasAnyHeader(parsed.headers, ALIASES.orderDate) &&
        hasAnyHeader(parsed.headers, ALIASES.orderType) &&
        hasAnyHeader(parsed.headers, ALIASES.quantity)
      )
    ) {
      const legacyRows = legacyOrderRowsFromMatrix(buffer);
      if (legacyRows.length > 0) rows = legacyRows;
    }
    if (rows.length === 0) return NextResponse.json({ message: "데이터 행이 없습니다." }, { status: 400 });

    client = await pool.connect();
    await ensureHistory(client);

    const stats =
      mode === "orders"
        ? await confirmOrders(rows, client)
        : mode === "merchant_patch"
          ? await confirmMerchantPatch(rows, client)
          : mode === "merchants"
            ? await confirmMerchants(rows, client)
            : await confirmBranches(rows, client);

    const unmatched = "unmatched" in stats ? stats.unmatched : 0;

    const history = await client.query(
      `INSERT INTO upload_history (filename, mode, uploaded_by, total_rows, inserted, updated, errors, skipped, unmatched)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id`,
      [
        file.name,
        mode,
        token.email || token.name || "admin",
        rows.length,
        stats.inserted,
        stats.updated,
        stats.errors,
        stats.skipped,
        unmatched,
      ]
    );

    return NextResponse.json({ ok: true, history_id: history.rows[0]?.id, total_rows: rows.length, ...stats, unmatched });
  } catch (error) {
    console.error("upload confirm error:", error);
    return NextResponse.json({ message: String(error) }, { status: 500 });
  } finally {
    if (client) client.release();
  }
}
