/* Fix infinite recursion in hospital_users RLS policies.
 *
 * The previous policies queried hospital_users from inside the hospital_users
 * policies themselves. PostgreSQL therefore evaluated the same RLS policy again
 * and raised: "infinite recursion detected in policy for relation hospital_users".
 *
 * Use a SECURITY DEFINER helper for the network-admin check so that the helper
 * can inspect hospital_users without recursively invoking its RLS policies.
 */

CREATE OR REPLACE FUNCTION public.is_network_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.hospital_users
    WHERE user_id = auth.uid()
      AND role = 'network_admin'
  );
$$;

REVOKE ALL ON FUNCTION public.is_network_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_network_admin() TO authenticated;

DROP POLICY IF EXISTS "select_own_hospital_users" ON hospital_users;
CREATE POLICY "select_own_hospital_users" ON hospital_users FOR SELECT
  TO authenticated USING (
    auth.uid() = user_id OR public.is_network_admin()
  );

DROP POLICY IF EXISTS "insert_own_hospital_users" ON hospital_users;
CREATE POLICY "insert_own_hospital_users" ON hospital_users FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id OR public.is_network_admin());

DROP POLICY IF EXISTS "update_own_hospital_users" ON hospital_users;
CREATE POLICY "update_own_hospital_users" ON hospital_users FOR UPDATE
  TO authenticated USING (
    auth.uid() = user_id OR public.is_network_admin()
  ) WITH CHECK (
    auth.uid() = user_id OR public.is_network_admin()
  );

DROP POLICY IF EXISTS "delete_own_hospital_users" ON hospital_users;
CREATE POLICY "delete_own_hospital_users" ON hospital_users FOR DELETE
  TO authenticated USING (
    auth.uid() = user_id OR public.is_network_admin()
  );
