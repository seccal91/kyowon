import pkg from 'pg';

const { Pool } = pkg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl:
    process.env.DATABASE_URL && process.env.NODE_ENV === 'production'
      ? { rejectUnauthorized: false }
      : undefined,
});

export default pool;
