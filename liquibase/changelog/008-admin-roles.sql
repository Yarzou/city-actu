-- liquibase formatted sql

-- changeset ville-actu:008-admin-roles splitStatements:false
-- comment: Rôle admin DB via profiles.is_admin + protection contre élévation de privilège côté client
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT FALSE;

CREATE OR REPLACE FUNCTION prevent_profile_admin_escalation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF COALESCE(NEW.is_admin, false) <> COALESCE(OLD.is_admin, false)
     AND auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'Modification de is_admin non autorisée';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_prevent_admin_escalation ON profiles;
CREATE TRIGGER profiles_prevent_admin_escalation
  BEFORE UPDATE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION prevent_profile_admin_escalation();

-- rollback DROP TRIGGER IF EXISTS profiles_prevent_admin_escalation ON profiles;
-- rollback DROP FUNCTION IF EXISTS prevent_profile_admin_escalation();
-- rollback ALTER TABLE profiles DROP COLUMN IF EXISTS is_admin;
