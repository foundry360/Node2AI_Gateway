-- Apply on existing Postgres volumes:
--   docker compose exec -T postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" < db/schema-epa.sql
--   docker compose exec -T postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" < db/seed-epa.sql
-- New Compose volumes load schema-epa.sql + seed-epa.sql via docker-entrypoint-initdb.d.

SELECT 'See schema-epa.sql and seed-epa.sql' AS migrate_epa_hint;
