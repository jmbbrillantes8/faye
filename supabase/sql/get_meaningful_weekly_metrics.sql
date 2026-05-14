-- Run this once in the Supabase SQL editor.
-- Called by /api/cron/weekly-metrics to compute the north star metric for a given Mon–Sun week.

create or replace function get_meaningful_weekly_metrics(
  week_start timestamptz,
  week_end   timestamptz
)
returns table (
  meaningful_sessions bigint,
  meaningful_users    bigint
)
language sql stable
as $$
  select
    count(s.id)                    as meaningful_sessions,
    count(distinct s.anonymous_id) as meaningful_users
  from sessions s
  cross join lateral (
    select role, created_at
    from messages
    where session_id = s.id
    order by created_at desc
    limit 1
  ) last_msg
  where s.started_at >= week_start
    and s.started_at <  week_end
    and s.message_count >= 12
    and last_msg.role = 'faye'
    and last_msg.created_at < now() - interval '3 hours'
$$;
