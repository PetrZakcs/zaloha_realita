import { useEffect, useState, Fragment } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUserStore } from '../store/userStore';
import { ALL_CARDS, isCardUnlocked } from '../lib/cards';
import { getAvatarLevel } from '../lib/avatarLevels';
import { ArrowLeft, Lock, KeyRound, Zap, Check } from 'lucide-react';

// "Inventář" (MVP1 spec-10) — the other half of the Profil/Inventář split: "PROFIL = co
// ukazuju (výběr), INVENTÁŘ = co vlastním (celek)". A single component, not split into
// Mobile/Desktop variants like most of the app — it's a list of sections, not a bespoke
// layout, and reads fine at any width.
export default function Inventory() {
  const navigate = useNavigate();
  const {
    user,
    unlockedCards,
    loadUnlockedCards,
    allStoryNodes,
    loadAllStoryNodes,
    setShowcase
  } = useUserStore();

  const [saving, setSaving] = useState(false);
  const [pendingShowcase, setPendingShowcase] = useState(user?.showcaseCardKeys || []);

  useEffect(() => {
    if (unlockedCards.length === 0) loadUnlockedCards();
    if (allStoryNodes.length === 0) loadAllStoryNodes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setPendingShowcase(user?.showcaseCardKeys || []);
  }, [user?.showcaseCardKeys]);

  const ownedCards = ALL_CARDS.filter(c => isCardUnlocked(c, unlockedCards));
  const lockedCards = ALL_CARDS.filter(c => !isCardUnlocked(c, unlockedCards));
  const level = getAvatarLevel(user?.badges_count);
  const dirty = JSON.stringify([...pendingShowcase].sort()) !== JSON.stringify([...(user?.showcaseCardKeys || [])].sort());

  const toggleShowcase = (cardKey) => {
    setPendingShowcase(prev => {
      if (prev.includes(cardKey)) return prev.filter(k => k !== cardKey);
      if (prev.length >= 3) return prev; // spec-10 §2E: max 3 showcase slots
      return [...prev, cardKey];
    });
  };

  const saveShowcase = async () => {
    setSaving(true);
    await setShowcase(pendingShowcase);
    setSaving(false);
  };

  return (
    <div style={{
      flex: 1,
      overflowY: 'auto',
      background: '#15111E',
      backgroundImage: 'radial-gradient(circle at 50% 0%, rgba(167, 139, 250, 0.12), transparent 42%)',
      fontFamily: 'Inter, sans-serif',
      padding: '14px 20px 32px'
    }}>
      <span
        onClick={() => navigate(-1)}
        style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: '#9A9AB5', cursor: 'pointer', fontFamily: 'Inter', fontSize: '13px' }}
      >
        <ArrowLeft size={16} /> Zpět
      </span>

      <div style={{ marginTop: '18px' }}>
        <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: '700', fontSize: '22px', color: '#F0F0F8' }}>
          Tvoje výbava
        </div>
        <div style={{ fontFamily: 'Inter', fontSize: '12px', color: '#6B6B8A', marginTop: '2px' }}>
          Osobní kapitál: {ownedCards.length} {ownedCards.length === 1 ? 'prvek' : ownedCards.length < 5 ? 'prvky' : 'prvků'}
        </div>
      </div>

      {/* SEKCE 1 — Aktivní identita */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginTop: '24px', background: '#1C1630', border: '0.5px solid #382C5C', borderRadius: '18px', padding: '16px' }}>
        <span style={{
          width: '64px',
          height: '64px',
          borderRadius: '50%',
          background: '#241C3C',
          border: `${level.borderWidth}px solid ${level.border}`,
          boxShadow: level.glow ? `0 0 ${level.glow}px ${level.border}66` : 'none',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: "'Space Grotesk', sans-serif",
          fontWeight: '700',
          fontSize: '20px',
          color: level.color,
          flexShrink: 0
        }}>
          {(user?.name || 'H').slice(0, 2).toUpperCase()}
        </span>
        <div>
          <div style={{ fontFamily: 'Inter', fontWeight: '600', fontSize: '10px', color: '#6B6B8A', textTransform: 'uppercase', letterSpacing: '.08em' }}>
            Aktivní identita · Level {level.level}
          </div>
          <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: '700', fontSize: '17px', color: level.color, marginTop: '3px' }}>
            {level.name}
          </div>
        </div>
      </div>

      {/* SEKCE 2 — Karty */}
      <div style={{ marginTop: '26px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
          <span style={{ fontFamily: 'Inter', fontWeight: '600', fontSize: '11px', letterSpacing: '.1em', textTransform: 'uppercase', color: '#6B6B8A' }}>
            Karty · {ownedCards.length}/{ALL_CARDS.length}
          </span>
          {dirty && (
            <button
              onClick={saveShowcase}
              disabled={saving}
              style={{
                display: 'flex', alignItems: 'center', gap: '5px',
                background: '#7C3AED', color: '#fff', border: 'none', borderRadius: '10px',
                padding: '5px 12px', fontFamily: 'Inter', fontWeight: '600', fontSize: '11px', cursor: 'pointer'
              }}
            >
              {saving ? 'Ukládám…' : <>Uložit výběr <Check size={12} /></>}
            </button>
          )}
        </div>
        <div style={{ fontFamily: 'Inter', fontSize: '11px', color: '#6B6B8A', marginBottom: '12px' }}>
          Vyber až 3 karty do showcase na svém veřejném profilu.
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
          {ownedCards.map(card => {
            const selected = pendingShowcase.includes(card.key);
            return (
              <div
                key={card.key}
                onClick={() => toggleShowcase(card.key)}
                style={{
                  aspectRatio: '1',
                  background: card.bg,
                  border: `2px solid ${selected ? '#22C55E' : card.border}`,
                  borderRadius: '16px',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '4px',
                  cursor: 'pointer',
                  position: 'relative',
                  boxShadow: selected ? '0 0 14px rgba(34,197,94,.4)' : 'none'
                }}
              >
                {selected && (
                  <span style={{ position: 'absolute', top: '6px', right: '6px', width: '16px', height: '16px', borderRadius: '50%', background: '#22C55E', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Check size={10} color="#0D0A18" />
                  </span>
                )}
                <span style={{ fontFamily: 'Inter', fontWeight: '600', fontSize: '10px', color: card.color, textAlign: 'center', padding: '0 6px' }}>{card.title}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* SEKCE 3 — Progres */}
      {allStoryNodes.length > 0 && (
        <div style={{ marginTop: '26px' }}>
          <div style={{ fontFamily: 'Inter', fontWeight: '600', fontSize: '11px', letterSpacing: '.1em', textTransform: 'uppercase', color: '#6B6B8A', marginBottom: '12px' }}>
            Postup · Uzel {user?.uzel || 0}/{allStoryNodes.length}
          </div>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            {allStoryNodes.map((node, idx) => {
              const uzel = user?.uzel || 0;
              const isDone = node.node_order < uzel;
              const isCurrent = node.node_order === uzel;
              const isLast = idx === allStoryNodes.length - 1;
              const circle = (
                <div
                  title={node.title}
                  style={{
                    width: '20px',
                    height: '20px',
                    borderRadius: '50%',
                    background: isDone ? '#22C55E' : (isCurrent ? '#7C3AED' : '#1C1630'),
                    border: isCurrent ? '2px solid #A78BFA' : '1px solid #382C5C',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0
                  }}
                >
                  {node.requires_pass && !isDone && (
                    <span style={{ display: 'inline-flex', width: '10px', height: '10px', color: '#F5B73F' }}><Lock size={9} /></span>
                  )}
                </div>
              );
              return (
                <Fragment key={node.id}>
                  {circle}
                  {!isLast && <div style={{ flex: 1, height: '2px', background: isDone ? '#22C55E' : '#2A2142' }}></div>}
                </Fragment>
              );
            })}
          </div>
        </div>
      )}

      {/* SEKCE 4 — Zamčené věci */}
      {lockedCards.length > 0 && (
        <div style={{ marginTop: '26px' }}>
          <div style={{ fontFamily: 'Inter', fontWeight: '600', fontSize: '11px', letterSpacing: '.1em', textTransform: 'uppercase', color: '#6B6B8A', marginBottom: '10px' }}>
            Zamčené · {lockedCards.length}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px' }}>
            {lockedCards.map(card => (
              <div
                key={card.key}
                style={{
                  aspectRatio: '1',
                  background: '#1A142C',
                  border: '1.5px dashed #382C5C',
                  borderRadius: '14px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                <span style={{ display: 'inline-flex', width: '18px', height: '18px', color: '#3a3a55' }}><Lock size={16} /></span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* SEKCE 5 — Resources */}
      <div style={{ display: 'flex', gap: '12px', marginTop: '26px' }}>
        <div style={{ flex: 1, background: '#241C3C', border: '0.5px solid #382C5C', borderRadius: '16px', padding: '14px', textAlign: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
            <KeyRound size={14} color="#F5B73F" />
            <span style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: '700', fontSize: '20px', color: '#F5B73F' }}>{user?.keys_count ?? 0}</span>
          </div>
          <div style={{ fontFamily: 'Inter', fontSize: '10px', color: '#6B6B8A', marginTop: '3px' }}>klíčů</div>
        </div>
        <div style={{ flex: 1, background: '#241C3C', border: '0.5px solid #382C5C', borderRadius: '16px', padding: '14px', textAlign: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
            <Zap size={14} color="#4AA8FF" />
            <span style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: '700', fontSize: '20px', color: '#4AA8FF' }}>{user?.xp ?? 0}</span>
          </div>
          <div style={{ fontFamily: 'Inter', fontSize: '10px', color: '#6B6B8A', marginTop: '3px' }}>XP</div>
        </div>
      </div>
    </div>
  );
}
