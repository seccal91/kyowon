import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import pool from "../../../lib/db";

export const runtime = "nodejs";

async function ensureTable(client: any) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS business_units (
      id BIGSERIAL PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);
  await client.query(`ALTER TABLE organizations ADD COLUMN IF NOT EXISTS business_unit_id BIGINT`);
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
    const res = await client.query(`SELECT id, name FROM business_units ORDER BY name`);
    return NextResponse.json({ business_units: res.rows });
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
    const { name } = body;
    if (!name?.trim()) return NextResponse.json({ message: "사업단명 필요" }, { status: 400 });
    client = await pool.connect();
    await ensureTable(client);
    const res = await client.query(
      `INSERT INTO business_units (name) VALUES ($1) RETURNING *`,
      [name.trim()]
    );
    return NextResponse.json({ business_unit: res.rows[0] });
  } catch (err: any) {
    if (err.code === "23505") return NextResponse.json({ message: "이미 존재하는 사업단명입니다." }, { status: 400 });
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
    // Unlink orgs from this business unit
    await client.query(`UPDATE organizations SET business_unit_id = NULL WHERE business_unit_id = $1`, [id]);
    await client.query(`DELETE FROM business_units WHERE id = $1`, [id]);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ message: "서버 오류" }, { status: 500 });
  } finally {
    if (client) client.release();
  }
}
