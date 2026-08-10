import { useState, useEffect } from 'react';
import { useUserStore } from '../../store/userStore';
import { DEFAULT_USER } from '../../store/slices/authSlice';
import { MessageSquare, Globe, Sparkles } from 'lucide-react';
import EmailAuthForm from '../onboarding/EmailAuthForm';

const RADIUS = 16;
// Steps shown in the progress indicator — everything except the full-bleed
// splash brand moment, which isn't part of the "fill this out" sequence.
const PROGRESS_STEPS = ['intro', 'login', 'nickname', 'slib', 'reward'];

export default function MobileOnboarding() {
  const {
    user,
    onboardingStep,
    setOnboardingStep,
    nextOnboardingStep,
    completeOnboarding,
    updateUser,
    submitPledge,
    login
  } = useUserStore();

  // Fields start empty — the suggested name/pledge shows only as a native
  // placeholder (DEFAULT_USER below) so it vanishes on the first keystroke
  // instead of having to be selected and deleted first.
  const [tempName, setTempName] = useState(user?.name && user.name !== DEFAULT_USER.name ? user.name : '');
  const [tempPledge, setTempPledge] = useState('');
  const [pendingProvider, setPendingProvider] = useState(null);

  useEffect(() => {
    if (user?.name && user.name !== DEFAULT_USER.name) {
      setTempName(user.name);
    }
  }, [user?.name]);

  const handleNext = () => {
    if (onboardingStep === 'nickname') {
      updateUser({ name: tempName.trim() || DEFAULT_USER.name });
    }
    if (onboardingStep === 'slib') {
      submitPledge(tempPledge.trim() || DEFAULT_USER.pledge);
    }
    if (onboardingStep === 'reward') {
      completeOnboarding();
      return;
    }
    nextOnboardingStep(true);
  };

  const handleOAuthClick = async (provider) => {
    setPendingProvider(provider);
    const result = await login(provider);
    // OAuth navigates away on success, so this only really resolves on
    // failure (or for the local-only fallback) — reset the button either way.
    if (!result?.success) setPendingProvider(null);
  };

  const progressIndex = PROGRESS_STEPS.indexOf(onboardingStep);

  const primaryButtonStyle = {
    width: '100%',
    height: '48px',
    background: '#7C3AED',
    color: '#fff',
    fontFamily: 'Inter',
    fontWeight: '700',
    fontSize: '16px',
    border: 'none',
    borderRadius: `${RADIUS}px`,
    cursor: 'pointer'
  };

  const oauthButtonStyle = (disabled) => ({
    width: '100%',
    height: '48px',
    background: '#2A2142',
    border: '1px solid #382C5C',
    borderRadius: `${RADIUS}px`,
    color: '#fff',
    fontWeight: '600',
    fontSize: '14px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '10px',
    cursor: disabled ? 'default' : 'pointer',
    opacity: disabled ? 0.6 : 1
  });

  return (
    <div style={{
      position: 'absolute',
      inset: 0,
      zIndex: 100,
      background: '#15111E',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      padding: '20px'
    }}>
      {/* Persistent progress header — was previously nested only inside the
          intro step's own markup, so it disappeared for the rest of the
          flow (login/nickname/slib/reward) and the whole thing read as one
          undifferentiated screen instead of a multi-step wizard. Hoisted
          here so it's shown consistently across every step except splash. */}
      {progressIndex !== -1 && (
        <div style={{ width: '100%', maxWidth: '350px', display: 'flex', gap: '7px', justifyContent: 'center', flexShrink: 0, marginBottom: '24px' }}>
          {PROGRESS_STEPS.map((step, i) => (
            <span key={step} style={{
              width: i === progressIndex ? '24px' : '8px',
              height: '8px',
              borderRadius: '4px',
              background: i <= progressIndex ? '#7C3AED' : '#382C5C',
              transition: 'all .2s'
            }} />
          ))}
        </div>
      )}

      <div style={{ flex: 1, minHeight: 0, width: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}>
      {/* Step 0: Splash */}
      {onboardingStep === 'splash' && (
        <div style={{ width: '100%', maxWidth: '350px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '24px', textAlign: 'center' }}>
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '11px', fontWeight: '500', letterSpacing: '.22em', color: '#A78BFA', border: '1px solid #3A2A6E', borderRadius: '20px', padding: '6px 16px' }}>
            PRE-LAUNCH
          </span>
          <span style={{ display: 'inline-flex', width: '64px', height: '64px', filter: 'drop-shadow(0 0 18px rgba(124,58,237,.55))' }}>
            <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ width: '100%', height: '100%' }}>
              <defs>
                <linearGradient id="iwg_splash" x1="8" y1="5" x2="40" y2="42" gradientUnits="userSpaceOnUse">
                  <stop offset="0" stopColor="#B24EE8" />
                  <stop offset="1" stopColor="#6E18A0" />
                </linearGradient>
              </defs>
              <path d="M11 5 L24 13 L37 5 L43 19 L35 42 L24 34 L13 42 L5 19 Z" fill="url(#iwg_splash)" stroke="url(#iwg_splash)" strokeWidth="3" strokeLinejoin="round" />
              <path d="M24 25 L24 11 M24 25 L13.5 36 M24 25 L34.5 36" fill="none" stroke="#fff" strokeWidth="5.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: '700', fontSize: '38px', color: '#F0F0F8', letterSpacing: '.03em', lineHeight: 1.1 }}>
            HRA <span style={{ color: '#A78BFA' }}>REALITY</span>
          </div>
          <div style={{ fontFamily: 'Inter', fontSize: '15px', color: '#9A9AB5', lineHeight: '1.5' }}>
            Přestaň jen sledovat svůj život.<br />
            <span style={{ color: '#A78BFA', fontWeight: '600' }}>Začni ho hrát.</span>
          </div>
          <button onClick={handleNext} style={{ ...primaryButtonStyle, marginTop: '16px' }}>
            Vstoupit do hry
          </button>
        </div>
      )}

      {/* Step 1: Intro Hook */}
      {onboardingStep === 'intro' && (
        <div style={{ width: '100%', maxWidth: '350px', display: 'flex', flexDirection: 'column', height: '100%' }}>
          <div style={{
            flex: 1,
            borderRadius: '16px',
            border: '1px solid #382C5C',
            background: 'repeating-linear-gradient(135deg,#1C1630,#1C1630 10px,#241C3C 10px,#241C3C 20px)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
            padding: '24px',
            position: 'relative'
          }}>
            <div style={{ color: '#7C3AED', fontSize: '11px', letterSpacing: '2px', fontFamily: "'JetBrains Mono', monospace", marginBottom: '16px' }}>ZAYA_SYSTEM // CONNECTED</div>
            <div style={{ color: '#F0F0F8', fontSize: '20px', fontWeight: '700', textAlign: 'center', fontFamily: "'Space Grotesk', sans-serif", marginBottom: '16px' }}>
              "Svět okolo tebe usnul. Lidé žijí v autopiloti."
            </div>
            <div style={{ color: '#9A9AB5', fontSize: '14px', textAlign: 'center', fontFamily: 'Inter', lineHeight: '1.5' }}>
              Každý den plníš výzvy v reálném světě, posouváš své hranice a buduješ svou postavu.
            </div>
          </div>

          <button onClick={handleNext} style={{ ...primaryButtonStyle, marginTop: '20px' }}>
            Chci hrát
          </button>
          <button
            onClick={() => setOnboardingStep('login')}
            style={{
              width: '100%',
              height: '44px',
              background: 'transparent',
              border: 'none',
              color: '#9A9AB5',
              fontFamily: 'Inter',
              fontSize: '13px',
              cursor: 'pointer',
              marginTop: '8px'
            }}
          >
            Mám už účet
          </button>
        </div>
      )}

      {/* Step 2: Login */}
      {onboardingStep === 'login' && (
        <div style={{ width: '100%', maxWidth: '350px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div style={{ color: '#F0F0F8', fontSize: '24px', fontWeight: '700', textAlign: 'center', fontFamily: "'Space Grotesk', sans-serif" }}>Vytvoř si profil</div>
          <div style={{ color: '#9A9AB5', fontSize: '14px', textAlign: 'center', fontFamily: 'Inter', marginBottom: '4px' }}>Pro uložení tvého postupu a odznaku doera.</div>

          <button onClick={() => handleOAuthClick('google')} disabled={pendingProvider === 'google'} style={oauthButtonStyle(pendingProvider === 'google')}>
            <Globe size={18} color="#4285F4" /> {pendingProvider === 'google' ? 'Připojuji…' : 'Pokračovat přes Google'}
          </button>

          <button onClick={() => handleOAuthClick('discord')} disabled={pendingProvider === 'discord'} style={oauthButtonStyle(pendingProvider === 'discord')}>
            <MessageSquare size={18} color="#5865F2" /> {pendingProvider === 'discord' ? 'Připojuji…' : 'Pokračovat přes Discord'}
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', margin: '4px 0' }}>
            <div style={{ flex: 1, height: '1px', background: '#382C5C' }}></div>
            <span style={{ color: '#6B6B8A', fontSize: '12px', fontFamily: 'Inter' }}>NEBO E-MAILEM</span>
            <div style={{ flex: 1, height: '1px', background: '#382C5C' }}></div>
          </div>

          <EmailAuthForm radius={RADIUS} />
        </div>
      )}

      {/* Step 3: Nickname */}
      {onboardingStep === 'nickname' && (
        <div style={{ width: '100%', maxWidth: '350px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div style={{ color: '#F0F0F8', fontSize: '24px', fontWeight: '700', textAlign: 'center', fontFamily: "'Space Grotesk', sans-serif" }}>Jak ti máme říkat?</div>
          <div style={{ color: '#9A9AB5', fontSize: '14px', textAlign: 'center', fontFamily: 'Inter' }}>Tvoje přezdívka v síti Hry Reality.</div>

          <input
            type="text"
            value={tempName}
            onChange={(e) => setTempName(e.target.value)}
            placeholder={DEFAULT_USER.name}
            style={{
              width: '100%',
              height: '48px',
              background: '#2A2142',
              border: '1px solid #7C3AED',
              borderRadius: `${RADIUS}px`,
              color: '#F0F0F8',
              padding: '0 16px',
              fontSize: '16px',
              outline: 'none',
              boxSizing: 'border-box'
            }}
          />

          <button onClick={handleNext} style={primaryButtonStyle}>
            Uložit přezdívku
          </button>
        </div>
      )}

      {/* Step 4: první výzva (do 60s) — dřív jen soukromý "slib" v profilu,
          teď reálná časově omezená mikro-výzva, která se rovnou publikuje
          do feedu (viz submitPledge v authSlice.js). */}
      {onboardingStep === 'slib' && (
        <div style={{ width: '100%', maxWidth: '350px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div style={{ alignSelf: 'center', fontFamily: "'JetBrains Mono', monospace", fontSize: '11px', fontWeight: '500', letterSpacing: '.14em', color: '#A78BFA', border: '1px solid #3A2A6E', borderRadius: '20px', padding: '5px 14px' }}>
            MIKRO-VÝZVA · 60 SEKUND
          </div>
          <div style={{ color: '#F0F0F8', fontSize: '24px', fontWeight: '700', textAlign: 'center', fontFamily: "'Space Grotesk', sans-serif" }}>Tvoje první výzva</div>
          <div style={{ color: '#9A9AB5', fontSize: '14px', textAlign: 'center', fontFamily: 'Inter' }}>Dokonči tuhle větu — hned se zveřejní ve Feedu ostatním hráčům.</div>

          <textarea
            value={tempPledge}
            onChange={(e) => setTempPledge(e.target.value)}
            placeholder={DEFAULT_USER.pledge}
            rows={4}
            style={{
              width: '100%',
              background: '#2A2142',
              border: '1px solid #7C3AED',
              borderRadius: `${RADIUS}px`,
              color: '#F0F0F8',
              padding: '12px 16px',
              fontSize: '14px',
              outline: 'none',
              resize: 'none',
              lineHeight: '1.5',
              boxSizing: 'border-box'
            }}
          />

          <button onClick={handleNext} style={primaryButtonStyle}>
            Zveřejnit a pokračovat
          </button>
        </div>
      )}

      {/* Step 5: Reward */}
      {onboardingStep === 'reward' && (
        <div style={{ width: '100%', maxWidth: '350px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '20px', textAlign: 'center' }}>
          <Sparkles size={48} color="#A78BFA" />
          <div style={{ color: '#F0F0F8', fontSize: '26px', fontWeight: '700', fontFamily: "'Space Grotesk', sans-serif" }}>Vítej v Hře Reality!</div>
          <div style={{ color: '#9A9AB5', fontSize: '14px', fontFamily: 'Inter' }}>
            Získáváš prvních 10 XP a klíč od Uzlu 1. Tvá první výzva čeká na nástěnce.
          </div>

          <button onClick={handleNext} style={{ ...primaryButtonStyle, marginTop: '10px' }}>
            Otevřít hlavní panel
          </button>
        </div>
      )}
      </div>
    </div>
  );
}
