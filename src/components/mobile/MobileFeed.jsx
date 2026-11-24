import HomeQuickMenu from '../common/HomeQuickMenu';
import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUserStore } from '../../store/userStore';
import { track } from '../../lib/analytics';
import { buildReferralLink, shareContent } from '../../lib/share';
import ReportButton from '../common/ReportButton';
import PlayerAvatar from '../common/PlayerAvatar';
import { observeImpressions } from '../../lib/feedImpressions';
import { clampCoreText, ProofRewardRow, FeaturedProofTag, HighlightNudge } from '../common/ProofCardExtras';
import { keysLabel } from '../../lib/plural';
import { Shield, Crown, Flame, Sprout, Eye, Share2, ImageIcon, ChevronRight, ArrowRight } from 'lucide-react';

export default function MobileFeed() {
  const {
    user,
    feed,
    addReaction,
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

  // Real share (spec-7 "MOMENT 5 — FEED VIRAL"): each proof's "Sdílet" carries the sharer's
  // own referral link, not a bare app link — that's what makes it attributable.
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
    if (!post.user_id) return; // demo/seed posts have no real profile behind them
    navigate(`/profile/${post.user_id}`);
  };

  useEffect(() => {
    track('feed_opened');
    fetchFeedPosts();
    if (allStoryNodes.length === 0) loadAllStoryNodes();
    // spec-17 §16 "session length ve feedu"
    const openedAt = Date.now();
    return () => track('feed_session_end', { seconds: Math.round((Date.now() - openedAt) / 1000) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const totalNodes = allStoryNodes.length || 9;

  // Feed Engine "MVP1 — ANALYTICS": impressions (once per post per session).
  const listRef = useRef(null);
  const feedKey = feed.map(p => p.id).join(',');
  useEffect(() => observeImpressions(listRef.current), [feedKey, filter]);

  // Feed Engine "FINITE SESSION": a batch of cards, then „Jsi v obraze“ → back to the game.
  const batchSize = Number(gameConfig?.feed_batch_size) || 12;
  const [visibleCount, setVisibleCount] = useState(batchSize);

  const filteredFeed = feed.filter(post => {
    if (filter === 'proofs') return post.type === 'PROOF';
    if (filter === 'founders') return post.author_pass_holder;
    return true;
  });

  const FounderBadge = () => (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', fontFamily: 'Inter', fontWeight: '600', fontSize: '9px', color: '#F5B73F', background: '#2A1E10', border: '1px solid #F5B73F', borderRadius: '20px', padding: '2px 8px 2px 6px' }}>
      <span style={{ display: 'inline-flex', width: '9px', height: '9px' }}><Crown size={8} /></span>Founder
    </span>
  );

  // One reaction per player and post (Feed Engine "MAX 1 REACTION TYPE / USER / POST") —
  // the chosen one is highlighted; tapping another switches it.
  const REACTIONS = [
    { type: 'fire', Icon: Flame, color: '#F5B73F', title: 'Respekt / Oheň', count: p => p.reactions_fire || 0 },
    { type: 'plant', Icon: Sprout, color: '#22C55E', title: 'Růst / Zásah do reality', count: p => p.reactions_plant ?? p.reactions_lightning ?? 0 },
    { type: 'eye', Icon: Eye, color: '#A78BFA', title: 'Všiml(a) jsem si', count: p => p.reactions_eye || 0 },
  ];

  const ReactionsRow = ({ post, showTryToo }) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '12px' }}>
      {REACTIONS.map(({ type, Icon, color, title, count }) => {
        const mine = post.my_reaction === type;
        return (
          <span
            key={type}
            onClick={() => addReaction(post.id, type)}
            title={title}
            aria-pressed={mine}
            style={{
              display: 'flex', alignItems: 'center', gap: '5px', fontFamily: 'Inter', fontWeight: mine ? '700' : '600', fontSize: '12px', color, cursor: 'pointer',
              padding: '3px 7px', borderRadius: '20px', border: `1px solid ${mine ? color : 'transparent'}`, background: mine ? 'rgba(255,255,255,.06)' : 'transparent'
            }}
          >
            <span style={{ display: 'inline-flex', width: '16px', height: '16px' }}><Icon size={14} /></span>{count(post)}
          </span>
        );
      })}
      <span style={{ flex: 1 }}></span>
      {showTryToo && post.challenge_id && (
        <span onClick={() => handleTryToo(post)} style={{ fontFamily: 'Inter', fontWeight: '600', fontSize: '12px', color: '#A78BFA', cursor: 'pointer', whiteSpace: 'nowrap' }}>
          Zkus taky
        </span>
      )}
      <span onClick={() => handleShareProof(post)} style={{ display: 'flex', alignItems: 'center', gap: '5px', fontFamily: 'Inter', fontWeight: '600', fontSize: '12px', color: '#F0F0F8', cursor: 'pointer' }}>
        <span style={{ display: 'inline-flex', width: '16px', height: '16px' }}><Share2 size={14} /></span>Sdílet
      </span>
      <ReportButton post={post} />
    </div>
  );

  const PostHeader = ({ post }) => (
    <div onClick={() => goToProfile(post)} style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: post.user_id ? 'pointer' : 'default' }}>
      <PlayerAvatar
        name={post.user_name}
        avatarUrl={post.author_avatar_url}
        level={post.author_avatar_level ?? 1}
        frameKey={post.author_frame || (post.author_pass_holder ? 'frame-founder' : null)}
        npc={post.author_onboarded === false}
auraColor={post.author_aura_color} maskTitle={post.author_mask}
        size={34}
      />
      <div style={{ flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ fontFamily: 'Inter', fontWeight: '600', fontSize: '13px', color: '#F0F0F8' }}>{post.user_name}</span>
          {post.is_first_proof && (
            <span style={{ fontFamily: 'Inter', fontWeight: '600', fontSize: '9px', color: '#22C55E', border: '1px solid #22C55E', borderRadius: '20px', padding: '2px 8px' }}>První důkaz</span>
          )}
          {post.author_pass_holder && <FounderBadge />}
          {post.author_level != null && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', fontFamily: 'Inter', fontWeight: '600', fontSize: '9px', color: '#A78BFA', background: '#1C1630', border: '1px solid #A78BFA', borderRadius: '20px', padding: '2px 8px' }}>
              <span style={{ display: 'inline-flex', width: '9px', height: '9px' }}><Shield size={8} /></span>Lv {post.author_level}{post.author_title ? ` · ${post.author_title}` : ''}
            </span>
          )}
          {post.author_primary_badge && (
            <span title="Hlavní odznak" style={{ fontFamily: 'Inter', fontWeight: '600', fontSize: '9px', color: '#F0F0F8', border: '1px solid #382C5C', borderRadius: '20px', padding: '2px 8px' }}>{post.author_primary_badge}</span>
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
                +{activeChallenge.reward_xp} XP · +{keysLabel(activeChallenge.reward_keys)} · Pokračovat
              </div>
            )}
          </div>
          <span style={{ display: 'inline-flex', width: '20px', height: '20px', color: '#fff', flexShrink: 0 }}><ArrowRight size={18} /></span>
        </div>
      )}

      <HomeQuickMenu />

      {/* Filter Tabs */}
      <div style={{ display: 'flex', gap: '8px', paddingBottom: '4px', flexShrink: 0 }}>
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
      <div ref={listRef} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {filteredFeed.length === 0 && (
          <div style={{ fontFamily: 'Inter', fontSize: '13px', color: '#6B6B8A', textAlign: 'center', padding: '24px 0' }}>
            Zatím tu nic není. Splň quest a buď první, koho ostatní uvidí.
          </div>
        )}
        {filteredFeed.slice(0, visibleCount).map((post) => (
          <div key={post.id} data-post-id={post.id}>{(() => {
          const isHighlight = post.type === 'STATUS' || post.type === 'COLLECTION';
          const isTextOnly = !isHighlight && !post.image_url;

          // Feed Engine "MVP1 — POSTS: System/World Card" — published by the game itself.
          if (post.type === 'WORLD' || post.type === 'FEATURED') {
            return (
              <div style={{ background: 'linear-gradient(150deg,#10222E,#15111E)', border: '1px solid #38BDF8', borderRadius: '20px', padding: '14px 16px' }}>
                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '10px', letterSpacing: '.1em', color: '#38BDF8', textTransform: 'uppercase', marginBottom: '6px' }}>
                  {post.type === 'FEATURED' ? 'Vybraný moment' : 'Svět Hry Reality'}
                </div>
                <div style={{ fontFamily: 'Inter', fontSize: '13px', color: '#F0F0F8', lineHeight: '1.5', whiteSpace: 'pre-wrap' }}>{post.content}</div>
              </div>
            );
          }

          if (isHighlight) {
            return (
              <div
                key={post.id}
                onClick={() => (post.type === 'STATUS' ? goToProfile(post) : navigate('/inventory'))}
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

          // spec-14: the onboarding "first proof" must look different from quest proofs.
          if (post.type === 'ONBOARDING') {
            return (
              <div key={post.id} style={{ background: 'linear-gradient(150deg,#1a2e24,#1A142C)', border: '1px solid #22C55E', borderRadius: '20px', padding: '13px 14px 14px' }}>
                <div style={{ marginBottom: '8px' }}><PostHeader post={post} /></div>
                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '10px', letterSpacing: '.1em', color: '#22C55E', textTransform: 'uppercase', marginBottom: '6px' }}>
                  Nový hráč vstoupil do hry
                </div>
                <div style={{ fontFamily: 'Inter', fontStyle: 'italic', fontSize: '13px', color: '#F0F0F8', lineHeight: '1.5' }}>„{post.content}"</div>
                <ReactionsRow post={post} />
              </div>
            );
          }

          if (isTextOnly) {
            return (
              <div
                key={post.id}
                style={{
                  background: '#241C3C',
                  border: post.author_pass_holder ? '1px solid #F5B73F' : '0.5px solid #382C5C',
                  boxShadow: post.author_pass_holder ? '0 0 14px rgba(245,183,63,.18)' : 'none',
                  borderRadius: '20px',
                  padding: '13px 14px 14px'
                }}
              >
                <div style={{ marginBottom: '11px' }}><PostHeader post={post} /></div>
                <FeaturedProofTag post={post} />
                <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 600, fontSize: '16px', color: '#F0F0F8', lineHeight: '1.4' }}>
                  {clampCoreText(post.content)}
                </div>
                <ProofRewardRow post={post} totalNodes={totalNodes} />
                <ReactionsRow post={post} showTryToo />
                <HighlightNudge post={post} />
              </div>
            );
          }

          return (
            <div
              key={post.id}
              style={{
                background: '#241C3C',
                border: post.author_pass_holder ? '1px solid #F5B73F' : '0.5px solid #382C5C',
                boxShadow: post.author_pass_holder ? '0 0 14px rgba(245,183,63,.18)' : 'none',
                borderRadius: '20px',
                overflow: 'hidden'
              }}
            >
              <div style={{ padding: '12px 14px 10px' }}><PostHeader post={post} /></div>

              {post.media_type === 'video' ? (
                <video src={post.image_url} controls playsInline preload="metadata" style={{ width: '100%', maxHeight: '420px', background: '#000', display: 'block' }} />
              ) : (
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
              )}

              <div style={{ padding: '13px 14px 14px' }}>
                <FeaturedProofTag post={post} />
                <div style={{ fontFamily: 'Inter', fontSize: '13px', color: '#F0F0F8', lineHeight: '1.5' }}>
                  {clampCoreText(post.content)}
                </div>
                <ProofRewardRow post={post} totalNodes={totalNodes} />
                <ReactionsRow post={post} showTryToo />
                <HighlightNudge post={post} />
              </div>
            </div>
          );
          })()}</div>
        ))}
      </div>
      {filteredFeed.length > 0 && (
        <div style={{ textAlign: 'center', padding: '18px 12px', border: '0.5px solid #382C5C', borderRadius: '18px', background: '#15111E', marginTop: '4px' }}>
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
  );
}
