-- Supabase SQL Editor에서 실행하세요.
-- 23:58 KST = 14:58 UTC
-- 00:05 KST로 옮기려면 cron 표현식을 '5 15 * * *'로 바꾸세요.

create extension if not exists pg_cron;
create extension if not exists pg_net;
create extension if not exists vault;

-- 먼저 Edge Function에 맞춘 비밀값을 Vault에 저장하세요.
-- 이미 저장했다면 아래 줄은 한 번만 실행하면 됩니다.
select vault.create_secret(
  'replace-with-your-cron-secret',
  'follower_snapshot_cron_secret',
  'Follower snapshot scheduler secret'
)
where not exists (
  select 1
  from vault.decrypted_secrets
  where name = 'follower_snapshot_cron_secret'
);

select cron.unschedule('instagram-follower-snapshot')
where exists (
  select 1
  from cron.job
  where jobname = 'instagram-follower-snapshot'
);

select
  cron.schedule(
    'instagram-follower-snapshot',
    '58 14 * * *',
    $$
    select
      net.http_post(
        url := 'https://ezbxsonxlsrtpmesirxe.supabase.co/functions/v1/follower-snapshot',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-cron-secret', (
            select decrypted_secret
            from vault.decrypted_secrets
            where name = 'follower_snapshot_cron_secret'
            limit 1
          )
        ),
        body := jsonb_build_object()
      ) as request_id;
    $$
  );
