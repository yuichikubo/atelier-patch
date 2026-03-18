-- ATELIER CMS — Supabase table setup
-- Run this in Supabase Dashboard → SQL Editor

create table if not exists pages (
  id           text        primary key,
  slug         text        not null,
  title        text        not null,
  status       text        not null default 'draft',
  workspace_id text        not null,
  version      integer     not null default 0,
  data         jsonb       not null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- Index for fast workspace queries
create index if not exists pages_workspace_idx on pages (workspace_id, updated_at desc);

-- Index for slug lookup (used by /site/[slug])
create unique index if not exists pages_slug_workspace_idx on pages (slug, workspace_id);

-- Row Level Security (optional — enable if you add auth)
-- alter table pages enable row level security;

-- Seed the demo page (optional)
-- Run after creating the table if you want the demo page to appear
insert into pages (id, slug, title, status, workspace_id, version, data) values (
  'home-dev-001',
  'home',
  'ATELIER — AI-Native CMS',
  'published',
  'dev-workspace',
  3,
  '{"id":"home-dev-001","title":"ATELIER — AI-Native CMS","slug":"home","status":"published","workspaceId":"dev-workspace","themeId":"luxury","version":3,"seo":{"title":"ATELIER CMS — Intelligent Editing","description":"A calm, AI-powered CMS built for clarity and strategy."},"sections":[]}'::jsonb
) on conflict (id) do nothing;
