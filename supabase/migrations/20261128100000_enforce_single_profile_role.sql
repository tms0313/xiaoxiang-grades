-- Enforce one application role per account.
-- Legacy profile_roles rows are no longer consulted for authorization.
CREATE OR REPLACE FUNCTION public.has_app_role(p_user_id uuid, p_role text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT CASE
    WHEN p_user_id IS DISTINCT FROM (SELECT auth.uid())
      AND NOT public.is_admin()
    THEN false
    ELSE EXISTS (
      SELECT 1
      FROM public.profiles
      WHERE id = p_user_id
        AND role = p_role
    )
  END;
$function$;
