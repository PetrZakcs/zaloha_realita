import { useState, useEffect } from 'react';
import { useUserStore } from '../store/userStore';
import { supabase } from '../api/supabaseClient';
import { track } from '../lib/analytics';
import { 
  X, Check, KeyRound, Lock, Crown, ArrowRight, Shield, Zap, 
  ImageIcon, Globe, Bell, Sparkles, Loader2, Volume2
} from 'lucide-react';
import OnboardingFlow from './modals/OnboardingFlow';

export default function ModalManager() {
  const { 
    user, 
    onboarded,
    sessionChecked,
    activeModal, 
    activeChallenge,
    closeModal,
    openModal,
    updateUser,
    submitProof,
    mockLogs,
    resetProgress,
    unlockedCards,
    proofsSubmittedCount,
    advanceNode
  } = useUserStore();

  // Onboarding text states
  const [tempName, setTempName] = useState(user?.name || 'TemnýPozorovatel');
  const [tempPledge, setTempPledge] = useState('Jsem člověk, co přestal čekat a začal jednat.');
  const [textProof, setTextProof] = useState('Posbíral jsem odpadky u zastávky. Reálný zásah ✊');
  const [publicToggle, setPublicToggle] = useState(false);
  const [proofMode, setProofMode] = useState('photo'); // 'photo' | 'text'
  const [photoFile, setPhotoFile] = useState(null);
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState(null);

  // Sync temp name when user store updates
  useEffect(() => {
    if (user?.name) {
      setTempName(user.name);
    }
  }, [user?.name]);

  // XP countup state
  const [xpDisplay, setXpDisplay] = useState(0);
  useEffect(() => {
    if (activeModal === 'celebration-xp' || activeModal === 'success-overlay') {
      const target = user?.xp || 240;
      const start = target - 50;
      setXpDisplay(start);
      let current = start;
      const timer = setInterval(() => {
        if (current < target) {
          current += 2;
          setXpDisplay(Math.min(current, target));
        } else {
          clearInterval(timer);
        }
      }, 30);
      return () => clearInterval(timer);
    }
  }, [activeModal, user?.xp]);

  // Reset the proof form each time the upload modal is (re)opened
  useEffect(() => {
    if (activeModal === 'proof-upload') {
      setProofMode('photo');
      setPhotoFile(null);
      setPhotoPreviewUrl(null);
      setTextProof('');
    }
  }, [activeModal]);

  // Revoke the object URL when it changes or the component unmounts, to avoid leaking memory
  useEffect(() => {
    return () => {
      if (photoPreviewUrl) URL.revokeObjectURL(photoPreviewUrl);
    };
  }, [photoPreviewUrl]);

  // Show a branded loading screen while the initial Supabase session check is
  // in flight. This prevents the onboarding splash from flashing for a
  // returning user whose profile is being fetched asynchronously on load.
  // sessionChecked is initialised to `true` when localStorage already has
  // onboarded=true, so this screen is invisible for users who are already in.
  if (!sessionChecked) {
    return (
      <div style={{
        position: 'absolute',
        inset: 0,
        background: '#0D0A18',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 200,
        gap: '20px'
      }}>
        <style>{`
          @keyframes iwauSpinnerRing { to { transform: rotate(360deg); } }
        `}</style>
        {/* App logo */}
        <span style={{ display: 'inline-flex', width: '52px', height: '52px', filter: 'drop-shadow(0 0 20px rgba(124,58,237,.6))' }}>
          <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ width: '100%', height: '100%' }}>
            <defs>
              <linearGradient id="iwg_spinner_logo" x1="8" y1="5" x2="40" y2="42" gradientUnits="userSpaceOnUse">
                <stop offset="0" stopColor="#B24EE8" />
                <stop offset="1" stopColor="#6E18A0" />
              </linearGradient>
            </defs>
            <path d="M11 5 L24 13 L37 5 L43 19 L35 42 L24 34 L13 42 L5 19 Z" fill="url(#iwg_spinner_logo)" stroke="url(#iwg_spinner_logo)" strokeWidth="3" strokeLinejoin="round" />
            <path d="M24 25 L24 11 M24 25 L13.5 36 M24 25 L34.5 36" fill="none" stroke="#fff" strokeWidth="5.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
        {/* Spinner ring */}
        <div style={{
          width: '28px',
          height: '28px',
          borderRadius: '50%',
          border: '2.5px solid #1E1535',
          borderTopColor: '#A78BFA',
          animation: 'iwauSpinnerRing 0.75s linear infinite'
        }} />
      </div>
    );
  }

  // If onboarded and no active modal, do not render anything
  if (onboarded && !activeModal) {
    return null;
  }

  // ONBOARDING FLOW
  if (!onboarded) {
    return <OnboardingFlow />;
  }

  // STANDARD ACTIVE MODALS (Onboarded is true)
  return (
    <div style={{
      position: 'absolute',
      inset: 0,
      background: 'rgba(5, 5, 9, 0.85)',
      backdropFilter: 'blur(4px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '20px',
      zIndex: 100
    }}>
      {/* Modal Card wrapper */}
      <div style={{
        position: 'relative',
        width: '100%',
        maxWidth: '350px',
        background: '#241C3C',
        border: '1px solid #382C5C',
        borderRadius: '24px',
        padding: '24px 20px',
        boxShadow: '0 20px 60px rgba(0,0,0,.6)',
        maxHeight: '90%',
        overflowY: 'auto',
        display: 'flex',
        flexDirection: 'column'
      }}>
        {/* Close Icon top right */}
        {activeModal !== 'mock-loader' && (
          <span 
            onClick={closeModal}
            style={{
              position: 'absolute',
              top: '16px',
              right: '16px',
              color: '#6B6B8A',
              cursor: 'pointer',
              display: 'inline-flex',
              width: '20px',
              height: '20px'
            }}
          >
            <X size={18} />
          </span>
        )}

        {/* MODAL 1: Challenge Detail */}
        {activeModal === 'challenge-detail' && (
          <div>
            <div style={{ height: '120px', borderRadius: '16px', background: 'repeating-linear-gradient(135deg,#1C1630,#1C1630 10px,#241C3C 10px,#241C3C 20px)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '6px', marginBottom: '14px', flexShrink: 0 }}>
              <ImageIcon size={24} style={{ color: '#22C55E' }} />
              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '9px', color: '#6B6B8A' }}>ILUSTRACE QUESTU · Environment</span>
            </div>
            
            <div style={{ fontFamily: 'Inter', fontWeight: '600', fontSize: '10px', letterSpacing: '.12em', textTransform: 'uppercase', color: '#8B5CF6' }}>
              Uzel {user?.uzel ?? 3} · Mikro-akce
            </div>
            <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: '700', fontSize: '22px', marginTop: '6px', color: '#fff' }}>
              {activeChallenge.title}
            </div>
            <div style={{ borderLeft: '2px solid #7C3AED', paddingLeft: '10px', marginTop: '12px' }}>
              <span style={{ fontFamily: 'Inter', fontStyle: 'italic', fontSize: '12px', color: '#9A9AB5' }}>
                {activeChallenge.description}
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#7C3AED' }}></span>
                <span style={{ fontFamily: 'Inter', fontSize: '12px', color: '#F0F0F8' }}>Najdi 3 odhozené kusy odpadu</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#7C3AED' }}></span>
                <span style={{ fontFamily: 'Inter', fontSize: '12px', color: '#F0F0F8' }}>Vhoď je do nejbližšího koše</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#7C3AED' }}></span>
                <span style={{ fontFamily: 'Inter', fontSize: '12px', color: '#F0F0F8' }}>Zachyť to a odeslů důkaz</span>
              </div>
            </div>

            <div style={{ marginTop: '18px' }}>
              <div style={{ fontFamily: 'Inter', fontWeight: '600', fontSize: '10px', color: '#6B6B8A', marginBottom: '8px' }}>Odměny za splnění:</div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <div style={{ flex: 1, background: '#2A1E10', border: '1px solid #F5B73F', borderRadius: '12px', padding: '10px 4px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                  <KeyRound size={16} style={{ color: '#F5B73F' }} />
                  <span style={{ fontFamily: 'Inter', fontSize: '10px', color: '#F5B73F', fontWeight: '600' }}>+{activeChallenge.reward_keys} klíče</span>
                </div>
                <div style={{ flex: 1, background: '#241a3d', border: '0.5px solid #7C3AED', borderRadius: '12px', padding: '10px 4px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                  <Shield size={16} style={{ color: '#A78BFA' }} />
                  <span style={{ fontFamily: 'Inter', fontSize: '10px', color: '#A78BFA', fontWeight: '600' }}>Rare Badge</span>
                </div>
                <div style={{ flex: 1, background: '#14223D', border: '0.5px solid #4AA8FF', borderRadius: '12px', padding: '10px 4px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                  <Zap size={16} style={{ color: '#4AA8FF' }} />
                  <span style={{ fontFamily: 'Inter', fontSize: '10px', color: '#4AA8FF', fontWeight: '600' }}>+{activeChallenge.reward_xp} XP</span>
                </div>
              </div>
            </div>

            <button 
              onClick={() => openModal('proof-upload')}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                width: '100%',
                height: '46px',
                background: '#7C3AED',
                color: '#fff',
                fontFamily: 'Inter',
                fontWeight: '700',
                fontSize: '15px',
                border: 'none',
                borderRadius: '16px',
                cursor: 'pointer',
                marginTop: '20px'
              }}
            >
              Přejít k plnění <ArrowRight size={16} />
            </button>
          </div>
        )}

        {/* MODAL 2: Proof Upload */}
        {activeModal === 'proof-upload' && (
          <div>
            <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: '700', fontSize: '18px', color: '#fff', marginBottom: '4px' }}>
              Odeslat důkaz akce
            </div>
            <div style={{ fontFamily: 'Inter', fontSize: '12px', color: '#9A9AB5', marginBottom: '14px' }}>
              Dokonči úkol. Vyber jeden způsob důkazu — foto, nebo text.
            </div>

            {/* Photo vs Text mode switch */}
            <div style={{ display: 'flex', background: '#1C1630', borderRadius: '12px', padding: '3px', marginBottom: '14px' }}>
              <button
                onClick={() => setProofMode('photo')}
                style={{
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  height: '34px',
                  background: proofMode === 'photo' ? '#7C3AED' : 'transparent',
                  color: proofMode === 'photo' ? '#fff' : '#6B6B8A',
                  border: 'none',
                  borderRadius: '9px',
                  fontFamily: 'Inter',
                  fontWeight: '600',
                  fontSize: '12px',
                  cursor: 'pointer'
                }}
              >
                <ImageIcon size={13} /> Foto
              </button>
              <button
                onClick={() => setProofMode('text')}
                style={{
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  height: '34px',
                  background: proofMode === 'text' ? '#7C3AED' : 'transparent',
                  color: proofMode === 'text' ? '#fff' : '#6B6B8A',
                  border: 'none',
                  borderRadius: '9px',
                  fontFamily: 'Inter',
                  fontWeight: '600',
                  fontSize: '12px',
                  cursor: 'pointer'
                }}
              >
                Text
              </button>
            </div>

            {proofMode === 'photo' ? (
              <label
                style={{
                  border: '1.5px dashed #7C3AED',
                  borderRadius: '16px',
                  height: '160px',
                  background: photoPreviewUrl
                    ? `center / cover no-repeat url(${photoPreviewUrl})`
                    : 'repeating-linear-gradient(135deg,#1C1630,#1C1630 10px,#241C3C 10px,#241C3C 20px)',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  cursor: 'pointer',
                  position: 'relative'
                }}
              >
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      if (photoPreviewUrl) URL.revokeObjectURL(photoPreviewUrl);
                      setPhotoFile(file);
                      setPhotoPreviewUrl(URL.createObjectURL(file));
                    }
                  }}
                  style={{ display: 'none' }}
                />
                {!photoPreviewUrl && (
                  <>
                    <ImageIcon size={28} style={{ color: '#6B6B8A' }} />
                    <span style={{ fontFamily: 'Inter', fontSize: '11px', color: '#6B6B8A' }}>
                      VYBRAT NEBO VYFOTIT DŮKAZ
                    </span>
                  </>
                )}
              </label>
            ) : (
              <textarea
                value={textProof}
                onChange={(e) => setTextProof(e.target.value)}
                placeholder="Popiš, co jsi udělal…"
                style={{
                  width: '100%',
                  height: '160px',
                  background: '#1C1630',
                  border: '0.5px solid #382C5C',
                  borderRadius: '12px',
                  padding: '10px',
                  fontFamily: 'Inter',
                  fontSize: '13px',
                  color: '#fff',
                  resize: 'none',
                  outline: 'none',
                  boxSizing: 'border-box'
                }}
              />
            )}

            {/* Visibility Selector */}
            <div style={{ display: 'flex', background: '#1C1630', borderRadius: '12px', padding: '3px', marginTop: '14px' }}>
              <button 
                onClick={() => setPublicToggle(true)}
                style={{
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  height: '34px',
                  background: publicToggle ? '#7C3AED' : 'transparent',
                  color: publicToggle ? '#fff' : '#6B6B8A',
                  border: 'none',
                  borderRadius: '9px',
                  fontFamily: 'Inter',
                  fontWeight: '600',
                  fontSize: '12px',
                  cursor: 'pointer'
                }}
              >
                <Globe size={13} /> Veřejný (+1 klíč)
              </button>
              <button 
                onClick={() => setPublicToggle(false)}
                style={{
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  height: '34px',
                  background: !publicToggle ? '#7C3AED' : 'transparent',
                  color: !publicToggle ? '#fff' : '#6B6B8A',
                  border: 'none',
                  borderRadius: '9px',
                  fontFamily: 'Inter',
                  fontWeight: '600',
                  fontSize: '12px',
                  cursor: 'pointer'
                }}
              >
                <Lock size={13} /> Soukromý
              </button>
            </div>

            <button
              disabled={proofMode === 'photo' ? !photoFile : !textProof.trim()}
              onClick={() => {
                submitProof({
                  text: proofMode === 'text' ? textProof : '',
                  photoFile: proofMode === 'photo' ? photoFile : null,
                  is_public: publicToggle
                });
              }}
              style={{
                width: '100%',
                height: '46px',
                background: (proofMode === 'photo' ? !photoFile : !textProof.trim()) ? '#2E4A38' : '#22C55E',
                color: (proofMode === 'photo' ? !photoFile : !textProof.trim()) ? '#6B6B8A' : '#fff',
                fontFamily: 'Inter',
                fontWeight: '700',
                fontSize: '15px',
                border: 'none',
                borderRadius: '16px',
                cursor: (proofMode === 'photo' ? !photoFile : !textProof.trim()) ? 'not-allowed' : 'pointer',
                marginTop: '16px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px'
              }}
            >
              Dokončit a odeslat <ArrowRight size={16} />
            </button>
          </div>
        )}

        {/* MODAL 2.5: Glitch Moment (secret mystery reward after 3rd proof) */}
        {activeModal === 'glitch-moment' && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
            <div style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: '11px',
              letterSpacing: '.12em',
              color: '#22C55E',
              textTransform: 'uppercase',
              animation: 'glitchFlicker 0.4s steps(2, end) 4'
            }}>
              SYSTÉMOVÁ ANOMÁLIE DETEKOVÁNA
            </div>

            <div style={{
              width: '100%',
              background: '#0B0A12',
              border: '1px solid #22C55E',
              borderRadius: '12px',
              padding: '16px',
              marginTop: '18px',
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: '12px',
              color: '#22C55E',
              lineHeight: '1.7',
              textAlign: 'left',
              boxShadow: '0 0 20px rgba(34,197,94,.25)'
            }}>
              &gt; GL_TCH://SIGNAL_DETECTED<br />
              &gt; ...někdo sleduje tvůj postup mimo systém Zaya...<br />
              &gt; ...3 zásahy potvrzeny. Vrstva reality se na okamžik odkryla...<br />
              &gt; FRAGMENT_KÓDU_03: <span style={{ color: '#fff' }}>„NPC to nevidí. Ty ano.“</span>
            </div>

            <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: '700', fontSize: '20px', color: '#fff', marginTop: '18px' }}>
              Fragment kódu získán.
            </div>
            <div style={{ fontFamily: 'Inter', fontSize: '13px', color: '#9A9AB5', marginTop: '6px', lineHeight: '1.5' }}>
              Udrž streak <span style={{ color: '#22C55E', fontWeight: '600' }}>3 dny</span> a odemkneš další fragment.
            </div>

            <button
              onClick={closeModal}
              style={{
                width: '100%',
                height: '46px',
                background: '#22C55E',
                color: '#0B0A12',
                fontFamily: 'Inter',
                fontWeight: '700',
                fontSize: '15px',
                border: 'none',
                borderRadius: '16px',
                cursor: 'pointer',
                marginTop: '22px'
              }}
            >
              Zavřít
            </button>
          </div>
        )}

        {/* MODAL 3: Mock log loader (analyzing) */}
        {activeModal === 'mock-loader' && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '10px 0' }}>
            <Loader2 size={36} className="spin-ico" style={{ color: '#3B82F6', marginBottom: '16px' }} />
            <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: '700', fontSize: '18px', color: '#fff', marginBottom: '8px' }}>
              Zaya analyzuje realitu…
            </div>
            
            <div style={{
              width: '100%',
              background: '#0B0A12',
              borderRadius: '10px',
              padding: '12px',
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: '10.5px',
              color: '#3B82F6',
              display: 'flex',
              flexDirection: 'column',
              gap: '4px',
              minHeight: '80px',
              textAlign: 'left'
            }}>
              {mockLogs.map((log, i) => (
                <div key={i} style={{ opacity: i === mockLogs.length - 1 ? 1 : 0.5 }}>
                  &gt; {log}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* MODAL 4: Success Overlay */}
        {activeModal === 'success-overlay' && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
            <span style={{ display: 'inline-flex', width: '48px', height: '48px', color: '#22C55E', marginBottom: '14px' }}>
              <Check size={48} style={{ filter: 'drop-shadow(0 0 10px rgba(34,197,94,.5))' }} />
            </span>
            <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: '700', fontSize: '24px', color: '#fff' }}>
              Zásah ověřen!
            </div>
            <div style={{ fontFamily: 'Inter', fontSize: '13px', color: '#9A9AB5', marginTop: '6px' }}>
              Zaya potvrdila reálný dopad tvého činu. Jsi o krok dál.
            </div>
            <button 
              onClick={() => openModal('celebration-xp')}
              style={{
                width: '100%',
                height: '46px',
                background: '#7C3AED',
                color: '#fff',
                fontFamily: 'Inter',
                fontWeight: '700',
                fontSize: '15px',
                border: 'none',
                borderRadius: '16px',
                cursor: 'pointer',
                marginTop: '20px'
              }}
            >
              Pokračovat k oslavě →
            </button>
          </div>
        )}

        {/* MODAL 5: Celebration XP toast */}
        {activeModal === 'celebration-xp' && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '10px 0', textAlign: 'center' }}>
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '11px', letterSpacing: '.12em', color: '#3B82F6', textTransform: 'uppercase' }}>
              +XP Připsáno
            </span>
            <div style={{
              fontFamily: "'Space Grotesk', sans-serif",
              fontWeight: '700',
              fontSize: '64px',
              color: '#4AA8FF',
              textShadow: '0 0 20px rgba(74,168,255,.8), 0 0 40px rgba(59,130,246,.5)',
              margin: '12px 0 6px'
            }}>
              +50
            </div>
            <div style={{ fontFamily: 'Inter', fontSize: '13px', color: '#9A9AB5' }}>
              Nové skóre: <span style={{ color: '#fff', fontWeight: 'bold' }}>{xpDisplay} XP</span>
            </div>

            <button 
              onClick={() => {
                // If it is the first upload, proceed to badge. Else, directly to keys
                if (user?.badges_count === 1) {
                  openModal('celebration-keys');
                } else {
                  openModal('celebration-badge');
                }
              }}
              style={{
                width: '100%',
                height: '46px',
                background: '#7C3AED',
                color: '#fff',
                fontFamily: 'Inter',
                fontWeight: '700',
                fontSize: '15px',
                border: 'none',
                borderRadius: '16px',
                cursor: 'pointer',
                marginTop: '24px'
              }}
            >
              Pokračovat →
            </button>
          </div>
        )}

        {/* MODAL 6: Celebration Badge Unlock */}
        {activeModal === 'celebration-badge' && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '11px', letterSpacing: '.12em', color: '#A78BFA', textTransform: 'uppercase' }}>
              Nový odznak odemčen!
            </div>
            
            {/* Rarity Ring animation */}
            <div style={{ position: 'relative', width: '110px', height: '110px', margin: '20px 0 16px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: '2.5px solid #A78BFA', animation: 'ringPulse 1.6s ease-out infinite' }}></span>
              <div style={{
                width: '92px',
                height: '92px',
                borderRadius: '50%',
                background: 'linear-gradient(150deg,#241a3d,#1C1630)',
                border: '1.5px solid #A78BFA',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 0 24px rgba(167,139,250,.45)'
              }}>
                <Shield size={44} style={{ color: '#A78BFA' }} />
              </div>
            </div>

            <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: '700', fontSize: '22px', color: '#fff' }}>
              Doer
            </div>
            <div style={{ fontFamily: 'Inter', fontWeight: '600', fontSize: '10px', letterSpacing: '.1em', textTransform: 'uppercase', color: '#A78BFA', border: '1px solid #A78BFA', borderRadius: '20px', padding: '3px 11px', marginTop: '6px' }}>
              Rare
            </div>
            <div style={{ fontFamily: 'Inter', fontSize: '13px', color: '#9A9AB5', marginTop: '14px', lineHeight: '1.5' }}>
              Každý, kdo jedná, už není NPC. Tento odznak to dokazuje.
            </div>

            <button 
              onClick={() => openModal('celebration-keys')}
              style={{
                width: '100%',
                height: '46px',
                background: '#7C3AED',
                color: '#fff',
                fontFamily: 'Inter',
                fontWeight: '700',
                fontSize: '15px',
                border: 'none',
                borderRadius: '16px',
                cursor: 'pointer',
                marginTop: '20px'
              }}
            >
              Získat odměnu →
            </button>
          </div>
        )}

        {/* MODAL 7: Celebration Keys Claim */}
        {activeModal === 'celebration-keys' && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '11px', letterSpacing: '.12em', color: '#F5B73F', textTransform: 'uppercase' }}>
              Klíče připsány
            </div>

            {/* Key Flip block */}
            <div style={{ position: 'relative', width: '90px', height: '90px', margin: '22px 0 16px', perspective: '1000px' }}>
              <div style={{
                width: '100%',
                height: '100%',
                borderRadius: '20px',
                background: 'linear-gradient(150deg,#3a2a10,#241C3C)',
                border: '2px solid #F5B73F',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 0 32px rgba(245,183,63,.5)',
                animation: 'flipKey 1.5s ease-in-out'
              }}>
                <KeyRound size={40} style={{ color: '#F5B73F' }} />
              </div>
            </div>

            <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: '700', fontSize: '26px', color: '#F5B73F' }}>
              +2 Klíče
            </div>
            
            <div style={{ width: '100%', background: '#1C1630', border: '0.5px solid #382C5C', borderRadius: '14px', padding: '10px', marginTop: '16px', textAlign: 'center' }}>
              <div style={{ fontFamily: 'Inter', fontSize: '10px', color: '#6B6B8A' }}>Celkem ve sbírce</div>
              <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: '700', fontSize: '19px', color: '#F5B73F', marginTop: '2px' }}>
                {user?.keys_count || 7} klíčů
              </div>
            </div>

            <button
              onClick={() => {
                advanceNode();
                if (proofsSubmittedCount === 3 && !localStorage.getItem('glitchMomentShown')) {
                  localStorage.setItem('glitchMomentShown', 'true');
                  openModal('glitch-moment');
                } else {
                  closeModal();
                }
              }}
              style={{
                width: '100%',
                height: '46px',
                background: '#22C55E',
                color: '#fff',
                fontFamily: 'Inter',
                fontWeight: '700',
                fontSize: '15px',
                border: 'none',
                borderRadius: '16px',
                cursor: 'pointer',
                marginTop: '22px'
              }}
            >
              Návrat na Dashboard
            </button>
          </div>
        )}

        {/* MODAL 8: Paywall Hra Pass */}
        {activeModal === 'paywall' && (
          <div style={{ textAlign: 'center' }}>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '14px' }}>
              <span style={{
                width: '54px',
                height: '54px',
                borderRadius: '50%',
                background: '#2A1E10',
                border: '2px solid #F5B73F',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 0 20px rgba(245,183,63,.4)'
              }}>
                <Crown size={28} style={{ color: '#F5B73F' }} />
              </span>
            </div>
            <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: '700', fontSize: '24px', color: '#fff' }}>
              Odemkni HRA PASS
            </div>
            <div style={{ fontFamily: 'Inter', fontSize: '13px', color: '#9A9AB5', marginTop: '6px', lineHeight: '1.45' }}>
              Získej přístup k prémiovým sezónním výzvám, unikátním odznakům a celému příběhu se Zayou.
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '16px', textAlign: 'left' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#1C1630', borderRadius: '12px', padding: '10px 12px' }}>
                <span style={{ color: '#F5B73F' }}><Sparkles size={16} /></span>
                <span style={{ fontFamily: 'Inter', fontSize: '12px', color: '#F0F0F8' }}>+12 exkluzivních výzev v sezóně</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#1C1630', borderRadius: '12px', padding: '10px 12px' }}>
                <span style={{ color: '#F5B73F' }}><Shield size={16} /></span>
                <span style={{ fontFamily: 'Inter', fontSize: '12px', color: '#F0F0F8' }}>Legendární a Epic odznaky do profilu</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#1C1630', borderRadius: '12px', padding: '10px 12px' }}>
                <span style={{ color: '#F5B73F' }}><Volume2 size={16} /></span>
                <span style={{ fontFamily: 'Inter', fontSize: '12px', color: '#F0F0F8' }}>Speciální efekty a zvuky v aplikaci</span>
              </div>
            </div>

            <div style={{
              background: '#2A1E10',
              border: '1px dashed #F5B73F',
              borderRadius: '16px',
              padding: '14px',
              marginTop: '18px'
            }}>
              <div style={{ fontFamily: 'Inter', fontSize: '12px', color: '#F5B73F' }}>Měsíční členství</div>
              <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: '700', fontSize: '26px', color: '#fff', marginTop: '4px' }}>
                149 Kč <span style={{ fontSize: '14px', color: '#9A9AB5', fontWeight: '500' }}>/ měsíc</span>
              </div>
              {/* TODO(klient): roční varianta — čeká na cenu a Stripe price ID od klienta.
                  Až budou známé, přidat sem přepínač Měsíčně/Ročně a druhý priceId níže. */}
            </div>

            <button
              onClick={async () => {
                track('pass_checkout_started');
                try {
                  const { data: { session } } = await supabase.auth.getSession();
                  if (!session) {
                    track('pass_checkout_blocked', { reason: 'no_session' });
                    alert('Pro aktivaci Hra Passu se prosím nejdřív přihlas.');
                    closeModal();
                    return;
                  }

                  const response = await fetch(`${process.env.REACT_APP_SUPABASE_URL}/functions/v1/stripe-checkout`, {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json',
                      'Authorization': `Bearer ${process.env.REACT_APP_SUPABASE_ANON_KEY}`
                    },
                    body: JSON.stringify({
                      // Potvrzeno klientem: měsíční předplatné 149 Kč/měsíc. REACT_APP_STRIPE_PRICE_ID
                      // musí ukazovat na odpovídající recurring Price v produkčním Stripe účtu.
                      // Roční varianta (druhý priceId) čeká na cenu od klienta — viz TODO výše
                      // u přepínače Měsíčně/Ročně.
                      priceId: process.env.REACT_APP_STRIPE_PRICE_ID || 'price_mock_founder_pass',
                      userId: session.user.id,
                      email: session.user.email,
                      type: 'SUBSCRIPTION',
                      successUrl: window.location.origin + '?payment=success',
                      cancelUrl: window.location.origin + '?payment=cancel'
                    })
                  });

                  const resData = await response.json();
                  if (resData.sessionUrl) {
                    window.location.href = resData.sessionUrl;
                  } else {
                    throw new Error(resData.error || 'Platební bránu se nepodařilo inicializovat.');
                  }
                } catch (err) {
                  // No fail-open free grant here: pass_holder is set ONLY by the
                  // stripe-webhook edge function after a real, verified payment.
                  console.warn('Stripe checkout call failed.', err);
                  track('pass_checkout_failed', { error: String(err?.message || err) });
                  alert('Platbu se nepodařilo zahájit. Zkus to prosím znovu později.');
                }
              }}
              style={{
                width: '100%',
                height: '48px',
                background: '#F5B73F',
                color: '#2A1E10',
                fontFamily: 'Inter',
                fontWeight: '700',
                fontSize: '15px',
                border: 'none',
                borderRadius: '16px',
                cursor: 'pointer',
                marginTop: '18px'
              }}
            >
              Aktivovat HRA PASS
            </button>

            <div style={{ fontFamily: 'Inter', fontSize: '11px', color: '#6B6B8A', textAlign: 'center', marginTop: '10px', lineHeight: '1.5' }}>
              Nákupem souhlasíš s <a href="/terms" style={{ color: '#9A9AB5', textDecoration: 'underline' }}>Obchodními podmínkami</a> a <a href="/privacy" style={{ color: '#9A9AB5', textDecoration: 'underline' }}>Zásadami ochrany osobních údajů</a>.
            </div>
          </div>
        )}

        {/* MODAL 9: Settings */}
        {activeModal === 'settings' && (
          <div>
            <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: '700', fontSize: '18px', color: '#fff', marginBottom: '14px' }}>
              Nastavení
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div>
                <label style={{ fontFamily: 'Inter', fontSize: '11px', color: '#6B6B8A', textTransform: 'uppercase' }}>Přezdívka</label>
                <input 
                  type="text" 
                  value={tempName} 
                  onChange={(e) => setTempName(e.target.value)}
                  style={{
                    width: '100%',
                    height: '38px',
                    background: '#1C1630',
                    border: '0.5px solid #382C5C',
                    borderRadius: '10px',
                    padding: '0 12px',
                    color: '#fff',
                    fontFamily: 'Inter',
                    fontSize: '14px',
                    marginTop: '4px',
                    outline: 'none',
                    boxSizing: 'border-box'
                  }}
                />
              </div>

              <div style={{ marginTop: '6px' }}>
                <label style={{ fontFamily: 'Inter', fontSize: '11px', color: '#6B6B8A', textTransform: 'uppercase' }}>Tvůj Slib</label>
                <textarea 
                  value={tempPledge} 
                  onChange={(e) => setTempPledge(e.target.value)}
                  style={{
                    width: '100%',
                    height: '60px',
                    background: '#1C1630',
                    border: '0.5px solid #382C5C',
                    borderRadius: '10px',
                    padding: '8px 12px',
                    color: '#fff',
                    fontFamily: 'Inter',
                    fontSize: '13px',
                    marginTop: '4px',
                    resize: 'none',
                    outline: 'none',
                    boxSizing: 'border-box'
                  }}
                />
              </div>
            </div>

            <button 
              onClick={() => {
                updateUser({ name: tempName, pledge: tempPledge });
                alert('Profil byl uložen.');
                closeModal();
              }}
              style={{
                width: '100%',
                height: '40px',
                background: '#7C3AED',
                color: '#fff',
                fontFamily: 'Inter',
                fontWeight: '600',
                fontSize: '13px',
                border: 'none',
                borderRadius: '12px',
                cursor: 'pointer',
                marginTop: '18px'
              }}
            >
              Uložit nastavení
            </button>

            {user?.isAdmin && (
              <button 
                onClick={() => {
                  closeModal();
                  window.location.href = '/admin';
                }}
                style={{
                  width: '100%',
                  height: '40px',
                  background: '#1C1630',
                  border: '1px solid #382C5C',
                  color: '#A78BFA',
                  fontFamily: 'Inter',
                  fontWeight: '600',
                  fontSize: '13px',
                  borderRadius: '12px',
                  cursor: 'pointer',
                  marginTop: '10px'
                }}
              >
                Správa obsahu (Admin) 🛠️
              </button>
            )}

            <button
              onClick={() => {
                if (window.confirm('Opravdu chceš resetovat celou aplikaci a herní pokrok?')) {
                  resetProgress();
                  closeModal();
                }
              }}
              style={{
                width: '100%',
                height: '40px',
                background: 'transparent',
                color: '#EF4444',
                fontFamily: 'Inter',
                fontWeight: '600',
                fontSize: '13px',
                border: '1px solid #EF4444',
                borderRadius: '12px',
                cursor: 'pointer',
                marginTop: '10px'
              }}
            >
              Resetovat pokrok
            </button>

            <div style={{ display: 'flex', justifyContent: 'center', gap: '14px', marginTop: '18px' }}>
              <a href="/terms" style={{ fontFamily: 'Inter', fontSize: '12px', color: '#6B6B8A', textDecoration: 'underline' }}>Obchodní podmínky</a>
              <a href="/privacy" style={{ fontFamily: 'Inter', fontSize: '12px', color: '#6B6B8A', textDecoration: 'underline' }}>Ochrana osobních údajů</a>
            </div>
          </div>
        )}

        {/* MODAL 10: Notifications */}
        {activeModal === 'notifications' && (
          <div>
            <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: '700', fontSize: '18px', color: '#fff', marginBottom: '12px' }}>
              Upozornění
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div style={{ display: 'flex', gap: '10px', background: '#1C1630', borderRadius: '12px', padding: '12px', alignItems: 'center' }}>
                <Bell size={18} style={{ color: '#A78BFA' }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontFamily: 'Inter', fontWeight: '600', fontSize: '12px', color: '#fff' }}>Reset žebříčku</div>
                  <div style={{ fontFamily: 'Inter', fontSize: '10px', color: '#6B6B8A' }}>Reset proběhne za 2 dny. Pospěš si!</div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '10px', background: '#1C1630', borderRadius: '12px', padding: '12px', alignItems: 'center' }}>
                <Bell size={18} style={{ color: '#F5B73F' }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontFamily: 'Inter', fontWeight: '600', fontSize: '12px', color: '#fff' }}>Nová sezónní výzva</div>
                  <div style={{ fontFamily: 'Inter', fontSize: '10px', color: '#6B6B8A' }}>Zaya odemkla bonusový příběhový uzel.</div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* MODAL 11: Collections / Sbírky */}
        {activeModal === 'collections' && (() => {
          const ALL_CARDS = [
            { key: 'doer-mvp1', title: 'Doer', bg: '#241a3d', border: '#7C3AED', color: '#A78BFA' },
            { key: 'c-node-1-card', title: 'Ticho', bg: '#2A1E10', border: '#F5B73F', color: '#F5B73F' },
            { key: 'c-node-2-card', title: 'Detox', bg: '#1C2E24', border: '#22C55E', color: '#22C55E' },
            { key: 'c-npc-challenge-card', title: 'NPC Hero', bg: '#14223D', border: '#4AA8FF', color: '#4AA8FF' },
            { key: 'c-node-4-card', title: 'Strom', bg: '#241a3d', border: '#7C3AED', color: '#A78BFA' },
            { key: 'c-node-5-card', title: 'Kniha', bg: '#2A1E10', border: '#F5B73F', color: '#F5B73F' },
            { key: 'c-node-6-card', title: 'Zpráva', bg: '#1C2E24', border: '#22C55E', color: '#22C55E' },
            { key: 'c-node-7-card', title: 'Úsvit', bg: '#14223D', border: '#4AA8FF', color: '#4AA8FF' }
          ];

          const unlockedBadges = ALL_CARDS.filter(card => 
            unlockedCards.some(uc => uc.card_key === card.key) || card.key === 'doer-mvp1'
          );

          return (
            <div>
              <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: '700', fontSize: '18px', color: '#fff', marginBottom: '4px' }}>
                Moje sbírky
              </div>
              <div style={{ fontFamily: 'Inter', fontSize: '12px', color: '#6B6B8A', marginBottom: '14px' }}>
                Přehled všech tvých odznaků a artefaktů v Sezóně 0.
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {/* Odznaky Album */}
                <div style={{ background: '#1C1630', border: '0.5px solid #382C5C', borderRadius: '14px', padding: '12px' }}>
                  <div style={{ fontFamily: 'Inter', fontWeight: '600', fontSize: '12px', color: '#fff', marginBottom: '8px', display: 'flex', justifyContent: 'space-between' }}>
                    <span>Odznaky Rarity</span>
                    <span style={{ color: '#A78BFA' }}>{unlockedBadges.length} / {ALL_CARDS.length}</span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px' }}>
                    {ALL_CARDS.map((card) => {
                      const isUnlocked = unlockedCards.some(uc => uc.card_key === card.key) || card.key === 'doer-mvp1';
                      if (isUnlocked) {
                        return (
                          <div 
                            key={card.key}
                            style={{ 
                              aspectRatio: '1', 
                              borderRadius: '8px', 
                              background: card.bg, 
                              border: `1px solid ${card.border}`, 
                              display: 'flex', 
                              flexDirection: 'column',
                              alignItems: 'center', 
                              justifyContent: 'center',
                              padding: '4px'
                            }} 
                            title={card.title}
                          >
                            <Shield size={16} style={{ color: card.color }} />
                            <span style={{ fontSize: '9px', color: '#fff', marginTop: '4px', textAlign: 'center', whiteSpace: 'nowrap', overflow: 'hidden', width: '100%', textOverflow: 'ellipsis' }}>
                              {card.title}
                            </span>
                          </div>
                        );
                      } else {
                        return (
                          <div 
                            key={card.key}
                            style={{ 
                              aspectRatio: '1', 
                              borderRadius: '8px', 
                              background: '#15111E', 
                              border: '0.5px dashed #382C5C', 
                              display: 'flex', 
                              flexDirection: 'column',
                              alignItems: 'center', 
                              justifyContent: 'center',
                              opacity: 0.45 
                            }}
                            title="Zamčeno"
                          >
                            <Lock size={12} style={{ color: '#4A3D6E' }} />
                            <span style={{ fontSize: '9px', color: '#4A3D6E', marginTop: '4px' }}>Locked</span>
                          </div>
                        );
                      }
                    })}
                  </div>
                </div>

                {/* Artefakty Album */}
                <div style={{ background: '#1C1630', border: '0.5px solid #382C5C', borderRadius: '14px', padding: '12px' }}>
                  <div style={{ fontFamily: 'Inter', fontWeight: '600', fontSize: '12px', color: '#fff', marginBottom: '8px' }}>
                    Odemčené Artefakty
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {unlockedBadges.map((badge) => (
                      <div key={badge.key} style={{ display: 'flex', gap: '8px', alignItems: 'center', background: '#241C3C', borderRadius: '8px', padding: '8px' }}>
                        <span style={{ width: '22px', height: '22px', borderRadius: '4px', background: '#1C1630', border: `1px solid ${badge.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><KeyRound size={12} style={{ color: badge.color }} /></span>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontFamily: 'Inter', fontWeight: '600', fontSize: '11px', color: '#fff' }}>Karta: {badge.title}</div>
                          <div style={{ fontFamily: 'Inter', fontSize: '9px', color: '#6B6B8A' }}>Sezóna 0 · Získaná za splněnou výzvu</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          );
        })()}
      </div>
    </div>
  );
}
