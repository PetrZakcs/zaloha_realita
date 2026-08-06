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

      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          await supabase.from('feed_posts').insert([{
            user_id: session.user.id,
            user_name: u.name,
            content: proofData.text || 'Prokázal jsem, že nejsem NPC! 🟢',
            image_url: imageUrl,
            is_public: proofData.is_public
          }]);

          await supabase.from('profiles').update({
            xp: newXp,
            keys_balance: newKeys,
            avatar_level: newBadgesCount
          }).eq('id', session.user.id);

          await supabase.from('key_transactions').insert([{
            user_id: session.user.id,
            amount: keysReward,
            source: proofData.is_public ? 'PROOF_PUBLIC' : 'CHALLENGE_COMPLETE',
            balance_after: newKeys
          }]);

          await supabase.from('challenge_completions').insert([{
            user_id: session.user.id,
            challenge_id: c ? c.id : 'c-npc-challenge',
            completed_at: new Date().toISOString()
          }]);

          const cardKeyToUnlock = c ? `${c.id}-card` : 'doer-mvp1';
          await supabase.from('user_cards').insert([{
            user_id: session.user.id,
            card_key: cardKeyToUnlock,
            sync_status: 'SYNCED',
            obtained_at: new Date().toISOString()
          }]);

          get().loadUnlockedCards();

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
    if (!u) return;

    const allNodes = get().allStoryNodes;
    const currentNode = allNodes.find(n => n.node_order === u.uzel);
    const nextNode = allNodes.find(n => n.node_order === u.uzel + 1);

    // Only REFERENTIAL nodes are narrative-only dead ends with no challenge to play.
    // FINAL (the Season 0 boss) has a real challenge and must stay reachable.
    if (nextNode && nextNode.type === 'REFERENTIAL') {
      track('season_completed', { node: u.uzel });
      set({ activeModal: null });
      return;
    }

    // Completed the last node (currently the FINAL boss) with nothing further defined yet —
    // Season 2 content isn't designed (see HANDOFF.md 8.6). Stop here instead of silently
    // reloading the same boss challenge, which would let a player resubmit it for infinite
    // XP/keys.
    if (!nextNode && currentNode?.type === 'FINAL') {
      track('season_completed', { node: u.uzel });
      set({ activeModal: null });
      return;
    }

    const updatedNode = nextNode ? nextNode.node_order : Math.min(u.uzel + 1, 9);
    const updated = { ...u, uzel: updatedNode };
    set({ user: updated, activeModal: null });
    localStorage.setItem('user', JSON.stringify(updated));

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
      onboardingStep: 'splash',
      activeModal: null,
      storyDialogStep: 0,
      dialogCompleted: false,
      activeStoryNode: null,
      activeStoryNodeSteps: [],
      proofsSubmittedCount: 0
    });
  }
});
