-- Economy columns for controlled RTP (house hold / max RTP per round).
alter table public.admin_controls
  add column if not exists economics_enabled boolean not null default true,
  add column if not exists house_hold_pct numeric(5,4) not null default 0.30,
  add column if not exists max_rtp_pct numeric(5,4) not null default 0.70;
