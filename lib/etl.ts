import pool from './db';

export async function etlOrders() {
  const client = await pool.connect();
  try {
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
    await client.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS merchant_name TEXT`);

    const src = await client.query(`SELECT id, row_data FROM excel_uploads_raw WHERE file_type = 'orders'`);
    if (!src.rows.length) return { inserted: 0 };

    const sourceIds = src.rows.map((r: any) => r.id);

    await client.query(`DELETE FROM orders WHERE source_id = ANY($1::bigint[])`, [sourceIds]);

    let inserted = 0;
    for (const r of src.rows) {
      const rd = r.row_data;
      const merchant = rd.merchant_code || rd['merchant_code'] || rd['가맹점코드'] || null;
      const merchantName = rd.merchant_name || rd['merchant_name'] || rd['가맹점명'] || rd['name'] || null;
      const year = Number(rd.year || rd['year'] || rd['연도'] || 0) || null;
      const month = Number(rd.month || rd['month'] || rd['월'] || 0) || null;
      const major = rd.major || rd['major'] || rd['대분류'] || null;
      const minor = rd.minor || rd['minor'] || rd['중분류'] || null;
      const revenue = Number(rd.revenue || rd['revenue'] || rd['매출'] || 0) || 0;
      const quantity = Number(rd.quantity || rd['quantity'] || rd['건수'] || 0) || 0;

      await client.query(
        `INSERT INTO orders (source_id, merchant_code, merchant_name, year, month, major, minor, revenue, quantity, raw) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [r.id, merchant, merchantName, year, month, major, minor, revenue, quantity, rd]
      );
      inserted++;
    }

    return { inserted };
  } finally {
    client.release();
  }
}
