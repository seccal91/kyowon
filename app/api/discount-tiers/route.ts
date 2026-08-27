import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import pool from "../../../lib/db";

export const runtime = "nodejs";

async function ensureTable(client: any) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS discount_tiers (
      id BIGSERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      criteria_date DATE,
      criteria_direction TEXT DEFAULT 'before',
      member_ranges JSONB DEFAULT '[]'::jsonb,
      apply_scope TEXT DEFAULT 'all',
      apply_org_id BIGINT,
      apply_merchants JSONB DEFAULT '[]'::jsonb,
      is_active BOOLEAN DEFAULT true,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);
  // Migrate old schema: add member_ranges if missing
  await client.query(`ALTER TABLE discount_tiers ADD COLUMN IF NOT EXISTS member_ranges JSONB DEFAULT '[]'::jsonb`);
  await client.query(`ALTER TABLE discount_tiers ADD COLUMN IF NOT EXISTS criteria_date DATE`);
  await client.query(`ALTER TABLE discount_tiers ADD COLUMN IF NOT EXISTS criteria_direction TEXT DEFAULT 'before'`);
}

async function requireAdmin(req: NextRequest) {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  return token?.role === "admin";
}

export async function GET() {
  let client;
  try {
    client = await pool.connect();
    await ensureTable(client);
    const res = await client.query(
      `SELECT dt.*, o.name as org_name
       FROM discount_tiers dt
       LEFT JOIN organizations o ON o.id = dt.apply_org_id
       ORDER BY dt.created_at DESC`
    );
    return NextResponse.json({ tiers: res.rows });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ message: "서버 오류" }, { status: 500 });
  } finally {
    if (client) client.release();
  }
}

export async function POST(req: NextRequest) {
  if (!(await requireAdmin(req)))
    return NextResponse.json({ message: "권한 없음" }, { status: 401 });
  let client;
  try {
    const body = await req.json();
    const { name, criteria_date, criteria_direction, member_ranges, apply_scope, apply_org_id, apply_merchants } = body;
    if (!name) return NextResponse.json({ message: "이름은 필수입니다." }, { status: 400 });

    client = await pool.connect();
    await ensureTable(client);
    const res = await client.query(
      `INSERT INTO discount_tiers (name, criteria_date, criteria_direction, member_ranges, apply_scope, apply_org_id, apply_merchants)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [
        name,
        criteria_date || null,
        criteria_direction || "before",
        JSON.stringify(member_ranges || []),
        apply_scope || "all",
        apply_org_id || null,
        JSON.stringify(apply_merchants || []),
      ]
    );
    return NextResponse.json({ tier: res.rows[0] });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ message: "서버 오류" }, { status: 500 });
  } finally {
    if (client) client.release();
  }
}

export async function PUT(req: NextRequest) {
  if (!(await requireAdmin(req)))
    return NextResponse.json({ message: "권한 없음" }, { status: 401 });
  let client;
  try {
    const body = await req.json();
    const { id, name, criteria_date, criteria_direction, member_ranges, apply_scope, apply_org_id, apply_merchants, is_active } = body;
    if (!id) return NextResponse.json({ message: "id 필요" }, { status: 400 });
    client = await pool.connect();
    await ensureTable(client);
    const res = await client.query(
      `UPDATE discount_tiers SET
         name=$1, criteria_date=$2, criteria_direction=$3, member_ranges=$4,
         apply_scope=$5, apply_org_id=$6, apply_merchants=$7, is_active=$8
       WHERE id=$9 RETURNING *`,
      [
        name,
        criteria_date || null,
        criteria_direction || "before",
        JSON.stringify(member_ranges || []),
        apply_scope || "all",
        apply_org_id || null,
        JSON.stringify(apply_merchants || []),
        is_active !== false,
        id,
      ]
    );
    return NextResponse.json({ tier: res.rows[0] });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ message: "서버 오류" }, { status: 500 });
  } finally {
    if (client) client.release();
  }
}

export async function DELETE(req: NextRequest) {
  if (!(await requireAdmin(req)))
    return NextResponse.json({ message: "권한 없음" }, { status: 401 });
  let client;
  try {
    const url = new URL(req.url);
    const id = url.searchParams.get("id");
    if (!id) return NextResponse.json({ message: "id 필요" }, { status: 400 });
    client = await pool.connect();
    await ensureTable(client);
    await client.query(`DELETE FROM discount_tiers WHERE id=$1`, [id]);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ message: "서버 오류" }, { status: 500 });
  } finally {
    if (client) client.release();
  }
}
