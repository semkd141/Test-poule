-- Invitations to join an owner-created competition; accepting creates a membership row
-- so the user may register (deelnemers) for that competition_id.

CREATE TABLE IF NOT EXISTS public.competition_invites (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  competition_id bigint NOT NULL REFERENCES public.competitions (id) ON DELETE CASCADE,
  email text NOT NULL,
  token_hash text NOT NULL UNIQUE,
  invited_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  accepted_at timestamptz,
  accepted_user_id uuid REFERENCES auth.users (id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS competition_invites_competition_idx
  ON public.competition_invites (competition_id);

CREATE INDEX IF NOT EXISTS competition_invites_competition_email_idx
  ON public.competition_invites (competition_id, email);

COMMENT ON TABLE public.competition_invites IS 'Email invite to a pool; token in emails is hashed here.';

CREATE TABLE IF NOT EXISTS public.competition_members (
  competition_id bigint NOT NULL REFERENCES public.competitions (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  invite_id bigint REFERENCES public.competition_invites (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (competition_id, user_id)
);

CREATE INDEX IF NOT EXISTS competition_members_user_idx ON public.competition_members (user_id);

COMMENT ON TABLE public.competition_members IS 'User may register a team in this competition (after accepting invite or as owner).';
