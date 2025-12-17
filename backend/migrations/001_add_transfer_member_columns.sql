-- Migration: Add transfer member columns to contract_logs
-- Date: 2025-12-17
-- Description: Add original_member_id and target_member_id for contract transfer functionality

ALTER TABLE contract_logs
ADD COLUMN IF NOT EXISTS original_member_id UUID REFERENCES members(id),
ADD COLUMN IF NOT EXISTS target_member_id UUID REFERENCES members(id);

-- Create partial index for transfer logs
CREATE INDEX IF NOT EXISTS idx_contract_logs_transfer
ON contract_logs(target_member_id)
WHERE log_type = 'TRANSFER';

-- Verify columns were added
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'contract_logs'
AND column_name IN ('original_member_id', 'target_member_id');
