import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import pool from "../../../lib/db";

export const runtime = "nodejs";

async function ensureTables(client: any) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS performance_entries (
      org_id BIGINT NOT NULL,
      year INT NOT NULL,
      month INT NOT NULL,
      target INT DEFAULT 0,
      new_merchants INT DEFAULT 0,
      PRIMARY KEY (org_id, year, month)
    )
  `);
}

function lastDay(year: number, month: number) {
  return new Date(year, month, 0).getDate();
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const year = Number(url.searchParams.get("year")) || new Date().getFullYear();
  const month = Number(url.searchParams.get("month")) || new Date().getMonth() + 1;
  const filterBuId = Number(url.searchParams.get("business_unit_id")) || 0;

  let client;
  try {
    client = await pool.connect();
    await ensureTables(client);

    const orgsRes = await client.query(`
      SELECT o.id, o.name, o.group_name, o.business_unit_id, bu.name AS bu_name
      FROM organizations o
      LEFT JOIN business_units bu ON bu.id = o.business_unit_id
      ORDER BY o.group_name, o.name
    `);
    let orgs: any[] = orgsRes.rows.map((r: any) => ({
      id: Number(r.id), name: r.name,
      group_name: r.group_name || "예외",
      business_unit_id: r.business_unit_id ? Number(r.business_unit_id) : null,
      bu_name: r.bu_name || null,
    }));

    if (filterBuId) orgs = orgs.filter(o => o.business_unit_id === filterBuId);

    if (orgs.length === 0) {
      return NextResponse.json({ year, month, groups: { blue: [], green: [], exception: [] }, business_units: [] });
    }

    const orgIds = orgs.map(o => o.id);

    const perfRes = await client.query(
      `SELECT org_id, target, new_merchants FROM performance_entries WHERE year = $1 AND month = $2 AND org_id = ANY($3)`,
      [year, month, orgIds]
    );
    const perfMap: Record<number, { target: number; new_merchants: number }> = {};
    for (const r of perfRes.rows) {
      perfMap[Number(r.org_id)] = { target: Number(r.target || 0), new_merchants: Number(r.new_merchants || 0) };
    }

    const mappingsRes = await client.query(
      `SELECT merchant_code, org_id FROM merchant_mappings WHERE org_id = ANY($1)`,
      [orgIds]
    );
    const orgMerchants: Record<number, string[]> = {};
    for (const r of mappingsRes.rows) {
      const oid = Number(r.org_id);
      if (!orgMerchants[oid]) orgMerchants[oid] = [];
      orgMerchants[oid].push(r.merchant_code);
    }
    const allCodes = Object.values(orgMerchants).flat();

    const memberByCode: Record<string, number> = {};
    const orderByCode: Record<string, number> = {};

    if (allCodes.length > 0) {
      const prevYear = month === 1 ? year - 1 : year;
      const prevMonth = month === 1 ? 12 : month - 1;
      const memberStart = `${prevYear}-${String(prevMonth).padStart(2, "0")}-21`;
      const memberEnd = `${year}-${String(month).padStart(2, "0")}-20`;
      const orderStart = `${year}-${String(month).padStart(2, "0")}-01`;
      const orderEnd = `${year}-${String(month).padStart(2, "0")}-${String(lastDay(year, month)).padStart(2, "0")}`;

      const memberRes = await client.query(
        `SELECT merchant_code,
                SUM(CASE WHEN cancelled THEN -quantity ELSE quantity END)::numeric AS cnt
         FROM orders
         WHERE order_date IS NOT NULL
           AND order_date >= $1 AND order_date <= $2
           AND order_type NOT IN ('초도', '영업교재')
           AND merchant_code = ANY($3)
         GROUP BY merchant_code`,
        [memberStart, memberEnd, allCodes]
      );
      for (const r of memberRes.rows) memberByCode[r.merchant_code] = Math.max(0, Number(r.cnt || 0));

      const orderRes = await client.query(
        `SELECT merchant_code,
                SUM(CASE WHEN cancelled THEN -quantity ELSE quantity END)::numeric AS cnt
         FROM orders
         WHERE order_date IS NOT NULL
           AND order_date >= $1 AND order_date <= $2
           AND order_type NOT IN ('초도', '영업교재')
           AND merchant_code = ANY($3)
         GROUP BY merchant_code`,
        [orderStart, orderEnd, allCodes]
      );
      for (const r of orderRes.rows) orderByCode[r.merchant_code] = Math.max(0, Number(r.cnt || 0));
    }

    const allRows = orgs.map(org => {
      const codes = orgMerchants[org.id] || [];
      const members = codes.reduce((s, c) => s + (memberByCode[c] || 0), 0);
      const orders = codes.reduce((s, c) => s + (orderByCode[c] || 0), 0);
      const perf = perfMap[org.id] || { target: 0, new_merchants: 0 };
      const { target, new_merchants } = perf;
      const diff = orders - target;
      const rate = target > 0 ? Math.round((orders / target) * 1000) / 10 : null;
      const score = rate !== null ? Math.round(rate * 10) / 10 + new_merchants * 5 : new_merchants * 5;
      const grade = rate === null ? "-" : rate >= 110 ? "S" : rate >= 100 ? "A" : rate >= 90 ? "B" : "C";
      return {
        org_id: org.id, org_name: org.name,
        group_name: org.group_name,
        business_unit_id: org.business_unit_id,
        bu_name: org.bu_name,
        members, target, orders, diff,
        rate, new_merchants, score, grade, rank: 0,
      };
    });

    function rankGroup(rows: typeof allRows) {
      return [...rows]
        .sort((a, b) => b.score - a.score || (b.rate ?? 0) - (a.rate ?? 0) || b.orders - a.orders)
        .map((r, i) => ({ ...r, rank: i + 1 }));
    }

    const blue = rankGroup(allRows.filter(r => r.group_name === "블루팀"));
    const green = rankGroup(allRows.filter(r => r.group_name === "그린팀"));
    const exception = rankGroup(allRows.filter(r => r.group_name !== "블루팀" && r.group_name !== "그린팀"));

    const buMap: Record<number, any> = {};
    for (const row of allRows) {
      if (!row.business_unit_id) continue;
      if (!buMap[row.business_unit_id]) {
        buMap[row.business_unit_id] = { id: row.business_unit_id, name: row.bu_name || "", members: 0, target: 0, orders: 0, new_merchants: 0 };
      }
      buMap[row.business_unit_id].members += row.members;
      buMap[row.business_unit_id].target += row.target;
      buMap[row.business_unit_id].orders += row.orders;
      buMap[row.business_unit_id].new_merchants += row.new_merchants;
    }
    const business_units = Object.values(buMap).map((bu: any) => {
      const rate = bu.target > 0 ? Math.round((bu.orders / bu.target) * 1000) / 10 : null;
      const score = rate !== null ? Math.round(rate * 10) / 10 + bu.new_merchants * 5 : bu.new_merchants * 5;
      return { ...bu, diff: bu.orders - bu.target, rate, score };
    }).sort((a: any, b: any) => a.name.localeCompare(b.name, "ko"));

    return NextResponse.json({ year, month, groups: { blue, green, exception }, business_units });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ message: "서버 오류" }, { status: 500 });
  } finally {
    if (client) client.release();
  }
}

export async function POST(req: NextRequest) {
  let client;
  try {
    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    if (!token) return NextResponse.json({ message: "권한 없음" }, { status: 401 });

    const body = await req.json();
    const { org_id, year, month } = body;
    if (!org_id || !year || !month) return NextResponse.json({ message: "파라미터 오류" }, { status: 400 });

    client = await pool.connect();
    await ensureTables(client);

    const fields = ["org_id", "year", "month"];
    const values: any[] = [org_id, year, month];
    const updates: string[] = [];

    if (body.target !== undefined) {
      fields.push("target"); values.push(Number(body.target) || 0);
      updates.push("target = EXCLUDED.target");
    }
    if (body.new_merchants !== undefined) {
      fields.push("new_merchants"); values.push(Number(body.new_merchants) || 0);
      updates.push("new_merchants = EXCLUDED.new_merchants");
    }

    if (updates.length === 0) return NextResponse.json({ ok: true });

    const ph = values.map((_, i) => `$${i + 1}`).join(", ");
    await client.query(
      `INSERT INTO performance_entries (${fields.join(", ")}) VALUES (${ph})
       ON CONFLICT (org_id, year, month) DO UPDATE SET ${updates.join(", ")}`,
      values
    );

    client.release();
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(err);
    if (client) client.release();
    return NextResponse.json({ message: "서버 오류" }, { status: 500 });
  }
}
