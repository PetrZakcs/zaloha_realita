# npm audit triage

Last reviewed: 2026-08-16 (TD-04). Re-run `npm audit` and update this file whenever the count
changes meaningfully — don't let it go stale into "nobody knows if 28 is the same 28".

## Fixed 2026-08-16 (`npm audit fix`, no `--force`, no breaking changes)

35 → 28 vulnerabilities. The one that mattered:

- **`react-router` / `react-router-dom` 7.18.1 → 7.18.2** — high severity,
  [GHSA-qwww-vcr4-c8h2](https://github.com/advisories/GHSA-qwww-vcr4-c8h2), a CSRF bypass in RSC
  (React Server Components) mode. This app is a client-only SPA (`BrowserRouter`, no RSC/server
  actions) so it likely wasn't exploitable here either way — patched anyway since the fix was a
  same-major, non-breaking bump. This is the only finding from this audit that was a real
  production runtime dependency, not dev tooling.
- The rest of the 12-package bump (`postcss`, `nanoid`, `js-yaml`, `brace-expansion`, `body-parser`,
  `svgo`, `fast-uri`, `@tootallnate/once`) is all transitive dev/build tooling — safe, low-effort,
  applied for hygiene.

## Remaining 28 (not fixed — would require `--force`)

All 28 remaining findings sit under `react-scripts`' own dependency tree (`webpack-dev-server` →
`sockjs`/`uuid`, `jest`@27 → `jest-environment-jsdom` → `jsdom` → `http-proxy-agent`, `bfj` →
`jsonpath` → `underscore`). `npm audit fix --force` would resolve them by downgrading
`react-scripts` to `0.0.0` — an explicitly breaking change that would take the build tool out from
under the app. **Deliberately not applied.**

Why this is lower risk than "20 high" sounds:

- **Dev-server / build-time only.** `webpack-dev-server`, `jest`, `jsdom` never ship in the
  production bundle (verified: production build is React + Supabase + Zustand + router only,
  187KB gzip). Their vulnerabilities matter if someone can reach your local dev server or CI
  runner directly, not to a deployed user of the app.
- **`bfj`/`jsonpath`/`underscore`** are pulled in by `react-scripts`' own build pipeline
  (source-map/bundle-analysis tooling), same story — not runtime code.

This is a symptom of the real underlying issue tracked separately: **CRA/`react-scripts` is
unmaintained** (last release predates this audit by years) and its pinned dependency tree can't be
patched without ejecting or migrating off it. Revisit if/when the CRA → Vite migration (parked item
in the tech-debt backlog) happens — that removes this whole dependency tree at once instead of
patching around it piecemeal.

## Rule going forward

Don't run `npm audit fix --force` on this project without an explicit decision to accept the
`react-scripts` downgrade — it silently breaks the build tool, not just a dependency.
