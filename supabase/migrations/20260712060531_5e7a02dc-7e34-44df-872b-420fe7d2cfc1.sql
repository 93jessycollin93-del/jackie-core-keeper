
-- ============ api_keys ============
CREATE TABLE IF NOT EXISTS public.api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  key_hash text NOT NULL,
  prefix text NOT NULL,
  scopes jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.api_keys TO authenticated;
GRANT ALL ON public.api_keys TO service_role;
ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own api_keys" ON public.api_keys FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ============ user_bots ============
CREATE TABLE IF NOT EXISTS public.user_bots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  purpose text,
  platform text,
  behavior_style text,
  language text,
  logic_modules jsonb NOT NULL DEFAULT '[]'::jsonb,
  api_keys jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'draft',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_bots TO authenticated;
GRANT ALL ON public.user_bots TO service_role;
ALTER TABLE public.user_bots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own user_bots" ON public.user_bots FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER user_bots_touch BEFORE UPDATE ON public.user_bots FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ bot_api_keys ============
CREATE TABLE IF NOT EXISTS public.bot_api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  bot_id uuid NOT NULL REFERENCES public.user_bots(id) ON DELETE CASCADE,
  api_key_id uuid NOT NULL REFERENCES public.api_keys(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(bot_id, api_key_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bot_api_keys TO authenticated;
GRANT ALL ON public.bot_api_keys TO service_role;
ALTER TABLE public.bot_api_keys ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own bot_api_keys" ON public.bot_api_keys FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ============ jackie_control_audit ============
CREATE TABLE IF NOT EXISTS public.jackie_control_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ts timestamptz NOT NULL DEFAULT now(),
  actor text NOT NULL,
  command text NOT NULL,
  action_id text,
  args jsonb,
  result text NOT NULL,
  message text NOT NULL
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.jackie_control_audit TO authenticated;
GRANT ALL ON public.jackie_control_audit TO service_role;
ALTER TABLE public.jackie_control_audit ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own jackie_control_audit" ON public.jackie_control_audit FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ============ jackie_control_swarms ============
CREATE TABLE IF NOT EXISTS public.jackie_control_swarms (
  id text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  goal text NOT NULL,
  models jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'running',
  results jsonb NOT NULL DEFAULT '[]'::jsonb,
  started_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.jackie_control_swarms TO authenticated;
GRANT ALL ON public.jackie_control_swarms TO service_role;
ALTER TABLE public.jackie_control_swarms ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own jackie_control_swarms" ON public.jackie_control_swarms FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ============ jackie_control_prefs ============
CREATE TABLE IF NOT EXISTS public.jackie_control_prefs (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'owner',
  model_override text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.jackie_control_prefs TO authenticated;
GRANT ALL ON public.jackie_control_prefs TO service_role;
ALTER TABLE public.jackie_control_prefs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own jackie_control_prefs" ON public.jackie_control_prefs FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ============ jackie_memory ============
CREATE TABLE IF NOT EXISTS public.jackie_memory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  key text NOT NULL,
  value text NOT NULL,
  category text NOT NULL DEFAULT 'context',
  source_conversation_id uuid,
  confidence numeric NOT NULL DEFAULT 0.8,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, key)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.jackie_memory TO authenticated;
GRANT ALL ON public.jackie_memory TO service_role;
ALTER TABLE public.jackie_memory ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own jackie_memory" ON public.jackie_memory FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER jackie_memory_touch BEFORE UPDATE ON public.jackie_memory FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ jackie_tasks ============
CREATE TABLE IF NOT EXISTS public.jackie_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'todo',
  priority text NOT NULL DEFAULT 'medium',
  category text NOT NULL DEFAULT 'general',
  due_date timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.jackie_tasks TO authenticated;
GRANT ALL ON public.jackie_tasks TO service_role;
ALTER TABLE public.jackie_tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own jackie_tasks" ON public.jackie_tasks FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER jackie_tasks_touch BEFORE UPDATE ON public.jackie_tasks FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ gunit_agents ============
CREATE TABLE IF NOT EXISTS public.gunit_agents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  status text NOT NULL DEFAULT 'idle',
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.gunit_agents TO authenticated;
GRANT ALL ON public.gunit_agents TO service_role;
ALTER TABLE public.gunit_agents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own gunit_agents" ON public.gunit_agents FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ============ gunit_bots ============
CREATE TABLE IF NOT EXISTS public.gunit_bots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT 'bot',
  spec jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.gunit_bots TO authenticated;
GRANT ALL ON public.gunit_bots TO service_role;
ALTER TABLE public.gunit_bots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own gunit_bots" ON public.gunit_bots FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ============ gunit_improvements ============
CREATE TABLE IF NOT EXISTS public.gunit_improvements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  goal text NOT NULL,
  improvement text NOT NULL DEFAULT '',
  score numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.gunit_improvements TO authenticated;
GRANT ALL ON public.gunit_improvements TO service_role;
ALTER TABLE public.gunit_improvements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own gunit_improvements" ON public.gunit_improvements FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ============ gunit_memory ============
CREATE TABLE IF NOT EXISTS public.gunit_memory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'user',
  content text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.gunit_memory TO authenticated;
GRANT ALL ON public.gunit_memory TO service_role;
ALTER TABLE public.gunit_memory ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own gunit_memory" ON public.gunit_memory FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
