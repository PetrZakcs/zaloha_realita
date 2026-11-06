import { supabase } from '../../api/supabaseClient';
import { track } from '../../lib/analytics';
import { levelFromXp } from '../../lib/levels';
import { compressImage } from '../../lib/compressImage';
import { scrubVideoLocation } from '../../lib/stripMetadata';

// Stored reference to a file in the private bucket. Not fetchable as is: "Moje důkazy" turns it
// into a short-lived signed URL (src/lib/privateMedia.js).
const privateProofUrl = (path) => `${process.env.REACT_APP_SUPABASE_URL}/storage/v1/object/authenticated/proofs-private/${path}`;

// Exported for tests.
export function pickActiveLoop(loops) {
  return loops.find(l => l.is_mandatory && !l.done)
    || loops.find(l => !l.done)
    || loops[loops.length - 1]
    || null;
}

export const createGameplaySlice = (set, get) => ({
  activeModal: null,
  mockLogs: [],
  proofError: null,
  lastReward: null,
  proofsSubmittedCount: parseInt(localStorage.getItem('proofsSubmittedCount') || '0', 10),

  // Real content only — null until the player's node is loaded from Supabase.
  activeChallenge: null,
  // All loops of the current node (Game Bible · Progression "NODES": several loops per node):
  // [{ id, title, loop_order, is_mandatory, done }]
  activeNodeLoops: [],
  storyDialogStep: 0,
  storyDialogs: [],
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


  openModal: (modalName) => set({ activeModal: modalName }),

  // "Zkus taky" from a feed post (spec-17 §6) — the modal resolves the post's exact quest.
  tryTooPost: null,
  openTryToo: (post) => set({ tryTooPost: post, activeModal: 'try-too' }),
  // Closing the identity reveal (any close button) also consumes it, so it doesn't reopen.
  closeModal: () => set(state => ({
    activeModal: null,
    proofError: null,
    identityReveal: state.activeModal === 'identity-reveal' ? null : state.identityReveal
  })),

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
          await get().refreshNodeLoops(nodeData);
        } else {
          set({ activeChallenge: null, activeNodeLoops: [], activeStoryNodeSteps: [] });
        }
      }
    } catch (err) {
      // No invented fallback quests any more — they had ids complete_challenge() rejects.
      console.warn('Failed to load node content from Supabase.', err);
      set({ activeChallenge: null, activeNodeLoops: [], activeStoryNodeSteps: [] });
    }
  },

  // Picks the loop to play in the current node: the first unfinished mandatory loop, then the
  // first unfinished optional one, else the last loop (all done → "Pokračovat" advances).
  // Doesn't touch the node's story dialog, so finishing loop A goes straight to loop B.
  refreshNodeLoops: async (node = get().activeStoryNode) => {
    const u = get().user;
    if (!node || !u?.id) return;
    try {
      const { data: challenges, error } = await supabase
        .from('challenges')
        .select('*')
        .eq('story_node_id', node.id)
        .order('loop_order', { ascending: true })
        .order('id', { ascending: true });
      if (error) throw error;
      const list = challenges || [];
      const { data: done } = list.length
        ? await supabase.from('challenge_completions').select('challenge_id').eq('user_id', u.id).in('challenge_id', list.map(c => c.id))
        : { data: [] };
      const doneIds = new Set((done || []).map(d => d.challenge_id));
      const loops = list.map(c => ({ id: c.id, title: c.title, loop_order: c.loop_order, is_mandatory: c.is_mandatory !== false, done: doneIds.has(c.id) }));
      const pick = pickActiveLoop(loops);
      const challenge = list.find(c => c.id === pick?.id) || null;
      set({ activeNodeLoops: loops, activeChallenge: challenge });

      if (challenge) {
        const { data: stepsData } = await supabase
          .from('challenge_steps')
          .select('*')
          .eq('challenge_id', challenge.id)
          .order('step_order', { ascending: true });
        set({ activeStoryNodeSteps: stepsData || [] });
      } else {
        set({ activeStoryNodeSteps: [] });
      }
    } catch (e) {
      console.warn('Failed to load node loops.', e);
      set({ activeChallenge: null, activeNodeLoops: [], activeStoryNodeSteps: [] });
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
      // spec-12 §2.3 "foto/video upload" — photos ≤ 10 MB, short videos ≤ 50 MB (bucket cap).
      const isVideo = (proofData.photoFile.type || '').startsWith('video/');
      const maxBytes = (isVideo ? 50 : 10) * 1024 * 1024;
      if (proofData.photoFile.size > maxBytes) {
        fail(isVideo ? 'Video může mít maximálně 50 MB.' : 'Fotka může mít maximálně 10 MB.', 'file too large');
        return;
      }
      set(s => ({ mockLogs: [...s.mockLogs, isVideo ? 'Nahrávám video...' : 'Nahrávám fotografii...'] }));
      // Photos are re-encoded (smaller + no EXIF/GPS); videos get their location atoms scrubbed.
      let uploadFile;
      try {
        uploadFile = isVideo ? await scrubVideoLocation(proofData.photoFile) : await compressImage(proofData.photoFile);
      } catch (e) {
        fail('Tenhle formát fotky neumíme zpracovat. Pošli ji prosím jako JPG nebo PNG.', e);
        return;
      }
      const ext = (uploadFile.name.split('.').pop() || (isVideo ? 'mp4' : 'jpg')).toLowerCase();
      const path = `${session.user.id}/${Date.now()}.${ext}`;
      // A private proof goes to the owner-only bucket: its URL must not be publicly readable.
      const bucket = proofData.is_public ? 'proofs' : 'proofs-private';
      const { error: uploadError } = await supabase.storage.from(bucket).upload(path, uploadFile);
      if (uploadError) {
        fail('Soubor se nepodařilo nahrát. Podporujeme JPG, PNG, WebP, HEIC a video MP4, WebM nebo MOV.', uploadError);
        return;
      }
      imageUrl = proofData.is_public
        ? (supabase.storage.from(bucket).getPublicUrl(path).data?.publicUrl || null)
        : privateProofUrl(path);
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
      badges_count: result.new_avatar_level,
      questsCompleted: result.already_completed ? (u.questsCompleted ?? 0) : (u.questsCompleted ?? 0) + 1
    };

    // Server-backed, so the 3rd/5th proof moments stay right across devices and re-logins.
    const proofsSubmitted = updatedUser.questsCompleted;
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
        proofNumber: proofsSubmitted,
        challengeId: c.id,
        node: u.uzel,
        firstQuest: !result.already_completed && (u.questsCompleted ?? 0) === 0,
        proofText: proofData.text || null,
        hasMedia: !!proofData.photoFile,
        // Lifetime Level (Game Bible) before/after — drives the "Posunul(a) jsem se" rank card.
        lifetimeLevelBefore: levelFromXp(u.xp || 0),
        lifetimeLevelAfter: levelFromXp(result.new_xp)
      }
    });
    localStorage.setItem('user', JSON.stringify(updatedUser));
    localStorage.setItem('proofsSubmittedCount', String(proofsSubmitted));

    get().loadUnlockedCards();
    get().fetchFeedPosts();
    get().fetchMysteryBoxes();
    get().loadIdentityExtras();
    get().refreshNodeLoops();
    get().fetchPlayerProgress();
    get().fetchNotifications();
    get().fetchIdentityItems();
    // airtable-sync is deliberately not called here any more: it pushed the app-only
    // 'doer-mvp1' key, which doesn't exist in the album.hrareality.cz Season 0 catalog.
    // Re-enable once the app ↔ album card mapping is agreed.

    track('proof_submitted', {
      proof_number: proofsSubmitted,
      node: u.uzel,
      is_public: proofData.is_public,
      has_photo: !!proofData.photoFile,
      already_completed: !!result.already_completed,
      seconds_since_start: proofData.startedAt ? Math.round((Date.now() - proofData.startedAt) / 1000) : null
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
      get().fetchIdentityItems();
      get().fetchPlayerProgress();
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

  // spec-20 "po nákupu: Status aktivován. Jsi Founder." The Pass is flipped by stripe-webhook,
  // which can land a moment after Stripe redirects back, so this waits for it instead of leaving
  // a paying player looking at the paywall.
  passActivation: null, // null | 'waiting' | 'active' | 'delayed'
  awaitPassActivation: async () => {
    set({ passActivation: 'waiting', activeModal: 'pass-activated' });
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { set({ passActivation: 'delayed' }); return; }
    for (let attempt = 0; attempt < 15; attempt++) {
      const { data } = await supabase.from('profiles').select('pass_holder').eq('id', session.user.id).maybeSingle();
      if (data?.pass_holder) {
        const u = get().user;
        if (u) {
          const updated = { ...u, passHolder: true, passLapsed: false };
          set({ user: updated });
          localStorage.setItem('user', JSON.stringify(updated));
        }
        set({ passActivation: 'active' });
        return;
      }
      await new Promise(r => setTimeout(r, 2000));
    }
    set({ passActivation: 'delayed' });
  }
});
