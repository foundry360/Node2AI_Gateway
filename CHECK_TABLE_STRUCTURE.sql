-- Run this in Supabase SQL Editor to check your users table structure

-- Check what columns exist
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'users'
ORDER BY ordinal_position;

-- Check what triggers exist
SELECT trigger_name, event_manipulation, action_statement
FROM information_schema.triggers
WHERE event_object_table = 'users';

-- Try to fix the trigger - recreate it to use the correct field access
DROP TRIGGER IF EXISTS audit_users_trigger ON users;

CREATE OR REPLACE FUNCTION fix_audit_trigger()
RETURNS TRIGGER AS $$
DECLARE
    org_id UUID;
    user_id UUID;
BEGIN
    -- Get organization_id from the record
    IF TG_OP = 'DELETE' THEN
        org_id := OLD.organization_id;
    ELSE
        org_id := NEW.organization_id;
    END IF;
    
    -- Get user_id safely
    IF TG_OP = 'DELETE' THEN
        user_id := OLD.updated_by;
    ELSE
        -- Try to get from created_by first, then updated_by
        BEGIN
            user_id := NEW.created_by;
        EXCEPTION WHEN OTHERS THEN
            user_id := NULL;
        END;
    END IF;
    
    -- Only log if we have an org
    IF org_id IS NOT NULL THEN
        PERFORM log_audit_event(
            org_id,
            user_id,
            TG_OP,
            TG_TABLE_NAME,
            COALESCE(NEW.id, OLD.id),
            jsonb_build_object(
                'old', CASE WHEN TG_OP = 'DELETE' THEN to_jsonb(OLD) ELSE NULL END,
                'new', CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN to_jsonb(NEW) ELSE NULL END
            ),
            CASE 
                WHEN TG_OP = 'DELETE' THEN 'warn'
                WHEN TG_OP = 'UPDATE' THEN 'info'
                ELSE 'info'
            END
        );
    END IF;
    
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_users_trigger
    AFTER INSERT OR UPDATE OR DELETE ON users
    FOR EACH ROW EXECUTE FUNCTION fix_audit_trigger();

