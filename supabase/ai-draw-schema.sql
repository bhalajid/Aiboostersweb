-- AI Draw: saved tickets per user. Run once in Supabase -> SQL Editor.
-- Each row is one line for one draw. Row-level security lets a signed-in user
-- see, add, change and delete only their own rows; nobody else (including other
-- users holding the public anon key) can read them.

create table if not exists public.ai_draw_tickets (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  game        text not null check (game in ('eurojackpot', 'lotto649', 'euromillions')),
  draw_date   date not null,
  main        smallint[] not null,
  extra       smallint[] not null default '{}',
  superzahl   smallint check (superzahl between 0 and 9),
  created_at  timestamptz not null default now(),
  constraint ai_draw_shape check (
    (game = 'eurojackpot'  and cardinality(main) = 5 and cardinality(extra) = 2 and superzahl is null and 1 <= all(main) and 50 >= all(main) and 1 <= all(extra) and 12 >= all(extra)) or
    (game = 'euromillions' and cardinality(main) = 5 and cardinality(extra) = 2 and superzahl is null and 1 <= all(main) and 50 >= all(main) and 1 <= all(extra) and 12 >= all(extra)) or
    (game = 'lotto649'     and cardinality(main) = 6 and cardinality(extra) = 0 and 1 <= all(main) and 49 >= all(main))
  )
);

create index if not exists ai_draw_tickets_user_date on public.ai_draw_tickets (user_id, draw_date desc);

alter table public.ai_draw_tickets enable row level security;

drop policy if exists "own tickets: read"   on public.ai_draw_tickets;
drop policy if exists "own tickets: add"    on public.ai_draw_tickets;
drop policy if exists "own tickets: change" on public.ai_draw_tickets;
drop policy if exists "own tickets: delete" on public.ai_draw_tickets;

create policy "own tickets: read"   on public.ai_draw_tickets for select to authenticated using (user_id = (select auth.uid()));
create policy "own tickets: add"    on public.ai_draw_tickets for insert to authenticated with check (user_id = (select auth.uid()));
create policy "own tickets: change" on public.ai_draw_tickets for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own tickets: delete" on public.ai_draw_tickets for delete to authenticated using (user_id = (select auth.uid()));

-- No more than 2,000 saved lines per user (abuse guard).
create or replace function public.ai_draw_ticket_limit() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from public.ai_draw_tickets where user_id = new.user_id) >= 2000 then
    raise exception 'ticket limit reached (2000 lines)';
  end if;
  return new;
end $$;
drop trigger if exists ai_draw_ticket_limit on public.ai_draw_tickets;
create trigger ai_draw_ticket_limit before insert on public.ai_draw_tickets
  for each row execute function public.ai_draw_ticket_limit();

-- "Delete my account and all my tickets" (GDPR erasure). Tickets go with the
-- user through the foreign key's ON DELETE CASCADE.
create or replace function public.delete_my_account() returns void
language plpgsql security definer set search_path = public, auth as $$
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  delete from auth.users where id = auth.uid();
end $$;
revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
