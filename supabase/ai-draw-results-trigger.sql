-- AI Draw: fetch official results on time.
-- GitHub's own schedule runs hours late or skips runs, so Supabase (pg_cron, exact to
-- the minute) starts the "AI Draw results" GitHub workflow instead. The workflow commits
-- data/ai-draw-results.json only when something changed; Vercel then deploys it.
--
-- Run once in Supabase -> SQL Editor, AFTER storing the GitHub token in the Vault:
--   1. GitHub -> Settings -> Developer settings -> Fine-grained tokens -> Generate new token
--      Repository access: only bhalajid/Aiboostersweb. Permissions: Actions = Read and write.
--   2. Supabase -> Project Settings -> Vault -> Add new secret
--      Name: github_ai_draw_token   Secret: the token from step 1
--   3. Run this file.
-- Times are UTC. Draws (German time): Lotto Wed 18:25 / Sat 19:25, Eurojackpot Tue/Fri 20:00,
-- EuroMillions Tue/Fri 21:05. Windows below cover both winter and summer time.

create extension if not exists pg_cron;
create extension if not exists pg_net;

create or replace function public.ai_draw_fetch_results() returns void
language plpgsql security definer set search_path = public, extensions as $$
declare tok text;
begin
  select decrypted_secret into tok from vault.decrypted_secrets where name = 'github_ai_draw_token';
  if tok is null then raise exception 'Vault secret github_ai_draw_token is missing'; end if;
  perform net.http_post(
    url     := 'https://api.github.com/repos/bhalajid/Aiboostersweb/actions/workflows/ai-draw-results.yml/dispatches',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || tok,
      'Accept', 'application/vnd.github+json',
      'X-GitHub-Api-Version', '2022-11-28',
      'User-Agent', 'ai-draw-scheduler',
      'Content-Type', 'application/json'),
    body    := jsonb_build_object('ref', 'main'));
end $$;
revoke all on function public.ai_draw_fetch_results() from public, anon, authenticated;

-- Draw evenings (Tue, Wed, Fri, Sat): every 10 minutes, 16:00-23:50 UTC.
select cron.schedule('ai-draw-draw-nights', '*/10 16-23 * * 2,3,5,6', $$select public.ai_draw_fetch_results()$$);
-- Mornings after a draw (Wed, Thu, Sat, Sun): every 30 minutes, 00:00-12:30 UTC, for late prize tables.
select cron.schedule('ai-draw-prize-tables', '*/30 0-12 * * 0,3,4,6', $$select public.ai_draw_fetch_results()$$);

-- Check it works: run once by hand, then look at GitHub -> Actions (a new "AI Draw results" run)
--   select public.ai_draw_fetch_results();
--   select status_code, content from net._http_response order by created desc limit 1;   -- 204 = accepted
-- Stop it later:
--   select cron.unschedule('ai-draw-draw-nights'); select cron.unschedule('ai-draw-prize-tables');
