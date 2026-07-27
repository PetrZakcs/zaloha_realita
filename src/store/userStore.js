import { create } from 'zustand';
import { supabase } from '../api/supabaseClient';
import { track } from '../lib/analytics';

const DEFAULT_USER = {
  name: 'TemnýPozorovatel',
  xp: 240,
  uzel: 3,
  streak: 5,
  keys_count: 7,
  badges_count: 4,
  pledge: 'Jsem člověk, co přestal čekat a začal jednat.',
  rarity: 'Rare',
  passHolder: false,
  discord_user_id: null,
  isAdmin: true, // Allow access by default in local dev, mapped from is_admin in Supabase
  email: 'admin@iwau.cz'
};

const DEFAULT_FEED = [
  {
    id: 'f1',
    user_name: 'NeonLiška',
    rarity: 'Rare',
    content: 'Sebrala 3 kelímky 🟢',
    reactions_fire: 34,
    reactions_lightning: 12,
    reactions_eye: 84,
    created_at: new Date(Date.now() - 600000).toISOString(),
    is_public: true
  },
  {
    id: 'f2',
    user_name: 'RychlýDoer',
    rarity: 'Rare',
    content: 'Napsal kámošce po půl roce',
    reactions_fire: 21,
    reactions_lightning: 5,
    reactions_eye: 46,
    created_at: new Date(Date.now() - 3600000).toISOString(),
    is_public: true
  },
  {
    id: 'f3',
    user_name: 'Kometa',
    rarity: 'Legendary',
    content: 'Dokončil jsem celou Season 0 a sejmul bossa! 👑',
    reactions_fire: 120,
    reactions_lightning: 44,
    reactions_eye: 382,
    created_at: new Date(Date.now() - 7200000).toISOString(),
    is_public: true
  }
];

const DEFAULT_LEADERBOARD = [
  { id: 'u1', name: 'Kometa', rarity: 'Legendary', xp: 412, uzel: 9, badges_count: 10 },
  { id: 'u2', name: 'Vlk_42', rarity: 'Rare', xp: 388, uzel: 8, badges_count: 8 },
  { id: 'u3', name: 'NeonLiška', rarity: 'Rare', xp: 310, uzel: 6, badges_count: 6 },
  { id: 'u4', name: 'RychlýDoer', rarity: 'Rare', xp: 285, uzel: 5, badges_count: 5 },
  { id: 'u5', name: 'TemnýPozorovatel', rarity: 'Rare', xp: 240, uzel: 3, badges_count: 4, is_self: true },
  { id: 'u6', name: 'GreenDoer', rarity: 'Common', xp: 180, uzel: 3, badges_count: 3 },
  { id: 'u7', name: 'ActivePlayer', rarity: 'Common', xp: 150, uzel: 2, badges_count: 2 },
  { id: 'u8', name: 'Shadow', rarity: 'Common', xp: 120, uzel: 2, badges_count: 2 }
];

