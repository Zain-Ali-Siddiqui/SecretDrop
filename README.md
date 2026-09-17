# SecretDrop

Encrypted message sharing using React, a Node.js API, and Supabase PostgreSQL. Encryption and decryption run in the browser; the API stores ciphertext only. Senders choose a 10-minute, 1-hour, 1-day, or 7-day lifetime and can enable Burn After Read.

Manual deletion requires the sender's private management link. Its random token is separate from the recipient share link, stored only as a hash in the database, and never returned by read endpoints. Save the private link; without accounts there is no sender-key recovery. Pre-update messages remain readable until expiry but have no sender deletion key, so public deletion of those messages is disabled.

Burn messages contain a random read-confirmation token inside their encrypted payload. After successful local decryption, the app atomically deletes the database record using that token, then reveals the text and shows the Self-destructed badge. Incorrect passwords cannot confirm a burn. Only one concurrent confirmation succeeds. This cannot prevent a modified client from saving ciphertext or withholding confirmation, or a recipient from retaining revealed text.

The view counter records unlock requests, including incorrect-password attempts; it is not a count of distinct people or proof of successful reads. Expiry is enforced server-side on every unlock/burn request; expired rows are inaccessible but are not physically purged by a scheduled task. Burn and sender deletion physically remove the record from the live table.

## Local setup

Requires Node.js 22.9+ and a Supabase project. The frontend uses the Node API, which connects to Supabase PostgreSQL over verified TLS. No database password is sent to the browser.

1. In Supabase, open **Connect > Session pooler** and copy the exact host, user, database, and port into `.env`. Session pooler usernames normally include the project reference (`postgres.<project-ref>`). Direct connections use `postgres` and require a network supporting the project endpoint.
2. Set `PGPASSWORD` to your database password and `PGSSL=true`. Keep special characters literal by quoting the password. If the certificate is not trusted by Node, download the database CA certificate from Supabase settings and set `PGSSLROOTCERT` to its file path. Do not disable certificate verification. Database credentials stay on the server; do not prefix them with `VITE_`.
3. Run `npm install`.
4. Run `npm run db:setup` to create the table in the configured database.
5. Run `npm run dev` and open the Vite URL shown in the terminal.

The API uses port 3001; Vite forwards `/api` requests to it. If you change the API port, also update the proxies in `vite.config.ts`.

## Production build

Run `npm run build`, then `npm start`. The Node server serves both the built frontend and API at http://127.0.0.1:3001. On hosting, set the same server environment variables in the hosting dashboard; a physical `.env` file is optional for `npm start`. The server binds to `0.0.0.0` and respects the hosting provider's `PORT`. Use HTTPS for remote access so browser encryption is available. A static-only host cannot run the database API.

The schema is also initialized on server startup. Setup creates the table if missing and never drops existing records. Previous hosted records are not automatically copied into this Supabase database.

## Hosting frontend and backend on one URL (Vercel)

This repository includes a Vite frontend and a Vercel Node function in `api/index.js`.
`vercel.json` routes `/api/*` to the existing Express API. The frontend uses relative
`/api` URLs, so published share links and API calls use the same domain.

Production: https://secret-drop-app.vercel.app

The former https://secret-drop-app.surge.sh address redirects to production,
preserving message code query parameters. Its redirect page is in
`deployment/surge-redirect/index.html`.

1. Sign in to Vercel and use the free Hobby plan for a personal project.
2. Add the values from your local `.env` as server environment variables:
   `PGUSER`, `PGPASSWORD`, `PGDATABASE`, `PGHOST`, `PGPORT`, `PGSSL`,
   and `PGSSLROOTCERT`. Never prefix database credentials with `VITE_`.
   Keep `PGSSLROOTCERT=server/certs/supabase-ca.crt`; the public CA is bundled
   with the function. Keep `PGSSL=true`.
3. Run `npm run db:setup` once before the first deployment. The serverless
   handler does not perform schema changes on requests.
4. Deploy with `npx vercel --prod`. No separate backend URL is needed.
   Leave `VITE_API_BASE_URL` unset for this deployment.
5. Verify `/api/health` and run `npm run test:smoke` with
   `SECRET_DROP_TEST_URL` set to the resulting HTTPS origin. The smoke test
   creates and removes its own random encrypted test record.

Deploying only `dist` to Surge still cannot run the Node API. Deploy the whole
project to Vercel for a working single-domain application. `.env` files are
excluded from the uploaded source; configure secrets in Vercel's environment.

## Checks

Run `npm run typecheck`, `npm run lint`, and `npm run build`.

The message table has row-level security enabled and is accessed by the server database role. The browser does not connect to the Supabase Data API. Existing data in a different project is not migrated.

Connection reference: https://supabase.com/docs/guides/database/connecting-to-postgres

## Configured cloud connection

The environment template uses the project's session pooler on port 5432. Set the database password in `.env` locally and in your hosting environment for deployment. `PGPASSWORD` is a literal password, not a URL, so do not percent-encode it. Include `server/certs/supabase-ca.crt` in the deployment and set `PGSSLROOTCERT=server/certs/supabase-ca.crt` with `PGSSL=true`. The CA certificate is public; the password must stay private.
