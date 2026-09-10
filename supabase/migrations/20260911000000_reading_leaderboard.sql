-- Reading leaderboard RPC
-- Aggregates the reader's own progress (reading_logs) joined with public profile
-- info to power the "Leaderboard" card on the Library > Streak tab and elsewhere.
-- SECURITY DEFINER so a regular (RLS-limited) client can read aggregate rankings
-- without exposing anything beyond public profile fields.

create or replace function public.get_reading_leaderboard(row_limit int default 10)
returns table (
  user_id uuid,
  username text,
  display_name text,
  avatar_url text,
  total_minutes bigint,
  reading_days bigint
)
language sql
security definer
set search_path = public
as $$
  select
    r.user_id,
    p.username,
    p.display_name,
    p.avatar_url,
    sum(r.minutes_read)::bigint  as total_minutes,
    count(distinct r.read_date)::bigint as reading_days
  from public.reading_logs r
  left join public.profiles p on p.id = r.user_id
  group by r.user_id, p.username, p.display_name, p.avatar_url
  order by total_minutes desc, reading_days desc
  limit greatest(least(row_limit, 50), 1)
$$;

grant execute on function public.get_reading_leaderboard(int) to anon, authenticated, service_role;