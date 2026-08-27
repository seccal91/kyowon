import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import pool from "../../../../lib/db";
import { REGION_MAP } from "../../../../lib/regions";

export const runtime = "nodejs";

function normalizeMajor(raw: string | null): string | null {
  if (!raw) return null;
  return Object.keys(REGION_MAP).find((r) => raw.includes(r) || r.includes(raw)) || raw;
}

export async function GET(req: NextRequest) {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  if (!token) return NextResponse.json({ message: "권한 없음" }, { status: 401 });

  let client;
  try {
    client = await pool.connect();

    const [orgTotal, orgWithRegions, mmTotal, mmWithOrg, mmNoOrg, orgSample] = await Promise.all([
      client.query(`SELECT COUNT(*)::int AS cnt FROM organizations`),
      client.query(`SELECT COUNT(*)::int AS cnt FROM organizations WHERE jsonb_array_length(COALESCE(regions,'[]'::jsonb)) > 0`),
      client.query(`SELECT COUNT(*)::int AS cnt FROM merchant_mappings`),
      client.query(`SELECT COUNT(*)::int AS cnt FROM merchant_mappings WHERE org_id IS NOT NULL`),
      client.query(`
        SELECT major, minor, COUNT(*)::int AS cnt
        FROM merchant_mappings
        WHERE org_id IS NULL AND (major IS NOT NULL OR minor IS NOT NULL)
        GROUP BY major, minor
        ORDER BY cnt DESC
        LIMIT 20
      `),
      client.query(`SELECT name, regions FROM organizations ORDER BY name LIMIT 20`),
    ]);

    return NextResponse.json({
      orgs: { total: orgTotal.rows[0].cnt, with_regions: orgWithRegions.rows[0].cnt },
      mappings: {
        total: mmTotal.rows[0].cnt,
        with_org: mmWithOrg.rows[0].cnt,
        without_org: mmTotal.rows[0].cnt - mmWithOrg.rows[0].cnt,
      },
      unmatched_majors: mmNoOrg.rows,
      org_regions: orgSample.rows.map((r: any) => ({ name: r.name, regions: r.regions || [] })),
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ message: "서버 오류" }, { status: 500 });
  } finally {
    if (client) client.release();
  }
}

export async function POST(req: NextRequest) {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  if (!token || token.role !== "admin") return NextResponse.json({ message: "권한 없음" }, { status: 401 });

  let client;
  try {
    client = await pool.connect();

    const orgsRes = await client.query(`SELECT id, regions FROM organizations`);
    const regionToOrgId: Record<string, number> = {};
    for (const org of orgsRes.rows) {
      for (const region of org.regions || []) {
        if (region.major && region.minor) {
          regionToOrgId[`${region.major}||${region.minor}`] = Number(org.id);
        }
      }
    }

    const mmRes = await client.query(
      `SELECT merchant_code, major, minor FROM merchant_mappings WHERE major IS NOT NULL AND minor IS NOT NULL`
    );

    let updated = 0;
    let failed = 0;

    for (const row of mmRes.rows) {
      const normalizedMajor = normalizeMajor(row.major);
      const orgId = normalizedMajor ? (regionToOrgId[`${normalizedMajor}||${row.minor}`] ?? null) : null;

      if (orgId !== null) {
        await client.query(
          `UPDATE merchant_mappings SET org_id = $1, major = $2 WHERE merchant_code = $3`,
          [orgId, normalizedMajor, row.merchant_code]
        );
        updated++;
      } else {
        failed++;
      }
    }

    return NextResponse.json({ ok: true, updated, failed });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ message: "서버 오류" }, { status: 500 });
  } finally {
    if (client) client.release();
  }
}
