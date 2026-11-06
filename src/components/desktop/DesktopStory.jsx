import { useEffect } from 'react';
import { useUserStore } from '../../store/userStore';
import NodeLoops from '../common/NodeLoops';
import { LockOpen, Play, Lock, ArrowRight, Check, Terminal, Skull } from 'lucide-react';
import TypewriterText from '../common/TypewriterText';

export default function DesktopStory() {
  const { 
    user,
    storyDialogStep, 
    storyDialogs, 
    dialogCompleted, 
    incrementDialogStep, 
    resetDialog,
    openModal,
    activeChallenge,
    activeStoryNodeSteps,
    advanceNode
  } = useUserStore();

  useEffect(() => {
    resetDialog();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div style={{
      display: 'flex',
      height: '100%',
      background: '#0D0A18',
      backgroundImage: 'radial-gradient(circle at 12% 0%, rgba(124,58,237,.14), transparent 40%)',
      fontFamily: 'Inter, sans-serif'
    }}>
      {/* LEFT: INTERACTIVE CHAT AREA */}
      <div style={{
        flex: 1.3,
        borderRight: '1px solid #1B1430',
        display: 'flex',
        flexDirection: 'column',
        height: '100%'
      }}>
        {/* Chat Messages */}
        <div style={{
          flex: 1,
          overflowY: 'auto',
          padding: '24px 28px',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px'
        }}>
          {storyDialogs.slice(0, storyDialogStep + 1).map((msg, i) => {
            if (msg.sender === 'zaya') {
              return (
                <div 
                  key={i} 
                  style={{
                    background: '#0B1626',
                    borderLeft: '2px solid #3B82F6',
                    borderRadius: '2px 10px 10px 10px',
                    padding: '16px 20px',
                    maxWidth: '80%',
                    alignSelf: 'flex-start'
                  }}
                >
                  <div style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: '500', fontSize: '10px', letterSpacing: '.10em', textTransform: 'uppercase', color: '#3B82F6', marginBottom: '7px' }}>
                    ZAYA_SYS
                  </div>
                  <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '13.5px', color: '#F0F0F8', lineHeight: '1.6' }}>
                    {i === storyDialogStep ? <TypewriterText text={msg.text} speed={10} /> : msg.text}
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
                    padding: '12px 18px',
                    maxWidth: '70%',
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

          {/* Typing indicators */}
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

          {/* Challenge card inline reveal */}
          {dialogCompleted && activeChallenge && (
            <div style={{
              marginTop: 'auto',
              background: '#241C3C',
              border: '1px solid #7C3AED',
              borderRadius: '16px',
              padding: '20px',
              boxShadow: '0 0 16px rgba(124,58,237,.18)',
              animation: 'glowPulse 2s ease-in-out infinite'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '10px' }}>
                <span style={{ display: 'inline-flex', width: '14px', height: '14px', color: '#22C55E' }}><LockOpen size={14} /></span>
                <span style={{ fontFamily: 'Inter', fontWeight: '600', fontSize: '10px', letterSpacing: '.12em', textTransform: 'uppercase', color: '#22C55E' }}>
                  Výzva odemčena
                </span>
              </div>
              <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: '700', fontSize: '20px', color: '#F0F0F8' }}>
                {activeChallenge.title}
              </div>
              <NodeLoops />
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '12px' }}>
                {activeStoryNodeSteps.length > 0 ? (
                  activeStoryNodeSteps.map((step, idx) => (
                    <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '9px' }}>
                      <span style={{ width: '7px', height: '7px', borderRadius: '50%', border: '1.5px solid #7C3AED', flexShrink: 0 }}></span>
                      <span style={{ fontFamily: 'Inter', fontSize: '13px', color: '#9A9AB5' }}>{step.text}</span>
                    </div>
                  ))
                ) : (
                  <>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '9px' }}>
                      <span style={{ width: '7px', height: '7px', borderRadius: '50%', border: '1.5px solid #7C3AED', flexShrink: 0 }}></span>
                      <span style={{ fontFamily: 'Inter', fontSize: '13px', color: '#9A9AB5' }}>{activeChallenge.description}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '9px' }}>
                      <span style={{ width: '7px', height: '7px', borderRadius: '50%', border: '1.5px solid #7C3AED', flexShrink: 0 }}></span>
                      <span style={{ fontFamily: 'Inter', fontSize: '13px', color: '#9A9AB5' }}>Důkaz: {activeChallenge.proof_type === 'PHOTO' ? 'Fotografie' : 'Textový popis'}</span>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer controls */}
        <div style={{
          padding: '20px 28px',
          borderTop: '1px solid #1B1430',
          background: '#0A0712',
          flexShrink: 0
        }}>
          {dialogCompleted ? (
            activeChallenge ? (
              <button
                onClick={() => openModal('challenge-detail')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  width: '100%',
                  height: '50px',
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
                onClick={() => advanceNode()}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  width: '100%',
                  height: '50px',
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
                Pokračovat <span style={{ display: 'inline-flex', width: '18px', height: '18px' }}><ArrowRight size={16} /></span>
              </button>
            )
          ) : (
            <button 
              onClick={() => {
                if (storyDialogStep % 2 === 0) {
                  incrementDialogStep();
                  setTimeout(() => {
                    incrementDialogStep();
                  }, 350);
                }
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                width: '100%',
                height: '50px',
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

      {/* RIGHT: MAPA CESTY (NODE ZIGZAG) */}
      <div style={{
        flex: 0.8,
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        padding: '24px 28px 40px',
        overflowY: 'auto'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '22px' }}>
          <div>
            <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: '700', fontSize: '18px', color: '#F0F0F8' }}>Mapa cesty</div>
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '10px', color: '#A78BFA', letterSpacing: '.1em' }}>SEZÓNA 0</div>
          </div>
        </div>

        <div style={{ position: 'relative', flex: 1, minHeight: '400px', padding: '10px 20px 0' }}>
          {/* Vertical dashed line */}
          <div style={{
            position: 'absolute',
            top: '20px',
            bottom: '40px',
            left: '50%',
            width: '2px',
            background: 'repeating-linear-gradient(#382C5C 0 6px, transparent 6px 13px)',
            transform: 'translateX(-50%)',
            zIndex: 0
          }}></div>

          {/* Zigzag nodes list */}
          <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', gap: '22px' }}>
            {[1, 2, 3, 4, 5, 6, 7, 8].map((order) => {
              const currentUzel = user?.uzel ?? 1;
              const isCompleted = order < currentUzel;
              const isActive = order === currentUzel;
              const isLocked = order > currentUzel;
              const isFinal = order === 8;
              const isLeftAlign = order % 2 === 1;

              if (isFinal) {
                return (
                  <div key={order} style={{ display: 'flex', justifyContent: 'center' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', opacity: isLocked ? 0.5 : 1 }}>
                      <div style={{
                        width: '54px',
                        height: '54px',
                        borderRadius: '16px',
                        background: isActive ? 'linear-gradient(135deg,#9333EA,#6D28D9)' : 'linear-gradient(150deg,#3a2a10,#241C3C)',
                        border: isActive ? '2px solid #fff' : '2px solid #F5B73F',
                        boxShadow: isActive ? '0 0 24px rgba(124,58,237,.6)' : '0 0 24px rgba(245,183,63,.5)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}>
                        <span style={{ display: 'inline-flex', width: '24px', height: '24px', color: '#F5B73F' }}><Skull size={20} /></span>
                      </div>
                      <span style={{ fontFamily: 'Inter', fontWeight: '700', fontSize: '10px', color: '#F5B73F', letterSpacing: '.08em' }}>
                        {isActive ? 'TY JSI ZDE · FINÁLE' : 'FINÁLE'}
                      </span>
                    </div>
                  </div>
                );
              }

              return (
                <div key={order} style={{ display: 'flex', justifyContent: isLeftAlign ? 'flex-start' : 'flex-end', alignItems: 'center', gap: '12px' }}>
                  {isActive ? (
                    <>
                      {isLeftAlign ? null : (
                        <span style={{
                          fontFamily: 'Inter',
                          fontWeight: '700',
                          fontSize: '10px',
                          color: '#A78BFA',
                          background: '#241C3C',
                          border: '1px solid #7C3AED',
                          borderRadius: '20px',
                          padding: '5px 11px',
                          whiteSpace: 'nowrap'
                        }}>
                          TY JSI TADY · UZEL {order}
                        </span>
                      )}
                      <div className="node-now" style={{
                        width: '50px',
                        height: '50px',
                        borderRadius: '50%',
                        background: 'linear-gradient(135deg,#9333EA,#6D28D9)',
                        border: '2px solid #fff',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        boxShadow: '0 0 22px rgba(124,58,237,.6)',
                        flexShrink: 0
                      }}>
                        <span style={{ display: 'inline-flex', width: '20px', height: '20px', color: '#fff' }}><Play size={18} fill="#fff" /></span>
                      </div>
                      {isLeftAlign ? (
                        <span style={{
                          fontFamily: 'Inter',
                          fontWeight: '700',
                          fontSize: '10px',
                          color: '#A78BFA',
                          background: '#241C3C',
                          border: '1px solid #7C3AED',
                          borderRadius: '20px',
                          padding: '5px 11px',
                          whiteSpace: 'nowrap'
                        }}>
                          TY JSI TADY · UZEL {order}
                        </span>
                      ) : null}
                    </>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '5px', opacity: isLocked ? 0.5 : 1 }}>
                      <div style={{
                        width: '40px',
                        height: '40px',
                        borderRadius: '50%',
                        background: isCompleted ? '#16351F' : '#1C1630',
                        border: isCompleted ? '2px solid #22C55E' : '1.5px solid #382C5C',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}>
                        {isCompleted ? (
                          <span style={{ display: 'inline-flex', width: '16px', height: '16px', color: '#22C55E' }}><Check size={14} /></span>
                        ) : (
                          <span style={{ display: 'inline-flex', width: '14px', height: '14px', color: '#6B6B8A' }}><Lock size={12} /></span>
                        )}
                      </div>
                      <span style={{ fontFamily: 'Inter', fontSize: '9px', color: isCompleted ? '#6B6B8A' : '#54506A' }}>Uzel {order}</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Zaya system reminder box */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', background: '#0B1626', border: '1px solid #3B82F6', boxShadow: '0 0 12px rgba(59,130,246,.3)', borderRadius: '14px', padding: '11px 14px', marginTop: '16px' }}>
          <span style={{ width: '26px', height: '26px', borderRadius: '8px', background: '#14223D', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Terminal size={14} style={{ color: '#3B82F6' }} /></span>
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '11px', color: '#9A9AB5', lineHeight: '1.4' }}>
            Dál už jen já vím, co tě čeká. <span style={{ color: '#F0F0F8' }}>&gt;&gt;</span>
          </span>
        </div>
      </div>
    </div>
  );
}
