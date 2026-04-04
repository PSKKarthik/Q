-- ============================================================
-- PHASE 4 MIGRATION — Run this in Supabase SQL Editor
-- ============================================================

-- #27: profiles_select — require authentication (was open to everyone)
DROP POLICY IF EXISTS "profiles_select" ON profiles;
CREATE POLICY "profiles_select" ON profiles FOR SELECT
  USING (auth.role() = 'authenticated');

-- #26: profiles_update — block role field changes from client
DROP POLICY IF EXISTS "profiles_update" ON profiles;
CREATE POLICY "profiles_update" ON profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (
    role = (SELECT role FROM profiles WHERE id = auth.uid())
  );

-- #28: questions_select — require authentication (was open to everyone)
DROP POLICY IF EXISTS "questions_select" ON questions;
CREATE POLICY "questions_select" ON questions FOR SELECT
  USING (auth.role() = 'authenticated');

-- #29: Admin can see all attempts (teacher policy already existed)
DROP POLICY IF EXISTS "attempts_select_admin" ON attempts;
CREATE POLICY "attempts_select_admin" ON attempts FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  );
