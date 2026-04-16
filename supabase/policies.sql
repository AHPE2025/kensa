alter table public.tenants enable row level security;
alter table public.profiles enable row level security;
alter table public.projects enable row level security;
alter table public.contractors enable row level security;
alter table public.drawings enable row level security;
alter table public.issues enable row level security;
alter table public.issue_media enable row level security;

create or replace function public.current_tenant_id()
returns uuid
language sql
stable
as $$
  select tenant_id from public.profiles where id = auth.uid()
$$;

drop policy if exists "tenants_select" on public.tenants;
create policy "tenants_select" on public.tenants
for select using (id = public.current_tenant_id());

drop policy if exists "tenants_insert" on public.tenants;
create policy "tenants_insert" on public.tenants
for insert with check (true);

drop policy if exists "profiles_select" on public.profiles;
create policy "profiles_select" on public.profiles
for select using (tenant_id = public.current_tenant_id());

drop policy if exists "profiles_insert_self" on public.profiles;
create policy "profiles_insert_self" on public.profiles
for insert with check (
  id = auth.uid()
  and tenant_id is not null
);

drop policy if exists "profiles_update_self" on public.profiles;
create policy "profiles_update_self" on public.profiles
for update using (id = auth.uid()) with check (tenant_id = public.current_tenant_id());

drop policy if exists "projects_rw_tenant" on public.projects;
create policy "projects_rw_tenant" on public.projects
for all using (tenant_id = public.current_tenant_id()) with check (tenant_id = public.current_tenant_id());

drop policy if exists "contractors_rw_tenant" on public.contractors;
create policy "contractors_rw_tenant" on public.contractors
for all using (tenant_id = public.current_tenant_id()) with check (tenant_id = public.current_tenant_id());

drop policy if exists "drawings_rw_tenant" on public.drawings;
create policy "drawings_rw_tenant" on public.drawings
for all using (tenant_id = public.current_tenant_id()) with check (tenant_id = public.current_tenant_id());

drop policy if exists "issues_rw_tenant" on public.issues;
create policy "issues_rw_tenant" on public.issues
for all using (tenant_id = public.current_tenant_id()) with check (tenant_id = public.current_tenant_id());

drop policy if exists "issue_media_rw_tenant" on public.issue_media;
create policy "issue_media_rw_tenant" on public.issue_media
for all using (tenant_id = public.current_tenant_id()) with check (tenant_id = public.current_tenant_id());

drop policy if exists "drawings_pdf_rw_tenant" on storage.objects;
create policy "drawings_pdf_rw_tenant" on storage.objects
for all to authenticated
using (
  bucket_id = 'drawings-pdf'
  and (storage.foldername(name))[1] = public.current_tenant_id()::text
)
with check (
  bucket_id = 'drawings-pdf'
  and (storage.foldername(name))[1] = public.current_tenant_id()::text
);

drop policy if exists "exports_pdf_rw_tenant" on storage.objects;
create policy "exports_pdf_rw_tenant" on storage.objects
for all to authenticated
using (
  bucket_id = 'exports-pdf'
  and (storage.foldername(name))[1] = public.current_tenant_id()::text
)
with check (
  bucket_id = 'exports-pdf'
  and (storage.foldername(name))[1] = public.current_tenant_id()::text
);
