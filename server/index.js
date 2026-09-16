import app from './app.js';
import { pool, setupDatabase } from './db.js';

try {
  await setupDatabase();
  const server = app.listen(Number(process.env.PORT || 3001), process.env.HOST || '0.0.0.0', () => console.log('SecretDrop API ready.'));
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, () => server.close(() => pool.end()));
  }
} catch (error) {
  console.error('Cannot start PostgreSQL API:', error.message);
  await pool.end();
  process.exitCode = 1;
}
