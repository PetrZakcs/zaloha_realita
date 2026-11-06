import { useEffect, useRef, useState } from 'react';
import { Lock, Globe, Award, Camera } from 'lucide-react';
import { supabase } from '../../api/supabaseClient';
import { useUserStore } from '../../store/userStore';
import ReferralDashboard from './ReferralDashboard';
import ShareMomentButton from './ShareMomentButton';
import { resolveMediaUrl } from '../../lib/privateMedia';

const RARITY = {
  common: { label: 'Common', color: '#9A9AB5' },
  rare: { label: 'Rare', color: '#4AA8FF' },
  epic: { label: 'Epic', color: '#A78BFA' },
  legendary: { label: 'Legendary', color: '#F5B73F' },
};

const sectionTitle = { fontFamily: 'Inter', fontWeight: 600, fontSize: '11px', letterSpacing: '.1em', textTransform: 'uppercase', color: '#6B6B8A', marginBottom: '10px' };

// Identity blocks shared by the own profile and public profiles:
//   - status title (spec-14/16: NPC → Pozorovatel → Hráč) + Founder title (spec-13 "Titul pod jménem")
//   - earned badges, click for description + rarity (spec-12 §4.7)
//   - own profile only: code fragments (spec-12 §9), photo change (spec-14), and
//     "Moje důkazy" — every own proof incl. private ones (spec-17 §2)
export default function ProfileIdentitySection({ userId, isOwn = false, statusTitle, passHolder = false }) {
  const { badgeCatalog, fragments, loadIdentityExtras, uploadAvatar, removeAvatar, user, setPrimaryBadge } = useUserStore();
  const [ownedBadges, setOwnedBadges] = useState([]);
  const [identityItems, setIdentityItems] = useState([]);
  const [openItem, setOpenItem] = useState(null);
  const [catalog, setCatalog] = useState([]);
  const [openBadge, setOpenBadge] = useState(null);
  const [proofs, setProofs] = useState([]);
  const [photoState, setPhotoState] = useState('');
  const fileRef = useRef(null);

  useEffect(() => {
    if (!userId) return;
    (async () => {
      const [{ data: owned }, { data: cat }, { data: items }] = await Promise.all([
        supabase.from('user_badges').select('badge_key, earned_at').eq('user_id', userId),
        badgeCatalog.length ? Promise.resolve({ data: badgeCatalog }) : supabase.from('node_rewards').select('*').order('node_order'),
        supabase.from('player_identity_items').select('item_key, earned_at, source, identity_items(kind, title, description, rarity, acquisition)').eq('user_id', userId)
      ]);
      setOwnedBadges(owned || []);
      setIdentityItems((items || []).filter(i => i.identity_items));
      setCatalog(cat || []);
      if (isOwn) {
        loadIdentityExtras();
        const { data: own } = await supabase
          .from('feed_posts')
          .select('id, content, image_url, media_type, is_public, created_at, type')
          .eq('user_id', userId)
          .in('type', ['PROOF', 'ONBOARDING'])
          .order('created_at', { ascending: false });
        // Private proofs live in the owner-only bucket and need a signed URL to display.
        setProofs(await Promise.all((own || []).map(async p => ({ ...p, image_url: await resolveMediaUrl(p.image_url) }))));
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, isOwn]);

  const earned = catalog.filter(b => ownedBadges.some(o => o.badge_key === b.badge_key));
  const locked = catalog.filter(b => !ownedBadges.some(o => o.badge_key === b.badge_key));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'center' }}>
        {statusTitle && (
          <span style={{ fontFamily: 'Inter', fontWeight: 600, fontSize: '11px', color: '#A78BFA', border: '0.5px solid #A78BFA', borderRadius: '20px', padding: '4px 11px' }}>
            Status: {statusTitle}
          </span>
        )}
        {passHolder && (
          <span style={{ fontFamily: 'Inter', fontWeight: 600, fontSize: '11px', color: '#F5B73F', border: '0.5px solid #F5B73F', borderRadius: '20px', padding: '4px 11px' }}>
            Titul: Founder hráč
          </span>
        )}
      </div>

      <div>
        <div style={sectionTitle}>Odznaky · {earned.length}/{catalog.length}</div>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          {[...earned, ...locked].map(b => {
            const owned = earned.includes(b);
            const rarity = RARITY[b.rarity] || RARITY.common;
            return (
              <button
                key={b.badge_key}
                type="button"
                onClick={() => setOpenBadge(openBadge?.badge_key === b.badge_key ? null : b)}
                style={{
                  display: 'flex', alignItems: 'center', gap: '6px', padding: '7px 11px', borderRadius: '12px', cursor: 'pointer',
                  background: owned ? '#241C3C' : 'transparent', border: `1px ${owned ? 'solid' : 'dashed'} ${owned ? rarity.color : '#382C5C'}`,
                  color: owned ? '#F0F0F8' : '#6B6B8A', fontFamily: 'Inter', fontSize: '12px', fontWeight: 600
                }}
              >
                {owned ? <Award size={14} color={rarity.color} /> : <Lock size={13} />} {b.title}
              </button>
            );
          })}
          {catalog.length === 0 && <span style={{ fontFamily: 'Inter', fontSize: '12px', color: '#6B6B8A' }}>Zatím žádné odznaky.</span>}
        </div>
        {openBadge && (
          <div style={{ marginTop: '10px', background: '#1C1630', border: '0.5px solid #382C5C', borderRadius: '12px', padding: '10px 12px' }}>
            <div style={{ fontFamily: 'Inter', fontWeight: 700, fontSize: '13px', color: '#F0F0F8' }}>
              {openBadge.title} <span style={{ color: (RARITY[openBadge.rarity] || RARITY.common).color, fontSize: '11px' }}>· {(RARITY[openBadge.rarity] || RARITY.common).label}</span>
            </div>
            <div style={{ fontFamily: 'Inter', fontSize: '12px', color: '#9A9AB5', marginTop: '4px', lineHeight: 1.5 }}>
              {openBadge.description} {earned.includes(openBadge) ? '' : `Získáš ho v uzlu ${openBadge.node_order}.`}
            </div>
            {/* Identity "IDENTITY TOOLTIP": how and when it was earned */}
            {earned.includes(openBadge) && (() => {
              const when = ownedBadges.find(o => o.badge_key === openBadge.badge_key)?.earned_at;
              return when ? <div style={{ fontFamily: 'Inter', fontSize: '11px', color: '#6B6B8A', marginTop: '4px' }}>Získáno dokončením uzlu {openBadge.node_order} · {new Date(when).toLocaleDateString('cs-CZ')}</div> : null;
            })()}
            {/* Identity "1× Primary Badge" — shown on feed cards */}
            {isOwn && earned.includes(openBadge) && (
              <button type="button" disabled={user?.primaryBadge === openBadge.badge_key}
                onClick={() => setPrimaryBadge(openBadge.badge_key)}
                style={{ marginTop: '8px', background: 'transparent', border: '1px solid #A78BFA', color: '#A78BFA', borderRadius: '10px', padding: '5px 10px', fontFamily: 'Inter', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>
                {user?.primaryBadge === openBadge.badge_key ? 'Hlavní odznak ✓' : 'Nastavit jako hlavní odznak'}
              </button>
            )}
          </div>
        )}
      </div>

      {identityItems.length > 0 && (
        <div>
          <div style={sectionTitle}>Tituly a značky</div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {identityItems.map(i => {
              const rarity = RARITY[i.identity_items.rarity] || RARITY.common;
              return (
                <button key={i.item_key} type="button" onClick={() => setOpenItem(openItem?.item_key === i.item_key ? null : i)}
                  style={{ fontFamily: 'Inter', fontWeight: 600, fontSize: '12px', color: '#F0F0F8', border: `1px solid ${rarity.color}`, borderRadius: '12px', padding: '6px 10px', background: '#241C3C', cursor: 'pointer' }}>
                  {i.identity_items.kind === 'season_mark' ? '◆ ' : ''}{i.identity_items.title}
                </button>
              );
            })}
          </div>
          {/* Identity "IDENTITY TOOLTIP": earned vs. other origin, how, when */}
          {openItem && (
            <div style={{ marginTop: '10px', background: '#1C1630', border: '0.5px solid #382C5C', borderRadius: '12px', padding: '10px 12px' }}>
              <div style={{ fontFamily: 'Inter', fontWeight: 700, fontSize: '13px', color: '#F0F0F8' }}>{openItem.identity_items.title}</div>
              <div style={{ fontFamily: 'Inter', fontSize: '11px', color: '#A78BFA', marginTop: '2px' }}>
                {openItem.identity_items.acquisition === 'earned' ? 'Earned Identity' : openItem.identity_items.acquisition === 'legacy' ? 'Legacy Identity' : 'Identity'}
              </div>
              {openItem.identity_items.description && <div style={{ fontFamily: 'Inter', fontSize: '12px', color: '#9A9AB5', marginTop: '4px' }}>{openItem.identity_items.description}</div>}
              <div style={{ fontFamily: 'Inter', fontSize: '11px', color: '#6B6B8A', marginTop: '4px' }}>Získáno: {new Date(openItem.earned_at).toLocaleDateString('cs-CZ')}</div>
            </div>
          )}
          {/* Game Bible · Viral "FIRST IDENTITY CARD" — "Něčím jsem se stal(a)." */}
          {isOwn && (
            <div style={{ marginTop: '10px' }}>
              <ShareMomentButton variant="identity" progressText={identityItems[identityItems.length - 1].identity_items.title} label="Sdílet svou identitu" />
            </div>
          )}
        </div>
      )}

      {isOwn && <ReferralDashboard />}

      {isOwn && (
        <div>
          <div style={sectionTitle}>Profilová fotka</div>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'transparent', border: '1px solid #7C3AED', color: '#A78BFA', borderRadius: '12px', padding: '7px 12px', fontFamily: 'Inter', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}
            >
              <Camera size={14} /> {user?.avatarUrl ? 'Změnit fotku' : 'Nahrát fotku'}
            </button>
            {user?.avatarUrl && (
              <button
                type="button"
                onClick={async () => { const r = await removeAvatar(); setPhotoState(r.error || ''); }}
                style={{ background: 'none', border: 'none', color: '#6B6B8A', fontFamily: 'Inter', fontSize: '12px', cursor: 'pointer' }}
              >
                Odebrat
              </button>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              style={{ display: 'none' }}
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                setPhotoState('Nahrávám…');
                const r = await uploadAvatar(f);
                setPhotoState(r.error || '');
              }}
            />
          </div>
          {photoState && <div style={{ fontFamily: 'Inter', fontSize: '12px', color: '#9A9AB5', marginTop: '6px' }}>{photoState}</div>}
        </div>
      )}

      {isOwn && !passHolder && fragments.length > 0 && (
        <div>
          <div style={sectionTitle}>Fragmenty kódu</div>
          <div style={{ fontFamily: 'Inter', fontSize: '12px', color: '#9A9AB5', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Lock size={13} /> Máš {fragments.length}. Sbírání fragmentů a streak jsou součástí Founder Passu.
          </div>
        </div>
      )}

      {isOwn && passHolder && fragments.length > 0 && (
        <div>
          <div style={sectionTitle}>Fragmenty kódu</div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {fragments.map(f => (
              <span key={f.fragment_no} style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '12px', color: '#22C55E', background: '#1a2e24', border: '0.5px solid #22C55E', borderRadius: '8px', padding: '5px 9px' }}>
                {f.code}
              </span>
            ))}
            {fragments.length < 2 && (
              <span style={{ fontFamily: 'Inter', fontSize: '11px', color: '#6B6B8A', alignSelf: 'center' }}>Udrž streak 3 dny a odemkneš další fragment.</span>
            )}
          </div>
        </div>
      )}

      {isOwn && (
        <div>
          <div style={sectionTitle}>Moje důkazy · {proofs.length}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {proofs.map(p => (
              <div key={p.id} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', background: '#1C1630', border: '0.5px solid #382C5C', borderRadius: '12px', padding: '10px 12px' }}>
                {p.image_url && p.media_type !== 'video' && (
                  <img src={p.image_url} alt="" style={{ width: '48px', height: '48px', objectFit: 'cover', borderRadius: '8px', flexShrink: 0 }} />
                )}
                {p.image_url && p.media_type === 'video' && (
                  <video src={p.image_url} muted playsInline preload="metadata" style={{ width: '48px', height: '48px', objectFit: 'cover', borderRadius: '8px', flexShrink: 0 }} />
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: 'Inter', fontSize: '12px', color: '#F0F0F8', lineHeight: 1.4 }}>{p.content}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontFamily: 'Inter', fontSize: '11px', color: '#6B6B8A', marginTop: '4px' }}>
                    {p.is_public ? <><Globe size={11} /> Veřejný</> : <><Lock size={11} /> Soukromý</>} · {new Date(p.created_at).toLocaleDateString('cs-CZ')}
                  </div>
                </div>
              </div>
            ))}
            {proofs.length === 0 && <span style={{ fontFamily: 'Inter', fontSize: '12px', color: '#6B6B8A' }}>Zatím žádné důkazy.</span>}
          </div>
        </div>
      )}
    </div>
  );
}
