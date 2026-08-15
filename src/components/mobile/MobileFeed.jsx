import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUserStore } from '../../store/userStore';
import { track } from '../../lib/analytics';
import { buildReferralLink, shareContent } from '../../lib/share';
import { SlidersHorizontal, Shield, Crown, Flame, CheckCircle2, Eye, Share2, ImageIcon, ChevronRight, ArrowRight } from 'lucide-react';

export default function MobileFeed() {
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

  // Real share (spec-7 "MOMENT 5 — FEED VIRAL"): each proof's "Sdílet" carries the sharer's
  // own referral link, not a bare app link — that's what makes it attributable. Was
  // previously mis-wired to openModal('paywall') on every click; see git history.
  const handleShareProof = async (post) => {
    track('share_clicked', { post_id: post.id });
    const result = await shareContent({
      title: 'Hra Reality',
      text: post.content ? `${post.user_name}: „${post.content}"` : `${post.user_name} hraje Hru Reality.`,
      url: buildReferralLink(user?.referralCode)
    });
    if (result.shared) track('share_completed', { post_id: post.id, method: result.method });
  };

  // "Zkus taky" (spec-6 §6) — the Story screen only ever shows the *viewer's own* current
  // node/challenge, not an arbitrary one a post came from (feed_posts doesn't carry a node
  // reference, and Story.jsx has no "preview node N" mode). A precise per-post deep link
  // would need both of those built out; until then this is a deliberately honest, smaller
  // version — it sends the viewer to their own current challenge rather than pretending to
  // land them on the exact one pictured.
  const handleTryToo = (post) => {
    track('try_too_clicked', { post_id: post.id });
    navigate('/story');
  };

  const goToProfile = (post) => {
    if (!post.user_id) return; // demo/seed posts have no real profile behind them
    navigate(`/profile/${post.user_id}`);
  };

  useEffect(() => {
    track('feed_opened');
    fetchFeedPosts();
    if (allStoryNodes.length === 0) loadAllStoryNodes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filteredFeed = feed.filter(post => {
    if (filter === 'doers') return post.rarity !== 'Common';
    if (filter === 'nearby') return post.id === 'f1'; // mock nearby
    return true;
  });

  const FounderBadge = () => (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', fontFamily: 'Inter', fontWeight: '600', fontSize: '9px', color: '#F5B73F', background: '#2A1E10', border: '1px solid #F5B73F', borderRadius: '20px', padding: '2px 8px 2px 6px' }}>
      <span style={{ display: 'inline-flex', width: '9px', height: '9px' }}><Crown size={8} /></span>Founder
    </span>
  );

  const ReactionsRow = ({ post, showTryToo }) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginTop: '12px' }}>
      <span onClick={() => addReaction(post.id, 'fire')} style={{ display: 'flex', alignItems: 'center', gap: '5px', fontFamily: 'Inter', fontWeight: '600', fontSize: '12px', color: '#F5B73F', cursor: 'pointer' }}>
        <span style={{ display: 'inline-flex', width: '16px', height: '16px' }}><Flame size={14} /></span>{post.reactions_fire}
      </span>
      <span onClick={() => addReaction(post.id, 'lightning')} style={{ display: 'flex', alignItems: 'center', gap: '5px', fontFamily: 'Inter', fontWeight: '600', fontSize: '12px', color: '#22C55E', cursor: 'pointer' }}>
        <span style={{ display: 'inline-flex', width: '16px', height: '16px' }}><CheckCircle2 size={14} /></span>{post.reactions_lightning}
      </span>
      <span onClick={() => addReaction(post.id, 'eye')} style={{ display: 'flex', alignItems: 'center', gap: '5px', fontFamily: 'Inter', fontWeight: '600', fontSize: '12px', color: '#A78BFA', cursor: 'pointer' }}>
        <span style={{ display: 'inline-flex', width: '16px', height: '16px' }}><Eye size={14} /></span>{post.reactions_eye}
      </span>
      <span style={{ flex: 1 }}></span>
      {showTryToo && (
        <span onClick={() => handleTryToo(post)} style={{ fontFamily: 'Inter', fontWeight: '600', fontSize: '12px', color: '#A78BFA', cursor: 'pointer' }}>
          Zkus taky
        </span>
      )}
      <span onClick={() => handleShareProof(post)} style={{ display: 'flex', alignItems: 'center', gap: '5px', fontFamily: 'Inter', fontWeight: '600', fontSize: '12px', color: '#F0F0F8', cursor: 'pointer' }}>
        <span style={{ display: 'inline-flex', width: '16px', height: '16px' }}><Share2 size={14} /></span>Sdílet
      </span>
    </div>
  );

  const PostHeader = ({ post }) => (
    <div onClick={() => goToProfile(post)} style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: post.user_id ? 'pointer' : 'default' }}>
      <span style={{ width: '34px', height: '34px', borderRadius: '50%', background: '#241a3d', border: `1.5px solid ${post.author_pass_holder ? '#F5B73F' : '#7C3AED'}`, flexShrink: 0 }}></span>
      <div style={{ flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ fontFamily: 'Inter', fontWeight: '600', fontSize: '13px', color: '#F0F0F8' }}>{post.user_name}</span>
          {post.author_pass_holder ? <FounderBadge /> : (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', fontFamily: 'Inter', fontWeight: '600', fontSize: '9px', color: '#A78BFA', background: '#1C1630', border: '1px solid #A78BFA', borderRadius: '20px', padding: '2px 8px' }}>
              <span style={{ display: 'inline-flex', width: '9px', height: '9px' }}><Shield size={8} /></span>Doer
            </span>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <div style={{
      flex: 1,
      overflowY: 'auto',
      background: '#15111E',
      backgroundImage: 'radial-gradient(circle at 85% 0%, rgba(34, 197, 94, 0.13), transparent 42%)',
      padding: '0 20px 24px',
      display: 'flex',
      flexDirection: 'column',
      gap: '14px',
      fontFamily: 'Inter, sans-serif'
    }}>
      {/* Top Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '8px 0 12px',
        flexShrink: 0
      }}>
        <span style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: '700', fontSize: '20px', color: '#F0F0F8' }}>
          Feed
        </span>
        <span
          onClick={() => openModal('notifications')}
          style={{ display: 'inline-flex', width: '22px', height: '22px', color: '#6B6B8A', cursor: 'pointer' }}
        >
          <SlidersHorizontal size={20} />
        </span>
      </div>

      {/* Your World (spec-6 §11) — always-on-top orientation block: where am I, what do I
          do next, what do I get. Deliberately compact here; the full version with the node
          progress dots already lives on Dashboard ('/'). */}
      {activeStoryNode && (
        <div
          onClick={() => navigate('/story')}
          style={{
            background: 'linear-gradient(135deg,#9333EA,#6D28D9)',
            borderRadius: '18px',
            padding: '16px',
            cursor: 'pointer',
            flexShrink: 0,
            boxShadow: '0 8px 24px rgba(124,58,237,.3)',
            display: 'flex',
            alignItems: 'center',
            gap: '10px'
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: 'Inter', fontWeight: '600', fontSize: '10px', color: 'rgba(255,255,255,.7)', textTransform: 'uppercase', letterSpacing: '.08em' }}>
              Uzel {user?.uzel ?? 0}/{allStoryNodes.length || 9}
            </div>
            <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: '700', fontSize: '16px', color: '#fff', marginTop: '3px' }}>
              {activeStoryNode.title}
            </div>
            {activeChallenge && (
              <div style={{ fontFamily: 'Inter', fontSize: '11px', color: 'rgba(255,255,255,.8)', marginTop: '5px' }}>
                +{activeChallenge.reward_xp} XP · +{activeChallenge.reward_keys} klíče · Pokračovat
              </div>
            )}
          </div>
          <span style={{ display: 'inline-flex', width: '20px', height: '20px', color: '#fff', flexShrink: 0 }}><ArrowRight size={18} /></span>
        </div>
      )}

      {/* Filter Tabs */}
      <div style={{ display: 'flex', gap: '8px', paddingBottom: '4px', flexShrink: 0 }}>
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
                color: active ? '#fff' : '#6B6B8A',
                background: active ? '#7C3AED' : 'transparent',
                border: active ? 'none' : '0.5px solid #382C5C',
                borderRadius: '20px',
                padding: '6px 14px',
                cursor: 'pointer',
                transition: 'all .2s'
              }}
            >
              {tab.label}
            </span>
          );
        })}
      </div>

      {/* Feed Card List — type-driven (post.type: PROOF/STATUS/COLLECTION/FEATURED), not
          the old post.id === 'f2'/'f3' mock-data hacks — those never matched a real
          feed_posts row's id, so every real post silently fell through to the generic
          photo-card layout regardless of its actual shape. See supabase_migration_feed_enrichment.sql
          for where STATUS/COLLECTION rows actually get written server-side. */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {filteredFeed.map((post) => {
          const isHighlight = post.type === 'STATUS' || post.type === 'COLLECTION';
          const isTextOnly = !isHighlight && !post.image_url;

          if (isHighlight) {
            return (
              <div
                key={post.id}
                onClick={() => openModal('collections')}
                style={{
                  background: 'linear-gradient(150deg,#241C3C,#1A142C)',
                  border: '1px solid #A78BFA',
                  borderRadius: '20px',
                  padding: '14px 16px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '13px',
                  boxShadow: '0 0 16px rgba(124,58,237,.15)',
                  cursor: 'pointer'
                }}
              >
                <div style={{ width: '46px', height: '46px', borderRadius: '13px', background: '#15111E', border: '1px solid #A78BFA', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <span style={{ display: 'inline-flex', width: '22px', height: '22px', color: '#A78BFA' }}><Shield size={22} /></span>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: 'Inter', fontSize: '12px', color: '#9A9AB5' }}>{post.type === 'STATUS' ? 'Status' : 'Sbírka'}</div>
                  <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: '700', fontSize: '15px', marginTop: '1px', color: '#F0F0F8' }}>
                    {post.content}
                  </div>
                </div>
                <span style={{ display: 'inline-flex', width: '16px', height: '16px', color: '#6B6B8A', flexShrink: 0 }}><ChevronRight size={16} /></span>
              </div>
            );
          }

          if (isTextOnly) {
            return (
              <div
                key={post.id}
                style={{
                  background: '#241C3C',
                  border: '0.5px solid #382C5C',
                  borderRadius: '20px',
                  padding: '13px 14px 14px'
                }}
              >
                <div style={{ marginBottom: '11px' }}><PostHeader post={post} /></div>
                <div style={{ fontFamily: 'Inter', fontSize: '13px', color: '#F0F0F8', lineHeight: '1.5' }}>
                  {post.content}
                </div>
                <ReactionsRow post={post} showTryToo />
              </div>
            );
          }

          return (
            <div
              key={post.id}
              style={{
                background: '#241C3C',
                border: '0.5px solid #382C5C',
                borderRadius: '20px',
                overflow: 'hidden'
              }}
            >
              <div style={{ padding: '12px 14px 10px' }}><PostHeader post={post} /></div>

              <div style={{
                height: '280px',
                background: post.image_url
                  ? `center / cover no-repeat url(${post.image_url})`
                  : 'repeating-linear-gradient(135deg,#1C1630,#1C1630 10px,#241C3C 10px,#241C3C 20px)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                {!post.image_url && (
                  <span style={{ display: 'inline-flex', width: '32px', height: '32px', color: '#3a3a55' }}><ImageIcon size={32} /></span>
                )}
              </div>

              <div style={{ padding: '13px 14px 14px' }}>
                <div style={{ fontFamily: 'Inter', fontSize: '13px', color: '#F0F0F8', lineHeight: '1.5' }}>
                  {post.content}
                </div>
                <ReactionsRow post={post} showTryToo />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
