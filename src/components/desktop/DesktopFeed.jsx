import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUserStore } from '../../store/userStore';
import { track } from '../../lib/analytics';
import { buildReferralLink, shareContent } from '../../lib/share';
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
    loadAllStoryNodes
  } = useUserStore();
  const navigate = useNavigate();
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    track('feed_opened');
    fetchFeedPosts();
    if (allStoryNodes.length === 0) loadAllStoryNodes();
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

  // See MobileFeed.jsx's handleTryToo comment — same intentionally-scoped-down version
  // (own current challenge, not a precise per-post deep link) for the same reason.
  const handleTryToo = (post) => {
    track('try_too_clicked', { post_id: post.id });
    navigate('/story');
  };

  const goToProfile = (post) => {
    if (!post.user_id) return;
    navigate(`/profile/${post.user_id}`);
  };

  const filteredFeed = feed.filter(post => {
    if (filter === 'doers') return post.rarity !== 'Common';
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
            { key: 'doers', label: 'Doeři' },
            { key: 'nearby', label: 'V okolí' }
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
                  +{activeChallenge.reward_xp} XP · +{activeChallenge.reward_keys} klíče · Pokračovat v příběhu
                </div>
              )}
            </div>
            <span style={{ display: 'inline-flex', width: '20px', height: '20px', color: '#fff', flexShrink: 0 }}><ArrowRight size={18} /></span>
          </div>
        )}

        <div style={{
          columnCount: 3,
          columnGap: '16px',
          width: '100%'
        }}>
          {filteredFeed.map((post) => {
            const isHighlight = post.type === 'STATUS' || post.type === 'COLLECTION';
            const isPhotoCard = !isHighlight && !!post.image_url;

            return (
              <div
                key={post.id}
                style={{
                  breakInside: 'avoid',
                  marginBottom: '16px',
                  background: '#15111E',
                  border: post.id.toString().startsWith('new_') ? '1px solid #7C3AED' : (isHighlight ? '1px solid #A78BFA' : '0.5px solid #2A2142'),
                  borderRadius: '18px',
                  overflow: 'hidden',
                  boxShadow: post.id.toString().startsWith('new_') || isHighlight ? '0 0 14px rgba(124,58,237,.18)' : 'none',
                  cursor: isHighlight ? 'pointer' : 'default'
                }}
                onClick={isHighlight ? () => openModal('collections') : undefined}
              >
                {/* Header */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '9px', padding: '12px 13px 10px' }}>
                  <span
                    onClick={(e) => { e.stopPropagation(); goToProfile(post); }}
                    style={{
                      width: '30px',
                      height: '30px',
                      borderRadius: '50%',
                      background: post.id.toString().startsWith('new_') ? '#15111E' : '#1f2a3d',
                      border: `1.5px solid ${post.author_pass_holder ? '#F5B73F' : (post.rarity === 'Legendary' ? '#F5B73F' : '#7C3AED')}`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontFamily: "'Space Grotesk', sans-serif",
                      fontWeight: '700',
                      fontSize: '11px',
                      color: '#A78BFA',
                      cursor: post.user_id ? 'pointer' : 'default',
                      flexShrink: 0
                    }}
                  >
                    {(post.user_name || '??').slice(0, 2).toUpperCase()}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                      <span
                        onClick={(e) => { e.stopPropagation(); goToProfile(post); }}
                        style={{ fontFamily: 'Inter', fontWeight: '600', fontSize: '12px', color: '#F0F0F8', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', cursor: post.user_id ? 'pointer' : 'default' }}
                      >
                        {post.id.toString().startsWith('new_') ? 'Ty · ' + post.user_name : post.user_name}
                      </span>
                      {post.author_pass_holder ? (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '2px', fontFamily: 'Inter', fontSize: '9px', color: '#F5B73F', border: '0.5px solid #F5B73F', borderRadius: '20px', padding: '1px 6px' }}>
                          <Crown size={8} /> Founder
                        </span>
                      ) : (
                        <span style={{ fontFamily: 'Inter', fontSize: '9px', color: '#A78BFA', border: '0.5px solid #A78BFA', borderRadius: '20px', padding: '1px 6px' }}>
                          {post.rarity}
                        </span>
                      )}
                    </div>
                    <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '9px', color: '#6B6B8A' }}>
                      {isHighlight ? (post.type === 'STATUS' ? 'Status' : 'Sbírka') : 'Výzva · před chvílí'}
                    </div>
                  </div>
                </div>

                {/* Photo Zone */}
                {isPhotoCard && (
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
                  <div style={{ fontFamily: 'Inter', fontSize: '12px', color: '#F0F0F8', lineHeight: '1.5' }}>
                    {post.content}
                  </div>
                  {!isHighlight && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginTop: '10px' }}>
                      <span
                        onClick={(e) => { e.stopPropagation(); addReaction(post.id, 'fire'); }}
                        title="Respekt / Oheň"
                        style={{ display: 'flex', alignItems: 'center', gap: '4px', fontFamily: 'Inter', fontSize: '11px', color: '#F5B73F', cursor: 'pointer' }}
                      >
                        <span style={{ display: 'inline-flex', width: '14px', height: '14px' }}><Flame size={14} /></span>
                        {post.reactions_fire || 0}
                      </span>
                      <span
                        onClick={(e) => { e.stopPropagation(); addReaction(post.id, 'plant'); }}
                        title="Růst / Zásah do reality"
                        style={{ display: 'flex', alignItems: 'center', gap: '4px', fontFamily: 'Inter', fontSize: '11px', color: '#22C55E', cursor: 'pointer' }}
                      >
                        <span style={{ display: 'inline-flex', width: '14px', height: '14px' }}><Sprout size={14} /></span>
                        {post.reactions_plant ?? post.reactions_lightning ?? 0}
                      </span>
                      <span
                        onClick={(e) => { e.stopPropagation(); addReaction(post.id, 'eye'); }}
                        title="Pozorováno"
                        style={{ display: 'flex', alignItems: 'center', gap: '4px', fontFamily: 'Inter', fontSize: '11px', color: '#A78BFA', cursor: 'pointer' }}
                      >
                        <span style={{ display: 'inline-flex', width: '14px', height: '14px' }}><Eye size={14} /></span>
                        {post.reactions_eye || 0}
                      </span>
                      <span style={{ flex: 1 }}></span>
                      <span
                        onClick={(e) => { e.stopPropagation(); handleTryToo(post); }}
                        style={{ fontFamily: 'Inter', fontSize: '11px', color: '#A78BFA', cursor: 'pointer', whiteSpace: 'nowrap' }}
                      >
                        Zkus taky
                      </span>
                      <span
                        onClick={(e) => { e.stopPropagation(); handleShareProof(post); }}
                        style={{ display: 'flex', alignItems: 'center', gap: '4px', fontFamily: 'Inter', fontSize: '11px', color: '#F0F0F8', cursor: 'pointer' }}
                      >
                        <span style={{ display: 'inline-flex', width: '14px', height: '14px' }}><Share2 size={14} /></span>
                      </span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
