import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUserStore } from '../../store/userStore';
import { track } from '../../lib/analytics';
import { buildReferralLink, shareContent } from '../../lib/share';
import ReportButton from '../common/ReportButton';
import PlayerAvatar from '../common/PlayerAvatar';
import { observeImpressions } from '../../lib/feedImpressions';
import { keysLabel } from '../../lib/plural';
import { clampCoreText, ProofRewardRow, FeaturedProofTag, HighlightNudge } from '../common/ProofCardExtras';
import { Flame, Sprout, Eye, Share2, ImageIcon, Plus, Crown, ArrowRight } from 'lucide-react';

export default function DesktopFeed() {
  const {
    user,
    feed,
    addReaction,
    openModal,
    fetchFeedPosts,
    activeStoryNode,
    activeChallenge,
    allStoryNodes,
    loadAllStoryNodes,
    openTryToo,
    gameConfig
  } = useUserStore();
  const navigate = useNavigate();
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    track('feed_opened');
    fetchFeedPosts();
    if (allStoryNodes.length === 0) loadAllStoryNodes();
    // spec-17 §16 "session length ve feedu"
    const openedAt = Date.now();
    return () => track('feed_session_end', { seconds: Math.round((Date.now() - openedAt) / 1000) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Was previously missing entirely on desktop (mobile at least had a — mis-wired — button;
  // see git history). Same real share as MobileFeed: carries the sharer's own referral link.
  const handleShareProof = async (post) => {
    track('share_clicked', { post_id: post.id });
    const result = await shareContent({
      title: 'Hra Reality',
      text: post.content ? `${post.user_name}: „${post.content}"` : `${post.user_name} hraje Hru Reality.`,
      url: buildReferralLink(user?.referralCode)
    });
    if (result.shared) track('share_completed', { post_id: post.id, method: result.method });
  };

  // "Zkus taky" (spec-17 §6) — deep link to the post's exact quest (TryTooModal).
  const handleTryToo = (post) => {
    track('try_too_clicked', { post_id: post.id, challenge_id: post.challenge_id });
    openTryToo(post);
  };

  const goToProfile = (post) => {
    if (!post.user_id) return;
    navigate(`/profile/${post.user_id}`);
  };

  // Feed Engine "MVP1 — ANALYTICS": impressions (once per post per session).
  const gridRef = useRef(null);
  const feedKey = feed.map(p => p.id).join(',');
  useEffect(() => observeImpressions(gridRef.current), [feedKey, filter]);

  // One reaction per player and post — the chosen one is highlighted, another one switches.
  const REACTIONS = [
    { type: 'fire', Icon: Flame, color: '#F5B73F', title: 'Respekt / Oheň', count: p => p.reactions_fire || 0 },
    { type: 'plant', Icon: Sprout, color: '#22C55E', title: 'Růst / Zásah do reality', count: p => p.reactions_plant ?? p.reactions_lightning ?? 0 },
    { type: 'eye', Icon: Eye, color: '#A78BFA', title: 'Všiml(a) jsem si', count: p => p.reactions_eye || 0 },
  ];

  // Feed Engine "FINITE SESSION": a batch of cards, then „Jsi v obraze“ → back to the game.
  const batchSize = Number(gameConfig?.feed_batch_size) || 12;
  const [visibleCount, setVisibleCount] = useState(batchSize);

  const filteredFeed = feed.filter(post => {
    if (filter === 'proofs') return post.type === 'PROOF';
    if (filter === 'founders') return post.author_pass_holder;
    return true;
  });

  return (
    <div style={{
      flex: 1,
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      fontFamily: 'Inter, sans-serif'
    }}>
      {/* Sub Header / Filters */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '16px',
        padding: '20px 28px',
        borderBottom: '1px solid #1B1430',
        flexShrink: 0
      }}>
        <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: '700', fontSize: '22px', color: '#F0F0F8' }}>
          Feed
        </div>
        <div style={{ display: 'flex', gap: '8px', marginLeft: '8px' }}>
          {[
            { key: 'all', label: 'Vše' },
            { key: 'proofs', label: 'Důkazy' },
            { key: 'founders', label: 'Founder' }
          ].map(tab => {
            const active = filter === tab.key;
            return (
              <span
                key={tab.key}
                onClick={() => setFilter(tab.key)}
                style={{
                  fontFamily: 'Inter',
                  fontWeight: active ? '600' : '500',
                  fontSize: '12px',
                  color: active ? '#fff' : '#9A9AB5',
                  background: active ? '#7C3AED' : 'transparent',
                  border: active ? 'none' : '0.5px solid #382C5C',
                  borderRadius: '20px',
                  padding: '7px 15px',
                  cursor: 'pointer',
                  transition: 'all .2s'
                }}
              >
                {tab.label}
              </span>
            );
          })}
        </div>
        <div style={{ flex: 1 }}></div>
        <button
          onClick={() => openModal('challenge-detail')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '7px',
            height: '40px',
            padding: '0 16px',
            background: '#7C3AED',
            color: '#fff',
            fontFamily: 'Inter',
            fontWeight: '600',
            fontSize: '13px',
            border: 'none',
            borderRadius: '14px',
            cursor: 'pointer'
          }}
        >
          <span style={{ display: 'inline-flex', width: '16px', height: '16px' }}><Plus size={16} /></span>
          Přidat důkaz
        </button>
      </div>

      {/* Grid Content */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: '22px 28px'
      }}>
        {/* Your World (spec-6 §11) — same orientation block as MobileFeed, laid out full-width
            above the masonry grid since desktop has no separate bottom-nav "Domů" glance. */}
        {activeStoryNode && (
          <div
            onClick={() => navigate('/story')}
            style={{
              background: 'linear-gradient(135deg,#9333EA,#6D28D9)',
              borderRadius: '18px',
              padding: '18px 22px',
              cursor: 'pointer',
              marginBottom: '20px',
              boxShadow: '0 8px 24px rgba(124,58,237,.3)',
              display: 'flex',
              alignItems: 'center',
              gap: '16px'
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: 'Inter', fontWeight: '600', fontSize: '10px', color: 'rgba(255,255,255,.7)', textTransform: 'uppercase', letterSpacing: '.08em' }}>
                Uzel {user?.uzel ?? 0}/{allStoryNodes.length || 9}
              </div>
              <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: '700', fontSize: '18px', color: '#fff', marginTop: '3px' }}>
                {activeStoryNode.title}
              </div>
              {activeChallenge && (
                <div style={{ fontFamily: 'Inter', fontSize: '12px', color: 'rgba(255,255,255,.8)', marginTop: '5px' }}>
                  +{activeChallenge.reward_xp} XP · +{keysLabel(activeChallenge.reward_keys)} · Pokračovat v příběhu
                </div>
              )}
            </div>
            <span style={{ display: 'inline-flex', width: '20px', height: '20px', color: '#fff', flexShrink: 0 }}><ArrowRight size={18} /></span>
          </div>
        )}

        <div ref={gridRef} style={{
          columnCount: 3,
          columnGap: '16px',
          width: '100%'
        }}>
          {filteredFeed.length === 0 && (
            <div style={{ fontFamily: 'Inter', fontSize: '13px', color: '#6B6B8A', padding: '24px 0' }}>
              Zatím tu nic není. Splň quest a buď první, koho ostatní uvidí.
            </div>
          )}
          {filteredFeed.slice(0, visibleCount).map((post) => {
            const isHighlight = post.type === 'STATUS' || post.type === 'COLLECTION';
            const isPhotoCard = !isHighlight && !!post.image_url;

            // Feed Engine "MVP1 — POSTS: System/World Card".
            if (post.type === 'WORLD') {
              return (
                <div key={post.id} data-post-id={post.id} style={{ breakInside: 'avoid', marginBottom: '16px', background: 'linear-gradient(150deg,#10222E,#15111E)', border: '1px solid #38BDF8', borderRadius: '18px', padding: '13px 14px' }}>
                  <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '9px', letterSpacing: '.1em', color: '#38BDF8', textTransform: 'uppercase', marginBottom: '6px' }}>Svět Hry Reality</div>
                  <div style={{ fontFamily: 'Inter', fontSize: '12px', color: '#F0F0F8', lineHeight: '1.5', whiteSpace: 'pre-wrap' }}>{post.content}</div>
                </div>
              );
            }

            return (
              <div
                key={post.id}
                data-post-id={post.id}
                style={{
                  breakInside: 'avoid',
                  marginBottom: '16px',
                  background: post.type === 'ONBOARDING' ? 'linear-gradient(150deg,#1a2e24,#15111E)' : '#15111E',
                  border: post.type === 'ONBOARDING' ? '1px solid #22C55E' : post.author_pass_holder ? '1px solid #F5B73F' : post.id.toString().startsWith('new_') ? '1px solid #7C3AED' : (isHighlight ? '1px solid #A78BFA' : '0.5px solid #2A2142'),
                  borderRadius: '18px',
                  overflow: 'hidden',
                  boxShadow: post.id.toString().startsWith('new_') || isHighlight ? '0 0 14px rgba(124,58,237,.18)' : 'none',
                  cursor: isHighlight ? 'pointer' : 'default'
                }}
                onClick={isHighlight ? () => (post.type === 'STATUS' ? goToProfile(post) : navigate('/inventory')) : undefined}
              >
                {/* Header */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '9px', padding: '12px 13px 10px' }}>
                  <PlayerAvatar
                    name={post.user_name}
                    avatarUrl={post.author_avatar_url}
                    level={post.author_avatar_level ?? 1}
                    frameKey={post.author_frame || (post.author_pass_holder ? 'frame-founder' : null)}
                    npc={post.author_onboarded === false}
auraColor={post.author_aura_color} maskTitle={post.author_mask}
                    size={30}
                    onClick={post.user_id ? (e) => { e?.stopPropagation?.(); goToProfile(post); } : undefined}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                      <span
                        onClick={(e) => { e.stopPropagation(); goToProfile(post); }}
                        style={{ fontFamily: 'Inter', fontWeight: '600', fontSize: '12px', color: '#F0F0F8', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', cursor: post.user_id ? 'pointer' : 'default' }}
                      >
                        {post.id.toString().startsWith('new_') ? 'Ty · ' + post.user_name : post.user_name}
                      </span>
                      {post.is_first_proof && (
                        <span style={{ fontFamily: 'Inter', fontSize: '9px', color: '#22C55E', border: '0.5px solid #22C55E', borderRadius: '20px', padding: '1px 6px', whiteSpace: 'nowrap' }}>První důkaz</span>
                      )}
                      {post.author_pass_holder ? (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '2px', fontFamily: 'Inter', fontSize: '9px', color: '#F5B73F', border: '0.5px solid #F5B73F', borderRadius: '20px', padding: '1px 6px' }}>
                          <Crown size={8} /> Founder
                        </span>
                      ) : post.author_level != null && (
                        <span style={{ fontFamily: 'Inter', fontSize: '9px', color: '#A78BFA', border: '0.5px solid #A78BFA', borderRadius: '20px', padding: '1px 6px', whiteSpace: 'nowrap' }}>
                          Lv {post.author_level}{post.author_title ? ` · ${post.author_title}` : ''}
                        </span>
                      )}
                      {post.author_primary_badge && (
                        <span title="Hlavní odznak" style={{ fontFamily: 'Inter', fontSize: '9px', color: '#F0F0F8', border: '0.5px solid #382C5C', borderRadius: '20px', padding: '1px 6px', whiteSpace: 'nowrap' }}>{post.author_primary_badge}</span>
                      )}
                    </div>
                    <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '9px', color: '#6B6B8A' }}>
                      {isHighlight ? (post.type === 'STATUS' ? 'Status' : 'Sbírka') : (post.type === 'ONBOARDING' ? 'Nový hráč vstoupil do hry' : 'Výzva')}
                    </div>
                  </div>
                </div>

                {/* Photo Zone */}
                {isPhotoCard && post.media_type === 'video' && (
                  <video src={post.image_url} controls playsInline preload="metadata" onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxHeight: '320px', background: '#000', display: 'block' }} />
                )}
                {isPhotoCard && post.media_type !== 'video' && (
                  <div style={{
                    height: '140px',
                    background: post.image_url
                      ? `center / cover no-repeat url(${post.image_url})`
                      : 'repeating-linear-gradient(135deg,#1C1630,#1C1630 10px,#241C3C 10px,#241C3C 20px)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}>
                    {!post.image_url && (
                      <span style={{ display: 'inline-flex', width: '26px', height: '26px', color: '#4A3D6E' }}><ImageIcon size={26} /></span>
                    )}
                  </div>
                )}

                {/* Content info */}
                <div style={{ padding: '11px 13px' }}>
                  <FeaturedProofTag post={post} />
                  <div style={{ fontFamily: 'Inter', fontSize: '12px', color: '#F0F0F8', lineHeight: '1.5' }}>
                    {isHighlight ? post.content : clampCoreText(post.content)}
                  </div>
                  <ProofRewardRow post={post} totalNodes={allStoryNodes.length || 9} />
                  <HighlightNudge post={post} />
                  {!isHighlight && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginTop: '10px' }}>
                      {REACTIONS.map(({ type, Icon, color, title, count }) => {
                        const mine = post.my_reaction === type;
                        return (
                          <span
                            key={type}
                            onClick={(e) => { e.stopPropagation(); addReaction(post.id, type); }}
                            title={title}
                            aria-pressed={mine}
                            style={{
                              display: 'flex', alignItems: 'center', gap: '4px', fontFamily: 'Inter', fontSize: '11px', fontWeight: mine ? 700 : 400, color, cursor: 'pointer',
                              padding: '2px 6px', borderRadius: '20px', border: `1px solid ${mine ? color : 'transparent'}`
                            }}
                          >
                            <span style={{ display: 'inline-flex', width: '14px', height: '14px' }}><Icon size={14} /></span>
                            {count(post)}
                          </span>
                        );
                      })}
                      <span style={{ flex: 1 }}></span>
                      {post.challenge_id && <span
                        onClick={(e) => { e.stopPropagation(); handleTryToo(post); }}
                        style={{ fontFamily: 'Inter', fontSize: '11px', color: '#A78BFA', cursor: 'pointer', whiteSpace: 'nowrap' }}
                      >
                        Zkus taky
                      </span>}
                      <span
                        onClick={(e) => { e.stopPropagation(); handleShareProof(post); }}
                        style={{ display: 'flex', alignItems: 'center', gap: '4px', fontFamily: 'Inter', fontSize: '11px', color: '#F0F0F8', cursor: 'pointer' }}
                      >
                        <span style={{ display: 'inline-flex', width: '14px', height: '14px' }}><Share2 size={14} /></span>
                      </span>
                      <ReportButton post={post} />
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        {filteredFeed.length > 0 && (
          <div style={{ textAlign: 'center', padding: '18px 12px', border: '0.5px solid #382C5C', borderRadius: '18px', background: '#15111E', marginTop: '16px' }}>
            <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, fontSize: '16px', color: '#F0F0F8' }}>Jsi v obraze</div>
            <div style={{ fontFamily: 'Inter', fontSize: '12px', color: '#9A9AB5', marginTop: '4px' }}>Teď je řada na tobě.</div>
            <button type="button" onClick={() => { track('feed_end_reached', { shown: Math.min(visibleCount, filteredFeed.length) }); navigate('/story'); }}
              style={{ marginTop: '12px', height: '42px', padding: '0 22px', background: '#7C3AED', color: '#fff', border: 'none', borderRadius: '14px', fontFamily: 'Inter', fontWeight: 700, fontSize: '14px', cursor: 'pointer' }}>
              Hrát
            </button>
            {filteredFeed.length > visibleCount && (
              <div>
                <button type="button" onClick={() => setVisibleCount(c => c + batchSize)}
                  style={{ marginTop: '8px', background: 'none', border: 'none', color: '#6B6B8A', fontFamily: 'Inter', fontSize: '12px', cursor: 'pointer' }}>
                  Zobrazit starší
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
