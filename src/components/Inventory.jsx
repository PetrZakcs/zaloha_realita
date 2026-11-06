import { useEffect, useState, Fragment } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUserStore } from '../store/userStore';
import { buildCatalog, isCardUnlocked } from '../lib/cards';
import { getAvatarLevel } from '../lib/avatarLevels';
import { FRAMES, isFrameUnlocked } from '../lib/frames';
import IdentitySlots from './common/IdentitySlots';
import { track } from '../lib/analytics';
import { ArrowLeft, Lock, KeyRound, Zap, Check, Gift } from 'lucide-react';
import PlayerAvatar from './common/PlayerAvatar';

const ALBUM_URL = process.env.REACT_APP_ALBUM_URL || 'https://album.hrareality.cz';

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
    setShowcase,
    mysteryBoxes,
    boxPool,
    fetchMysteryBoxes,
    openModal,
    setActiveFrame, ownIdentityVisual } = useUserStore();
  const [frameBusy, setFrameBusy] = useState(false);

  const [saving, setSaving] = useState(false);
  const [pendingShowcase, setPendingShowcase] = useState(user?.showcaseCardKeys || []);

  useEffect(() => {
    if (unlockedCards.length === 0) loadUnlockedCards();
    if (allStoryNodes.length === 0) loadAllStoryNodes();
    fetchMysteryBoxes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setPendingShowcase(user?.showcaseCardKeys || []);
  }, [user?.showcaseCardKeys]);

  const catalog = buildCatalog(boxPool);
  const ownedCards = catalog.filter(c => isCardUnlocked(c, unlockedCards));
  const lockedCards = catalog.filter(c => !isCardUnlocked(c, unlockedCards));
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
        <PlayerAvatar name={user?.name} avatarUrl={user?.avatarUrl} {...ownIdentityVisual()} level={user?.badges_count} frameKey={user?.activeFrame} npc={user?.onboardingCompleted === false} size={64} />
        <div>
          <div style={{ fontFamily: 'Inter', fontWeight: '600', fontSize: '10px', color: '#6B6B8A', textTransform: 'uppercase', letterSpacing: '.08em' }}>
            Aktivní identita · Level {level.level}
          </div>
          <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: '700', fontSize: '17px', color: level.color, marginTop: '3px' }}>
            {level.name}
          </div>
        </div>
      </div>

      {/* Rámečky (spec-12 §2.4 "3–5 odemykatelných rámečků", spec-21 §4 "možnost přepnout") */}
      <div style={{ marginTop: '14px' }}>
        <div style={{ fontFamily: 'Inter', fontWeight: '600', fontSize: '11px', letterSpacing: '.1em', textTransform: 'uppercase', color: '#6B6B8A', marginBottom: '10px' }}>
          Rámečky
        </div>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          {FRAMES.map(frame => {
            const unlocked = isFrameUnlocked(frame, { level: user?.badges_count || 0, passHolder: !!user?.passHolder });
            const active = user?.activeFrame === frame.key;
            return (
              <button
                key={frame.key}
                type="button"
                disabled={!unlocked || frameBusy}
                onClick={async () => {
                  setFrameBusy(true);
                  await setActiveFrame(active ? null : frame.key);
                  setFrameBusy(false);
                }}
                title={unlocked ? (active ? 'Sundat rámeček' : 'Nasadit rámeček') : (frame.requiresPass ? 'Jen s Founder Passem' : `Odemkneš na úrovni ${frame.requiredLevel}`)}
                style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', background: 'none',
                  border: 'none', cursor: unlocked ? 'pointer' : 'not-allowed', opacity: unlocked ? 1 : 0.4, padding: 0
                }}
              >
                <span style={{
                  width: '44px', height: '44px', borderRadius: '50%', background: '#241C3C',
                  border: `${frame.width}px solid ${frame.border}`, boxShadow: active ? `0 0 ${frame.glow}px ${frame.border}` : 'none',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6B6B8A'
                }}>
                  {!unlocked && <Lock size={14} />}
                  {active && <Check size={16} color={frame.border} />}
                </span>
                <span style={{ fontFamily: 'Inter', fontSize: '10px', color: active ? '#F0F0F8' : '#9A9AB5' }}>{frame.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Identity slots (Game Bible · Identity MVP1: title, aura, mask) */}
      <IdentitySlots />

      {/* Mystery boxy (spec-12 §2.1: box za každý 3. klíč) */}
      <button
        onClick={() => openModal('mystery-box')}
        style={{
          display: 'flex', alignItems: 'center', gap: '12px', width: '100%', marginTop: '14px', textAlign: 'left',
          background: mysteryBoxes.length > 0 ? '#2A1E10' : '#1C1630',
          border: `1px solid ${mysteryBoxes.length > 0 ? '#F5B73F' : '#382C5C'}`, borderRadius: '16px', padding: '12px 16px', cursor: 'pointer'
        }}
      >
        <span style={{ color: '#F5B73F', display: 'inline-flex' }}><Gift size={22} /></span>
        <span style={{ flex: 1, fontFamily: 'Inter', fontSize: '13px', color: '#F0F0F8' }}>
          {mysteryBoxes.length > 0 ? `Mystery Boxy k otevření: ${mysteryBoxes.length}` : 'Mystery Box získáš za každé 3 klíče'}
        </span>
      </button>

      {/* spec-12 §4.1 "Artefakty (Propojit do alba)" — the Season 0 album lives on
          album.hrareality.cz (Discord login). */}
      <a
        href={ALBUM_URL}
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => track('album_link_clicked')}
        style={{
          display: 'flex', alignItems: 'center', gap: '12px', marginTop: '10px', textDecoration: 'none',
          background: '#1C1630', border: '1px solid #382C5C', borderRadius: '16px', padding: '12px 16px'
        }}
      >
        <span style={{ flex: 1, fontFamily: 'Inter', fontSize: '13px', color: '#F0F0F8' }}>
          Sběratelské album Season 0 <span style={{ color: '#6B6B8A', fontSize: '11px' }}>· přihlášení přes Discord</span>
        </span>
        <span style={{ fontFamily: 'Inter', fontSize: '13px', color: '#A78BFA' }}>Otevřít →</span>
      </a>

      {/* SEKCE 2 — Karty */}
      <div style={{ marginTop: '26px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
          <span style={{ fontFamily: 'Inter', fontWeight: '600', fontSize: '11px', letterSpacing: '.1em', textTransform: 'uppercase', color: '#6B6B8A' }}>
            Karty · {ownedCards.length}/{catalog.length}
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