export const useUserStore = create((set, get) => {
  // Load initial state from localStorage if available
  const localOnboarded = localStorage.getItem('onboarded') === 'true';
  let localUser = null;
  try {
    const u = localStorage.getItem('user');
    if (u) localUser = JSON.parse(u);
  } catch (e) {
    console.error('Failed parsing local user data', e);
  }

  // Set up real-time subscription for Feed Posts
  let feedChannel = null;
  const setupFeedRealtime = () => {
    if (feedChannel) return;
    try {
      feedChannel = supabase
        .channel('public:feed_posts')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'feed_posts' }, (payload) => {
          if (payload.eventType === 'INSERT') {
            const newItem = {
              id: payload.new.id,
              user_name: payload.new.user_name,
              rarity: 'Rare', // Default rarity mapping
              content: payload.new.content,
              image_url: payload.new.image_url || null,
              reactions_fire: payload.new.reactions_fire || 0,
              reactions_lightning: payload.new.reactions_lightning || 0,
              reactions_eye: payload.new.reactions_eye || 0,
              created_at: payload.new.created_at,
              is_public: payload.new.is_public
            };
            set(state => ({ feed: [newItem, ...state.feed.filter(x => x.id !== newItem.id)] }));
          } else if (payload.eventType === 'UPDATE') {
            set(state => ({
              feed: state.feed.map(item => item.id === payload.new.id ? {
                ...item,
                reactions_fire: payload.new.reactions_fire || 0,
                reactions_lightning: payload.new.reactions_lightning || 0,
                reactions_eye: payload.new.reactions_eye || 0
              } : item)
            }));
          }
        })
        .subscribe();
    } catch (e) {
      console.warn('Realtime subscription failed, using local offline state.', e);
    }
  };

  // Trigger setup
  setupFeedRealtime();

  return {
    // Auth & Onboarding State
    onboarded: localOnboarded,
    onboardingStep: 'splash', // splash, intro, login, nickname, slib, reward
    user: localUser || (localOnboarded ? DEFAULT_USER : null),
    feed: DEFAULT_FEED,
    leaderboard: DEFAULT_LEADERBOARD,
    loading: false,
    unlockedCards: [],
    proofsSubmittedCount: parseInt(localStorage.getItem('proofsSubmittedCount') || '0', 10),

    // Navigation & Overlay Modal Queue
    activeModal: null, // challenge-detail, upload-proof, analyzing, reward-reveal, r1-xp-toast, r2-badge-unlock, r3-key-claim, node-complete, settings, notifications, edit-profile, paywall, collections, streak-claim
    mockLogs: [],
    
    // Gameplay states
    activeChallenge: {
      id: 'npc-challenge',
      title: 'Prokaž, že nejsi NPC',
      type: 'Environmentální reset',
      category: 'Výzva 3 · Mikro-akce',
      description: 'Jeden mikro-zásah do reality. Do 15 minut. Najdi 3 odhozené kusy odpadu, seber je a vyhoď do koše.',
      reward_xp: 50,
      reward_keys: 2
    },
    storyDialogStep: 0,
    storyDialogs: [
      { sender: 'zaya', text: 'Většina lidí kolem tebe dnes neudělá nic. Ty máš jinou roli. Připrav se na zásah.', sys: 'GL_TCH://NODE_03_ACTIVE' },
      { sender: 'player', text: 'Jsem připraven.' },
      { sender: 'zaya', text: 'Skvělé. Uzel 3 se aktivuje. Tvoje výzva: "Prokaž, že nejsi NPC" je odemčena. Ukaž světu, že jednáš.' }
    ],
    dialogCompleted: false,

    activeStoryNode: null,
    activeStoryNodeSteps: [],

    // Notification list
    notifications: [
      { id: 'n1', title: 'Zaya', text: 'Vítej v Hře Reality! Tvá dobrodružství začínají.', time: 'Před 2 dny', unread: false },
      { id: 'n2', title: 'Odměna', text: 'Získal jsi odznak Doer za registraci.', time: 'Před 1 dnem', unread: true }
    ],

    // Actions
    setOnboardingStep: (step) => set({ onboardingStep: step }),
    
    nextOnboardingStep: () => {
      const step = get().onboardingStep;
      if (step === 'splash') set({ onboardingStep: 'intro' });
      else if (step === 'intro') set({ onboardingStep: 'login' });
      else if (step === 'login') set({ onboardingStep: 'nickname' });
      else if (step === 'nickname') set({ onboardingStep: 'slib' });
      else if (step === 'slib') set({ onboardingStep: 'reward' });
    },

    loadCurrentNodeData: async () => {
      const u = get().user;
      if (!u) return;

      try {
        // 1. Fetch active story node matching user's current uzel order
        const { data: nodeData, error: nodeError } = await supabase
          .from('story_nodes')
          .select('*')
          .eq('node_order', u.uzel)
          .single();

        if (nodeError) throw nodeError;

        if (nodeData) {
          set({ activeStoryNode: nodeData });

          // 2. Fetch dialogs for this node dynamically
          const dynamicDialogs = [
            { sender: 'zaya', text: nodeData.cutscene_text, sys: `GL_TCH://NODE_0${nodeData.node_order}_ACTIVE` }
          ];
          
          if (nodeData.type === 'CHALLENGE') {
            dynamicDialogs.push({ sender: 'player', text: 'Chci pokračovat.' });
            dynamicDialogs.push({ sender: 'zaya', text: `Tvá výzva: "${nodeData.title}" je odemčena. Splň ji pro odemčení dalšího uzlu.` });
          } else if (nodeData.type === 'REFERENTIAL') {
            dynamicDialogs.push({ sender: 'player', text: 'Chci se ohlédnout za svou cestou.' });
          }

          set({ 
            storyDialogs: dynamicDialogs,
            storyDialogStep: 0,
            dialogCompleted: false
          });

          // 3. Fetch challenge details if it is a challenge node
          if (nodeData.type === 'CHALLENGE') {
            const { data: challengeData } = await supabase
              .from('challenges')
              .select('*')
              .eq('story_node_id', nodeData.id)
              .single();

            if (challengeData) {
              set({ activeChallenge: challengeData });

              // 4. Fetch steps for the challenge
              const { data: stepsData } = await supabase
                .from('challenge_steps')
                .select('*')
                .eq('challenge_id', challengeData.id)
                .order('step_order', { ascending: true });

              set({ activeStoryNodeSteps: stepsData || [] });
            }
          } else {
            set({ activeChallenge: null, activeStoryNodeSteps: [] });
          }
        }
      } catch (err) {
        console.warn('Failed to load dynamic node content from Supabase. Using fallback mockups.', err);
        // Resilient Fallback to default Uzel 3 NPC challenge details
        if (u.uzel === 3) {
          set({
            activeChallenge: {
              id: 'c-npc-challenge',
              title: 'Prokaž, že nejsi NPC',
              description: 'Jeden mikro-zásah do reality. Do 15 minut. Najdi 3 odhozené kusy odpadu, seber je a vyhoď do koše.',
              why_text: 'Tímto malým činem ukážeš světu, že jednáš z vlastní vůle, ne jako naprogramovaný NPC.',
              proof_type: 'PHOTO',
              reward_keys: 2,
              reward_xp: 50
            },
            activeStoryNodeSteps: [
              { order: 1, text: 'Vyjdi ven z domu nebo kanceláře.' },
              { order: 2, text: 'Najdi v okruhu 100 metrů 3 odhozené odpadky.' },
              { order: 3, text: 'Odnes je k nejbližšímu popelnici či koši.' },
              { order: 4, text: 'Vyfoť je těsně před vyhozením jako důkaz.' }
            ],
            storyDialogs: [
              { sender: 'zaya', text: 'Většina lidí kolem tebe dnes neudělá nic. Ty máš jinou roli. Připrav se na zásah.', sys: 'GL_TCH://NODE_03_ACTIVE' },
              { sender: 'player', text: 'Jsem připraven.' },
              { sender: 'zaya', text: 'Skvělé. Uzel 3 se aktivuje. Tvoje výzva: "Prokaž, že nejsi NPC" je odemčena. Ukaž světu, že jednáš.' }
            ],
            storyDialogStep: 0,
            dialogCompleted: false
          });
        }
      }
    },

    loadUnlockedCards: async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          const { data, error } = await supabase
            .from('user_cards')
            .select('*')
            .eq('user_id', session.user.id);
          
          if (!error && data) {
            set({ unlockedCards: data });
          }
        }
      } catch (e) {
        console.warn('Failed to load user cards from Supabase.', e);
      }
    },

    updateUser: async (fields) => {
      const u = get().user;
      const base = u || { ...DEFAULT_USER };
      const updated = { ...base, ...fields };
      set({ user: updated });
      localStorage.setItem('user', JSON.stringify(updated));

      // Push to Supabase if session exists
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          await supabase.from('profiles').update({
            display_name: updated.name,
            pledge: updated.pledge,
            discord_user_id: updated.discord_user_id,
            xp: updated.xp,
            keys_balance: updated.keys_count,
            pass_holder: updated.passHolder,
            avatar_level: updated.badges_count
          }).eq('id', session.user.id);
        }
      } catch (e) {
        console.warn('Could not sync user updates with Supabase.', e);
      }
    },

    login: async (method) => {
      const randomName = 'Hráč_' + Math.floor(Math.random() * 1000);
      const newUser = {
        ...DEFAULT_USER,
        name: randomName,
        keys_count: DEFAULT_USER.keys_count + 1,
        xp: 0,
        badges_count: 1
      };
      set({ user: newUser, onboardingStep: 'nickname' });
      localStorage.setItem('user', JSON.stringify(newUser));
      get().loadCurrentNodeData();
      track('login', { method });

      // Trigger anonymous or social sign in in Supabase if supported
      try {
        if (method === 'google' || method === 'discord') {
          await supabase.auth.signInWithOAuth({ provider: method });
        } else {
          // Anonymous Sign In fallback
          const { data } = await supabase.auth.signInAnonymously();
          if (data?.user) {
            // Provision user profile in Supabase
            await supabase.from('profiles').insert([{
              id: data.user.id,
              email: data.user.email,
              display_name: randomName,
              xp: 0,
              keys_balance: DEFAULT_USER.keys_count + 1
            }]);
          }
        }
      } catch (e) {
        console.warn('Supabase auth signin omitted, using local session.', e);
      }
    },

    setNickname: (name) => {
      get().updateUser({ name });
    },

    setPledge: (pledge) => {
      get().updateUser({ pledge });
    },

    completeOnboarding: () => {
      const u = get().user || { ...DEFAULT_USER };
      const updated = { ...u, xp: 10, keys_count: u.keys_count + 1 };
      set({ user: updated, onboarded: true, onboardingStep: 'done' });
      localStorage.setItem('user', JSON.stringify(updated));
      localStorage.setItem('onboarded', 'true');
      get().updateUser({ xp: 10, keys_count: u.keys_count + 1 });
      get().loadCurrentNodeData();
      get().loadUnlockedCards();
      track('onboarding_completed');
    },

    resetProgress: () => {
      localStorage.removeItem('user');
      localStorage.removeItem('onboarded');
      localStorage.removeItem('proofsSubmittedCount');
      localStorage.removeItem('glitchMomentShown');
      set({
        user: null,
        onboarded: false,
        onboardingStep: 'splash',
        activeModal: null,
        storyDialogStep: 0,
        dialogCompleted: false,
        activeStoryNode: null,
        activeStoryNodeSteps: [],
        proofsSubmittedCount: 0
      });
    },

    // Challenge actions
    openModal: (modalName) => set({ activeModal: modalName }),
    closeModal: () => set({ activeModal: null }),

    incrementDialogStep: () => {
      const step = get().storyDialogStep;
      if (step < get().storyDialogs.length - 1) {
        set({ storyDialogStep: step + 1 });
      } else {
        set({ dialogCompleted: true });
      }
    },

    resetDialog: () => {
      set({ storyDialogStep: 0, dialogCompleted: false });
      get().loadCurrentNodeData();
    },

    submitProof: async (proofData) => {
      set({ activeModal: 'mock-loader', mockLogs: ['Inicializace Zaya_SYS...'] });

      await new Promise(r => setTimeout(r, 450));
      set(s => ({ mockLogs: [...s.mockLogs, 'Kontrola GPS koordinátů...'] }));
      await new Promise(r => setTimeout(r, 550));

      // Upload proof photo to Supabase Storage, if provided
      let imageUrl = null;
      if (proofData.photoFile) {
        set(s => ({ mockLogs: [...s.mockLogs, 'Nahrávání fotografie...'] }));
        try {
          const { data: { session } } = await supabase.auth.getSession();
          if (session) {
            const ext = proofData.photoFile.name.split('.').pop() || 'jpg';
            const path = `${session.user.id}/${Date.now()}.${ext}`;
            const { error: uploadError } = await supabase.storage
              .from('proofs')
              .upload(path, proofData.photoFile);
            if (!uploadError) {
              const { data: publicUrlData } = supabase.storage.from('proofs').getPublicUrl(path);
              imageUrl = publicUrlData?.publicUrl || null;
            } else {
              console.warn('Photo upload failed, continuing without image.', uploadError);
            }
          }
        } catch (e) {
          console.warn('Photo upload failed, continuing without image.', e);
        }
      }

      set(s => ({ mockLogs: [...s.mockLogs, 'Skenování okolních objektů...'] }));
      await new Promise(r => setTimeout(r, 500));
      set(s => ({ mockLogs: [...s.mockLogs, 'Ověření reálnosti: 100% OK'] }));
      await new Promise(r => setTimeout(r, 500));

      const u = get().user;
      const c = get().activeChallenge;
      if (u) {
        const xpReward = c ? c.reward_xp : 50;
        const keysReward = proofData.is_public ? (c ? c.reward_keys + 1 : 3) : (c ? c.reward_keys : 2);
        const newXp = u.xp + xpReward;
        const newKeys = u.keys_count + keysReward;
        const badgeUnlocked = u.badges_count < 5;
        const newBadgesCount = badgeUnlocked ? u.badges_count + 1 : u.badges_count;

        const updatedUser = {
          ...u,
          xp: newXp,
          keys_count: newKeys,
          badges_count: newBadgesCount
        };

        set({ user: updatedUser });
        localStorage.setItem('user', JSON.stringify(updatedUser));

        // 1. Save to Supabase Database
        try {
          const { data: { session } } = await supabase.auth.getSession();
          if (session) {
            // Write proof to feed_posts
            await supabase.from('feed_posts').insert([{
              user_id: session.user.id,
              user_name: u.name,
              content: proofData.text || 'Prokázal jsem, že nejsem NPC! 🟢',
              image_url: imageUrl,
              is_public: proofData.is_public
            }]);

            // Increment profile metrics
            await supabase.from('profiles').update({
              xp: newXp,
              keys_balance: newKeys,
              avatar_level: newBadgesCount
            }).eq('id', session.user.id);

            // Log Key Transaction
            await supabase.from('key_transactions').insert([{
              user_id: session.user.id,
              amount: keysReward,
              source: proofData.is_public ? 'PROOF_PUBLIC' : 'CHALLENGE_COMPLETE',
              balance_after: newKeys
            }]);

            // Save Challenge Completion
            await supabase.from('challenge_completions').insert([{
              user_id: session.user.id,
              challenge_id: c ? c.id : 'c-npc-challenge',
              completed_at: new Date().toISOString()
            }]);

            // Save card unlock to user_cards
            const cardKeyToUnlock = c ? `${c.id}-card` : 'doer-mvp1';
            await supabase.from('user_cards').insert([{
              user_id: session.user.id,
              card_key: cardKeyToUnlock,
              sync_status: 'SYNCED',
              obtained_at: new Date().toISOString()
            }]);

            get().loadUnlockedCards();

            // 2. Outbound sync to Airtable via Deno Edge Function if paired with Discord
            if (u.discord_user_id) {
              await fetch(`${process.env.REACT_APP_SUPABASE_URL}/functions/v1/airtable-sync`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${process.env.REACT_APP_SUPABASE_ANON_KEY}`
                },
                body: JSON.stringify({
                  discordUserId: u.discord_user_id,
                  cardKey: 'doer-mvp1'
                })
              });
            }
          }
        } catch (e) {
          console.warn('Supabase update failed during proof upload, fallback to local perzistence.', e);
        }

        // Add locally to feed
        const newFeedItem = {
          id: 'new_' + Date.now(),
          user_name: u.name,
          rarity: u.rarity,
          content: proofData.text || 'Prokázal jsem, že nejsem NPC! 🟢',
          image_url: imageUrl,
          reactions_fire: 0,
          reactions_lightning: 0,
          reactions_eye: 0,
          created_at: new Date().toISOString(),
          is_public: proofData.is_public
        };
        set(state => ({ feed: [newFeedItem, ...state.feed] }));
      }

      // Track proof count for the Glitch Moment mystery reward, surfaced at the end of the celebration chain
      const proofsSubmitted = get().proofsSubmittedCount + 1;
      set({ proofsSubmittedCount: proofsSubmitted });
      localStorage.setItem('proofsSubmittedCount', String(proofsSubmitted));

      track('proof_submitted', {
        proof_number: proofsSubmitted,
        node: u?.uzel,
        is_public: proofData.is_public,
        has_photo: !!proofData.photoFile
      });

      set({ activeModal: 'success-overlay' });
    },

    advanceNode: async () => {
      const u = get().user;
      if (u) {
        if (u.uzel === 3) {
          set({ activeModal: 'node-complete' });
        } else {
          const updatedNode = Math.min(u.uzel + 1, 9);
          const updated = { ...u, uzel: updatedNode };
          set({ user: updated });
          localStorage.setItem('user', JSON.stringify(updated));
          set({ activeModal: null });

          // Sync to Supabase
          try {
            const { data: { session } } = await supabase.auth.getSession();
            if (session) {
              await supabase.from('profiles').update({ uzel: updatedNode }).eq('id', session.user.id);
            }
          } catch (e) {
            console.warn('Failed syncing node advancement to database.', e);
          }
          track('node_completed', { node: updatedNode });
          get().loadCurrentNodeData();
        }
      }
    },

    confirmNodeComplete: async () => {
      const u = get().user;
      if (u) {
        const updated = { ...u, uzel: 4 };
        set({ user: updated, activeModal: null });
        localStorage.setItem('user', JSON.stringify(updated));

        try {
          const { data: { session } } = await supabase.auth.getSession();
          if (session) {
            await supabase.from('profiles').update({ uzel: 4 }).eq('id', session.user.id);
          }
        } catch (e) {
          console.warn('Failed syncing confirmNodeComplete to database.', e);
        }
        track('node_completed', { node: 4 });
        get().loadCurrentNodeData();
      }
    },

    addReaction: async (postId, type) => {
      // Local optimistical update
      set(state => ({
        feed: state.feed.map(item => {
          if (item.id === postId) {
            if (type === 'fire') return { ...item, reactions_fire: item.reactions_fire + 1 };
            if (type === 'lightning') return { ...item, reactions_lightning: item.reactions_lightning + 1 };
            if (type === 'eye') return { ...item, reactions_eye: item.reactions_eye + 1 };
          }
          return item;
        })
      }));

      // Sync with Supabase Database
      try {
        const { data: currentItem } = await supabase.from('feed_posts').select('*').eq('id', postId).single();
        if (currentItem) {
          const updateFields = {};
          if (type === 'fire') updateFields.reactions_fire = (currentItem.reactions_fire || 0) + 1;
          if (type === 'lightning') updateFields.reactions_lightning = (currentItem.reactions_lightning || 0) + 1;
          if (type === 'eye') updateFields.reactions_eye = (currentItem.reactions_eye || 0) + 1;

          await supabase.from('feed_posts').update(updateFields).eq('id', postId);
        }
      } catch (e) {
        console.warn('Failed to register reaction updates in database.', e);
      }
    },

    toggleNotificationRead: (id) => {
      set(state => ({
        notifications: state.notifications.map(n => n.id === id ? { ...n, unread: false } : n)
      }));
    },

    logout: async () => {
      localStorage.removeItem('user');
      localStorage.removeItem('onboarded');
      set({ user: null, onboarded: false, onboardingStep: 'splash', activeModal: null, activeStoryNode: null, activeStoryNodeSteps: [] });
      try {
        await supabase.auth.signOut();
      } catch (e) {
        console.warn('Supabase auth signout failed.', e);
      }
    },

    unlockPass: async () => {
      const u = get().user;
      if (u) {
        const updated = { ...u, passHolder: true };
        set({ user: updated, activeModal: null });
        localStorage.setItem('user', JSON.stringify(updated));

        try {
          const { data: { session } } = await supabase.auth.getSession();
          if (session) {
            await supabase.from('profiles').update({ pass_holder: true }).eq('id', session.user.id);
          }
        } catch (e) {
          console.warn('Failed syncing unlockPass to database.', e);
        }
      }
    },

    fetchUser: async (userId) => {
      try {
        const { data } = await supabase.from('profiles').select('*').eq('id', userId).single();
        if (data) {
          const mappedUser = {
            name: data.display_name,
            xp: data.xp,
            uzel: data.uzel || 3,
            streak: data.current_streak,
            keys_count: data.keys_balance,
            badges_count: data.avatar_level || 1,
            pledge: data.pledge,
            rarity: 'Rare',
            passHolder: data.pass_holder,
            discord_user_id: data.discord_user_id,
            isAdmin: data.is_admin || false,
            email: data.email || null
          };
          set({ user: mappedUser, onboarded: true });
          localStorage.setItem('user', JSON.stringify(mappedUser));
          localStorage.setItem('onboarded', 'true');
          get().loadCurrentNodeData();
          get().loadUnlockedCards();
        }
      } catch (e) {
        console.warn('Supabase fetchUser failed, using local storage.');
      }
    }
  };
});
