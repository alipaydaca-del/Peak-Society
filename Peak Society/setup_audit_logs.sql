-- Create the Audit Logs table
create table public.audit_logs (
    id text primary key,
    action text not null,
    target text not null,
    "performedBy" text not null,
    date timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable Row Level Security
alter table public.audit_logs enable row level security;

-- Admin Policy (Full Access)
-- Only Owners and Admins can view or insert audit logs. Regular users cannot!
create policy "Admins can manage audit logs"
  on public.audit_logs
  for all
  using (
    (select role from public.users where id = auth.uid()) in ('owner', 'admin')
  )
  with check (
    (select role from public.users where id = auth.uid()) in ('owner', 'admin')
  );

-- Note: In app.js, the 'performedBy' field uses session.username. 
-- Make sure your backend logic has admin privileges or change the RLS to allow inserts from authenticated users if you want them to log their own actions securely.
