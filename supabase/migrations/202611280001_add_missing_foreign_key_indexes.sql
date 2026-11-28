create index if not exists site_messages_created_by_idx
  on public.site_messages (created_by);

create index if not exists site_messages_updated_by_idx
  on public.site_messages (updated_by);

create index if not exists temporary_events_created_by_idx
  on public.temporary_events (created_by);
