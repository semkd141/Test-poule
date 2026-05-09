-- Optional: bind legacy email-only rows once users exist in Supabase Auth with the same email.
-- Run manually in SQL Editor after verifying data. Not applied automatically.

-- UPDATE public.deelnemers d
-- SET user_id = u.id
-- FROM auth.users u
-- WHERE d.user_id IS NULL
--   AND lower(trim(d.email)) = lower(trim(u.email));

-- With multiple auth identities per email (rare), pick the intended user_id first (e.g. last_sign_in_at).
