import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUserStore } from '../../store/userStore';
import { supabase } from '../../api/supabaseClient';
import { ALL_CARDS, isCardUnlocked } from '../../lib/cards';
import { getAvatarLevel } from '../../lib/avatarLevels';
import { Settings as SettingsIcon, Crown, Pencil, Package, ChevronRight } from 'lucide-react';
import HraPassCard from '../common/HraPassCard';
import PlayerAvatar from '../common/PlayerAvatar';
import ProfileIdentitySection from '../common/ProfileIdentitySection';

export default function DesktopProfile() {
  const { user, openModal, unlockedCards, loadUnlockedCards, seasonReflectionSubmitted, ownIdentityVisual } = useUserStore();
  const navigate = useNavigate();
  const [proofs, setProofs] = useState([]);

  useEffect(() => {
    if (unlockedCards.length === 0) loadUnlockedCards();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      fontFamily: 'Inter, sans-serif'
    }}>
      <div style={{ flex: 1, overflowY: 'auto', padding: '28px 36px 36px', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
          <span style={{ fontFamily: 'Inter', fontWeight: '600', fontSize: '11px', letterSpacing: '.12em', textTransform: 'uppercase', color: '#6B6B8A' }}>
            Profil Hráče
          </span>
          <span
            onClick={() => openModal('settings')}
            style={{
              display: 'inline-flex',
              width: '36px',
              height: '36px',
              borderRadius: '12px',
              background: '#241C3C',
              border: '1px solid #382C5C',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#9A9AB5',
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
          >
            <SettingsIcon size={18} />
          </span>
        </div>

        {/* Avatar — level-driven color/glow (spec-10 §6) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
          <div style={{ position: 'relative', width: '112px', height: '112px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <PlayerAvatar name={user?.name} avatarUrl={user?.avatarUrl} {...ownIdentityVisual()} level={user?.badges_count} frameKey={user?.activeFrame} npc={user?.onboardingCompleted === false} size={88} />
            {user?.passHolder && (
              <span style={{
                position: 'absolute',
                bottom: '2px',
                right: '2px',
                width: '32px',
                height: '32px',
                borderRadius: '50%',
                background: '#2A1E10',
                border: '2px solid #F5B73F',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 0 14px rgba(245,183,63,.6)'
              }}>
                <span style={{ display: 'inline-flex', width: '15px', height: '15px', color: '#F5B73F' }}><Crown size={15} /></span>
              </span>
            )}
          </div>

          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: '700', fontSize: '28px', color: '#F0F0F8' }}>
              {user?.name || 'TemnýPozorovatel'}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '8px' }}>
              <span style={{ fontFamily: 'Inter', fontWeight: '600', fontSize: '11px', color: level.color, background: '#241C3C', border: `0.5px solid ${level.border}`, borderRadius: '20px', padding: '4px 12px' }}>
                {level.name}
              </span>
              {user?.passHolder && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', fontFamily: 'Inter', fontWeight: '600', fontSize: '11px', color: '#F5B73F', background: '#2A1E10', border: '0.5px solid #F5B73F', borderRadius: '20px', padding: '4px 12px' }}>
                  <Crown size={11} /> Founder
                </span>
              )}
              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '13px', color: '#60A5FA' }}>
                {user?.xp || 0} XP
              </span>
            </div>
          </div>

          <button
            onClick={() => openModal('settings')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              height: '42px',
              padding: '0 18px',
              background: 'rgba(124,58,237,0.12)',
              color: '#A78BFA',
              fontFamily: 'Inter',
              fontWeight: '600',
              fontSize: '13px',
              border: '1px solid #7C3AED',
              borderRadius: '14px',
              cursor: 'pointer',
              boxShadow: '0 0 12px rgba(124,58,237,0.25)',
              transition: 'all 0.2s'
            }}
          >
            <span style={{ display: 'inline-flex', width: '15px', height: '15px' }}><Pencil size={15} /></span>
            Upravit profil
          </button>
        </div>

        <div style={{ borderLeft: '3px solid #7C3AED', paddingLeft: '16px', marginTop: '24px' }}>
          <span style={{ fontFamily: 'Inter', fontStyle: 'italic', fontSize: '14px', color: '#9A9AB5', lineHeight: '1.55' }}>
            „{user?.pledge || 'Jsem člověk, co přestal čekat a začal jednat.'}“
          </span>
        </div>

        <div style={{ marginTop: '24px' }}>
          <HraPassCard />
        </div>

        {/* Stats row */}
        <div style={{ display: 'flex', gap: '16px', marginTop: '24px', flexShrink: 0 }}>
          <div style={{ flex: 1, background: '#15111E', border: '0.5px solid #2A2142', borderRadius: '18px', padding: '18px', textAlign: 'center' }}>
            <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: '700', fontSize: '28px', color: '#F5B73F' }}>{user?.keys_count ?? 0}</div>
            <div style={{ fontFamily: 'Inter', fontSize: '11px', color: '#6B6B8A', marginTop: '3px' }}>klíčů</div>
          </div>
          <div style={{ flex: 1, background: '#15111E', border: '0.5px solid #2A2142', borderRadius: '18px', padding: '18px', textAlign: 'center' }}>
            <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: '700', fontSize: '28px', color: user?.passHolder ? '#F5B73F' : '#6B6B8A' }}>{user?.passHolder ? (user?.streak ?? 0) : '🔒'}</div>
            <div style={{ fontFamily: 'Inter', fontSize: '11px', color: '#6B6B8A', marginTop: '3px' }}>{user?.passHolder ? 'dní v řadě' : 'streak s Passem'}</div>
          </div>
          <div style={{ flex: 1, background: '#15111E', border: '0.5px solid #2A2142', borderRadius: '18px', padding: '18px', textAlign: 'center' }}>
            <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: '700', fontSize: '28px', color: '#22C55E' }}>{user?.uzel ?? 0}</div>
            <div style={{ fontFamily: 'Inter', fontSize: '11px', color: '#6B6B8A', marginTop: '3px' }}>aktuální uzel</div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '24px', marginTop: '26px' }}>
          {/* Showcase / mini collection */}
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
              <span style={{ fontFamily: 'Inter', fontWeight: '600', fontSize: '11px', letterSpacing: '.12em', textTransform: 'uppercase', color: '#6B6B8A' }}>
                {showcase.length > 0 ? 'Showcase' : 'Sbírka'} · {ownedCards.length}/{ALL_CARDS.length}
              </span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px' }}>
              {(showcase.length > 0 ? showcase : ownedCards.slice(0, 4)).map(card => (
                <div key={card.key} style={{ aspectRatio: '1', background: card.bg, border: `1.5px solid ${card.border}`, borderRadius: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '4px' }}>
                  <span style={{ fontFamily: 'Inter', fontWeight: '600', fontSize: '10px', color: card.color, textAlign: 'center' }}>{card.title}</span>
                </div>
              ))}
            </div>
            <div
              onClick={() => navigate('/inventory')}
              style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '12px', color: '#A78BFA', fontFamily: 'Inter', fontWeight: '600', fontSize: '12px', cursor: 'pointer' }}
            >
              <Package size={14} /> Otevřít Inventář <ChevronRight size={14} />
            </div>
          </div>

          <div style={{ marginBottom: '20px' }}>
            <ProfileIdentitySection userId={user?.id} isOwn statusTitle={user?.onboardingCompleted === false ? 'NPC' : (seasonReflectionSubmitted ? 'Hráč' : 'Pozorovatel')} passHolder={!!user?.passHolder} />
          </div>

          {/* Poslední proofy */}
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: 'Inter', fontWeight: '600', fontSize: '11px', letterSpacing: '.12em', textTransform: 'uppercase', color: '#6B6B8A', marginBottom: '12px' }}>
              Poslední důkazy
            </div>
            {proofs.length === 0 && (
              <div style={{ fontFamily: 'Inter', fontSize: '12px', color: '#6B6B8A' }}>Zatím žádné veřejné důkazy.</div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {proofs.map(p => (
                <div key={p.id} style={{ background: '#241C3C', border: '0.5px solid #382C5C', borderRadius: '14px', padding: '10px 13px' }}>
                  <div style={{ fontFamily: 'Inter', fontSize: '12px', color: '#F0F0F8', lineHeight: '1.5' }}>{p.content}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
