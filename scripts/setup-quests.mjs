import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function setup() {
  console.log('--- Setting up Quest System ---')

  // 1. Seed Quests
  const quests = [
    { title: 'Daily Explorer', description: 'Complete 2 test attempts today', type: 'daily', target_type: 'test', target_count: 2, xp_reward: 50 },
    { title: 'XP Miner', description: 'Earn 100 XP from any source', type: 'daily', target_type: 'xp', target_count: 100, xp_reward: 30 },
    { title: 'Social Scholar', description: 'Post 1 time in the forum', type: 'daily', target_type: 'social', target_count: 1, xp_reward: 25 },
    { title: 'Weekly Warrior', description: 'Complete 10 tests this week', type: 'weekly', target_type: 'test', target_count: 10, xp_reward: 200 },
    { title: 'Knowledge Milestone', description: 'Earn a total of 500 XP', type: 'special', target_type: 'xp', target_count: 500, xp_reward: 100 },
    { title: 'Elite Milestone', description: 'Earn a total of 2500 XP', type: 'special', target_type: 'xp', target_count: 2500, xp_reward: 500 },
  ]

  console.log('Seeding quests...')
  const { error: seedError } = await supabase.from('quests').upsert(quests, { onConflict: 'title' })
  
  if (seedError) {
    console.error('Failed to seed quests:', seedError)
  } else {
    console.log('✓ Successfully seeded quests!')
  }

  // 2. Provide instructions for the RPC
  console.log('\n--- SQL REQUIRED ---')
  console.log('Please run the following SQL in the Supabase Dashboard SQL Editor to allow students to claim rewards:')
  console.log(`
--- SQL START ---
-- Function to claim quest rewards atomically
CREATE OR REPLACE FUNCTION public.claim_quest_reward(p_progress_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_student_id uuid;
  v_xp_reward integer;
  v_completed boolean;
  v_claimed boolean;
BEGIN
  -- 1. Fetch quest details
  SELECT qp.student_id, qp.completed, qp.claimed, q.xp_reward
  INTO v_student_id, v_completed, v_claimed, v_xp_reward
  FROM public.quest_progress qp
  JOIN public.quests q ON q.id = qp.quest_id
  WHERE qp.id = p_progress_id;

  -- 2. Validate
  IF NOT v_completed THEN
    RAISE EXCEPTION 'Quest not completed yet';
  END IF;
  
  IF v_claimed THEN
    RAISE EXCEPTION 'Reward already claimed';
  END IF;

  -- 3. Mark as claimed
  UPDATE public.quest_progress
  SET claimed = true
  WHERE id = p_progress_id;

  -- 4. Reward XP to profile (this will trigger the XP log trigger we created earlier!)
  UPDATE public.profiles
  SET xp = COALESCE(xp, 0) + v_xp_reward
  WHERE id = v_student_id;

END;
$$;

-- Grant access
GRANT EXECUTE ON FUNCTION public.claim_quest_reward(uuid) TO authenticated;
--- SQL END ---
  `)
}

setup()
