import { useState, useEffect } from 'react';
import { useUserStore } from '../../store/userStore';
import { track } from '../../lib/analytics';
import { SlidersHorizontal, Shield, Flame, CheckCircle2, Eye, Share2, ImageIcon, ChevronRight } from 'lucide-react';

export default function MobileFeed() {
  const { feed, addReaction, openModal, fetchFeedPosts } = useUserStore();
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    fetchFeedPosts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filteredFeed = feed.filter(post => {
    if (filter === 'doers') return post.rarity !== 'Common';
    if (filter === 'nearby') return post.id === 'f1'; // mock nearby
    return true;
  });

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

      {/* Feed Card List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {filteredFeed.map((post) => {
          // Check if this is f2 (text only)
          if (post.id === 'f2') {
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
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '11px' }}>
                  <span style={{ width: '34px', height: '34px', borderRadius: '50%', background: '#1f2a3d', border: '1.5px solid #7C3AED', flexShrink: 0 }}></span>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ fontFamily: 'Inter', fontWeight: '600', fontSize: '13px', color: '#F0F0F8' }}>{post.user_name}</span>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', fontFamily: 'Inter', fontWeight: '600', fontSize: '9px', color: '#A78BFA', background: '#1C1630', border: '1px solid #A78BFA', borderRadius: '20px', padding: '2px 8px' }}>
                        <span style={{ display: 'inline-flex', width: '9px', height: '9px' }}><Shield size={8} /></span>Doer
                      </span>
                    </div>
                    <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '10px', color: '#6B6B8A', marginTop: '2px' }}>
                      6 dní v řadě · před 12 min
                    </div>
                  </div>
                </div>
                <div style={{ fontFamily: 'Inter', fontSize: '13px', color: '#F0F0F8', lineHeight: '1.5' }}>
                  {post.content}
                </div>
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
                  <span onClick={() => { track('share_clicked', { post_id: post.id }); openModal('paywall'); }} style={{ display: 'flex', alignItems: 'center', gap: '5px', fontFamily: 'Inter', fontWeight: '600', fontSize: '12px', color: '#F0F0F8', cursor: 'pointer' }}>
                    <span style={{ display: 'inline-flex', width: '16px', height: '16px' }}><Share2 size={14} /></span>Sdílet
                  </span>
                </div>
              </div>
            );
          }

          // Check if this is an unlock card (mock variety - let's inject one between items)
          const isUnlockCard = post.id === 'f3'; // Let's make f3 show a badge unlock layout!
          if (isUnlockCard) {
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
                <div style={{ width: '46px', height: '46px', borderRadius: '13px', background: '#15111E', border: '1px solid #A78BFA', display: 'flex', alignItems: 'center', justifycontent: 'center', flexShrink: 0, justifyContent: 'center' }}>
                  <span style={{ display: 'inline-flex', width: '22px', height: '22px', color: '#A78BFA' }}><Shield size={22} /></span>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: 'Inter', fontSize: '12px', color: '#9A9AB5' }}>{post.user_name} odemkl odznak</div>
                  <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: '700', fontSize: '15px', marginTop: '1px', color: '#F0F0F8' }}>
                    Doer <span style={{ fontFamily: 'Inter', fontWeight: '600', fontSize: '9px', color: '#A78BFA', border: '1px solid #A78BFA', borderRadius: '20px', padding: '2px 8px', marginLeft: '4px' }}>Rare</span>
                  </div>
                </div>
                <span style={{ display: 'inline-flex', width: '16px', height: '16px', color: '#6B6B8A', flexShrink: 0 }}><ChevronRight size={16} /></span>
              </div>
            );
          }

          // Default card: NeonLiška (with large photo)
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
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 14px 10px' }}>
                <span style={{ width: '34px', height: '34px', borderRadius: '50%', background: '#241a3d', border: '1.5px solid #7C3AED', flexShrink: 0 }}></span>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontFamily: 'Inter', fontWeight: '600', fontSize: '13px', color: '#F0F0F8' }}>{post.user_name}</span>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', fontFamily: 'Inter', fontWeight: '600', fontSize: '9px', color: '#A78BFA', background: '#1C1630', border: '1px solid #A78BFA', boxShadow: '0 0 8px rgba(167,139,250,.4)', borderRadius: '20px', padding: '2px 8px 2px 6px' }}>
                      <span style={{ display: 'inline-flex', width: '9px', height: '9px' }}><Shield size={8} /></span>Doer
                    </span>
                  </div>
                  <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '10px', color: '#6B6B8A', marginTop: '2px' }}>
                    12 dní v řadě · před 4 min
                  </div>
                </div>
              </div>

              {/* Photo Area */}
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

              {/* Caption and Interactions */}
              <div style={{ padding: '13px 14px 14px' }}>
                <div style={{ fontFamily: 'Inter', fontSize: '13px', color: '#F0F0F8', lineHeight: '1.5' }}>
                  {post.content}
                </div>
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
                  <span onClick={() => { track('share_clicked', { post_id: post.id }); openModal('paywall'); }} style={{ display: 'flex', alignItems: 'center', gap: '5px', fontFamily: 'Inter', fontWeight: '600', fontSize: '12px', color: '#F0F0F8', cursor: 'pointer' }}>
                    <span style={{ display: 'inline-flex', width: '16px', height: '16px' }}><Share2 size={14} /></span>Sdílet
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
