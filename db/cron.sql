create extension if not exists pg_cron;
create extension if not exists pg_net;

do $$
begin
  if exists (
    select 1
    from cron.job
    where jobname = 'admin-approval-push-every-minute'
  ) then
    perform cron.unschedule('admin-approval-push-every-minute');
  end if;
end;
$$;
