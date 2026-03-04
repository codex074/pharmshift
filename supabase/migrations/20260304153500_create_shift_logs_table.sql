-- Create shift_logs table
CREATE TABLE IF NOT EXISTS public.shift_logs (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    shift_id UUID REFERENCES public.shifts(id) ON DELETE SET NULL,
    action TEXT NOT NULL CHECK (action IN ('swap', 'transfer', 'admin_edit', 'admin_delete')),
    old_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
    new_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
    performed_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    details TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS
ALTER TABLE public.shift_logs ENABLE ROW LEVEL SECURITY;

-- Create Policies
CREATE POLICY "Allow authenticated users to read shift_logs"
    ON public.shift_logs FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "Allow authenticated users to insert shift_logs"
    ON public.shift_logs FOR INSERT
    TO authenticated
    WITH CHECK (true);
