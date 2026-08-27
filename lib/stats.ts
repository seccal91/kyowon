import pool from './db';

// Recompute aggregated statistics for an organization and store into precomputed_stats
export async function recomputeStatsForOrg(orgId: number) {
  if (!orgId) return;
  const client = await pool.connect();
  try {
    // ensure tables
    await client.query(`
      CREATE TABLE IF NOT EXISTS precomputed_stats (
        id BIGSERIAL PRIMARY KEY,
        org_id BIGINT NOT NULL,
        year INT NOT NULL,
        month INT NOT NULL,
        stats JSONB NOT NULL,
        computed_at TIMESTAMP DEFAULT NOW(),
        UNIQUE (org_id, year, month)
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS organizations (
        id BIGSERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        regions JSONB DEFAULT '[]'::jsonb,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS merchant_mappings (
        merchant_code TEXT PRIMARY KEY,
        org_id BIGINT NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // load org regions
    const orgRes = await client.query(`SELECT id, regions FROM organizations WHERE id = $1`, [orgId]);
    if (!orgRes.rows.length) {
      // delete any precomputed rows
      await client.query(`DELETE FROM precomputed_stats WHERE org_id = $1`, [orgId]);
      return;
    }
    const regions = orgRes.rows[0].regions || [];

    // find matching rows from excel_uploads_raw where row_data->>'major' and ->>'minor' match any region
    // assume uploaded rows have `major` and `minor`, and `year`,`month`, `revenue`,`quantity` fields
    const statsByPeriod: Record<string, any> = {};

    // Use normalized `orders` table for aggregation (better performance)
    await client.query(`
      CREATE TABLE IF NOT EXISTS orders (
        id BIGSERIAL PRIMARY KEY,
        source_id BIGINT,
        merchant_code TEXT,
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

    const mappingsRes = await client.query(`SELECT merchant_code, org_id FROM merchant_mappings`);
    const merchantOrgMap: Record<string, number> = {};
    for (const map of mappingsRes.rows) {
      merchantOrgMap[map.merchant_code] = Number(map.org_id);
    }

    const rowsRes = await client.query(`SELECT merchant_code, year, month, major, minor, revenue, quantity FROM orders`);
    for (const r of rowsRes.rows) {
      const merchant = r.merchant_code || null;
      const major = r.major;
      const minor = r.minor;
      const orderOrgId = merchant ? merchantOrgMap[merchant] : null;
      if (orderOrgId && orderOrgId !== orgId) continue;
      const belongsByRegion = regions.some((reg: any) => String(reg.major) === String(major) && String(reg.minor) === String(minor));
      if (!orderOrgId && !belongsByRegion) continue;
      const year = Number(r.year || 0);
      const month = Number(r.month || 0);
      if (!year || !month) continue;
      const revenue = Number(r.revenue || 0) || 0;
      const quantity = Number(r.quantity || 0) || 0;
      const key = `${year}-${month}`;
      if (!statsByPeriod[key]) statsByPeriod[key] = { revenue: 0, quantity: 0 };
      statsByPeriod[key].revenue += revenue;
      statsByPeriod[key].quantity += quantity;
    }

    // upsert into precomputed_stats per period
    for (const k of Object.keys(statsByPeriod)) {
      const [year, month] = k.split('-').map((v) => Number(v));
      const stats = statsByPeriod[k];
      await client.query(`
        INSERT INTO precomputed_stats (org_id, year, month, stats, computed_at)
        VALUES ($1, $2, $3, $4, NOW())
        ON CONFLICT (org_id, year, month) DO UPDATE SET stats = EXCLUDED.stats, computed_at = EXCLUDED.computed_at
      `, [orgId, year, month, JSON.stringify(stats)]);
    }
  } finally {
    client.release();
  }
}
