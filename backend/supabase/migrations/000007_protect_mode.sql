-- Allow 'protect' as a win_mode value — the admin-selectable Protect Mode
-- (a deliberately conservative weighted crash table for thin-reserve
-- periods), in addition to the existing 'normal' / 'win' / 'loss' values.
alter table admin_controls drop constraint if exists admin_controls_win_mode_check;
alter table admin_controls add constraint admin_controls_win_mode_check
  check (win_mode in ('normal', 'win', 'loss', 'protect'));
