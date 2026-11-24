import { useUserStore } from '../userStore';

// Targets the three specific things TD-10 in the tech-debt backlog called out — each is a
// bug that actually shipped and got fixed in production once already (see git history:
// "fix: display_name collisions silently blocking new signups", "fix: re-login root cause
// — JWT race + INSERT fallback"), and none of them had a test until now:
//   1. generateRandomName()'s collision-retry path (private — exercised indirectly through
//      handleOAuthSession's INSERT retry loop, since it's not exported).
//   2. The discord_user_id backfill branch — now resolved server-side by the
//      sync_discord_identity() RPC instead of the client writing the id itself.
//   3. handleOAuthSession()'s INSERT-fails-for-a-non-collision-reason fallback to fetchUser().
//
// mockMaybeSingle/mockSingle/mockInsert/mockUpdateEq are declared with the jest.mock()-required
// "mock" prefix so the hoisted factory below is allowed to reference them (see App.test.js for
// the same pattern, and Jest's own error message if you drop the prefix).
let mockMaybeSingle = jest.fn(() => Promise.resolve({ data: null, error: null }));
let mockSingle = jest.fn(() => Promise.resolve({ data: null, error: null }));
let mockInsert = jest.fn(() => Promise.resolve({ error: null }));
let mockUpdateEq = jest.fn(() => Promise.resolve({ error: null }));
let mockRpc = jest.fn(() => Promise.resolve({ data: null, error: null }));
let mockPlayerState = [];

jest.mock('../../api/supabaseClient', () => {
  function genericChain(resolvedValue) {
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
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
      },
      // Only public.profiles gets precise, per-test-controllable mocking — every other
      // table (feed_posts, user_cards, leaderboard, etc., reached transitively through
      // fetchUser()'s own follow-up calls into feedSlice/gameplaySlice) gets a generic
      // always-empty-but-never-throws chain, same approach as App.test.js.
      from: (table) => {
        if (table === 'profiles') {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: () => mockMaybeSingle(),
                single: () => mockSingle(),
              }),
            }),
            insert: (rows) => mockInsert(rows),
            update: (fields) => ({ eq: (col, val) => mockUpdateEq(fields, col, val) }),
          };
        }
        if (table === 'player_state') return genericChain({ data: mockPlayerState, error: null });
        return genericChain({ data: [], error: null });
      },
      rpc: (...args) => mockRpc(...args),
      channel: () => genericChain({ data: null, error: null }),
      removeChannel: () => {},
      storage: { from: () => genericChain({ data: null, error: null }) },
    },
  };
});

const initialState = useUserStore.getState();

beforeEach(() => {
  useUserStore.setState(initialState, true);
  localStorage.clear();
  mockMaybeSingle.mockReset().mockResolvedValue({ data: null, error: null });
  mockSingle.mockReset().mockResolvedValue({ data: null, error: null });
  mockInsert.mockReset().mockResolvedValue({ error: null });
  mockUpdateEq.mockReset().mockResolvedValue({ error: null });
  mockRpc.mockReset().mockResolvedValue({ data: null, error: null });
});

function fakeSession({ provider = null, identities = [], userMetadata = {} } = {}) {
  return {
    user: {
      id: 'user-123',
      email: 'player@example.com',
      app_metadata: provider ? { provider } : {},
      identities,
      user_metadata: userMetadata,
    },
  };
}

test('existing profile: loads it via fetchUser and never attempts an INSERT', async () => {
  const row = { id: 'user-123', display_name: 'ExistingPlayer', xp: 50, keys_balance: 2, avatar_level: 1 };
  mockMaybeSingle.mockResolvedValue({ data: row, error: null });
  mockSingle.mockResolvedValue({ data: row, error: null });

  await useUserStore.getState().handleOAuthSession(fakeSession());

  expect(useUserStore.getState().onboarded).toBe(true);
  expect(useUserStore.getState().user.name).toBe('ExistingPlayer');
  expect(mockInsert).not.toHaveBeenCalled();
});

test('new user: INSERT succeeds on the first try and advances to the identity step', async () => {
  mockMaybeSingle.mockResolvedValue({ data: null, error: null });
  mockInsert.mockResolvedValue({ error: null });

  await useUserStore.getState().handleOAuthSession(fakeSession());

  expect(mockInsert).toHaveBeenCalledTimes(1);
  expect(useUserStore.getState().onboardingStep).toBe('identity');
});

test('display_name collision: retries the INSERT with a freshly generated name instead of giving up', async () => {
  mockMaybeSingle.mockResolvedValue({ data: null, error: null });
  mockInsert
    .mockResolvedValueOnce({
      error: {
        code: '23505',
        message: 'duplicate key value violates unique constraint "profiles_display_name_key"',
        details: 'Key (display_name)=(NovýHráč) already exists.',
      },
    })
    .mockResolvedValueOnce({ error: null });

  await useUserStore.getState().handleOAuthSession(fakeSession());

  expect(mockInsert).toHaveBeenCalledTimes(2);
  const firstName = mockInsert.mock.calls[0][0][0].display_name;
  const secondName = mockInsert.mock.calls[1][0][0].display_name;
  expect(secondName).not.toBe(firstName);
  expect(secondName).toMatch(/^Hráč_\d+$/);
});

