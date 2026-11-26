-- Restrict directory-wide profile reads to administrators.
-- Users retain access to their own profile through profiles_read_own.
DROP POLICY IF EXISTS profiles_staff_read ON public.profiles;

CREATE POLICY profiles_admin_read
ON public.profiles
FOR SELECT
TO authenticated
USING ((SELECT public.is_admin()));
