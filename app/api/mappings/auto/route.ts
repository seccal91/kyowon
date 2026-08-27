import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import pool from "../../../../lib/db";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  let client;
  try {
    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    if (!token || token.role !== "admin") return NextResponse.json({ message: "권한 없음" }, { status: 401 });

    client = await pool.connect();
    await client.query(`
      CREATE TABLE IF NOT EXISTS organizations (
        id BIGSERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        regions JSONB DEFAULT '[]'::jsonb,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS orders (
        id BIGSERIAL PRIMARY KEY,
        source_id BIGINT,
        merchant_code TEXT,
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
    await client.query(`
      CREATE TABLE IF NOT EXISTS merchant_mappings (
        merchant_code TEXT PRIMARY KEY,
        org_id BIGINT NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    const orgs = (await client.query(`SELECT id, regions FROM organizations`)).rows;
    const existing = new Set((await client.query(`SELECT merchant_code FROM merchant_mappings`)).rows.map((r:any) => r.merchant_code));
    const rows = (await client.query(`SELECT DISTINCT merchant_code, major, minor FROM orders WHERE merchant_code IS NOT NULL`)).rows;

    let inserted = 0;
    for (const row of rows) {
      const merchant = row.merchant_code;
      const major = row.major;
      const minor = row.minor;
      if (!merchant || !major || !minor || existing.has(merchant)) continue;
      const matchedOrg = orgs.find((org: any) => (org.regions || []).some((reg: any) => String(reg.major) === String(major) && String(reg.minor) === String(minor)));
      if (!matchedOrg) continue;
      await client.query(`INSERT INTO merchant_mappings (merchant_code, org_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [merchant, matchedOrg.id]);
      inserted++;
    }

    client.release();
    return NextResponse.json({ ok: true, inserted });
  } catch (err) {
    console.error(err);
    if (client) client.release();
    return NextResponse.json({ message: "서버 오류" }, { status: 500 });
  }
}
