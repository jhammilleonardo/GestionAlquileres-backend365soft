-- ============================================================================
-- Migration: 004_create_property_leads_table.sql
-- Description: Create table to store property inquiry leads from public catalog
-- Author: Backend Team
-- Date: 2026-04-09
-- Status: Deployed to all tenants
-- ============================================================================

-- UP: Create property_leads table
CREATE TABLE IF NOT EXISTS property_leads (
  id SERIAL PRIMARY KEY,
  property_id INT NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL,
  phone VARCHAR(20) NOT NULL,
  message TEXT NOT NULL,
  inquiry_type VARCHAR(50) DEFAULT 'general',
  availability VARCHAR(50),
  status VARCHAR(50) DEFAULT 'PENDING',
  user_ip VARCHAR(45),
  assigned_to INT REFERENCES "user"(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_property_leads_property_id ON property_leads(property_id);
CREATE INDEX IF NOT EXISTS idx_property_leads_email ON property_leads(email);
CREATE INDEX IF NOT EXISTS idx_property_leads_status ON property_leads(status);
CREATE INDEX IF NOT EXISTS idx_property_leads_assigned_to ON property_leads(assigned_to);
CREATE INDEX IF NOT EXISTS idx_property_leads_created_at ON property_leads(created_at DESC);

-- Update trigger for automatically updating updated_at
CREATE OR REPLACE FUNCTION update_property_leads_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_property_leads_updated_at ON property_leads;
CREATE TRIGGER trigger_property_leads_updated_at
BEFORE UPDATE ON property_leads
FOR EACH ROW
EXECUTE FUNCTION update_property_leads_updated_at();

-- ============================================================================
-- DOWN: Uncomment to rollback
-- ============================================================================
-- DROP TRIGGER IF EXISTS trigger_property_leads_updated_at ON property_leads;
-- DROP FUNCTION IF EXISTS update_property_leads_updated_at();
-- DROP TABLE IF EXISTS property_leads CASCADE;
