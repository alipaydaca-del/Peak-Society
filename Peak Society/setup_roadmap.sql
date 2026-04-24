-- Create the user_progress table to separately manage Roadmap completion tracking without disrupting the existing users table schema.
create table public.user_progress (
  user_id uuid references auth.users(id) on delete cascade primary key,
  completed_lessons text[] default '{}'
);

-- Enable RLS
alter table public.user_progress enable row level security;

-- Policies
create policy "Users can view their own progress" 
  on public.user_progress for select 
  using (user_id = auth.uid());

create policy "Users can manage their own progress" 
  on public.user_progress for all 
  using (user_id = auth.uid()) 
  with check (user_id = auth.uid());
