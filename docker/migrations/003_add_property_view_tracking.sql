-- ============================================================================
-- Migration: 003_add_property_view_tracking.sql
-- Description: Add view tracking columns to properties table
-- Author: Backend Team
-- Date: 2026-04-09
-- Status: Deployed to all tenants
-- ============================================================================

-- UP: Add columns for view tracking
ALTER TABLE properties
ADD COLUMN IF NOT EXISTS view_count INT DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_viewed_at TIMESTAMP NULL;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_properties_view_count ON properties(view_count DESC);
CREATE INDEX IF NOT EXISTS idx_properties_last_viewed_at ON properties(last_viewed_at DESC);
CREATE INDEX IF NOT EXISTS idx_properties_status_view_count ON properties(status, view_count DESC);

-- ============================================================================
-- DOWN: Uncomment to rollback
-- ============================================================================
-- DROP INDEX IF EXISTS idx_properties_status_view_count;
-- DROP INDEX IF EXISTS idx_properties_last_viewed_at;
-- DROP INDEX IF EXISTS idx_properties_view_count;
-- ALTER TABLE properties
-- DROP COLUMN IF EXISTS last_viewed_at,
-- DROP COLUMN IF EXISTS view_count;
