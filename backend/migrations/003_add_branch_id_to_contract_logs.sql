-- Migration: Add branch_id to contract_logs for tracking which branch performed the action
-- Date: 2025-12-17
-- Description: Add branch_id to contract_logs to record which branch executed contract operations (transfer, pause, etc.)

ALTER TABLE contract_logs
ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id);

-- Create index for branch queries
CREATE INDEX IF NOT EXISTS idx_contract_logs_branch
ON contract_logs(branch_id);

-- Add comment for documentation
COMMENT ON COLUMN contract_logs.branch_id IS 'The branch where the contract operation was performed';

-- Verify column was added
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'contract_logs'
AND column_name = 'branch_id';
