-- modolouge_link_account deliberately runs as the calling service_role.
-- Supabase does not grant that role SELECT on auth.users by default.
-- Only grant the fields needed to verify an identity; keep the function
-- SECURITY INVOKER and keep browser roles unable to execute it.
grant select (id, email, email_confirmed_at, is_anonymous)
  on auth.users to service_role;
