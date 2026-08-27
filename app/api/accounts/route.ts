import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import pool from "../../../lib/db";
import bcrypt from "bcryptjs";

export const runtime = "nodejs";

async function ensureTable(client: any) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS users (
      id BIGSERIAL PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      name TEXT,
      password_hash TEXT NOT NULL,
      role TEXT DEFAULT 'user',
      permissions JSONB DEFAULT '["전체"]'::jsonb,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);
  await client.query(
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS permissions JSONB DEFAULT '["전체"]'::jsonb`
  );
}

async function requireAdmin(req: NextRequest) {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  return token?.role === "admin";
}

export async function GET(req: NextRequest) {
  if (!(await requireAdmin(req)))
    return NextResponse.json({ message: "권한 없음" }, { status: 401 });

  let client;
  try {
    client = await pool.connect();
    await ensureTable(client);
    const res = await client.query(
      `SELECT id, email, name, role, permissions, created_at FROM users ORDER BY created_at DESC`
    );
    return NextResponse.json({ users: res.rows });
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
    const { email, name, password, permissions } = body;
    if (!email || !password)
      return NextResponse.json(
        { message: "이메일과 비밀번호는 필수입니다." },
        { status: 400 }
      );

    const hash = await bcrypt.hash(password, 10);
    client = await pool.connect();
    await ensureTable(client);

    const res = await client.query(
      `INSERT INTO users (email, name, password_hash, role, permissions)
       VALUES ($1, $2, $3, 'user', $4)
       RETURNING id, email, name, role, permissions, created_at`,
      [email, name || "", hash, JSON.stringify(permissions || ["전체"])]
    );
    return NextResponse.json({ user: res.rows[0] });
  } catch (err: any) {
    console.error(err);
    if (err.code === "23505")
      return NextResponse.json(
        { message: "이미 존재하는 이메일입니다." },
        { status: 400 }
      );
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
    const { id, name, password, permissions } = body;
    if (!id) return NextResponse.json({ message: "id 필요" }, { status: 400 });

    client = await pool.connect();
    await ensureTable(client);

    if (password) {
      const hash = await bcrypt.hash(password, 10);
      await client.query(
        `UPDATE users SET name=$1, password_hash=$2, permissions=$3 WHERE id=$4 AND role != 'admin'`,
        [name || "", hash, JSON.stringify(permissions || ["전체"]), id]
      );
    } else {
      await client.query(
        `UPDATE users SET name=$1, permissions=$2 WHERE id=$3 AND role != 'admin'`,
        [name || "", JSON.stringify(permissions || ["전체"]), id]
      );
    }

    const res = await client.query(
      `SELECT id, email, name, role, permissions, created_at FROM users WHERE id=$1`,
      [id]
    );
    return NextResponse.json({ user: res.rows[0] });
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
    await client.query(`DELETE FROM users WHERE id=$1 AND role != 'admin'`, [id]);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ message: "서버 오류" }, { status: 500 });
  } finally {
    if (client) client.release();
  }
}
