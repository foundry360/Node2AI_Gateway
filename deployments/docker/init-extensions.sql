-- Node2AI Database Extensions Initialization
-- This script runs before the main init-db.sql to ensure extensions are available

-- Enable required PostgreSQL extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "vector";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "btree_gin";

-- Verify extensions are installed
DO $$
BEGIN
    -- Check if uuid-ossp is available
    IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'uuid-ossp') THEN
        RAISE EXCEPTION 'uuid-ossp extension not available';
    END IF;
    
    -- Check if vector is available
    IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector') THEN
        RAISE EXCEPTION 'vector extension not available';
    END IF;
    
    -- Check if pg_trgm is available
    IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_trgm') THEN
        RAISE EXCEPTION 'pg_trgm extension not available';
    END IF;
    
    -- Check if btree_gin is available
    IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'btree_gin') THEN
        RAISE EXCEPTION 'btree_gin extension not available';
    END IF;
    
    RAISE NOTICE 'All required extensions are available';
END $$;
