-- Migration 001: Fix plate columns + add missing columns
-- TypeORM synchronize only creates new tables/columns; it does NOT alter
-- existing column types or lengths. Run this manually against the DB.
--
-- Dev:  docker exec -i $(docker ps -qf "name=postgres") psql -U taller_user -d taller_db < apps/api/src/database/migrations/001_fix_schema.sql
-- Prod: docker exec -i $(docker ps -qf "name=postgres") psql -U $POSTGRES_USER -d $POSTGRES_DB < apps/api/src/database/migrations/001_fix_schema.sql

-- 1. Expand plate columns to VARCHAR(50) in all tables
ALTER TABLE appointments       ALTER COLUMN plate TYPE VARCHAR(50);
ALTER TABLE bodyshop_entries   ALTER COLUMN plate TYPE VARCHAR(50);
ALTER TABLE budget_appointments ALTER COLUMN plate TYPE VARCHAR(50);

-- 2. Add missing columns to budget_appointments
ALTER TABLE budget_appointments
  ADD COLUMN IF NOT EXISTS processes       jsonb,
  ADD COLUMN IF NOT EXISTS linked_entry_id uuid,
  ADD COLUMN IF NOT EXISTS rejection_reason text,
  ADD COLUMN IF NOT EXISTS budget_number   varchar(50);

-- 3. Add missing columns to bodyshop_entries
ALTER TABLE bodyshop_entries
  ADD COLUMN IF NOT EXISTS waiting_for_resource boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS resource_note        varchar(200),
  ADD COLUMN IF NOT EXISTS resource_blocked_at  timestamptz,
  ADD COLUMN IF NOT EXISTS estimated_finish_date varchar(10),
  ADD COLUMN IF NOT EXISTS budget_number        varchar(50),
  ADD COLUMN IF NOT EXISTS processes            jsonb,
  ADD COLUMN IF NOT EXISTS advisor_code         varchar(30),
  ADD COLUMN IF NOT EXISTS advisor_name         varchar(100),
  ADD COLUMN IF NOT EXISTS time_start           varchar(8);

-- 4. Add missing columns to appointments
ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS advisor_code        varchar(30),
  ADD COLUMN IF NOT EXISTS advisor_name        varchar(100),
  ADD COLUMN IF NOT EXISTS phone               varchar(50),
  ADD COLUMN IF NOT EXISTS vehicle_description varchar(120),
  ADD COLUMN IF NOT EXISTS estimated_finish_date date;

-- 5. Verify result
SELECT table_name, column_name, character_maximum_length
FROM information_schema.columns
WHERE table_name IN ('appointments', 'bodyshop_entries', 'budget_appointments')
  AND column_name = 'plate'
ORDER BY table_name;
