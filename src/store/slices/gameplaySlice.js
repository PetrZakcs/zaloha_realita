import { supabase } from '../../api/supabaseClient';
import { track } from '../../lib/analytics';

export const createGameplaySlice = (set, get) => ({
  activeModal: null,
  mockLogs: [],
  proofError: null,
  lastReward: null,
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
  closeModal: () => set({ activeModal: null, proofError: null }),

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
    // Loader copy describes what actually happens — the previous "Kontrola GPS koordinátů" /
    // "Ověření reálnosti: 100% OK" lines implied a verification that doesn't exist.
    set({ activeModal: 'mock-loader', proofError: null, mockLogs: ['Zaya_SYS přijímá tvůj důkaz...'] });
    await new Promise(r => setTimeout(r, 400));

    const fail = (message, error) => {
      console.warn('submitProof failed.', error);
      track('proof_submit_failed', { reason: String(error?.message || error || message) });
      // Back to the proof form with the player's input intact — never a fake local reward.
      set({ activeModal: 'proof-upload', proofError: message });
    };

    const u = get().user;
    const c = get().activeChallenge;
    const { data: { session } } = await supabase.auth.getSession();
    if (!u || !session || !c?.id) {
      fail('Pro odeslání důkazu musíš být přihlášený/á.', 'no session or challenge');
      return;
    }

    let imageUrl = null;
    if (proofData.photoFile) {
      set(s => ({ mockLogs: [...s.mockLogs, 'Nahrávám fotografii...'] }));
      const ext = (proofData.photoFile.name.split('.').pop() || 'jpg').toLowerCase();
      const path = `${session.user.id}/${Date.now()}.${ext}`;
      const { error: uploadError } = await supabase.storage.from('proofs').upload(path, proofData.photoFile);
      if (uploadError) {
        fail('Fotku se nepodařilo nahrát. Zkus menší obrázek (max 10 MB, JPG/PNG/WebP/HEIC).', uploadError);
        return;
      }
      imageUrl = supabase.storage.from('proofs').getPublicUrl(path).data?.publicUrl || null;
    }

    set(s => ({ mockLogs: [...s.mockLogs, 'Zapisuji zásah do světa...'] }));

    // All reward-granting logic (server-validated amounts, node check, atomic completion +
    // grant, feed_posts/key_transactions/user_cards writes) lives in complete_challenge().
    const { data, error } = await supabase.rpc('complete_challenge', {
      p_challenge_id: c.id,
      p_proof_text: proofData.text || null,
      p_image_url: imageUrl,
      p_is_public: !!proofData.is_public
    });
    if (error) {
      fail('Důkaz se nepodařilo uložit. Zkontroluj připojení a zkus to znovu.', error);
      return;
    }

    const result = Array.isArray(data) ? data[0] : data;
    const updatedUser = {
      ...u,
      xp: result.new_xp,
      keys_count: result.new_keys_balance,
      badges_count: result.new_avatar_level
    };

    const proofsSubmitted = result.already_completed ? get().proofsSubmittedCount : get().proofsSubmittedCount + 1;
    set({
      user: updatedUser,
      proofsSubmittedCount: proofsSubmitted,
      // What the celebration screens show — the real server result, not fixed numbers.
      lastReward: {
        alreadyCompleted: !!result.already_completed,
        isPublic: !!proofData.is_public,
        xpGained: Math.max(0, result.new_xp - (u.xp || 0)),
        keysGained: Math.max(0, result.new_keys_balance - (u.keys_count || 0)),
        levelBefore: u.badges_count || 0,
        levelAfter: result.new_avatar_level || 0,
        proofNumber: proofsSubmitted
      }
    });
    localStorage.setItem('user', JSON.stringify(updatedUser));
    localStorage.setItem('proofsSubmittedCount', String(proofsSubmitted));

    get().loadUnlockedCards();
    get().fetchFeedPosts();
    get().fetchMysteryBoxes();
    // airtable-sync is deliberately not called here any more: it pushed the app-only
    // 'doer-mvp1' key, which doesn't exist in the album.hrareality.cz Season 0 catalog.
    // Re-enable once the app ↔ album card mapping is agreed.

    track('proof_submitted', {
      proof_number: proofsSubmitted,
      node: u.uzel,
      is_public: proofData.is_public,
      has_photo: !!proofData.photoFile,
      already_completed: !!result.already_completed
    });

    set({ activeModal: 'success-overlay' });
  },

  // MVP1 spec-12 §2.1 "Za každý 3. klíč hráč získá mystery box". Boxes are granted
  // server-side (grant_earned_mystery_boxes trigger); content comes from mystery_box_pool.
  mysteryBoxes: [],
  boxPool: [],

  fetchMysteryBoxes: async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const [{ data: boxes, error: boxesError }, { data: pool, error: poolError }] = await Promise.all([
        supabase.from('mystery_boxes').select('id, status, card_key, created_at').eq('user_id', session.user.id).eq('status', 'pending').order('created_at'),
        supabase.from('mystery_box_pool').select('card_key, title, rarity, description')
      ]);
      if (!boxesError) set({ mysteryBoxes: boxes || [] });
      if (!poolError) set({ boxPool: pool || [] });
    } catch (e) {
      console.warn('Failed to load mystery boxes.', e);
    }
  },

  // Returns { card } or { error: 'empty' | 'failed' }.
  openMysteryBox: async (boxId) => {
    track('mystery_box_open_clicked', { box_id: boxId });
    const { data, error } = await supabase.rpc('open_mystery_box', { p_box_id: boxId });
    if (error) {
      const empty = /pool is empty/i.test(error.message || '');
      console.warn('open_mystery_box failed.', error);
      return { error: empty ? 'empty' : 'failed' };
    }
    const card = Array.isArray(data) ? data[0] : data;
    track('mystery_box_opened', { card_key: card?.card_key, rarity: card?.rarity });
    set(state => ({ mysteryBoxes: state.mysteryBoxes.filter(b => b.id !== boxId) }));
    get().loadUnlockedCards();
    get().fetchFeedPosts();
    return { card };
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

      // The server refuses to advance past a node whose challenge isn't completed yet —
      // send the player back to that challenge instead of silently doing nothing.
      if (result.status === 'challenge_required') {
        track('node_challenge_required', { node: u.uzel });
        set({ activeModal: 'challenge-detail' });
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
      // No local-only advance any more: `uzel` is server-owned, so a faked step forward was
      // silently reverted on the next load. Tell the player instead.
      console.warn('advance_node RPC failed.', e);
      track('node_advance_failed', { node: u.uzel, reason: String(e?.message || e) });
      set({ activeModal: null });
      alert('Posun do dalšího uzlu se nepodařilo uložit. Zkontroluj připojení a zkus to znovu.');
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
        .eq('referrer_id', session.user.id)
        // Only activated players count (first challenge completed) — handle_referral_activation().
        .not('activated_at', 'is', null);
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
