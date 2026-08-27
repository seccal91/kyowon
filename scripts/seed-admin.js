const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
require('dotenv').config({ path: '.env.local' });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL && process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined,
});

async function main() {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password) {
    console.error('Please set ADMIN_EMAIL and ADMIN_PASSWORD in environment');
    process.exit(1);
  }

  const hash = await bcrypt.hash(password, 10);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id BIGSERIAL PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      name TEXT,
      password_hash TEXT NOT NULL,
      role TEXT DEFAULT 'admin',
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);

  await pool.query(
    `INSERT INTO users (email, password_hash, role) VALUES ($1, $2, 'admin') ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash`,
    [email, hash]
  );

  console.log('Admin user created/updated:', email);
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
