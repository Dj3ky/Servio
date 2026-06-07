-- Add project_manager role
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'project_manager';
