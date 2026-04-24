import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function setup() {
  console.log('--- Setting up XP History ---')

  // 1. Create table
  const { error: tableError } = await supabase.rpc('admin_run_sql', {
    sql: `
      CREATE TABLE IF NOT EXISTS xp_transactions (
        id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
        student_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
        amount integer NOT NULL,
        source_type text NOT NULL,
        description text,
        created_at timestamptz DEFAULT now()
      );

      ALTER TABLE xp_transactions ENABLE ROW LEVEL SECURITY;
      
      DROP POLICY IF EXISTS "Students can view their own XP history" ON xp_transactions;
      CREATE POLICY "Students can view their own XP history" ON xp_transactions
        FOR SELECT USING (auth.uid() = student_id);

      -- Function to log XP on profile update
      CREATE OR REPLACE FUNCTION public.log_xp_on_update()
      RETURNS TRIGGER AS $$
      BEGIN
        IF NEW.xp > OLD.xp THEN
          INSERT INTO public.xp_transactions (student_id, amount, source_type, description)
          VALUES (NEW.id, NEW.xp - OLD.xp, 'system', 'Earned XP');
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql SECURITY DEFINER;

      DROP TRIGGER IF EXISTS tr_log_xp_gain ON public.profiles;
      CREATE TRIGGER tr_log_xp_gain
      AFTER UPDATE OF xp ON public.profiles
      FOR EACH ROW
      EXECUTE PROCEDURE public.log_xp_on_update();
    `
  })

  // If RPC admin_run_sql doesn't exist (which is common in managed Supabase without custom setup),
  // we'll give the user the SQL instead.
  if (tableError) {
    console.error('RPC admin_run_sql not found or failed. Please run the following SQL manually in the Supabase Dashboard SQL Editor:')
    console.log(`
--- SQL START ---
CREATE TABLE IF NOT EXISTS xp_transactions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  amount integer NOT NULL,
  source_type text NOT NULL, -- 'test', 'login', 'quest', 'admin', 'system'
  description text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE xp_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Students can view their own XP history" ON xp_transactions;
CREATE POLICY "Students can view their own XP history" ON xp_transactions
  FOR SELECT USING (auth.uid() = student_id);

-- Log existing attempts to the history table for a richer experience immediately
INSERT INTO xp_transactions (student_id, amount, source_type, description, created_at)
SELECT student_id, xp_earned, 'test', 'Completed test effort', submitted_at
FROM attempts
ON CONFLICT DO NOTHING;

-- Log existing daily claims
INSERT INTO xp_transactions (student_id, amount, source_type, description, created_at)
SELECT student_id, xp_delta, 'login', 'Daily login bonus', created_at
FROM daily_xp_claims
ON CONFLICT DO NOTHING;

-- Trigger to auto-log future XP gains
CREATE OR REPLACE FUNCTION public.log_xp_on_update()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.xp > OLD.xp THEN
    INSERT INTO public.xp_transactions (student_id, amount, source_type, description)
    VALUES (NEW.id, NEW.xp - OLD.xp, 'system', 'General XP gain');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS tr_log_xp_gain ON public.profiles;
CREATE TRIGGER tr_log_xp_gain
AFTER UPDATE OF xp ON public.profiles
FOR EACH ROW
EXECUTE PROCEDURE public.log_xp_on_update();
--- SQL END ---
    `)
  } else {
    console.log('✓ Successfully set up database tables and triggers!')
  }
}

setup()
