import { useEffect } from 'react';
import { useUserStore } from '../../store/userStore';
import { ChevronLeft, LockOpen, ArrowRight } from 'lucide-react';

export default function MobileStory() {
  const { 
    user, 
    storyDialogStep, 
    storyDialogs, 
    dialogCompleted, 
    incrementDialogStep, 
    resetDialog,
    openModal,
    activeChallenge,
    activeStoryNodeSteps
  } = useUserStore();

  useEffect(() => {
    // Reset conversation on open to allow re-playing
    resetDialog();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div style={{
      flex: 1,
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column',
      background: '#15111E',
      backgroundImage: 'radial-gradient(circle, rgba(139,92,246,.10) 1px, transparent 1.5px)',
      backgroundSize: '28px 28px',
      fontFamily: 'Inter, sans-serif'
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '8px 18px 14px',
        borderBottom: '0.5px solid #382C5C',
        flexShrink: 0
      }}>
        <span 
          onClick={() => openModal('collections')} 
          style={{ display: 'inline-flex', width: '22px', height: '22px', color: '#6B6B8A', cursor: 'pointer' }}
        >
          <ChevronLeft size={20} />
        </span>
        <span style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: '700', fontSize: '15px' }}>
          Uzel {user?.uzel || 3} / 9
        </span>
        <span 
          onClick={() => openModal('collections')}
          style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: '11px',
            color: '#fff',
            background: 'linear-gradient(135deg,#2563EB,#3B82F6)',
            borderRadius: '7px',
            padding: '4px 8px',
            cursor: 'pointer'
          }}
        >
          #{user?.xp || 240}
        </span>
      </div>

      {/* Chat messages */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: '20px 18px',
        display: 'flex',
        flexDirection: 'column',
        gap: '16px'
      }}>
        {/* Render visible dialog steps */}
        {storyDialogs.slice(0, storyDialogStep + 1).map((msg, i) => {
          if (msg.sender === 'zaya') {
            return (
              <div 
                key={i} 
                style={{
                  background: '#0B1626',
                  borderLeft: '2px solid #3B82F6',
                  borderRadius: '2px 10px 10px 10px',
                  padding: '12px 14px',
                  maxWidth: '88%',
                  alignSelf: 'flex-start'
                }}
              >
                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: '500', fontSize: '10px', letterSpacing: '.1em', textTransform: 'uppercase', color: '#3B82F6', marginBottom: '7px' }}>
                  ZAYA_SYS
                </div>
                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '13px', color: '#F0F0F8', lineHeight: '1.55' }}>
                  {msg.text}
                </div>
                {msg.sys && (
                  <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '11px', color: '#3B82F6', opacity: '.55', marginTop: '9px' }}>
                    {msg.sys}
                  </div>
                )}
              </div>
            );
          } else {
            return (
              <div 
                key={i} 
                style={{
                  alignSelf: 'flex-end',
                  background: 'rgba(124,58,237,.12)',
                  border: '0.5px solid #382C5C',
                  borderRadius: '10px 10px 2px 10px',
                  padding: '10px 14px',
                  maxWidth: '72%',
                  textAlign: 'right'
                }}
              >
                <div style={{ fontFamily: 'Inter', fontSize: '14px', color: '#F0F0F8' }}>
                  {msg.text}
                </div>
              </div>
            );
          }
        })}

        {/* Typing dots while wait-loading */}
        {!dialogCompleted && storyDialogStep % 2 === 1 && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '2px',
            background: '#0B1626',
            borderLeft: '2px solid #3B82F6',
            borderRadius: '2px 10px 10px 10px',
            padding: '12px 16px',
            width: '62px',
            alignSelf: 'flex-start'
          }} className="dot-blink">
            <span></span>
            <span></span>
            <span></span>
          </div>
        )}

        {/* Challenge Box Reveal at end of conversation */}
        {dialogCompleted && activeChallenge && (
          <div style={{
            marginTop: 'auto',
            background: '#241C3C',
            border: '1px solid #7C3AED',
            borderRadius: '16px',
            padding: '16px',
            boxShadow: '0 0 16px rgba(124,58,237,.18)',
            animation: 'glowPulse 2s ease-in-out infinite'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '10px' }}>
              <span style={{ display: 'inline-flex', width: '14px', height: '14px', color: '#22C55E' }}><LockOpen size={14} /></span>
              <span style={{ fontFamily: 'Inter', fontWeight: '600', fontSize: '10px', letterSpacing: '.12em', textTransform: 'uppercase', color: '#22C55E' }}>
                Výzva odemčena
              </span>
            </div>
            <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: '700', fontSize: '18px', color: '#F0F0F8' }}>
              {activeChallenge.title}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '12px' }}>
              {activeStoryNodeSteps.length > 0 ? (
                activeStoryNodeSteps.map((step, idx) => (
                  <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '9px' }}>
                    <span style={{ width: '7px', height: '7px', borderRadius: '50%', border: '1.5px solid #7C3AED', flexShrink: 0 }}></span>
                    <span style={{ fontFamily: 'Inter', fontSize: '12px', color: '#6B6B8A' }}>{step.text}</span>
                  </div>
                ))
              ) : (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '9px' }}>
                    <span style={{ width: '7px', height: '7px', borderRadius: '50%', border: '1.5px solid #7C3AED', flexShrink: 0 }}></span>
                    <span style={{ fontFamily: 'Inter', fontSize: '12px', color: '#6B6B8A' }}>{activeChallenge.description}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '9px' }}>
                    <span style={{ width: '7px', height: '7px', borderRadius: '50%', border: '1.5px solid #7C3AED', flexShrink: 0 }}></span>
                    <span style={{ fontFamily: 'Inter', fontSize: '12px', color: '#6B6B8A' }}>Důkaz: {activeChallenge.proof_type === 'PHOTO' ? 'Fotografie' : 'Textový popis'}</span>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Action CTA Button footer */}
      <div style={{ padding: '14px 18px 24px', flexShrink: 0, borderTop: '0.5px solid #382C5C', background: '#0B0A12' }}>
        {dialogCompleted ? (
          <button 
            onClick={() => openModal('challenge-detail')}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              width: '100%',
              height: '48px',
              background: '#7C3AED',
              color: '#fff',
              fontFamily: 'Inter',
              fontWeight: '700',
              fontSize: '16px',
              letterSpacing: '.01em',
              border: 'none',
              borderRadius: '18px',
              cursor: 'pointer'
            }}
          >
            Spustit výzvu <span style={{ display: 'inline-flex', width: '18px', height: '18px' }}><ArrowRight size={16} /></span>
          </button>
        ) : (
          <button 
            onClick={() => {
              if (storyDialogStep % 2 === 0) {
                // Player speaks
                incrementDialogStep();
                // Auto-advance after 1.5s typing delay
                setTimeout(() => {
                  incrementDialogStep();
                }, 1500);
              }
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              width: '100%',
              height: '48px',
              background: '#241C3C',
              border: '1px solid #382C5C',
              color: '#F0F0F8',
              fontFamily: 'Inter',
              fontWeight: '600',
              fontSize: '15px',
              borderRadius: '18px',
              cursor: 'pointer'
            }}
          >
            Pokračovat v dialogu
          </button>
        )}
      </div>
    </div>
  );
}
