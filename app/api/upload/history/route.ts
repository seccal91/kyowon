import { NextRequest, NextResponse } from "next/server";
import pool from "../../../../lib/db";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  let client;
  try {
    client = await pool.connect();
    await client.query(`
      CREATE TABLE IF NOT EXISTS upload_history (
        id BIGSERIAL PRIMARY KEY, filename TEXT NOT NULL, mode TEXT NOT NULL,
        uploaded_at TIMESTAMP DEFAULT NOW(), uploaded_by TEXT,
        total_rows INT DEFAULT 0, inserted INT DEFAULT 0,
        updated INT DEFAULT 0, errors INT DEFAULT 0, skipped INT DEFAULT 0
      )
    `);
    const res = await client.query(
      `SELECT * FROM upload_history ORDER BY uploaded_at DESC LIMIT 50`
    );
    return NextResponse.json({ history: res.rows });
  } catch (err) {
    return NextResponse.json({ message: String(err) }, { status: 500 });
  } finally {
    if (client) client.release();
  }
}
