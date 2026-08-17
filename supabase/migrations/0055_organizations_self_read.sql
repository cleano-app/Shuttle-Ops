-- Fixes a real bug found live: getPortalSession() (src/lib/auth/
-- portalSession.ts) resolves org_type via a PostgREST embedded join
-- (organization_account_users -> organizations(org_type)), which runs
-- under the CALLING role's own RLS — not a security definer bypass, since
-- getPortalSession() is a plain client query, not an RPC. organizations
-- (0005) only had dispatcher-read/office-manage policies, so a linked
-- referrer/sponsor contact's own org_type always came back null, and
-- referPassenger()'s `session.orgType !== "referrer"` check failed for
-- every real referrer — confirmed live via the portal UI ("Not
-- authorized." when a genuine referrer org tried to refer a passenger).
-- org_type/name aren't sensitive (unlike passengers.vulnerability_notes,
-- there's no equivalent reason to route this through a function instead).
create policy organizations_self_read on organizations for select
  using (
    exists (
      select 1 from organization_account_users oau
      where oau.organization_id = organizations.id and oau.user_id = auth.uid()
    )
  );
