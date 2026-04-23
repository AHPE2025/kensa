create extension if not exists "pgcrypto";

create table if not exists public.tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now()
);

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  address text not null,
  inspection_date date not null,
  created_at timestamptz not null default now()
);

create table if not exists public.contractors (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  category text,
  phone text,
  created_at timestamptz not null default now()
);

create table if not exists public.drawings (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  floor_label text not null,
  file_path text not null,
  original_pdf_path text,
  page_images text[] not null default '{}',
  file_name text,
  page_count int not null check (page_count > 0),
  created_at timestamptz not null default now()
);

alter table public.drawings add column if not exists original_pdf_path text;
alter table public.drawings add column if not exists page_images text[] not null default '{}';
alter table public.drawings add column if not exists file_name text;

create table if not exists public.issues (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  drawing_id uuid not null references public.drawings(id) on delete cascade,
  page_index int not null check (page_index >= 0),
  floor_label text not null,
  pin_x double precision not null check (pin_x >= 0 and pin_x <= 1),
  pin_y double precision not null check (pin_y >= 0 and pin_y <= 1),
  callout_x double precision not null check (callout_x >= 0 and callout_x <= 1),
  callout_y double precision not null check (callout_y >= 0 and callout_y <= 1),
  issue_type text not null,
  issue_text text not null,
  contractor_id uuid references public.contractors(id) on delete restrict,
  status text not null default 'open',
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);

create table if not exists public.issue_media (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  issue_id uuid not null references public.issues(id) on delete cascade,
  file_path text not null,
  created_at timestamptz not null default now()
);

create index if not exists projects_tenant_id_idx on public.projects(tenant_id);
create index if not exists contractors_tenant_id_idx on public.contractors(tenant_id);
create index if not exists drawings_tenant_project_idx on public.drawings(tenant_id, project_id);
create index if not exists issues_tenant_project_idx on public.issues(tenant_id, project_id);
create index if not exists issues_drawing_page_idx on public.issues(drawing_id, page_index);

alter table public.issues alter column contractor_id drop not null;

insert into storage.buckets (id, name, public)
values ('drawings-pdf', 'drawings-pdf', false)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('drawings-images', 'drawings-images', false)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('exports-pdf', 'exports-pdf', false)
on conflict (id) do nothing;
