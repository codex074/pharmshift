-- migration to add salary_number to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS salary_number TEXT;
