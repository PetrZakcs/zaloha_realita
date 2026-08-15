import { render, act } from '@testing-library/react';
import App from './App';

// App.jsx calls supabase.auth.getSession() directly on mount, and several store
// actions (fetchFeedPosts/fetchLeaderboard/fetchPlayerCount) hit supabase.from(...)
// in the same effect — with the real client this test would need live network
// access and real project credentials just to finish loading, which makes it slow,
// flaky, and useless in CI. A generic chainable stub keeps this a deterministic,
// offline smoke test. Real Supabase behaviour (RLS, RPC reward logic, auth edge
// cases) belongs in its own integration tests against a real/staging project —
// tracked as TD-09/TD-10 in the tech-debt backlog, not here.
// Defined inside the factory (rather than above it) because jest.mock() factories
// are hoisted above imports and may not reference out-of-scope variables.
jest.mock('./api/supabaseClient', () => {
  function makeChainableStub(resolvedValue) {
    const handler = {
      get(_target, prop) {
        if (prop === 'then') return (resolve) => resolve(resolvedValue);
        if (prop === 'catch' || prop === 'finally') return () => proxy;
        return () => proxy;
      },
    };
    const proxy = new Proxy({}, handler);
    return proxy;
  }

  return {
    supabase: {
      auth: {
        getSession: () => Promise.resolve({ data: { session: null } }),
        onAuthStateChange: () => ({
          data: { subscription: { unsubscribe: () => {} } },
        }),
      },
      from: () => makeChainableStub({ data: [], error: null }),
      rpc: () => Promise.resolve({ data: null, error: null }),
      storage: { from: () => makeChainableStub({ data: null, error: null }) },
      // feedSlice's setupFeedRealtime() subscribes to a channel on mount; without
      // this it falls back gracefully (own try/catch) but logs a console.warn.
      channel: () => makeChainableStub({ data: null, error: null }),
      removeChannel: () => {},
    },
  };
});

test('renders the app shell without crashing when there is no active session', async () => {
  // Smoke test: the initial (logged-out, session-not-yet-checked) render should
  // mount cleanly instead of throwing — that's the failure mode this guards
  // against (see git history: OAuth session race, JWT race, missing-profile
  // fallout all left users stuck on a blank/crashed splash).
  const { container } = render(<App />);
  // App's mount effect resolves supabase.auth.getSession() on a microtask and
  // then updates store state (setSessionChecked) from outside render — flush it
  // inside act() so that update isn't attributed to "outside a test".
  await act(async () => {});
  expect(container).not.toBeEmptyDOMElement();
});
