import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUserStore } from '../../store/userStore';
import { supabase } from '../../api/supabaseClient';
import { ALL_CARDS, isCardUnlocked } from '../../lib/cards';
import { getAvatarLevel } from '../../lib/avatarLevels';
import { Settings as SettingsIcon, Crown, ChevronRight, Package } from 'lucide-react';
import HraPassCard from '../common/HraPassCard';

export default function MobileProfile() {
  const { user, openModal, unlockedCards, loadUnlockedCards } = useUserStore();
  const navigate = useNavigate();
  const [proofs, setProofs] = useState([]);

  useEffect(() => {
    if (unlockedCards.length === 0) loadUnlockedCards();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Own "poslední 3 veřejné proofy" (spec-10 §2C) — same shape/query as PublicProfile.jsx's
  // version of this, just scoped to the logged-in user instead of a :userId param.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const { data } = await supabase
        .from('feed_posts')
        .select('*')
        .eq('user_id', session.user.id)
        .eq('is_public', true)
        .order('created_at', { ascending: false })
        .limit(3);
      if (!cancelled) setProofs(data || []);
    })();
    return () => { cancelled = true; };
  }, []);

  const level = getAvatarLevel(user?.badges_count);
  const ownedCards = ALL_CARDS.filter(c => isCardUnlocked(c, unlockedCards));
  const showcase = (user?.showcaseCardKeys || []).map(key => ALL_CARDS.find(c => c.key === key)).filter(Boolean);

  return (
    <div style={{
      flex: 1,
      overflowY: 'auto',
      background: '#15111E',
      backgroundImage: 'radial-gradient(circle at 50% 0%, rgba(167, 139, 250, 0.16), transparent 42%)',
      fontFamily: 'Inter, sans-serif'
    }}>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {/* Profile Card Header */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '14px 24px 0', position: 'relative' }}>
          <span
            onClick={() => openModal('settings')}
            style={{ position: 'absolute', right: '20px', top: '12px', display: 'inline-flex', width: '22px', height: '22px', color: '#6B6B8A', cursor: 'pointer' }}
          >
            <SettingsIcon size={20} />
          </span>

          {/* Avatar — level-driven color/glow (spec-10 §6), not a fixed purple ring */}
          <div style={{ position: 'relative', width: '96px', height: '96px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{
              width: '78px',
              height: '78px',
              borderRadius: '50%',
              background: '#241C3C',
              border: `${level.borderWidth}px solid ${level.border}`,
              boxShadow: level.glow ? `0 0 ${level.glow}px ${level.border}88` : 'none',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontFamily: "'Space Grotesk', sans-serif",
              fontWeight: '700',
              fontSize: '26px',
              color: level.color
            }}>
              {(user?.name || 'TP').slice(0, 2).toUpperCase()}
            </span>
            {user?.passHolder && (
              <span style={{
                position: 'absolute',
                bottom: '-2px',
                right: '-2px',
                width: '28px',
                height: '28px',
                borderRadius: '50%',
                background: '#2A1E10',
                border: '2px solid #F5B73F',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 0 10px rgba(245,183,63,.5)'
              }}>
                <span style={{ display: 'inline-flex', width: '13px', height: '13px', color: '#F5B73F' }}><Crown size={12} /></span>
              </span>
            )}
          </div>

          <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: '700', fontSize: '20px', marginTop: '14px', color: '#F0F0F8' }}>
            {user?.name || 'TemnýPozorovatel'}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '6px' }}>
            <span style={{ fontFamily: 'Inter', fontWeight: '600', fontSize: '11px', color: level.color, background: '#241C3C', border: `0.5px solid ${level.border}`, borderRadius: '20px', padding: '4px 11px' }}>
              {level.name}
            </span>
            {user?.passHolder && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', fontFamily: 'Inter', fontWeight: '600', fontSize: '11px', color: '#F5B73F', background: '#2A1E10', border: '0.5px solid #F5B73F', borderRadius: '20px', padding: '4px 11px' }}>
                <Crown size={11} /> Founder
              </span>
            )}
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '11px', color: '#60A5FA' }}>
              {user?.xp || 0} XP
            </span>
          </div>
        </div>

        {/* Profile Pledge */}
        <div style={{ padding: '16px 24px 0' }}>
          <div style={{ borderLeft: '2px solid #7C3AED', paddingLeft: '12px' }}>
            <span style={{ fontFamily: 'Inter', fontStyle: 'italic', fontSize: '13px', color: '#9A9AB5', lineHeight: '1.5' }}>
              „{user?.pledge || 'Jsem člověk, co přestal čekat a začal jednat.'}“
            </span>
          </div>
        </div>

        {/* Stats Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '9px', padding: '16px 24px 0' }}>
          <div style={{ background: '#241C3C', border: '0.5px solid #382C5C', borderRadius: '16px', padding: '11px', textAlign: 'center' }}>
            <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: '700', fontSize: '19px', color: '#F5B73F' }}>{user?.keys_count ?? 0}</div>
            <div style={{ fontFamily: 'Inter', fontSize: '9px', color: '#6B6B8A', marginTop: '2px' }}>klíčů</div>
          </div>
          <div style={{ background: '#241C3C', border: '0.5px solid #382C5C', borderRadius: '16px', padding: '11px', textAlign: 'center' }}>
            <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: '700', fontSize: '19px', color: '#4AA8FF' }}>{user?.xp ?? 0}</div>
            <div style={{ fontFamily: 'Inter', fontSize: '9px', color: '#6B6B8A', marginTop: '2px' }}>XP</div>
          </div>
          <div style={{ background: '#241C3C', border: '0.5px solid #382C5C', borderRadius: '16px', padding: '11px', textAlign: 'center' }}>
            <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: '700', fontSize: '19px', color: '#F5B73F' }}>{user?.streak ?? 0}</div>
            <div style={{ fontFamily: 'Inter', fontSize: '9px', color: '#6B6B8A', marginTop: '2px' }}>dní v řadě</div>
          </div>
          <div style={{ background: '#241C3C', border: '0.5px solid #382C5C', borderRadius: '16px', padding: '11px', textAlign: 'center', gridColumn: 'span 3' }}>
            <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: '700', fontSize: '19px', color: '#22C55E' }}>Uzel {user?.uzel ?? 0}</div>
            <div style={{ fontFamily: 'Inter', fontSize: '9px', color: '#6B6B8A', marginTop: '2px' }}>aktuální postup</div>
          </div>
        </div>

        {/* HRA PASS Banner */}
        <div style={{ padding: '16px 24px 0' }}>
          <HraPassCard compact />
        </div>

        {/* Showcase (spec-10 §2E) — the player's own curated selection, editable in Inventář */}
        {showcase.length > 0 && (
          <div style={{ padding: '20px 24px 0' }}>
            <span style={{ fontFamily: 'Inter', fontWeight: '600', fontSize: '10px', letterSpacing: '.12em', textTransform: 'uppercase', color: '#6B6B8A' }}>
              Showcase
            </span>
            <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
              {showcase.map(card => (
                <div key={card.key} style={{ flex: 1, aspectRatio: '1', background: card.bg, border: `1.5px solid ${card.border}`, borderRadius: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '4px' }}>
                  <span style={{ fontFamily: 'Inter', fontWeight: '600', fontSize: '10px', color: card.color, textAlign: 'center' }}>{card.title}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Poslední proofy (spec-10 §2C) */}
        {proofs.length > 0 && (
          <div style={{ padding: '20px 24px 0' }}>
            <span style={{ fontFamily: 'Inter', fontWeight: '600', fontSize: '10px', letterSpacing: '.12em', textTransform: 'uppercase', color: '#6B6B8A' }}>
              Poslední důkazy
            </span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '10px' }}>
              {proofs.map(p => (
                <div key={p.id} style={{ background: '#241C3C', border: '0.5px solid #382C5C', borderRadius: '14px', padding: '10px 13px' }}>
                  <div style={{ fontFamily: 'Inter', fontSize: '12px', color: '#F0F0F8', lineHeight: '1.5' }}>{p.content}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Mini collection teaser (spec-10 §2F) — 3 owned cards + progress, links to the
            full Inventář. Replaces what used to be a 16-slot grid cycling through 4 fake
            mock icon styles regardless of what was actually unlocked. */}
        <div style={{ padding: '20px 24px 0' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
            <span style={{ fontFamily: 'Inter', fontWeight: '600', fontSize: '10px', letterSpacing: '.12em', textTransform: 'uppercase', color: '#6B6B8A' }}>
              Sbírka
            </span>
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '10px', color: '#A78BFA' }}>
              {ownedCards.length} / {ALL_CARDS.length}
            </span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
            {ownedCards.slice(0, 3).map(card => (
              <div key={card.key} style={{ aspectRatio: '1', background: card.bg, border: `1.5px solid ${card.border}`, borderRadius: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '4px' }}>
                <span style={{ fontFamily: 'Inter', fontWeight: '600', fontSize: '10px', color: card.color, textAlign: 'center' }}>{card.title}</span>
              </div>
            ))}
          </div>

          <div
            onClick={() => navigate('/inventory')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '11px',
              marginTop: '14px',
              background: '#1C1630',
              border: '0.5px solid #382C5C',
              borderRadius: '16px',
              padding: '12px 14px',
              cursor: 'pointer'
            }}
          >
            <span style={{
              width: '32px',
              height: '32px',
              borderRadius: '9px',
              background: '#241C3C',
              border: '0.5px solid #7C3AED',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0
            }}>
              <span style={{ display: 'inline-flex', width: '16px', height: '16px', color: '#A78BFA' }}><Package size={16} /></span>
            </span>
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: 'Inter', fontWeight: '600', fontSize: '12px', color: '#F0F0F8' }}>Otevřít Inventář</div>
              <div style={{ fontFamily: 'Inter', fontSize: '10px', color: '#6B6B8A', marginTop: '1px' }}>Karty, showcase, postup a zdroje</div>
            </div>
            <span style={{ display: 'inline-flex', width: '16px', height: '16px', color: '#6B6B8A' }}><ChevronRight size={16} /></span>
          </div>
        </div>

        <div style={{ height: '20px' }} />
      </div>
    </div>
  );
}