test('INSERT fails for a non-collision reason: falls back to fetchUser instead of retrying blindly', async () => {
  mockMaybeSingle.mockResolvedValue({ data: null, error: null });
  mockInsert.mockResolvedValue({
    error: { code: '42501', message: 'permission denied for table profiles' },
  });
  // Simulates the exact scenario the fallback exists for: the profile actually was there
  // (fetchUser's own SELECT finds it) even though the INSERT above failed non-recoverably.
  mockSingle.mockResolvedValue({
    data: { id: 'user-123', display_name: 'RecoveredPlayer', xp: 0, keys_balance: 1, avatar_level: 0 },
    error: null,
  });

  await useUserStore.getState().handleOAuthSession(fakeSession());

  expect(mockInsert).toHaveBeenCalledTimes(1);
  expect(useUserStore.getState().onboarded).toBe(true);
  expect(useUserStore.getState().user.name).toBe('RecoveredPlayer');
});

test('discord backfill: an existing Discord profile without discord_user_id asks the server to sync it', async () => {
  const row = { id: 'user-123', display_name: 'DiscordPlayer', xp: 0, keys_balance: 1, avatar_level: 0, discord_user_id: null };
  mockMaybeSingle.mockResolvedValue({ data: row, error: null });
  mockSingle.mockResolvedValue({ data: row, error: null });

  const session = fakeSession({
    provider: 'discord',
    identities: [{ provider: 'discord', identity_data: { provider_id: '881234567890123456', username: 'someone' } }],
  });

  await useUserStore.getState().handleOAuthSession(session);

  expect(mockRpc).toHaveBeenCalledWith('sync_discord_identity');
  // The client must never write discord_user_id itself (protect_profile_privileges locks it).
  expect(mockUpdateEq).not.toHaveBeenCalledWith(
    expect.objectContaining({ discord_user_id: expect.anything() }),
    expect.anything(),
    expect.anything()
  );
});

test('non-Discord login never calls sync_discord_identity', async () => {
  const row = { id: 'user-123', display_name: 'EmailPlayer', xp: 0, keys_balance: 1, avatar_level: 0, discord_user_id: null };
  mockMaybeSingle.mockResolvedValue({ data: row, error: null });
  mockSingle.mockResolvedValue({ data: row, error: null });

  await useUserStore.getState().handleOAuthSession(fakeSession());

  expect(mockRpc).not.toHaveBeenCalledWith('sync_discord_identity');
});

describe('session and onboarding resume', () => {
  const profileRow = { id: 'user-9', display_name: 'Devět', xp: 50, uzel: 1, keys_balance: 1, avatar_level: 1, pass_holder: false, discord_user_id: 'x' };

  beforeEach(() => {
    localStorage.clear();
    useUserStore.setState({ user: null, onboarded: false, onboardingStep: 'landing', _handlingOAuthSessionId: null });
    mockMaybeSingle = jest.fn(() => Promise.resolve({ data: null, error: null }));
    mockSingle = jest.fn(() => Promise.resolve({ data: profileRow, error: null }));
  });

  test('a signed-in player mid-onboarding stays in onboarding on reload', async () => {
    useUserStore.setState({ onboardingStep: 'slib' });
    await useUserStore.getState().fetchUser('user-9');
    expect(useUserStore.getState().onboarded).toBe(false);
    expect(useUserStore.getState().onboardingStep).toBe('slib');
    expect(useUserStore.getState().user.name).toBe('Devět');
  });

  test('a returning player with nothing in progress goes straight into the game', async () => {
    await useUserStore.getState().fetchUser('user-9');
    expect(useUserStore.getState().onboarded).toBe(true);
  });

  test('a player with no onboarding record resumes at the entry step on a new device', async () => {
    mockPlayerState = { onboarding_completed_at: null, onboarding_skipped_at: null };
    await useUserStore.getState().fetchUser('user-9');
    mockPlayerState = [];
    expect(useUserStore.getState().onboarded).toBe(false);
    expect(useUserStore.getState().onboardingStep).toBe('entry');
  });

  test('clearLocalSession forgets the player and returns to the landing', () => {
    localStorage.setItem('onboarded', 'true');
    localStorage.setItem('user', '{}');
    useUserStore.setState({ user: { id: 'x' }, onboarded: true });
    useUserStore.getState().clearLocalSession();
    expect(useUserStore.getState().user).toBeNull();
    expect(useUserStore.getState().onboarded).toBe(false);
    expect(useUserStore.getState().onboardingStep).toBe('landing');
    expect(localStorage.getItem('onboarded')).toBeNull();
    expect(localStorage.getItem('user')).toBeNull();
  });
});
