import { pool, setupDatabase } from './db.js';

try {
  await setupDatabase();
  console.log('PostgreSQL schema is ready.');
} catch (error) {
  console.error('Database setup failed:', error.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
