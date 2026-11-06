import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Gift } from 'lucide-react';
import { useUserStore } from '../../store/userStore';
import { levelProgress } from '../../lib/levels';
import { track } from '../../lib/analytics';

// Game Bible · Progression "PLAYER HOME" — Home answers "Co mám udělat teď?" first, then
// shows only what the player needs now: Lifetime Level, Theme progress, the next quest.
// Everything comes from get_player_progress(); nothing renders until it has loaded.
export default function NextMoveCard({ compact = false }) {
  const { user, playerProgress, fetchPlayerProgress, openModal } = useUserStore();
  const navigate = useNavigate();

  useEffect(() => {
    if (!playerProgress) fetchPlayerProgress();
    track('home_view');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const nextQuestId = playerProgress?.next_quest_id;
  useEffect(() => {
    if (nextQuestId) track('next_action_view', { quest_id: nextQuestId });
  }, [nextQuestId]);

  if (!playerProgress || user?.onboardingCompleted === false) return null;

  const p = playerProgress;
  const lvl = levelProgress(user?.xp ?? 0);
  const themePct = p.theme_total > 0 ? Math.round((p.theme_done / p.theme_total) * 100) : 0;
  const go = () => {
    track('next_move_clicked', { quest_id: p.next_quest_id, node: p.node_order });
    navigate('/story');
  };

  return (
    <div style={{ background: 'linear-gradient(135deg,#1F1638,#15111E)', border: '1px solid #7C3AED', borderRadius: '18px', padding: compact ? '14px' : '16px 18px', flexShrink: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
        <span style={{ fontFamily: 'Inter', fontWeight: 600, fontSize: '10px', letterSpacing: '.12em', textTransform: 'uppercase', color: '#A78BFA' }}>
          Tvůj další krok
        </span>
        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '10px', color: '#9A9AB5' }}>
          Level {lvl.level} · {p.lifetime_title}
        </span>
      </div>

      {p.next_quest_id ? (
        <div onClick={go} style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '8px', cursor: 'pointer' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, fontSize: '17px', color: '#fff' }}>{p.next_quest_title}</div>
            <div style={{ fontFamily: 'Inter', fontSize: '11px', color: '#9A9AB5', marginTop: '3px' }}>
              {p.node_title ? `${p.node_title}` : ''}
              {p.node_loops_total > 1 ? ` · loop ${Math.min(p.node_loops_done + 1, p.node_loops_total)}/${p.node_loops_total}` : ''}
              {p.next_quest_minutes ? ` · ~${p.next_quest_minutes} min` : ''}
            </div>
          </div>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: '#7C3AED', color: '#fff', borderRadius: '12px', padding: '8px 12px', fontFamily: 'Inter', fontWeight: 700, fontSize: '13px', flexShrink: 0 }}>
            Pokračovat <ArrowRight size={14} />
          </span>
        </div>
      ) : (
        <div onClick={go} style={{ fontFamily: 'Inter', fontSize: '13px', color: '#F0F0F8', marginTop: '8px', cursor: 'pointer' }}>
          Všechny questy v tématu máš splněné. Pokračuj do závěru sezóny →
        </div>
      )}

      <div style={{ marginTop: '12px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'Inter', fontSize: '10px', color: '#6B6B8A', marginBottom: '4px' }}>
          <span>{p.season_name || 'Sezóna'} · téma</span><span>{p.theme_done}/{p.theme_total} · {themePct} %</span>
        </div>
        <div style={{ height: '5px', background: '#2A2142', borderRadius: '4px', overflow: 'hidden' }}>
          <div style={{ width: `${themePct}%`, height: '100%', background: '#22C55E' }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'Inter', fontSize: '10px', color: '#6B6B8A', margin: '8px 0 4px' }}>
          <span>Level {lvl.level} → {lvl.level + 1}</span><span>{lvl.current}/{lvl.needed} XP</span>
        </div>
        <div style={{ height: '5px', background: '#2A2142', borderRadius: '4px', overflow: 'hidden' }}>
          <div style={{ width: `${lvl.percent}%`, height: '100%', background: '#4AA8FF' }} />
        </div>
      </div>

      {p.pending_boxes > 0 && (
        <button type="button" onClick={() => openModal('mystery-box')}
          style={{ marginTop: '12px', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', height: '36px', background: 'transparent', color: '#F5B73F', border: '1px solid #F5B73F', borderRadius: '12px', fontFamily: 'Inter', fontWeight: 600, fontSize: '12px', cursor: 'pointer' }}>
          <Gift size={14} /> Neotevřené boxy: {p.pending_boxes}
        </button>
      )}
    </div>
  );
}
