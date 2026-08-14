create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'admin-approval-push-every-minute',
  '* * * * *',
  $$
  select
    net.http_post(
      url := 'https://mmkayqlhgorteplisyzv.functions.supabase.co/admin-approval-push',
      headers := jsonb_build_object(
        'Content-Type', 'application/json'
      ),
      body := '{}'::jsonb
    );
  $$
);
