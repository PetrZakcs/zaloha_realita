# Supabase schema — migration workflow

## What's here

- `migrations/` — every schema change ever applied to this project, in the order it was applied.
- `seed.sql` — dev-only seed data, run by `supabase db reset` after migrations. Never applied to
  production.
- `functions/` — Edge Functions (Deno).
- `config.toml` — Supabase CLI project config.

## How the existing migrations got ordered (2026-08-16, TD-06)

Until now these lived as 20 loose `.sql` files in the repo root with no enforced order — nothing
recorded what had actually been run against the live project, or in what sequence. All 20 were
moved here and given a `YYYYMMDDHHMMSS_` prefix, derived from:

1. Explicit `-- Requires supabase_migration_X.sql to already be applied` comments in the files
   themselves (there are 4 of these — they were followed exactly).
2. Git history (first-commit date) for everything else, since most files don't declare a hard
   dependency on each other beyond the base schema.

**Every file confirmed already applied to the live project as of 2026-08-16 (per Petr) — this
reorder does not re-run anything, it just gives the existing state a real, replayable order.** Not
independently verified via `supabase db diff` against the live project; if you ever provision a
fresh environment from this migrations folder, diff it against prod once before trusting it blind.

### About the "SUPERSEDED" headers

Several files (`referral_system.sql`, `season_reflection.sql`, `profile_showcase.sql`,
`feed_enrichment.sql`, `profiles_security.sql`) open with a comment like:

> SUPERSEDED for `protect_profile_privileges()` — see `consolidated_functions.sql`. The
> `ALTER TABLE`/`CREATE TABLE`/policy statements below are still the real, one-time source.

**This means the function *body* was later redefined elsewhere — it does not mean the file is
obsolete.** Each of these files still holds the only `CREATE TABLE`/`ALTER TABLE`/RLS policy
statements for its feature; deleting or skipping the file would lose real schema history that
`consolidated_functions.sql` never recreates. Nothing here was archived or removed — every file
stays, in order, exactly as a migration history should work: never edit or delete a migration
that's already run, only layer a new one on top. `consolidated_functions.sql` is that new layer —
it's deliberately the last migration in the sequence, redefining five shared functions exactly
once instead of leaving them scattered redefinitions across five files.

## Applying migrations

```bash
supabase login                        # once
supabase link --project-ref <ref>     # once per project checkout, get <ref> from the dashboard URL
supabase db push                      # applies any migration not yet recorded as run
```

`db push` tracks what's already applied via its own bookkeeping table — safe to run repeatedly.

## Adding a new migration

Never hand-edit a file in `migrations/` that's already been applied to any real environment.
Instead:

```bash
supabase migration new short_description   # creates a correctly-timestamped empty file here
```

Write the change, then `supabase db push` it. Migrations run in timestamp order, so the
**latest** file that `CREATE OR REPLACE`s a function is its live version. When you change one of
the shared functions, copy its body from that latest file into a new migration — don't edit
`consolidated_functions.sql` (already applied, `db push` won't re-run it). Current live versions:

| Function | Latest definition |
|---|---|
| `protect_profile_privileges`, `complete_challenge`, `advance_node`, `increment_feed_reaction`, `set_default_referral_code` | `20260925120000_security_audit_fixes.sql` |
| `handle_referral_signup`, `handle_referral_activation`, `report_post`, `get_weekly_top_doers`, `open_mystery_box`, `grant_earned_mystery_boxes` | `20260925130000_mvp1_spec_debt.sql` |
| `submit_season_reflection` | `20260816004546_consolidated_functions.sql` |

## Deploying the 2026-09-25 security fixes

`20260925120000_security_audit_fixes.sql` and the edge-function changes go out together — the
client (`plan` instead of `priceId`, the player's JWT on checkout, `publish_pledge`,
`record_daily_activity`, `sync_discord_identity`) depends on both.

1. `supabase db push`
2. Edge Function secrets (`supabase secrets set KEY=value`):
   - `APP_URL` — production app origin, e.g. `https://<your-domain>` (Stripe success/cancel
     redirect; checkout refuses to run without it)
   - `STRIPE_PRICE_ID_MONTHLY` — the 149 Kč/month recurring Price
   - `STRIPE_PRICE_ID_YEARLY`, `STRIPE_PRICE_ID_DEPOSIT` — optional, only once those plans exist
3. `supabase functions deploy stripe-checkout stripe-webhook airtable-sync`
4. Stripe dashboard → Webhooks: besides `checkout.session.completed`, also send
   `customer.subscription.updated` and `customer.subscription.deleted` (Pass revocation).
5. Deploy the frontend (Vercel). `REACT_APP_STRIPE_PRICE_ID` is no longer read and can be removed.
6. If `hello-world` was ever deployed: `supabase functions delete hello-world`.

Existing Founder Pass holders who paid before this change have no row in `subscriptions`, so a
later cancellation of *their* subscription is matched via the subscription's `metadata.user_id`
only if it was set — older subscriptions don't carry it. Check them once in the Stripe dashboard.

## Known gap

`20260816004545_push_notifications.sql` still has unfilled `YOUR_PROJECT_REF` /
`YOUR_SERVICE_ROLE_KEY` placeholders in its `SECTION 3` cron job, and the `send-retention-push`
Edge Function it schedules hasn't been deployed. Tracked as **TD-14** in the tech-debt backlog —
push opt-in works client-side, actual sending is currently a silent no-op.

## Deploying the 2026-09-25 MVP1 spec-debt batch

Goes out together with (after) the security fixes above.

1. `supabase db push` (applies `20260925130000_mvp1_spec_debt.sql`: paywall after node 3,
   referral rewards on activation, reports, weekly Top Doers, mystery boxes).
2. `supabase functions deploy stripe-portal` and enable the Customer Portal in Stripe
   (Settings → Billing → Customer portal) — that's where players cancel the Pass.
3. **Mystery box content:** `mystery_box_pool` starts empty on purpose — Season 0 album cards
   each have their own earning condition and must not drop randomly. Until the client supplies
   box content, boxes are granted but opening says the content is being prepared.
4. Optional frontend env flags (Vercel), each only once the dependency exists:
   - `REACT_APP_PASS_YEARLY_ENABLED=true` — needs `STRIPE_PRICE_ID_YEARLY` (999 Kč/rok)
   - `REACT_APP_DEPOSIT_ENABLED=true` — needs `STRIPE_PRICE_ID_DEPOSIT` (49/99 Kč záloha)
   - `REACT_APP_AUTH_APPLE_ENABLED=true` / `REACT_APP_AUTH_FACEBOOK_ENABLED=true` — needs the
     provider enabled in Supabase Auth
   - `REACT_APP_DISCORD_INVITE_URL`, `REACT_APP_DISCORD_VIP_URL` — community / VIP room links
