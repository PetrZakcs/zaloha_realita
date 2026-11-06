import { Crown, Sparkles, ChevronRight, Check } from 'lucide-react';
import { useUserStore } from '../../store/userStore';

export default function HraPassCard({ compact = false }) {
  const { user, openModal } = useUserStore();
  const isPassHolder = Boolean(user?.passHolder);

  return (
    <div
      onClick={() => openModal('paywall')}
      style={{
        position: 'relative',
        overflow: 'hidden',
        background: isPassHolder
          ? 'linear-gradient(135deg, rgba(245,183,63,0.2) 0%, rgba(124,58,237,0.25) 50%, rgba(21,17,30,0.95) 100%)'
          : 'linear-gradient(135deg, rgba(42,30,16,0.92) 0%, rgba(36,28,60,0.95) 50%, rgba(18,14,32,0.98) 100%)',
        border: isPassHolder ? '1px solid #F5B73F' : '1px solid rgba(245, 183, 63, 0.45)',
        borderRadius: '20px',
        padding: compact ? '14px 16px' : '16px 18px',
        cursor: 'pointer',
        boxShadow: isPassHolder
          ? '0 0 24px rgba(245,183,63,0.3), inset 0 0 20px rgba(245,183,63,0.1)'
          : '0 8px 24px rgba(0,0,0,0.6), inset 0 0 15px rgba(245,183,63,0.06)',
        transition: 'all 0.25s ease'
      }}
    >
      {/* Background ambient glow circle */}
      <div style={{
        position: 'absolute',
        top: '-30px',
        right: '-30px',
        width: '120px',
        height: '120px',
        borderRadius: '50%',
        background: isPassHolder ? 'rgba(245,183,63,0.25)' : 'rgba(245,183,63,0.12)',
        filter: 'blur(30px)',
        pointerEvents: 'none'
      }} />

      {/* Top Header Tag */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{
            fontFamily: 'Inter, sans-serif',
            fontSize: '9px',
            fontWeight: 800,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            color: '#F5B73F',
            background: 'rgba(245,183,63,0.12)',
            border: '0.5px solid rgba(245,183,63,0.35)',
            borderRadius: '6px',
            padding: '2px 8px'
          }}>
            SEZÓNA 0 · FOUNDER PASS
          </span>
          {isPassHolder && (
            <span style={{
              fontFamily: 'Inter, sans-serif',
              fontSize: '9px',
              fontWeight: 700,
              color: '#22C55E',
              background: 'rgba(34,197,94,0.15)',
              border: '0.5px solid rgba(34,197,94,0.4)',
              borderRadius: '6px',
              padding: '2px 8px'
            }}>
              AKTIVNÍ ✨
            </span>
          )}
        </div>
        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '10px', color: '#9A9AB5' }}>
          BEZ ČEKÁNÍ
        </span>
      </div>

      {/* Main Card Row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          {/* Glowing Crown Icon */}
          <div style={{
            width: '46px',
            height: '46px',
            borderRadius: '14px',
            background: 'linear-gradient(135deg, #3A2610 0%, #201738 100%)',
            border: '1.5px solid #F5B73F',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#F5B73F',
            boxShadow: '0 0 16px rgba(245,183,63,0.45)',
            flexShrink: 0
          }}>
            <Crown size={24} />
          </div>

          <div>
            <div style={{
              color: '#FFFFFF',
              fontWeight: 700,
              fontSize: compact ? '15px' : '16px',
              fontFamily: "'Space Grotesk', sans-serif",
              letterSpacing: '-0.01em'
            }}>
              {isPassHolder ? 'Founder Pass je aktivní' : 'Odemkni Founder Pass'}
            </div>
            <div style={{
              color: isPassHolder ? '#F5B73F' : '#B4B4CE',
              fontSize: '12px',
              marginTop: '3px',
              lineHeight: '1.35',
              fontFamily: 'Inter, sans-serif'
            }}>
              {isPassHolder
                ? 'Celá sezóna bez čekání a zvýrazněné důkazy'
                : 'Celá sezóna bez čekání, Founder identita, certifikát'}
            </div>
          </div>
        </div>

        {/* Action Button / Active Badge */}
        {!isPassHolder ? (
          <div style={{
            background: 'linear-gradient(135deg, #F5B73F 0%, #EAB308 50%, #D97706 100%)',
            color: '#0F0B1E',
            fontWeight: 800,
            fontSize: '13px',
            fontFamily: "'Space Grotesk', sans-serif",
            padding: '10px 16px',
            borderRadius: '12px',
            boxShadow: '0 4px 16px rgba(245,183,63,0.45)',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            flexShrink: 0
          }}>
            <Sparkles size={14} />
            <span>{user?.passLapsed ? 199 : 149} Kč</span>
            <ChevronRight size={14} />
          </div>
        ) : (
          <div style={{
            background: 'rgba(34,197,94,0.15)',
            border: '1px solid #22C55E',
            color: '#22C55E',
            fontWeight: 700,
            fontSize: '12px',
            padding: '8px 14px',
            borderRadius: '10px',
            display: 'flex',
            alignItems: 'center',
            gap: '5px',
            flexShrink: 0
          }}>
            <Check size={14} />
            <span>ODEMČENO</span>
          </div>
        )}
      </div>
    </div>
  );
}
