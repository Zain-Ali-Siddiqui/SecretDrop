import { spawnSync } from 'node:child_process';

// Pass the installed Vercel CLI's dist/index.js path as the first argument.
// Secrets are sent over stdin, never command-line arguments or console output.
const cli = process.argv[2];
if (!cli) throw new Error('Provide the path to the Vercel CLI entrypoint.');
for (const name of ['PGUSER', 'PGPASSWORD', 'PGDATABASE', 'PGHOST', 'PGPORT', 'PGSSL', 'PGSSLROOTCERT']) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  const result = spawnSync(process.execPath, [cli, 'env', 'add', name, 'production', '--force', '--sensitive'], {
    input: value, encoding: 'utf8', windowsHide: true,
  });
  if (result.status !== 0) throw new Error(`Could not configure ${name}; exit ${result.status}.`);
  console.log(`Configured ${name} for production.`);
}
