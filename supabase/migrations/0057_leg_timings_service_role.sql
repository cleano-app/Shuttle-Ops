-- The nightly job (src/lib/jobs/nightly.ts, run by Vercel Cron) calls
-- recompute_leg_timings() with the service key, which has no profile, so
-- 0047's is_office() guard refused it. Allow the service role as well;
-- everyone else is still Office-only. Rewrites only the guard line of the
-- existing definition rather than repeating the whole function body.
do $$
declare
  v_def text := pg_get_functiondef('public.recompute_leg_timings()'::regprocedure);
begin
  if position('if not is_office() then' in v_def) > 0 then
    execute replace(
      v_def,
      'if not is_office() then',
      'if not (is_office() or coalesce(auth.role(), '''') = ''service_role'') then'
    );
  end if;
end;
$$;
