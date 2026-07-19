import { useUserStore } from '../../store/userStore';
import { Flame, KeyRound, ArrowRight, Play, Lock, Crown, Check } from 'lucide-react';

export default function MobileDashboard() {
  const { user, activeChallenge, openModal } = useUserStore();

  return (
    <div style={{
      flex: 1,
      overflowY: 'auto',
      padding: '0 20px 8px',
      display: 'flex',
      flexDirection: 'column',
      gap: '14px',
      fontFamily: 'Inter, sans-serif'
    }}>
      {/* GAME STAT STRIP */}
      <div data-anim="xp-strip" style={{
        display: 'flex',
        alignItems: 'center',
        gap: '14px',
        background: '#1C1630',
        border: '0.5px solid #382C5C',
        borderRadius: '20px',
        padding: '14px 18px',
        flexShrink: 0
      }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: 'Inter', fontWeight: '600', fontSize: '10px', letterSpacing: '.12em', textTransform: 'uppercase', color: '#6B6B8A' }}>Celkem XP</div>
          <div data-anim="xp-countup" style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: '700', fontSize: '30px', color: '#4AA8FF', lineHeight: 1.15, textShadow: '0 0 16px rgba(74,168,255,.4)' }}>
            {user?.xp || 240}
          </div>
        </div>
        <div style={{ width: '0.5px', height: '38px', background: '#382C5C', flexShrink: 0 }}></div>
        <div data-anim="streak" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px', flexShrink: 0 }}>
          <span className="flame-ico" style={{ display: 'inline-flex', width: '22px', height: '22px', color: '#F5B73F' }}><Flame size={20} /></span>
          <span style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: '700', fontSize: '14px', color: '#F5B73F', lineHeight: 1 }}>{user?.streak || 5}</span>
          <span style={{ fontFamily: 'Inter', fontSize: '8px', color: '#6B6B8A', letterSpacing: '.04em' }}>DNÍ V ŘADĚ</span>
        </div>
        <div style={{ width: '0.5px', height: '38px', background: '#382C5C', flexShrink: 0 }}></div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px', flexShrink: 0 }}>
          <span style={{ display: 'inline-flex', width: '22px', height: '22px', color: '#F5B73F' }}><KeyRound size={20} /></span>
          <span style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: '700', fontSize: '14px', color: '#F5B73F', lineHeight: 1 }}>{user?.keys_count || 7}</span>
          <span style={{ fontFamily: 'Inter', fontSize: '8px', color: '#6B6B8A', letterSpacing: '.04em' }}>KLÍČŮ</span>
        </div>
      </div>

      {/* QUEST PATH */}
      <div style={{ flexShrink: 0 }}>
        <div style={{ display: 'flex', justifycontent: 'space-between', alignItems: 'center', marginBottom: '9px' }}>
          <span style={{ fontFamily: 'Inter', fontWeight: '600', fontSize: '10px', letterSpacing: '.12em', textTransform: 'uppercase', color: '#6B6B8A' }}>Sezóna 0 · cesta</span>
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '10px', color: '#A78BFA' }}>Uzel {user?.uzel || 3} / 9</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          {/* Node 1 */}
          <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: '#16351F', border: '1.5px solid #22C55E', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <span style={{ display: 'inline-flex', width: '13px', height: '13px', color: '#22C55E' }}><Check size={12} /></span>
          </div>
          <div style={{ flex: 1, height: '2px', background: '#22C55E' }}></div>
          
          {/* Node 2 */}
          <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: '#16351F', border: '1.5px solid #22C55E', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <span style={{ display: 'inline-flex', width: '13px', height: '13px', color: '#22C55E' }}><Check size={12} /></span>
          </div>
          <div style={{ flex: 1, height: '2px', background: 'linear-gradient(90deg,#22C55E,#7C3AED)' }}></div>
          
          {/* Node 3 (Current) */}
          <div 
            onClick={() => openModal('collections')}
            style={{ width: '30px', height: '30px', borderRadius: '50%', background: 'linear-gradient(135deg,#9333EA,#6D28D9)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, cursor: 'pointer' }}
          >
            <span style={{ display: 'inline-flex', width: '15px', height: '15px', color: '#fff' }}><Play size={14} fill="#fff" /></span>
          </div>
          <div style={{ flex: 1, height: '2px', background: '#2A2142' }}></div>
          
          {/* Node 4 (Locked) */}
          <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: '#1C1630', border: '1.5px solid #382C5C', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <span style={{ display: 'inline-flex', width: '11px', height: '11px', color: '#6B6B8A' }}><Lock size={10} /></span>
          </div>
          <div style={{ flex: 1, height: '2px', background: '#2A2142' }}></div>

          {/* Node 5 (Locked) */}
          <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: '#1C1630', border: '1.5px solid #382C5C', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <span style={{ display: 'inline-flex', width: '11px', height: '11px', color: '#6B6B8A' }}><Lock size={10} /></span>
          </div>
          <div style={{ flex: 1, height: '2px', background: '#2A2142' }}></div>
          
          {/* Boss Node */}
          <div style={{ width: '26px', height: '26px', borderRadius: '50%', background: '#2A1E10', border: '1.5px solid #F5B73F', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <span style={{ display: 'inline-flex', width: '13px', height: '13px', color: '#F5B73F' }}><Crown size={12} /></span>
          </div>
        </div>
      </div>

      {/* HERO CTA BUTTON */}
      <div 
        onClick={() => openModal('challenge-detail')}
        className="sheen-wrap" 
        style={{
          background: 'linear-gradient(135deg,#9333EA,#6D28D9)',
          borderRadius: '20px',
          padding: '20px',
          boxShadow: '0 10px 30px rgba(124,58,237,.4)',
          position: 'relative',
          overflow: 'hidden',
          cursor: 'pointer',
          flexShrink: 0
        }}
      >
        <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: '700', fontSize: '21px', color: '#fff', lineBreak: 'loose', position: 'relative' }}>
          Pokračovat v příběhu
        </div>
        <div style={{ fontFamily: 'Inter', fontSize: '13px', color: 'rgba(255,255,255,.78)', marginTop: '6px', position: 'relative' }}>
          Uzel {user?.uzel || 3} · Zaya čeká
        </div>
        <span style={{ position: 'absolute', right: 18, top: '50%', transform: 'translateY(-50%)', display: 'inline-flex', width: '26px', height: '26px', color: '#fff', zIndex: 1 }}>
          <ArrowRight size={22} />
        </span>
      </div>

      {/* DAILY CHALLENGE CARD */}
      <div style={{
        background: '#241C3C',
        border: '0.5px solid #382C5C',
        borderLeft: '3px solid #7C3AED',
        borderRadius: '16px',
        padding: '14px 16px',
        flexShrink: 0
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '10px' }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: 'Inter', fontWeight: '600', fontSize: '10px', letterSpacing: '.12em', textTransform: 'uppercase', color: '#8B5CF6' }}>
              Výzva {user?.uzel || 3} · Mikro-akce
            </div>
            <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: '700', fontSize: '16px', marginTop: '6px', color: '#F0F0F8' }}>
              {activeChallenge.title}
            </div>
            <div style={{ fontFamily: 'Inter', fontSize: '12px', color: '#6B6B8A', marginTop: '4px' }}>
              {activeChallenge.description}
            </div>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', marginTop: '10px', background: '#1C1630', border: '0.5px solid #382C5C', borderRadius: '20px', padding: '3px 10px' }}>
              <span style={{ display: 'inline-flex', width: '13px', height: '13px', color: '#F5B73F' }}><KeyRound size={12} /></span>
              <span style={{ fontFamily: 'Inter', fontSize: '11px', color: '#F5B73F', fontWeight: '600' }}>+{activeChallenge.rewardKeys} klíče</span>
            </div>
          </div>
          <button 
            onClick={() => openModal('challenge-detail')}
            style={{
              background: 'transparent',
              border: '1px solid #7C3AED',
              color: '#A78BFA',
              fontFamily: 'Inter',
              fontWeight: '600',
              fontSize: '12px',
              borderRadius: '8px',
              height: '32px',
              padding: '0 14px',
              cursor: 'pointer',
              whiteSpace: 'nowrap'
            }}
          >
            Spustit
          </button>
        </div>
      </div>

      {/* COMMUNITY PREVIEW */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <div style={{ fontFamily: 'Inter', fontWeight: '600', fontSize: '10px', letterSpacing: '.12em', textTransform: 'uppercase', color: '#6B6B8A', marginBottom: '2px' }}>
          Komunita · právě teď
        </div>
        
        {/* Card 1 */}
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', background: '#241C3C', border: '0.5px solid #382C5C', borderRadius: '16px', padding: '10px 12px' }}>
          <span style={{ width: '32px', height: '32px', borderRadius: '50%', background: '#241a3d', border: '1.5px solid #7C3AED', flexShrink: 0 }}></span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontFamily: 'Inter', fontWeight: '600', fontSize: '12px' }}>RychlýDoer</span>
              <span style={{ fontFamily: 'Inter', fontSize: '9px', color: '#A78BFA', border: '1px solid #A78BFA', boxShadow: '0 0 8px rgba(167,139,250,.4)', borderRadius: '20px', padding: '1px 7px' }}>Doer</span>
            </div>
            <div style={{ fontFamily: 'Inter', fontSize: '11px', color: '#6B6B8A', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              Sebral jsem 3 kelímky u zastávky…
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px', color: '#6B6B8A', fontFamily: "'JetBrains Mono', monospace", fontSize: '10px' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
              <span style={{ display: 'inline-flex', width: '12px', height: '12px', color: '#F5B73F' }}><Flame size={12} /></span>
              12
            </span>
          </div>
        </div>

        {/* Card 2 */}
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', background: '#241C3C', border: '0.5px solid #382C5C', borderRadius: '16px', padding: '10px 12px' }}>
          <span style={{ width: '32px', height: '32px', borderRadius: '50%', background: '#1f2a3d', border: '1.5px solid #7C3AED', flexShrink: 0 }}></span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontFamily: 'Inter', fontWeight: '600', fontSize: '12px' }}>NeonLiška</span>
              <span style={{ fontFamily: 'Inter', fontSize: '9px', color: '#A78BFA', border: '1px solid #A78BFA', boxShadow: '0 0 8px rgba(167,139,250,.4)', borderRadius: '20px', padding: '1px 7px' }}>Doer</span>
            </div>
            <div style={{ fontFamily: 'Inter', fontSize: '11px', color: '#6B6B8A', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              Vzal jsem ségru na 5min cleanup…
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px', color: '#6B6B8A', fontFamily: "'JetBrains Mono', monospace", fontSize: '10px' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
              <span style={{ display: 'inline-flex', width: '12px', height: '12px', color: '#F5B73F' }}><Flame size={12} /></span>
              21
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
