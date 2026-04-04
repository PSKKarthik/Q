-- ============================================================
-- SCHEMA HOTFIX — Run this in Supabase SQL Editor
-- Fixes column mismatches discovered by full codebase audit
-- ============================================================

-- ============================================================
-- FIX 1: live_classes — missing `subject` and `room_id` columns
-- LiveClassModule.tsx inserts both fields; schema only had `room_url`
-- ============================================================
ALTER TABLE live_classes ADD COLUMN IF NOT EXISTS subject text;
ALTER TABLE live_classes ADD COLUMN IF NOT EXISTS room_id text;

-- ============================================================
-- FIX 2: meeting_slots — missing `start_time`, `end_time`, `parent_name`
-- MeetingSchedulerModule.tsx inserts start_time/end_time instead of `time`
-- and writes parent_name on booking (schema had booked_name, not parent_name)
-- The old `time NOT NULL` constraint must be dropped to allow inserts
-- ============================================================
ALTER TABLE meeting_slots ALTER COLUMN time DROP NOT NULL;
ALTER TABLE meeting_slots ADD COLUMN IF NOT EXISTS start_time text;
ALTER TABLE meeting_slots ADD COLUMN IF NOT EXISTS end_time text;
ALTER TABLE meeting_slots ADD COLUMN IF NOT EXISTS parent_name text;

-- ============================================================
-- FIX 3: profiles — optional avatar image URL
-- ============================================================
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS avatar_url text;

-- ============================================================
-- FIX 4: plagiarism flag persistence for teacher review workflow
-- ============================================================
CREATE TABLE IF NOT EXISTS plagiarism_flags (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	assignment_id uuid REFERENCES assignments(id) ON DELETE CASCADE,
	teacher_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
	student_a_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
	student_b_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
	submission_a_id uuid REFERENCES submissions(id) ON DELETE SET NULL,
	submission_b_id uuid REFERENCES submissions(id) ON DELETE SET NULL,
	similarity integer NOT NULL,
	status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'reviewed', 'dismissed')),
	shared_phrases jsonb DEFAULT '[]'::jsonb,
	created_at timestamptz DEFAULT now()
);

ALTER TABLE plagiarism_flags ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "plagiarism_flags_select" ON plagiarism_flags;
CREATE POLICY "plagiarism_flags_select" ON plagiarism_flags FOR SELECT USING (true);
DROP POLICY IF EXISTS "plagiarism_flags_insert" ON plagiarism_flags;
CREATE POLICY "plagiarism_flags_insert" ON plagiarism_flags FOR INSERT WITH CHECK (auth.uid() = teacher_id);
DROP POLICY IF EXISTS "plagiarism_flags_update" ON plagiarism_flags;
CREATE POLICY "plagiarism_flags_update" ON plagiarism_flags FOR UPDATE USING (auth.uid() = teacher_id);

-- ============================================================
-- VERIFY (optional — run to confirm columns exist)
-- ============================================================
-- SELECT column_name FROM information_schema.columns
--   WHERE table_name = 'live_classes'   ORDER BY ordinal_position;
-- SELECT column_name FROM information_schema.columns
--   WHERE table_name = 'meeting_slots'  ORDER BY ordinal_position;
