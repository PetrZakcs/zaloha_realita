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

Write the change, then `supabase db push` it. If it touches a function shared with
`consolidated_functions.sql` (`protect_profile_privileges`, `advance_node`, `complete_challenge`,
`submit_season_reflection`, `handle_referral_signup`), redefine it there too — same reason that
file exists in the first place (see its own header).

## Known gap

`20260816004545_push_notifications.sql` still has unfilled `YOUR_PROJECT_REF` /
`YOUR_SERVICE_ROLE_KEY` placeholders in its `SECTION 3` cron job, and the `send-retention-push`
Edge Function it schedules hasn't been deployed. Tracked as **TD-14** in the tech-debt backlog —
push opt-in works client-side, actual sending is currently a silent no-op.
