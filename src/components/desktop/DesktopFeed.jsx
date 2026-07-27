import { useState } from 'react';
import { useUserStore } from '../../store/userStore';
import { Flame, CheckCircle2, ImageIcon, Plus } from 'lucide-react';

export default function DesktopFeed() {
  const { feed, addReaction, openModal } = useUserStore();
  const [filter, setFilter] = useState('all');

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
        <div style={{
          columnCount: 3,
          columnGap: '16px',
          width: '100%'
        }}>
          {filteredFeed.map((post) => {
            const isPhotoCard = post.id !== 'f2'; // f2 is text only

            return (
              <div 
                key={post.id}
                style={{
                  breakInside: 'avoid',
                  marginBottom: '16px',
                  background: '#15111E',
                  border: post.id.startsWith('new_') ? '1px solid #7C3AED' : '0.5px solid #2A2142',
                  borderRadius: '18px',
                  overflow: 'hidden',
                  boxShadow: post.id.startsWith('new_') ? '0 0 14px rgba(124,58,237,.18)' : 'none'
                }}
              >
                {/* Header */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '9px', padding: '12px 13px 10px' }}>
                  <span style={{
                    width: '30px',
                    height: '30px',
                    borderRadius: '50%',
                    background: post.id.startsWith('new_') ? '#15111E' : '#1f2a3d',
                    border: `1.5px solid ${post.rarity === 'Legendary' ? '#F5B73F' : '#7C3AED'}`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontFamily: "'Space Grotesk', sans-serif",
                    fontWeight: '700',
                    fontSize: '11px',
                    color: '#A78BFA'
                  }}>
                    {post.user_name.slice(0, 2).toUpperCase()}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                      <span style={{ fontFamily: 'Inter', fontWeight: '600', fontSize: '12px', color: '#F0F0F8', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {post.id.startsWith('new_') ? 'Ty · ' + post.user_name : post.user_name}
                      </span>
                      <span style={{ fontFamily: 'Inter', fontSize: '9px', color: '#A78BFA', border: '0.5px solid #A78BFA', borderRadius: '20px', padding: '1px 6px' }}>
                        {post.rarity}
                      </span>
                    </div>
                    <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '9px', color: '#6B6B8A' }}>
                      Výzva 3 · před chvílí
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
                  <div style={{ display: 'flex', gap: '14px', marginTop: '10px' }}>
                    <span 
                      onClick={() => addReaction(post.id, 'fire')}
                      style={{ display: 'flex', alignItems: 'center', gap: '4px', fontFamily: 'Inter', fontSize: '11px', color: '#F5B73F', cursor: 'pointer' }}
                    >
                      <span style={{ display: 'inline-flex', width: '14px', height: '14px' }}><Flame size={14} /></span>
                      {post.reactions_fire}
                    </span>
                    <span
                      onClick={() => addReaction(post.id, 'lightning')}
                      style={{ display: 'flex', alignItems: 'center', gap: '4px', fontFamily: 'Inter', fontSize: '11px', color: '#22C55E', cursor: 'pointer' }}
                    >
                      <span style={{ display: 'inline-flex', width: '14px', height: '14px' }}><CheckCircle2 size={14} /></span>
                      {post.reactions_lightning}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
