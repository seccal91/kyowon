import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import pool from "../../../lib/db";

export const runtime = "nodejs";

async function ensureTable(client: any) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS merchant_mappings (
      merchant_code TEXT PRIMARY KEY,
      org_id BIGINT NOT NULL,
      contract_date DATE,
      member_count INT DEFAULT 0,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);
  await client.query(`ALTER TABLE merchant_mappings ADD COLUMN IF NOT EXISTS contract_date DATE`);
  await client.query(`ALTER TABLE merchant_mappings ADD COLUMN IF NOT EXISTS member_count INT DEFAULT 0`);
}

export async function GET() {
  try {
    const client = await pool.connect();
    await ensureTable(client);
    const res = await client.query(`SELECT merchant_code, org_id, contract_date, member_count, created_at FROM merchant_mappings ORDER BY merchant_code`);
    client.release();
    return NextResponse.json({ mappings: res.rows });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ message: "서버 오류" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  let client;
  try {
    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    if (!token || token.role !== "admin") return NextResponse.json({ message: "권한 없음" }, { status: 401 });

    const body = await req.json();
    const { merchant_code, org_id, contract_date, member_count } = body;
    if (!merchant_code || !org_id) return NextResponse.json({ message: "merchant_code 및 org_id 필요" }, { status: 400 });

    client = await pool.connect();
    await ensureTable(client);
    await client.query(`
      INSERT INTO merchant_mappings (merchant_code, org_id, contract_date, member_count)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (merchant_code) DO UPDATE SET org_id = EXCLUDED.org_id, contract_date = EXCLUDED.contract_date, member_count = EXCLUDED.member_count
    `, [merchant_code, org_id, contract_date || null, Number(member_count) || 0]);
    client.release();
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(err);
    if (client) client.release();
    return NextResponse.json({ message: "서버 오류" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  let client;
  try {
    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    if (!token || token.role !== "admin") return NextResponse.json({ message: "권한 없음" }, { status: 401 });

    const url = new URL(req.url);
    const merchant_code = url.searchParams.get("merchant_code");
    if (!merchant_code) return NextResponse.json({ message: "merchant_code 필요" }, { status: 400 });

    client = await pool.connect();
    await ensureTable(client);
    await client.query(`DELETE FROM merchant_mappings WHERE merchant_code = $1`, [merchant_code]);
    client.release();
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(err);
    if (client) client.release();
    return NextResponse.json({ message: "서버 오류" }, { status: 500 });
  }
}
