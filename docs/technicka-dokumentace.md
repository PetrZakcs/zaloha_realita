# Hra Reality: technická dokumentace

## Přehled

| Vrstva | Technologie | Kde |
|---|---|---|
| Frontend | Create React App, React 19, React Router 7, Zustand | `src/` |
| Backend | Supabase: Postgres s RLS, Auth, Storage, Realtime | `supabase/migrations/` |
| Serverové funkce | Deno Edge Functions | `supabase/functions/` |
| Platby | Stripe Checkout, Billing Portal, webhooky | `stripe-*` |
| Oznámení | Web Push (VAPID) a service worker | `send-retention-push`, `public/service-worker.js` |
| Moderace | Claude API přes edge funkci | `moderate-proof` |
| Hosting | Vercel | `vercel.json` |

## Struktura frontendu

- `src/App.jsx`: trasy a start aplikace.
- `src/components/Layout.jsx`: rozvržení, navigace, modální okna.
- `src/components/mobile`, `src/components/desktop`: dvě samostatné podoby obrazovek.
- `src/components/common`: sdílené prvky, např. `HomeQuickMenu`, `PlayerAvatar`, `PrivacySettings`.
- `src/components/IntegrationPhase.jsx`, `QuestMap.jsx`: společné obrazovky pro obě podoby.
- `src/components/admin`: správa obsahu, moderace, KPI, katalogy.
- `src/store/slices`: stav aplikace (`authSlice`, `gameplaySlice`, `feedSlice`).
- `src/lib`: analytika, levely avatarů, média, odkazy, moderace.

## Herní logika a databáze

Pravidla, která ovlivňují odměny nebo viditelnost, běží v databázi jako funkce `SECURITY DEFINER`. Klient je sám měnit nemůže: chrání je RLS a trigger na tabulce `profiles`.

| Funkce nebo tabulka | Účel |
|---|---|
| `complete_challenge` | Dokončení výzvy, odměny, důkaz, bonus Passu |
| `advance_node` | Postup na další uzel podle Passu nebo čekací doby |
| `get_feed` | Řazení feedu 0,40 / 0,30 / 0,20 / 0,10 a zvýhodnění |
| `claim_posts_for_moderation`, `apply_ai_moderation`, `admin_moderate_post` | Moderace důkazů |
| `get_integration_state`, `complete_integration_signal` | Integrační fáze a mezivrstva |
| `set_my_privacy`, `player_privacy` | Co hráč ukazuje na veřejném profilu |
| `publish_world_post`, `publish_featured_post` | Karty publikované adminem |
| `admin_kpi_business`, `admin_kpi_extended` | Přehledy KPI |
| `game_config` (`cfg_num`, `cfg_json`) | Herní čísla měnitelná bez nasazení |

Schéma a jeho vývoj popisují migrace ve složce `supabase/migrations`, řazené podle data v názvu. Provozní postup je v `supabase/README.md`.

## Edge funkce

| Funkce | Spouští | Tajné hodnoty |
|---|---|---|
| `stripe-checkout`, `stripe-portal` | Přihlášený hráč | `STRIPE_*`, `APP_URL` |
| `stripe-webhook` | Stripe | `STRIPE_WEBHOOK_SECRET` |
| `moderate-proof` | Klient po uložení důkazu, cron | `ANTHROPIC_API_KEY`, `CRON_SECRET`, volitelně `MODERATION_MODEL` |
| `send-retention-push` | Cron | `VAPID_*`, `CRON_SECRET` |
| `announce-top-doers` | Cron, jednou týdně | `DISCORD_WEBHOOK_URL`, `CRON_SECRET` |

## Proměnné frontendu

`REACT_APP_SUPABASE_URL`, `REACT_APP_SUPABASE_ANON_KEY`, `REACT_APP_VAPID_PUBLIC_KEY`, volitelně `REACT_APP_DISCORD_INVITE_URL`, `REACT_APP_DISCORD_VIP_URL` a přepínače `REACT_APP_AUTH_*`, `REACT_APP_DEPOSIT_ENABLED`, `REACT_APP_PASS_YEARLY_ENABLED`.

## Testy

```bash
CI=true npx react-scripts test --watchAll=false
```

```bash
deno test --allow-env --allow-net --allow-read --no-check --node-modules-dir=none supabase/functions/
```

```bash
PG_BIN=/cesta/k/postgres/bin supabase/tests/run_local.sh
```

```bash
PG_BIN=/cesta/k/postgres/bin PGPORT=54329 supabase/tests/upgrade_test.sh
```

`flow_test.sql` prochází hru proti skutečnému Postgresu s náhradou Supabase. `upgrade_test.sh` zkouší aktualizaci z verze v produkci na databázi s daty.

## Co testy nepokrývají

Ostré přihlášení přes Google a Discord, skutečné platby, volání Claude API, doručení push a Discord webhooku, chování Realtime a Storage v Supabase. Ověřují se až po nasazení podle kroku „Check live“ v `supabase/README.md`.

## Nasazení

Postup je v `supabase/README.md`, část „Production release runbook“. Pořadí: záloha, tajné hodnoty, migrace, funkce, plánované úlohy, webhook, frontend, ruční kontrola.

**Před zapnutím AI moderace:** smlouva vyžaduje souhlas objednatele s předáním osobních údajů třetí straně. Bez `ANTHROPIC_API_KEY` čekají veřejné důkazy na ruční schválení adminem.
