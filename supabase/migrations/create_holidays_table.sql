-- Run this script in the Supabase SQL Editor

CREATE TABLE holidays (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    date DATE UNIQUE NOT NULL,
    name TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Note: In Supabase, if you want users to be able to read/write, you might need RLS policies.
-- If you are not using RLS tightly, you can disable it or add simple policies.
-- Here we enable it and allow authenticated users to read and insert (or you can restrict to admins).
ALTER TABLE holidays ENABLE ROW LEVEL SECURITY;

-- Allow anyone to read holidays
CREATE POLICY "Enable read access for all users" ON holidays FOR SELECT USING (true);

-- Allow authenticated users to insert/update/delete (You can tighten this later to just admins)
CREATE POLICY "Enable all access for authenticated users" ON holidays USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');
