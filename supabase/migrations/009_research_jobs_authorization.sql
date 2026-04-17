-- Remove the permissive research_jobs policy found in production and
-- reassert owner-scoped access for client-issued queries.

drop policy if exists "Service role full access" on public.research_jobs;
drop policy if exists research_owner_read on public.research_jobs;
drop policy if exists research_owner_write on public.research_jobs;

create policy research_owner_read on public.research_jobs
  for select
  using (owner_id = auth.uid());

create policy research_owner_write on public.research_jobs
  for all
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());
