import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import pool from "../../../lib/db";
import { recomputeStatsForOrg } from "../../../lib/stats";

export const runtime = "nodejs";

async function ensureTable(client: any) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS organizations (
      id BIGSERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      regions JSONB DEFAULT '[]'::jsonb,
      group_name TEXT DEFAULT '예외',
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);
  await client.query(`ALTER TABLE organizations ADD COLUMN IF NOT EXISTS group_name TEXT DEFAULT '예외'`);
  await client.query(`ALTER TABLE organizations ADD COLUMN IF NOT EXISTS business_unit_id BIGINT`);
}

export async function GET(req: NextRequest) {
  try {
    const client = await pool.connect();
    await ensureTable(client);
    const res = await client.query(
      `SELECT o.id, o.name, o.regions, o.group_name, o.business_unit_id, o.created_at,
              bu.name as business_unit_name
       FROM organizations o
       LEFT JOIN business_units bu ON bu.id = o.business_unit_id
       ORDER BY o.id`
    );
    client.release();
    return NextResponse.json({ organizations: res.rows });
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
    const { name, regions, group_name, business_unit_id } = body;
    if (!name) return NextResponse.json({ message: 'name 필요' }, { status: 400 });

    client = await pool.connect();
    await ensureTable(client);

    // Validate regions are not already assigned to other organizations
    if (regions && Array.isArray(regions)) {
      for (const r of regions) {
        const regionJson = JSON.stringify([r]);
        const conflictRes = await client.query(`SELECT id, name FROM organizations WHERE regions @> $1::jsonb`, [regionJson]);
        if (conflictRes.rows.length > 0) {
          return NextResponse.json({ message: `${r.major} ${r.minor} 은(는) 이미 다른 지사에 할당되어 있습니다.` }, { status: 400 });
        }
      }
    }
    const res = await client.query(
      `INSERT INTO organizations (name, regions, group_name, business_unit_id) VALUES ($1, $2, $3, $4) RETURNING *`,
      [name, JSON.stringify(regions ?? []), group_name || '예외', business_unit_id || null]
    );
    const org = res.rows[0];
    client.release();

    // 비동기 사전계산 트리거
    recomputeStatsForOrg(org.id).catch((e) => console.error('recompute error', e));

    return NextResponse.json({ organization: org });
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
    const { id, name, regions, group_name, business_unit_id } = body;
    if (!id) return NextResponse.json({ message: 'id 필요' }, { status: 400 });
    if (!name) return NextResponse.json({ message: 'name 필요' }, { status: 400 });

    client = await pool.connect();
    await ensureTable(client);

    // Validate regions are not already assigned to other organizations
    if (regions && Array.isArray(regions)) {
      for (const r of regions) {
        const regionJson = JSON.stringify([r]);
        const conflictRes = await client.query(`SELECT id, name FROM organizations WHERE regions @> $1::jsonb AND id <> $2`, [regionJson, id]);
        if (conflictRes.rows.length > 0) {
          return NextResponse.json({ message: `${r.major} ${r.minor} 은(는) 이미 다른 지사에 할당되어 있습니다.` }, { status: 400 });
        }
      }
    }
    const res = await client.query(
      `UPDATE organizations SET name = $1, regions = $2, group_name = $3, business_unit_id = $4 WHERE id = $5 RETURNING *`,
      [name, JSON.stringify(regions ?? []), group_name || '예외', business_unit_id || null, id]
    );
    const org = res.rows[0];
    client.release();

    recomputeStatsForOrg(org.id).catch((e) => console.error('recompute error', e));

    return NextResponse.json({ organization: org });
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
    await client.query(`DELETE FROM organizations WHERE id = $1`, [id]);
    client.release();

    // 제거된 조직에 대한 통계 정리(비동기)
    recomputeStatsForOrg(Number(id)).catch((e) => console.error('recompute error', e));

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(err);
    if (client) client.release();
    return NextResponse.json({ message: '서버 오류' }, { status: 500 });
  }
}
