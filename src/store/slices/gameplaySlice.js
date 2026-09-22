import { supabase } from '../../api/supabaseClient';
import { track } from '../../lib/analytics';

export const createGameplaySlice = (set, get) => ({
  activeModal: null,
  mockLogs: [],
  proofsSubmittedCount: parseInt(localStorage.getItem('proofsSubmittedCount') || '0', 10),

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
  allStoryNodes: [],

  // "Referenční uzel" (spec-5) — shown once after season completion (today: finishing the
  // FINAL 'Uzel 9 · Boss Fight' node). null until checkSeasonReflectionStatus() resolves,
  // so advanceNode() knows to wait rather than assuming "not submitted yet" and flashing
  // the flow at a returning player who already completed it in a previous session.
  seasonReflectionSubmitted: null,
  seasonReflectionStep: 'pre-frame', // pre-frame -> reflection -> slider -> nps -> referral-intent -> sentence -> identity-lock -> share -> unlocked
  seasonReflectionAnswers: {
    percent: 50,
    wouldRecommend: null,
    referralIntent: null,
    sentenceTemplate: null,
    sentenceText: ''
  },

  notifications: [
    { id: 'n1', title: 'Zaya', text: 'Vítej v Hře Reality! Tvá dobrodružství začínají.', time: 'Před 2 dny', unread: false },
    { id: 'n2', title: 'Odměna', text: 'Získal jsi odznak Doer za registraci.', time: 'Před 1 dnem', unread: true }
  ],

  openModal: (modalName) => set({ activeModal: modalName }),
  closeModal: () => set({ activeModal: null }),

  loadCurrentNodeData: async () => {
    const u = get().user;
    if (!u) return;

    try {
      const { data: nodeData, error: nodeError } = await supabase
        .from('story_nodes')
        .select('*')
        .eq('node_order', u.uzel)
        .single();

      if (nodeError) throw nodeError;

      if (nodeData) {
        set({ activeStoryNode: nodeData });

        const dynamicDialogs = [
          { sender: 'zaya', text: nodeData.cutscene_text, sys: `GL_TCH://NODE_0${nodeData.node_order}_ACTIVE` }
        ];
        
        if (nodeData.type === 'CHALLENGE') {
          dynamicDialogs.push({ sender: 'player', text: 'Chci pokračovat.' });
          dynamicDialogs.push({ sender: 'zaya', text: `Tvá výzva: "${nodeData.title}" je odemčena. Splň ji pro odemčení dalšího uzlu.` });
        } else if (nodeData.type === 'FINAL') {
          dynamicDialogs.push({ sender: 'player', text: 'Jsem připraven na finále.' });
          dynamicDialogs.push({ sender: 'zaya', text: `Poslední zkouška: "${nodeData.title}". Splň ji a dokonči Season 0.` });
        } else if (nodeData.type === 'REFERENTIAL') {
          dynamicDialogs.push({ sender: 'player', text: 'Chci se ohlédnout za svou cestou.' });
        }

        set({ 
          storyDialogs: dynamicDialogs,
          storyDialogStep: 0,
          dialogCompleted: false
        });

        if (nodeData.type === 'CHALLENGE' || nodeData.type === 'FINAL') {
          const { data: challengeData } = await supabase
            .from('challenges')
            .select('*')
            .eq('story_node_id', nodeData.id)
            .single();

          if (challengeData) {
            set({ activeChallenge: challengeData });

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
      const nodeIndex = u.uzel || 1;
      const nodeFallbackMap = {
        1: {
          title: '3 minuty ticha',
          description: 'Zastav se a po dobu 3 minut pouze pozoruj okolí bez koukání do mobilu.',
          why_text: 'Uvědomíš si, kolik detailů ti denně uniká v autopilotu.',
          proof_type: 'TEXT',
          reward_keys: 1,
          reward_xp: 25,
          steps: [{ order: 1, text: 'Zastav se na klidném místě.' }, { order: 2, text: '3 minuty pozoruj okolí.' }],
          dialogs: [
            { sender: 'zaya', text: 'Většina lidí kolem tebe dnes neudělá nic nového. Ty se probouzíš.', sys: 'GL_TCH://NODE_01_ACTIVE' },
            { sender: 'player', text: 'Jsem připraven.' },
            { sender: 'zaya', text: 'Tvá první výzva: Zastav se na 3 minuty bez obrazovky.' }
          ]
        },
        2: {
          title: 'Signal Cut (Detox)',
          description: 'Odlož telefon na 45 minut, vypni notifikace a vyfoť analogové zátiší.',
          why_text: 'Získáš zpět svou pozornost a klid v mysli.',
          proof_type: 'PHOTO',
          reward_keys: 2,
          reward_xp: 40,
          steps: [{ order: 1, text: 'Vypni notifikace.' }, { order: 2, text: 'Odlož telefon na 45 min.' }],
          dialogs: [
            { sender: 'zaya', text: 'Uzel 2 se aktivuje. Signal Cut.', sys: 'GL_TCH://NODE_02_ACTIVE' },
            { sender: 'player', text: 'Rozumím.' },
            { sender: 'zaya', text: 'Odlož displej a vrať se k vnímání prostorem.' }
          ]
        },
        3: {
          title: 'Prokaž, že nejsi NPC',
          description: 'Jeden mikro-zásah do reality. Do 15 minut. Najdi 3 odhozené kusy odpadu, seber je a vyhoď do koše.',
          why_text: 'Tímto malým činem ukážeš světu, že jednáš z vlastní vůle, ne jako naprogramovaný NPC.',
          proof_type: 'PHOTO',
          reward_keys: 2,
          reward_xp: 50,
          steps: [
            { order: 1, text: 'Vyjdi ven z domu nebo kanceláře.' },
            { order: 2, text: 'Najdi v okruhu 100 metrů 3 odhozené odpadky.' },
            { order: 3, text: 'Odnes je k nejbližšímu popelnici či koši.' },
            { order: 4, text: 'Vyfoť je těsně před vyhozením jako důkaz.' }
          ],
          dialogs: [
            { sender: 'zaya', text: 'Většina lidí kolem tebe dnes neudělá nic. Ty máš jinou roli. Připrav se na zásah.', sys: 'GL_TCH://NODE_03_ACTIVE' },
            { sender: 'player', text: 'Jsem připraven.' },
            { sender: 'zaya', text: 'Skvělé. Uzel 3 se aktivuje. Tvoje výzva: "Prokaž, že nejsi NPC" je odemčena. Ukaž světu, že jednáš.' }
          ]
        },
        9: {
          title: 'Prolomení Sítě ZAYA (Boss Fight)',
          description: 'Celodenní výzva: 24h bez sociálních sítí + 10 000 kroků + 1 dobrý skutek.',
          why_text: 'Stáváš se oficiálně potvrzeným Doerem Season 0.',
          proof_type: 'PHOTO',
          reward_keys: 10,
          reward_xp: 500,
          steps: [
            { order: 1, text: 'Zapni mód nerušit.' },
            { order: 2, text: 'Ujdi 10 000 kroků.' },
            { order: 3, text: 'Udělej dobrý skutek.' }
          ],
          dialogs: [
            { sender: 'zaya', text: 'Finální uzel Season 0. Boss fight.', sys: 'GL_TCH://NODE_09_FINAL' },
            { sender: 'player', text: 'Jdu na to.' },
            { sender: 'zaya', text: 'Prolom síť ZAYA a získej kartu Doer MVP-1.' }
          ]
        }
      };

      const fallback = nodeFallbackMap[nodeIndex] || nodeFallbackMap[3];
      set({
        activeChallenge: {
          id: `c-node-${nodeIndex}`,
          title: fallback.title,
          description: fallback.description,
          why_text: fallback.why_text,
          proof_type: fallback.proof_type,
          reward_keys: fallback.reward_keys,
          reward_xp: fallback.reward_xp
        },
        activeStoryNodeSteps: fallback.steps,
        storyDialogs: fallback.dialogs,
        storyDialogStep: 0,
        dialogCompleted: false
      });
    }
  },

  loadAllStoryNodes: async () => {
    try {
      const { data, error } = await supabase
        .from('story_nodes')
        .select('*')
        .order('node_order', { ascending: true });

      if (error) throw error;
      set({ allStoryNodes: data || [] });
    } catch (e) {
      console.warn('Failed to load story node list from Supabase.', e);
    }
  },

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
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) throw new Error('No active Supabase session');

        // All reward-granting logic (server-validated amounts, atomic completion
        // check + grant, feed_posts/key_transactions/user_cards writes) now lives
        // in the complete_challenge() RPC — the client no longer computes or
        // writes reward amounts directly. See supabase_migration_profiles_security.sql.
        const { data, error } = await supabase.rpc('complete_challenge', {
          p_challenge_id: c ? c.id : 'c-npc-challenge',
          p_proof_text: proofData.text || null,
          p_image_url: imageUrl,
          p_is_public: !!proofData.is_public
        });
        if (error) throw error;

        const result = Array.isArray(data) ? data[0] : data;
        const updatedUser = {
          ...u,
          xp: result.new_xp,
          keys_count: result.new_keys_balance,
          badges_count: result.new_avatar_level
        };
        set({ user: updatedUser });
        localStorage.setItem('user', JSON.stringify(updatedUser));

        get().loadUnlockedCards();
        // complete_challenge() already inserted the real feed_posts row server-side —
        // refetch from Supabase instead of optimistically faking a local entry.
        get().fetchFeedPosts();

        if (u.discord_user_id && session?.access_token) {
          await fetch(`${process.env.REACT_APP_SUPABASE_URL}/functions/v1/airtable-sync`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${session.access_token}`
            },
            body: JSON.stringify({
              discordUserId: u.discord_user_id,
              cardKey: 'doer-mvp1'
            })
          });
        }
      } catch (e) {
        // Preserves the app's existing offline/demo-mode resilience: if the RPC
        // fails (no session, network down, or a locally-faked activeChallenge.id
        // like "npc-challenge"/"c-node-N" that doesn't exist server-side), fall
        // back to a LOCAL-ONLY reward. This is not persisted server-side.
        console.warn('complete_challenge RPC failed, using local-only reward (not persisted).', e);
        const xpReward = c ? c.reward_xp : 50;
        // MVP1 spec (Feed §7): private proof grants XP but ZERO keys — mirrors the
        // p_is_public gating in complete_challenge() (supabase_migration_profiles_security.sql).
        // Keep this fallback's amounts in sync with that RPC, not a separate "+1 bonus"
        // formula, so demo/offline mode doesn't quietly promise different rewards.
        const keysReward = proofData.is_public ? (c ? c.reward_keys : 2) : 0;
        const updatedUser = {
          ...u,
          xp: u.xp + xpReward,
          keys_count: u.keys_count + keysReward,
          badges_count: u.badges_count < 5 ? u.badges_count + 1 : u.badges_count
        };
        set({ user: updatedUser });
        localStorage.setItem('user', JSON.stringify(updatedUser));

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
    }

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

  // useFreeDaily: explicit intent flag for "Pokračovat zdarma" on the paywall moment —
  // the server independently re-checks whether today's free slot is actually still
  // available (supabase_migration_free_daily_node.sql) rather than trusting this value;
  // it only tells the RPC the player has consciously chosen the free path over buying
  // the Pass, so a first-time gate hit still surfaces 'pass_required' instead of quietly
  // spending the slot.
  advanceNode: async (useFreeDaily = false) => {
    const u = get().user;
    if (!u) return;

    // Shared by both the RPC success path and the offline fallback below: season's over —
    // open the "Referenční uzel" reflection flow (spec-5) the first time, or just close out
    // silently on repeat visits once it's already been submitted (checkSeasonReflectionStatus()
    // is expected to have already resolved this by the time a player can reach this point).
    const handleSeasonCompleted = () => {
      track('season_completed', { node: u.uzel });
      if (get().seasonReflectionSubmitted) {
        set({ activeModal: null });
      } else {
        set({ activeModal: 'season-reflection', seasonReflectionStep: 'pre-frame' });
      }
    };

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('No active Supabase session');

      // Server-validated: resolves current/next node, checks REFERENTIAL/FINAL season-end
      // conditions, and enforces requires_pass against the caller's own pass_holder — all
      // previously done (or, for the pass check, never done at all) on the client against
      // data it could freely fake. See supabase_migration_advance_node.sql and
      // supabase_migration_free_daily_node.sql (soft-gate: 1 free story node/day past the
      // paywall instead of a hard block).
      const { data, error } = await supabase.rpc('advance_node', { p_use_free_daily: useFreeDaily });
      if (error) throw error;

      const result = Array.isArray(data) ? data[0] : data;

      if (result.status === 'season_completed') {
        handleSeasonCompleted();
        return;
      }

      if (result.status === 'pass_required') {
        track('node_gated_by_pass', { node: u.uzel });
        set({ activeModal: 'paywall' });
        return;
      }

      if (result.status === 'daily_limit_reached') {
        track('node_daily_limit_reached', { node: u.uzel });
        set({ activeModal: 'node-daily-limit' });
        return;
      }

      const updated = { ...u, uzel: result.new_uzel };
      set({ user: updated, activeModal: null });
      localStorage.setItem('user', JSON.stringify(updated));
      track('node_completed', { node: result.new_uzel, via_free_daily: useFreeDaily });
      get().loadCurrentNodeData();
    } catch (e) {
      // Same offline/demo-mode resilience as elsewhere: fall back to a local-only advance,
      // not persisted server-side, using whatever node list the client already loaded.
      console.warn('advance_node RPC failed, using local-only progression (not persisted).', e);
      const allNodes = get().allStoryNodes;
      const currentNode = allNodes.find(n => n.node_order === u.uzel);
      const nextNode = allNodes.find(n => n.node_order === u.uzel + 1);

      if (nextNode && nextNode.type === 'REFERENTIAL') {
        handleSeasonCompleted();
        return;
      }
      if (!nextNode && currentNode?.type === 'FINAL') {
        handleSeasonCompleted();
        return;
      }

      // Mirrors the real RPC's requires_pass gate — without this, the local-only fallback
      // let a free player walk straight through paid content whenever the RPC call itself
      // failed (network blip, or the request simply broken client-side). Doesn't replicate
      // the 1-node/day free-allowance bookkeeping here — offline/demo mode just hard-gates
      // like the rest of this fallback already does; the server remains the actual source
      // of truth for `uzel` regardless (protect_profile_privileges locks it against direct
      // writes), so this only affects the optimistic local UI, not real progression.
      if (nextNode?.requires_pass && !u.passHolder && !useFreeDaily) {
        track('node_gated_by_pass', { node: u.uzel, offline_fallback: true });
        set({ activeModal: 'paywall' });
        return;
      }

      const updatedNode = nextNode ? nextNode.node_order : Math.min(u.uzel + 1, 9);
      const updated = { ...u, uzel: updatedNode };
      set({ user: updated, activeModal: null });
      localStorage.setItem('user', JSON.stringify(updated));
      track('node_completed', { node: updatedNode, via_free_daily: useFreeDaily });
      get().loadCurrentNodeData();
    }
  },

  // Checked once per session (called from fetchUser(), same place loadCurrentNodeData()/
  // loadUnlockedCards() already get kicked off) so advanceNode()'s season_completed branch
  // knows whether to show the reflection flow or not without an extra round-trip at the
  // exact moment the season finishes.
  checkSeasonReflectionStatus: async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const { data, error } = await supabase
        .from('season_reflections')
        .select('id')
        .eq('user_id', session.user.id)
        .maybeSingle();
      if (!error) {
        set({ seasonReflectionSubmitted: !!data });
      }
    } catch (e) {
      console.warn('Failed to check season reflection status.', e);
    }
  },

  // null = not loaded yet — the paywall/settings referral CTA should render nothing (or a
  // loading state) rather than a fake "0/2" while this is still resolving. See
  // supabase_migration_referral_system.sql.
  referralSignupsCount: null,

  fetchReferralStats: async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const { count, error } = await supabase
        .from('referral_signups')
        .select('id', { count: 'exact', head: true })
        .eq('referrer_id', session.user.id);
      if (!error) set({ referralSignupsCount: count ?? 0 });
    } catch (e) {
      console.warn('Failed to fetch referral stats.', e);
    }
  },

  setSeasonReflectionStep: (step) => set({ seasonReflectionStep: step }),

  updateSeasonReflectionAnswers: (fields) => set(state => ({
    seasonReflectionAnswers: { ...state.seasonReflectionAnswers, ...fields }
  })),

  submitSeasonReflection: async () => {
    const { percent, wouldRecommend, referralIntent, sentenceTemplate, sentenceText } = get().seasonReflectionAnswers;
    track('season_reflection_submitted', { percent, would_recommend: wouldRecommend, referral_intent: referralIntent });

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('No active Supabase session');

      // Server-validated (ranges, non-empty sentence) and server-idempotent — see
      // supabase_migration_season_reflection.sql. This is the app's main source of hard
      // MVP1 validation data (% transformace, NPS, referral intent, UGC), so, like
      // complete_challenge()/advance_node(), it's never computed or trusted client-side.
      const { data, error } = await supabase.rpc('submit_season_reflection', {
        p_percent: percent,
        p_would_recommend: !!wouldRecommend,
        p_referral_intent: referralIntent ?? 0,
        p_sentence_template: sentenceTemplate ?? 1,
        p_sentence_text: sentenceText
      });
      if (error) throw error;

      const result = Array.isArray(data) ? data[0] : data;
      set({ seasonReflectionSubmitted: true, seasonReflectionStep: 'identity-lock' });
      get().loadUnlockedCards(); // picks up the newly granted 'light-bearer-season0' card
      return { success: true, percent: result?.transformation_percent ?? percent };
    } catch (e) {
      // Same offline/demo-mode resilience as submitProof()/advanceNode(): the flow itself
      // (identity-lock -> share card -> hidden unlock) still plays out locally so a flaky
      // connection doesn't strand the player mid-flow, it just isn't persisted server-side.
      console.warn('submit_season_reflection RPC failed, continuing locally (not persisted).', e);
      set({ seasonReflectionSubmitted: true, seasonReflectionStep: 'identity-lock' });
      return { success: false, percent };
    }
  },

  toggleNotificationRead: (id) => {
    set(state => ({
      notifications: state.notifications.map(n => n.id === id ? { ...n, unread: false } : n)
    }));
  },

  resetProgress: () => {
    localStorage.removeItem('user');
    localStorage.removeItem('onboarded');
    localStorage.removeItem('onboardingStep');
    localStorage.removeItem('proofsSubmittedCount');
    localStorage.removeItem('glitchMomentShown');
    set({
      user: null,
      onboarded: false,
      onboardingStep: 'entry',
      activeModal: null,
      storyDialogStep: 0,
      dialogCompleted: false,
      activeStoryNode: null,
      activeStoryNodeSteps: [],
      proofsSubmittedCount: 0,
      seasonReflectionSubmitted: null,
      seasonReflectionStep: 'pre-frame',
      seasonReflectionAnswers: {
        percent: 50,
        wouldRecommend: null,
        referralIntent: null,
        sentenceTemplate: null,
        sentenceText: ''
      },
      welcomeBackDays: null
    });
  }
});
