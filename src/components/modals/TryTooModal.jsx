import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Lock, Play, Check, Crown } from 'lucide-react';
import { supabase } from '../../api/supabaseClient';
import { useUserStore } from '../../store/userStore';
import { track } from '../../lib/analytics';
import ShareMomentButton from '../common/ShareMomentButton';

// spec-17 §6 "Zkus taky" deep-links to the exact quest of the post:
//   - my current node → start it
//   - a later node, Pass-only and no Pass → "jen pro Pass členy" + Pass CTA
//   - a later node otherwise → visible, but playable only after the previous nodes
//   - already completed → say so
export default function TryTooModal() {
  const { tryTooPost, user, closeModal, openModal } = useUserStore();
  const navigate = useNavigate();
  const [info, setInfo] = useState(null); // { challenge, nodeOrder, requiresPass, completed }

  useEffect(() => {
    const challengeId = tryTooPost?.challenge_id;
    if (!challengeId) return;
    (async () => {
      const { data: challenge } = await supabase
        .from('challenges')
        .select('id, title, description, why_text, story_nodes(node_order, requires_pass)')
        .eq('id', challengeId)
        .maybeSingle();
      let completed = false;
      if (user?.id) {
        const { data } = await supabase
          .from('challenge_completions')
          .select('challenge_id')
          .eq('user_id', user.id)
          .eq('challenge_id', challengeId)
          .maybeSingle();
        completed = !!data;
      }
      setInfo({
        challenge,
        nodeOrder: challenge?.story_nodes?.node_order ?? null,
        requiresPass: !!challenge?.story_nodes?.requires_pass,
        completed
      });
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tryTooPost?.challenge_id]);

  if (!info) {
    return <div style={{ fontFamily: 'Inter', fontSize: '13px', color: '#9A9AB5', textAlign: 'center', padding: '20px 0' }}>Načítám výzvu…</div>;
  }
  if (!info.challenge) {
    return <div style={{ fontFamily: 'Inter', fontSize: '13px', color: '#9A9AB5', textAlign: 'center', padding: '20px 0' }}>Tahle výzva už ve hře není.</div>;
  }

  const myNode = user?.uzel ?? 1;
  const ahead = info.nodeOrder > myNode;
  const passLocked = ahead && info.requiresPass && !user?.passHolder;

  let message;
  let action;
  if (info.completed) {
    message = <><Check size={14} /> Tuhle výzvu už máš splněnou.</>;
  } else if (passLocked) {
    message = <><Lock size={14} /> Tohle je vrstva pro aktivní hráče (uzel {info.nodeOrder}). Founder Pass ti odemkne celou cestu.</>;
    action = { label: <><Crown size={16} /> Odemknout Founder Pass</>, run: () => { track('paywall_opened', { source: 'try_too' }); openModal('paywall'); } };
  } else if (ahead) {
    message = <><Lock size={14} /> Tahle výzva tě čeká v uzlu {info.nodeOrder}. Nejdřív dokonči ty předchozí.</>;
    action = { label: <><Play size={16} /> Pokračovat v mé cestě</>, run: () => { closeModal(); navigate('/story'); } };
  } else {
    message = 'Tohle je tvoje aktuální výzva.';
    action = { label: <><Play size={16} /> Spustit výzvu</>, run: () => { closeModal(); navigate('/story'); } };
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '11px', letterSpacing: '.12em', color: '#A78BFA', textTransform: 'uppercase' }}>
        Zkus taky · Uzel {info.nodeOrder}
      </div>
      <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, fontSize: '20px', color: '#fff' }}>{info.challenge.title}</div>
      <div style={{ fontFamily: 'Inter', fontSize: '13px', color: '#9A9AB5', lineHeight: 1.5 }}>{info.challenge.description}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontFamily: 'Inter', fontSize: '12px', color: '#F0F0F8', background: '#1C1630', borderRadius: '10px', padding: '8px 10px' }}>
        {message}
      </div>
      {action && (
        <button
          type="button"
          onClick={action.run}
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', width: '100%', height: '46px', background: passLocked ? '#F5B73F' : '#7C3AED', color: passLocked ? '#15111E' : '#fff', fontFamily: 'Inter', fontWeight: 700, fontSize: '15px', border: 'none', borderRadius: '16px', cursor: 'pointer' }}
        >
          {action.label}
        </button>
      )}
      {/* Game Bible · Viral "DIRECT QUEST INVITE" — invite a friend to exactly this quest */}
      {user?.referralCode && (
        <ShareMomentButton variant="invite" questId={info.challenge.id} progressText={info.challenge.title} label="Pozvat kamaráda na tento quest" />
      )}
    </div>
  );
}
