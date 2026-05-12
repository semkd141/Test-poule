-- Competitions can be owned by a normal authenticated user (pool organizer).

ALTER TABLE public.competitions
  ADD COLUMN IF NOT EXISTS owner_user_id uuid REFERENCES auth.users (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS competitions_owner_user_id_idx
  ON public.competitions (owner_user_id)
  WHERE owner_user_id IS NOT NULL;

COMMENT ON COLUMN public.competitions.owner_user_id IS 'Supabase Auth user who created/owns this pool; NULL for platform-seeded competitions.';
