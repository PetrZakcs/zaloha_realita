import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../api/supabaseClient';
import { track } from '../lib/analytics';
import { ALL_CARDS } from '../lib/cards';
import { getAvatarLevel } from '../lib/avatarLevels';
import { ArrowLeft, Crown, Flame } from 'lucide-react';
import PlayerAvatar from './common/PlayerAvatar';
import ProfileIdentitySection from './common/ProfileIdentitySection';

// Read-only public profile (MVP1 spec-6 §10 / spec-10 "PROFIL HRÁČE (VEŘEJNÝ)") — reached by
// tapping an avatar/name in the feed. Deliberately a single component, not split into
// Mobile/Desktop variants like the rest of the app: it's a small, mostly-text page, and the
// existing card/list styles read fine at any width without a bespoke desktop layout.
//
// Reads from public.profiles_public (see supabase_migration_profiles_security.sql) — the
// RLS-safe column subset (no email/discord_user_id/is_admin) meant exactly for this: showing
// another player's identity without exposing their private profile row.
export default function PublicProfile() {
  const { userId } = useParams();
  const navigate = useNavigate();
  const [profile, setProfile] = useState(null);
  const [proofs, setProofs] = useState([]);
  const [status, setStatus] = useState('loading'); // 'loading' | 'ready' | 'not-found'

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setStatus('loading');
      const [{ data: profileData, error: profileError }, { data: proofData }] = await Promise.all([
        supabase.from('profiles_public').select('*').eq('id', userId).maybeSingle(),
        supabase
          .from('feed_posts')
          .select('*')
          .eq('user_id', userId)
          .eq('is_public', true)
          .order('created_at', { ascending: false })
          .limit(3)
      ]);

      if (cancelled) return;
      if (profileError || !profileData) {
        setStatus('not-found');
        return;
      }
      setProfile(profileData);
      setProofs(proofData || []);
      setStatus('ready');
      // spec-11 "FEED & SOCIAL" KPI: "% hráčů co si otevřou profil jiného hráče" — this
      // page is the only place that ever happens, and it was entirely untracked.
      track('profile_viewed', { viewed_user_id: userId });
    }

    if (userId) load();
    return () => { cancelled = true; };
  }, [userId]);

  return (
    <div style={{
      flex: 1,
      overflowY: 'auto',
      background: '#15111E',
      backgroundImage: 'radial-gradient(circle at 50% 0%, rgba(167, 139, 250, 0.16), transparent 42%)',
      fontFamily: 'Inter, sans-serif',
      padding: '14px 20px 24px'
    }}>
      <span
        onClick={() => navigate(-1)}
        style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: '#9A9AB5', cursor: 'pointer', fontFamily: 'Inter', fontSize: '13px' }}
      >
        <ArrowLeft size={16} /> Zpět
      </span>

      {status === 'loading' && (
        <div style={{ textAlign: 'center', color: '#6B6B8A', fontFamily: 'Inter', fontSize: '13px', marginTop: '60px' }}>
          Načítám profil…
        </div>
      )}

      {status === 'not-found' && (
        <div style={{ textAlign: 'center', color: '#6B6B8A', fontFamily: 'Inter', fontSize: '13px', marginTop: '60px' }}>
          Tento hráč nebyl nalezen.
        </div>
      )}

      {status === 'ready' && profile && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginTop: '20px' }}>
          {(() => {
            const level = getAvatarLevel(profile.avatar_level);
            return (
              <>
                <PlayerAvatar name={profile.display_name} avatarUrl={profile.avatar_url} auraColor={profile.aura_color} maskTitle={profile.mask_title} level={profile.avatar_level} frameKey={profile.active_frame} npc={profile.onboarding_completed === false} size={78} />

                <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: '700', fontSize: '19px', marginTop: '12px', color: '#F0F0F8' }}>
                  {profile.display_name || 'Hráč'}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '8px' }}>
                  <span style={{ fontFamily: 'Inter', fontWeight: '600', fontSize: '11px', color: level.color, background: '#241C3C', border: `0.5px solid ${level.border}`, borderRadius: '20px', padding: '4px 11px' }}>
                    {level.name}
                  </span>
                  {profile.pass_holder && (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontFamily: 'Inter', fontWeight: '600', fontSize: '11px', color: '#F5B73F', background: '#2A1E10', border: '0.5px solid #F5B73F', borderRadius: '20px', padding: '4px 11px' }}>
                      <Crown size={11} /> Founder
                    </span>
                  )}
                  <span style={{ fontFamily: 'Inter', fontWeight: '600', fontSize: '11px', color: '#A78BFA', background: '#241C3C', border: '0.5px solid #7C3AED', borderRadius: '20px', padding: '4px 11px' }}>
                    {profile.xp || 0} XP
                  </span>
                  {profile.current_streak > 0 && (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontFamily: 'Inter', fontWeight: '600', fontSize: '11px', color: '#F5B73F', background: '#1C1630', border: '0.5px solid #382C5C', borderRadius: '20px', padding: '4px 11px' }}>
                      <Flame size={11} /> {profile.current_streak}
                    </span>
                  )}
                </div>
              </>
            );
          })()}

          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '11px', color: '#6B6B8A', marginTop: '10px' }}>
            Uzel {profile.uzel || 0} / 9
          </div>

          {profile.showcase_card_keys?.length > 0 && (
            <div style={{ width: '100%', maxWidth: '360px', marginTop: '24px' }}>
              <div style={{ fontFamily: 'Inter', fontWeight: '600', fontSize: '11px', color: '#6B6B8A', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: '10px' }}>
                Showcase
              </div>
              <div style={{ display: 'flex', gap: '10px' }}>
                {profile.showcase_card_keys.map(key => {
                  const card = ALL_CARDS.find(c => c.key === key);
                  if (!card) return null;
                  return (
                    <div key={key} style={{ flex: 1, aspectRatio: '1', background: card.bg, border: `1.5px solid ${card.border}`, borderRadius: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '4px' }}>
                      <span style={{ fontFamily: 'Inter', fontWeight: '600', fontSize: '10px', color: card.color, textAlign: 'center' }}>{card.title}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div style={{ width: '100%', maxWidth: '360px', marginTop: '24px' }}>
            <ProfileIdentitySection userId={userId} statusTitle={profile.status_title} passHolder={!!profile.pass_holder} />
          </div>

          <div style={{ width: '100%', maxWidth: '360px', marginTop: '28px' }}>
            <div style={{ fontFamily: 'Inter', fontWeight: '600', fontSize: '11px', color: '#6B6B8A', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: '10px' }}>
              Poslední důkazy
            </div>
            {proofs.length === 0 && (
              <div style={{ fontFamily: 'Inter', fontSize: '12px', color: '#6B6B8A' }}>Zatím žádné veřejné důkazy.</div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {proofs.map((p) => (
                <div key={p.id} style={{ background: '#241C3C', border: '0.5px solid #382C5C', borderRadius: '14px', padding: '12px 14px' }}>
                  <div style={{ fontFamily: 'Inter', fontSize: '13px', color: '#F0F0F8', lineHeight: '1.5' }}>{p.content}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
