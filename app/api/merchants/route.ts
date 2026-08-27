import { NextRequest, NextResponse } from "next/server";
import pool from "../../../lib/db";

export const runtime = "nodejs";

type MerchantItem = { code: string; name: string };

export async function GET(req: NextRequest) {
  let client;
  try {
    const url = new URL(req.url);
    const q = (url.searchParams.get('q') || '').trim();
    const type = url.searchParams.get('type') === 'name' ? 'name' : 'code';

    client = await pool.connect();
    await client.query(`CREATE TABLE IF NOT EXISTS orders (id BIGSERIAL PRIMARY KEY)`);
    await client.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS merchant_name TEXT`);

    let rows;
    if (!q) {
      rows = await client.query(`SELECT DISTINCT merchant_code, merchant_name FROM orders WHERE merchant_code IS NOT NULL AND merchant_code <> '' ORDER BY merchant_code LIMIT 100`);
    } else if (type === 'name') {
      rows = await client.query(`SELECT DISTINCT merchant_code, merchant_name FROM orders WHERE merchant_name ILIKE $1 ORDER BY merchant_name LIMIT 100`, [`%${q}%`]);
    } else {
      const last4 = q.slice(-4);
      rows = await client.query(`SELECT DISTINCT merchant_code, merchant_name FROM orders WHERE merchant_code ILIKE $1 ORDER BY merchant_code LIMIT 100`, [`%${last4}`]);
    }

    client.release();
    const merchants: MerchantItem[] = rows.rows.map((r:any) => ({
      code: r.merchant_code,
      name: r.merchant_name || r.merchant_code,
    }));
    return NextResponse.json({ merchants });
  } catch (err) {
    console.error(err);
    if (client) client.release();
    return NextResponse.json({ message: '서버 오류' }, { status: 500 });
  }
}
