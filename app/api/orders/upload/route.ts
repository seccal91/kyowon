import { NextRequest, NextResponse } from "next/server";
import pool from "../../../../lib/db";

export const runtime = "nodejs";

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

export async function GET(req: NextRequest) {
  let client;
  try {
    client = await pool.connect();
    await ensureOrders(client);

    const year = Number(req.nextUrl.searchParams.get("year")) || new Date().getFullYear();
    const res = await client.query(
      `SELECT
         merchant_code,
         year,
         month,
         order_type,
         SUM(CASE WHEN cancelled THEN -quantity ELSE quantity END)::numeric AS quantity
       FROM orders
       WHERE year = $1
         AND merchant_code IS NOT NULL
       GROUP BY merchant_code, year, month, order_type
       ORDER BY year DESC, month DESC, merchant_code`,
      [year]
    );

    const byKey: Record<string, any> = {};
    for (const row of res.rows) {
      const key = `${row.merchant_code}||${row.year}||${row.month}`;
      if (!byKey[key]) {
        byKey[key] = {
          merchant_code: row.merchant_code,
          year: Number(row.year),
          month: Number(row.month),
          product_counts: {},
          total_quantity: 0,
        };
      }
      const type = row.order_type || "미분류";
      const qty = Number(row.quantity || 0);
      byKey[key].product_counts[type] = (byKey[key].product_counts[type] || 0) + qty;
      byKey[key].total_quantity += qty;
    }

    return NextResponse.json({ orders: Object.values(byKey) });
  } catch (error) {
    console.error("orders summary error:", error);
    return NextResponse.json({ message: "주문 현황을 불러오지 못했습니다." }, { status: 500 });
  } finally {
    if (client) client.release();
  }
}

export async function POST() {
  return NextResponse.json(
    { message: "주문 업로드는 /admin/upload의 '주문 데이터' 탭에서 파일 분석 후 등록해 주세요." },
    { status: 410 }
  );
}
