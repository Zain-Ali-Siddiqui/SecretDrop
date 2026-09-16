# Supabase database CA

`supabase-ca.crt` is the public Supabase Root 2021 CA certificate downloaded over HTTPS from:

https://supabase-downloads.s3-ap-southeast-1.amazonaws.com/prod/ssl/prod-ca-2021.crt

Set `PGSSL=true` and `PGSSLROOTCERT=server/certs/supabase-ca.crt` in the server environment. Keep this file in the deployment. TLS certificate and hostname verification remain enabled.

Supabase documents certificate verification here: https://supabase.com/docs/guides/database/psql
