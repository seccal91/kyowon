import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import pool from "../../../lib/db";

export const runtime = "nodejs";

async function ensureTable(client: any) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS promotions (
      id BIGSERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      tiers JSONB DEFAULT '[]'::jsonb,
      targets JSONB DEFAULT '[]'::jsonb,
      apply_to_sales BOOLEAN DEFAULT false,
      start_date DATE,
      end_date DATE,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);
  await client.query(`ALTER TABLE promotions ADD COLUMN IF NOT EXISTS apply_to_sales BOOLEAN DEFAULT false`);
  await client.query(`ALTER TABLE promotions ADD COLUMN IF NOT EXISTS start_date DATE`);
  await client.query(`ALTER TABLE promotions ADD COLUMN IF NOT EXISTS end_date DATE`);
}

export async function GET() {
  try {
    const client = await pool.connect();
    await ensureTable(client);
    const res = await client.query(`SELECT id, name, tiers, targets, apply_to_sales, start_date, end_date, created_at FROM promotions ORDER BY id`);
    client.release();
    return NextResponse.json({ promotions: res.rows });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ message: '서버 오류' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  let client;
  try {
    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    if (!token || token.role !== 'admin') return NextResponse.json({ message: '권한 없음' }, { status: 401 });

    const body = await req.json();
    if (body.promotionId && body.year && body.month) {
      const promotionId = Number(body.promotionId);
      const year = Number(body.year);
      const month = Number(body.month);
      if (!promotionId || !year || !month) return NextResponse.json({ message: 'promotionId, year, month 필요' }, { status: 400 });

      client = await pool.connect();
      await ensureTable(client);
      const pRes = await client.query(`SELECT * FROM promotions WHERE id = $1`, [promotionId]);
      if (!pRes.rows.length) { client.release(); return NextResponse.json({ message: '프로모션 없음' }, { status: 404 }); }
      const promo = pRes.rows[0];

      await client.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS merchant_name TEXT`);
      const rows = await client.query(`SELECT merchant_code, year, month, revenue, quantity FROM orders WHERE year = $1 AND month = $2`, [year, month]);
      const byMerchant: Record<string, { quantity: number; revenue: number; rows: any[] }> = {};
      for (const r of rows.rows) {
        const merchant = r.merchant_code || 'unknown';
        const qty = Number(r.quantity || 0) || 0;
        const rev = Number(r.revenue || 0) || 0;
        if (!byMerchant[merchant]) byMerchant[merchant] = { quantity: 0, revenue: 0, rows: [] };
        byMerchant[merchant].quantity += qty;
        byMerchant[merchant].revenue += rev;
        byMerchant[merchant].rows.push(r);
      }

      const targets: string[] = promo.targets || [];
      const tiers: Array<{ threshold:number; discount:number }> = promo.tiers || [];
      const results: any[] = [];
      for (const t of Object.keys(byMerchant)) {
        if (targets.length && !targets.includes(t)) continue;
        const m = byMerchant[t];
        let applied: any = null;
        for (const tr of tiers) {
          if (Number(m.quantity) === Number(tr.threshold)) { applied = tr; break; }
        }
        results.push({ merchant: t, quantity: m.quantity, revenue: m.revenue, applied });
      }

      client.release();
      return NextResponse.json({ results });
    }

    const { name, tiers, targets, apply_to_sales, start_date, end_date } = body;
    if (!name) return NextResponse.json({ message: 'name 필요' }, { status: 400 });

    client = await pool.connect();
    await ensureTable(client);
    const res = await client.query(
      `INSERT INTO promotions (name, tiers, targets, apply_to_sales, start_date, end_date) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, name, tiers, targets, apply_to_sales, start_date, end_date, created_at`,
      [name, JSON.stringify(tiers || []), JSON.stringify(targets || []), !!apply_to_sales, start_date || null, end_date || null]
    );
    client.release();
    return NextResponse.json({ promotion: res.rows[0] });
  } catch (err) {
    console.error(err);
    if (client) client.release();
    return NextResponse.json({ message: '서버 오류' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  let client;
  try {
    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    if (!token || token.role !== 'admin') return NextResponse.json({ message: '권한 없음' }, { status: 401 });

    const body = await req.json();
    const { id, name, tiers, targets, apply_to_sales, start_date, end_date } = body;
    if (!id) return NextResponse.json({ message: 'id 필요' }, { status: 400 });

    client = await pool.connect();
    await ensureTable(client);
    const res = await client.query(
      `UPDATE promotions SET name=$1, tiers=$2, targets=$3, apply_to_sales=$4, start_date=$5, end_date=$6 WHERE id=$7 RETURNING id, name, tiers, targets, apply_to_sales, start_date, end_date, created_at`,
      [name, JSON.stringify(tiers || []), JSON.stringify(targets || []), !!apply_to_sales, start_date || null, end_date || null, id]
    );
    client.release();
    return NextResponse.json({ promotion: res.rows[0] });
  } catch (err) {
    console.error(err);
    if (client) client.release();
    return NextResponse.json({ message: '서버 오류' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  let client;
  try {
    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    if (!token || token.role !== 'admin') return NextResponse.json({ message: '권한 없음' }, { status: 401 });

    const url = new URL(req.url);
    const id = url.searchParams.get('id');
    if (!id) return NextResponse.json({ message: 'id 필요' }, { status: 400 });

    client = await pool.connect();
    await ensureTable(client);
    await client.query(`DELETE FROM promotions WHERE id = $1`, [id]);
    client.release();
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(err);
    if (client) client.release();
    return NextResponse.json({ message: '서버 오류' }, { status: 500 });
  }
}
