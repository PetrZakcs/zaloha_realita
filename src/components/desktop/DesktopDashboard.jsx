import { Fragment, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { keysLabel } from '../../lib/plural';
import { useUserStore } from '../../store/userStore';
import { KeyRound, Play, Lock, Crown, Check, ArrowRight } from 'lucide-react';
import NpcBanner from '../common/NpcBanner';
import NextMoveCard from '../common/NextMoveCard';

export default function DesktopDashboard() {
  const { user, activeChallenge, allStoryNodes, loadAllStoryNodes } = useUserStore();
  const navigate = useNavigate();

  useEffect(() => {
    if (allStoryNodes.length === 0) loadAllStoryNodes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const maxNode = allStoryNodes.length > 0 ? allStoryNodes.length : 9;
  const progressPct = Math.min(100, Math.round(((user?.uzel ?? 0) / maxNode) * 100));

  return (
    <div style={{
      flex: 1,
      overflowY: 'auto',
      padding: '24px 28px',
      display: 'flex',
      flexDirection: 'column',
      gap: '18px',
      fontFamily: 'Inter, sans-serif',
      height: '100%'
    }}>
      <NpcBanner />
      <NextMoveCard compact={false} />

      {/* LEVEL + QUEST PATH ROW */}
      <div style={{ display: 'flex', gap: '16px', flexShrink: 0 }}>
        <div style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          gap: '14px',
          background: '#15111E',
          border: '0.5px solid #2A2142',
          borderRadius: '18px',
          padding: '16px 18px'
        }}>
          <div style={{ position: 'relative', width: '50px', height: '50px', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: `conic-gradient(#7C3AED 0% ${progressPct}%,#2A2142 ${progressPct}% 100%)` }}></div>
            <div style={{ position: 'absolute', inset: '3px', borderRadius: '50%', background: '#15111E' }}></div>
            <span style={{ position: 'relative', fontFamily: "'Space Grotesk', sans-serif", fontWeight: '700', fontSize: '19px', color: '#F0F0F8' }}>
              {user?.uzel ?? 1}
            </span>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
              <span style={{ fontFamily: 'Inter', fontWeight: '600', fontSize: '13px', color: '#F0F0F8' }}>
                Uzel {user?.uzel ?? 1} <span style={{ color: '#6B6B8A', fontWeight: '500' }}>Sezóna 0</span>
              </span>
              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '11px', color: '#60A5FA' }}>
                {user?.xp ?? 0} XP
              </span>
            </div>
            <div style={{ height: '7px', background: '#2A2142', borderRadius: '4px', overflow: 'hidden' }}>
              <div style={{ width: `${progressPct}%`, height: '100%', borderRadius: '4px', background: 'linear-gradient(90deg,#2563EB,#4AA8FF)' }}></div>
            </div>
          </div>
        </div>
      </div>

      {/* QUEST PATH (node list) */}
      <div style={{
        background: '#15111E',
        border: '0.5px solid #2A2142',
        borderRadius: '18px',
        padding: '18px 20px',
        flexShrink: 0
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
          <span style={{ fontFamily: 'Inter', fontWeight: '600', fontSize: '11px', letterSpacing: '.12em', textTransform: 'uppercase', color: '#6B6B8A' }}>
            Sezóna 0 · cesta
          </span>
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '11px', color: '#A78BFA' }}>
            Uzel {user?.uzel ?? 0} / {allStoryNodes.length}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          {allStoryNodes.map((node, idx) => {
            const uzel = user?.uzel ?? 0;
            const isDone = node.node_order < uzel;
            const isCurrent = node.node_order === uzel;
            const isBoss = node.type === 'REFERENTIAL' || node.type === 'FINAL';
            const isLast = idx === allStoryNodes.length - 1;

            let circle;
            if (isBoss) {
              circle = (
                <div style={{ width: '30px', height: '30px', borderRadius: '50%', background: '#2A1E10', border: '1.5px solid #F5B73F', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <span style={{ display: 'inline-flex', width: '15px', height: '15px', color: '#F5B73F' }}><Crown size={14} /></span>
                </div>
              );
            } else if (isCurrent) {
              circle = (
                <div
                  className="node-now"
                  onClick={() => navigate('/story')}
                  style={{ width: '36px', height: '36px', borderRadius: '50%', background: 'linear-gradient(135deg,#9333EA,#6D28D9)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, cursor: 'pointer' }}
                >
                  <span style={{ display: 'inline-flex', width: '17px', height: '17px', color: '#fff' }}><Play size={16} fill="#fff" /></span>
                </div>
              );
            } else if (isDone) {
              circle = (
                <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: '#16351F', border: '1.5px solid #22C55E', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <span style={{ display: 'inline-flex', width: '14px', height: '14px', color: '#22C55E' }}><Check size={14} /></span>
                </div>
              );
            } else {
              circle = (
                <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: '#1C1630', border: `1.5px solid ${node.requires_pass ? '#F5B73F' : '#382C5C'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <span style={{ display: 'inline-flex', width: '13px', height: '13px', color: node.requires_pass ? '#F5B73F' : '#6B6B8A' }}><Lock size={12} /></span>
                </div>
              );
            }

            return (
              <Fragment key={node.id}>
                {circle}
                {!isLast && <div style={{ flex: 1, height: '2px', background: isDone ? '#22C55E' : '#2A2142' }}></div>}
              </Fragment>
            );
          })}
        </div>
      </div>

      {/* HERO HERO + CHALLENGE BLOCK */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: '18px', flex: 1, minHeight: 0 }}>
        {/* Story progress card */}
        <div className="sheen-wrap" style={{
          background: 'linear-gradient(120deg,#7C3AED,#5B21B6)',
          borderRadius: '20px',
          padding: '28px',
          position: 'relative',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column'
        }}>
          <div style={{ position: 'absolute', right: '-30px', top: '-30px', width: '180px', height: '180px', borderRadius: '50%', background: 'radial-gradient(circle,rgba(255,255,255,.16),transparent 70%)' }}></div>
          <div style={{ fontFamily: 'Inter', fontWeight: '600', fontSize: '11px', letterSpacing: '.12em', textTransform: 'uppercase', color: 'rgba(255,255,255,.7)', position: 'relative' }}>
            Tvůj další krok
          </div>
          <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: '700', fontSize: '30px', color: '#fff', marginTop: '8px', lineHeight: 1.08, position: 'relative' }}>
            Pokračovat<br />v příběhu
          </div>
          <div style={{ fontFamily: 'Inter', fontSize: '14px', color: 'rgba(255,255,255,.8)', marginTop: '8px', position: 'relative' }}>
            Uzel {user?.uzel ?? 1} · Zaya na tebe čeká.
          </div>
          <div style={{ flex: 1 }}></div>
          <button
            onClick={() => navigate('/story')}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              alignSelf: 'flex-start',
              background: '#fff',
              color: '#5B21B6',
              fontFamily: 'Inter',
              fontWeight: '700',
              fontSize: '15px',
              border: 'none',
              borderRadius: '16px',
              padding: '13px 22px',
              cursor: 'pointer',
              position: 'relative'
            }}
          >
            Otevřít uzel <span style={{ display: 'inline-flex', width: '16px', height: '16px' }}><ArrowRight size={16} /></span>
          </button>
        </div>

        {/* Daily challenge card */}
        <div style={{
          background: '#15111E',
          border: '0.5px solid #2A2142',
          borderLeft: '3px solid #7C3AED',
          borderRadius: '20px',
          padding: '20px',
          display: 'flex',
          flexDirection: 'column'
        }}>
          {activeChallenge ? (
            <>
              <div style={{ fontFamily: 'Inter', fontWeight: '600', fontSize: '10px', letterSpacing: '.12em', textTransform: 'uppercase', color: '#8B5CF6' }}>
                Dnešní výzva
              </div>
              <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: '700', fontSize: '19px', marginTop: '8px', color: '#F0F0F8' }}>
                {activeChallenge.title}
              </div>
              <div style={{ fontFamily: 'Inter', fontSize: '13px', color: '#9A9AB5', marginTop: '8px', lineHeight: '1.5' }}>
                {activeChallenge.description}
              </div>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', marginTop: '14px', background: '#1C1630', border: '0.5px solid #382C5C', borderRadius: '20px', padding: '5px 12px', alignSelf: 'flex-start' }}>
                <span style={{ display: 'inline-flex', width: '14px', height: '14px', color: '#F5B73F' }}><KeyRound size={12} /></span>
                <span style={{ fontFamily: 'Inter', fontSize: '12px', color: '#F5B73F', fontWeight: '600' }}>
                  +{keysLabel(activeChallenge.reward_keys)} · +{activeChallenge.reward_xp} XP
                </span>
              </div>
              <div style={{ flex: 1 }}></div>
              <button
                onClick={() => navigate('/story')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  width: '100%',
                  height: '46px',
                  background: '#7C3AED',
                  color: '#fff',
                  fontFamily: 'Inter',
                  fontWeight: '700',
                  fontSize: '14px',
                  border: 'none',
                  borderRadius: '16px',
                  cursor: 'pointer'
                }}
              >
                Spustit výzvu
              </button>
            </>
          ) : (
            <>
              <div style={{ fontFamily: 'Inter', fontWeight: '600', fontSize: '10px', letterSpacing: '.12em', textTransform: 'uppercase', color: '#8B5CF6' }}>
                Příběhový moment
              </div>
              <div style={{ fontFamily: 'Inter', fontSize: '13px', color: '#9A9AB5', marginTop: '10px', lineHeight: '1.5' }}>
                Tenhle uzel je čistě příběhový, žádná výzva k němu nepatří. Pokračuj v dialogu se Zayou.
              </div>
              <div style={{ flex: 1 }}></div>
              <button
                onClick={() => navigate('/story')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  width: '100%',
                  height: '46px',
                  background: '#7C3AED',
                  color: '#fff',
                  fontFamily: 'Inter',
                  fontWeight: '700',
                  fontSize: '14px',
                  border: 'none',
                  borderRadius: '16px',
                  cursor: 'pointer'
                }}
              >
                Pokračovat v příběhu
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
