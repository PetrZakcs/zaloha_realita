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
| `complete_challenge`, `get_feed`, `claim_share_reward`, `admin_players_export` | `20261106120000_mvp1_finish.sql` |
| `protect_profile_privileges`, `increment_feed_reaction`, `set_default_referral_code` | `20260925120000_security_audit_fixes.sql` (or later, grep before copying) |
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

## Deploying the 2026-09-29 original-spec completion batch

Goes out after the two batches above. Migrations for this project are run by hand in the
Supabase SQL Editor, in filename order.

1. Run `20260929120000_original_spec_completion.sql`. It creates `player_state` (backfilled for
   existing players — they count as onboarded), onboarding / nickname / avatar / frame RPCs,
   badges (`node_rewards`), code fragments, share rewards, the ranked `get_feed()` RPC and the
   KPI views. It also creates the `avatars` storage bucket and lets the `proofs` bucket accept
   video (max 50 MB) — no manual Storage setup needed.
2. Deploy the frontend. The feed now reads through `get_feed()`, so the migration must be
   applied **before** the new frontend goes live.
3. KPI views (`kpi_node_funnel`, `kpi_retention`, `kpi_proofs`) are readable only from the SQL
   Editor / service role.
4. Content still owed by the client: badge titles per theme (`node_rewards`), fragment lore,
   frame artwork, mystery box pool. Optional env: `REACT_APP_ALBUM_URL`
   (default `https://album.hrareality.cz`).

## Deploying the 2026-10-13 Game Bible MVP1 batch

Run after `20260929120000_original_spec_completion.sql`, in the SQL Editor:

1. `20261013120000_game_bible_mvp1.sql` — everything the Game Bible decides unambiguously:
   domains / seasons / guardians (Zaya), quest metadata + several loops per node, progression
   event log (`game_events`), Lifetime Level + titles, streak from meaningful actions only
   (`player_active_days`, existing streaks are recomputed), max 1 reaction per player and post
   (existing duplicates are cleaned up), identity items (titles, Season Mark, auras/masks),
   Activated/Qualified referrals + Recruiter titles + first/last-touch attribution, in-app
   notifications + preferences, World cards and the new feed ranking, `get_player_progress()`,
   KPI views `kpi_activation` / `kpi_referrals`. Safe to re-run.
2. Deploy the frontend after the migration (it calls the new RPCs).
3. Redeploy `send-retention-push` (it now honours notification preferences).

Deliberately NOT decided here (open client questions): private-proof keys, Pass XP / feed boost
(the existing ×1.25 feed multiplier stays), navigation, flexible "5 of 7" streak, share-moment
frequency, the referral reward ladder. Content still owed: aura/mask catalog, badge names, final
level curve (game designer), season dates.

Note: after this migration `20260929120000` can no longer be re-run on its own (it would try to
recreate the old `get_feed` signature) — that is expected; never re-run old migrations.

## Deploying the 2026-10-20 MVP1 completion (phase A + admin phase B)

Run after `20261013120000_game_bible_mvp1.sql`, in this order, then deploy the frontend:

1. `20261020120000_mvp1_phase_a.sql` — server-side balancing (`game_config`, every value with
   its source in the Game Bible; admin → Katalogy → Balancování), config-driven Lifetime Level,
   XP for completed nodes / seasons, first earned mask ("Maska Prvního zásahu"), referral
   velocity cap with reward holds, block / hide / extended report reasons, primary badge,
   feed author identity (aura, mask, badge), Reality Retention + engagement KPI views.
2. `20261020130000_admin_phase_b.sql` — admin-only RPCs behind the new admin tabs:
   `admin_kpi_snapshot(days)` (KPI), `admin_review_queue()` (Kontrola) and
   `admin_players_export()` (Hráči → Export CSV).
3. Deploy the frontend (it reads `game_config` on start and calls the new RPCs).

Values marked "orientační" in `game_config.source` are working numbers from the Bible examples;
the game designer adjusts them in the admin without a deploy.

## Deploying the 2026-11-06 MVP1 finish

Run after `20261020130000_admin_phase_b.sql`, then deploy functions and frontend:

1. `20261106120000_mvp1_finish.sql` — avatar levels 0–7, private `proofs-private` bucket and no
   more public listing of `proofs` / `avatars`, feed reward row, recurring referral reward
   (`record_pass_payment`, sizes in `game_config`), `delete_my_account()`, admin flags + quality
   score, `admin_kpi_business()`, and the `payments` table the webhook always expected.
2. `supabase functions deploy stripe-webhook stripe-checkout`.
3. Stripe dashboard → Webhooks: also send `invoice.paid`.
4. Optional secret `STRIPE_PRICE_ID_MONTHLY_RETURNING` — the 199 Kč price for players coming back
   after cancelling. Without it they stay on the 149 Kč price; the paywall would still say 199 Kč,
   so set it together with the frontend deploy.
5. Supabase Auth → Redirect URLs must allow the app origin (password reset link).

Files of proofs marked private before this migration stay in the public bucket under their old
URLs; only listing is gone. Move them by hand if any exist.

## Testing migrations locally

`supabase/tests/run_local.sh` replays every migration on a throwaway Postgres (with a minimal
Supabase stub) and runs `flow_test.sql` — sign-up with a referral, onboarding, quests across
loops, activation → qualification → Recruiter title, single reactions, feed, levels, notification
permissions, Season Mark, World card, KPI views. See the script header for a Docker-free setup.

It also documents a pre-existing ordering quirk: `20260727131520_cleanup_legacy_schema.sql`
must run **before** the base schema (it drops `challenges`), although its timestamp sorts it
after. Production was set up in the right order by hand.
