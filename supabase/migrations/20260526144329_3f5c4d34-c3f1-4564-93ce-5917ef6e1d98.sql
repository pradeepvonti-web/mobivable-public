select cron.schedule(
  'sweep-expired-subscriptions-hourly',
  '7 * * * *',
  $$ select public.sweep_expired_subscriptions(); $$
);