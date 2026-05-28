-- project_migrations.version was created as `integer`, but
-- src/lib/backend-provision.functions.ts writes Date.now() into it.
-- Date.now() returns a millisecond epoch (~1.78e12 today), which overflows
-- a 4-byte integer and silently breaks the audit log on every applyBackendSchema
-- call. Widen to bigint.

ALTER TABLE public.project_migrations
  ALTER COLUMN version TYPE bigint USING version::bigint;
