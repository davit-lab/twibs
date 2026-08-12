-- Fix: the scheduled-messages-dispatch cron job was skipped because the
-- original migration's cron.unschedule() raised (job did not exist yet) and
-- the exception handler swallowed it before cron.schedule() could run.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'scheduled-messages-dispatch') THEN
    PERFORM cron.schedule('scheduled-messages-dispatch', '* * * * *',
      'SELECT public.dispatch_scheduled_messages()');
  END IF;
END $$;
