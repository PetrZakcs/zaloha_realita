import { useState, useEffect } from 'react';
import { useUserStore } from '../../store/userStore';
import { MessageSquare, Globe, Sparkles } from 'lucide-react';

export default function OnboardingFlow() {
  const {
    user,
    onboardingStep,
    nextOnboardingStep,
    completeOnboarding,
    updateUser,
    login
  } = useUserStore();

  const [tempName, setTempName] = useState(user?.name || 'TemnýPozorovatel');
  const [tempPledge, setTempPledge] = useState('Jsem člověk, co přestal čekat a začal jednat.');

  useEffect(() => {
    if (user?.name) {
      setTempName(user.name);
    }
  }, [user?.name]);

  const handleNext = () => {
    if (onboardingStep === 'nickname') {
      updateUser({ name: tempName });
    }
    if (onboardingStep === 'slib') {
      updateUser({ pledge: tempPledge });
    }
    if (onboardingStep === 'reward') {
      completeOnboarding();
      return;
    }
    nextOnboardingStep();
  };

  return (
    <div style={{
      position: 'absolute',
      inset: 0,
      zIndex: 100,
      background: '#15111E',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      alignItems: 'center',
      padding: '20px'
    }}>
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
          <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: '700', fontSize: '38px', color: '#fff', letterSpacing: '.03em', lineHeight: 1.1 }}>
            HRA <span style={{ color: '#A78BFA' }}>REALITY</span>
          </div>
          <div style={{ fontFamily: 'Inter', fontSize: '15px', color: '#9A9AB5', lineHeight: '1.5' }}>
            Přestaň jen sledovat svůj život.<br />
            <span style={{ color: '#A78BFA', fontWeight: '600' }}>Začni ho hrát.</span>
          </div>
          <button 
            onClick={handleNext}
            style={{
              width: '100%',
              height: '48px',
              background: '#7C3AED',
              color: '#fff',
              fontFamily: 'Inter',
              fontWeight: '700',
              fontSize: '16px',
              border: 'none',
              borderRadius: '18px',
              cursor: 'pointer',
              marginTop: '16px'
            }}
          >
            Vstoupit do hry
          </button>
        </div>
      )}

      {/* Step 1: Intro Hook */}
      {onboardingStep === 'intro' && (
        <div style={{ width: '100%', maxWidth: '350px', display: 'flex', flexDirection: 'column', height: '100%' }}>
          <div style={{ display: 'flex', gap: '7px', justifyContent: 'center', marginBottom: '24px' }}>
            <span style={{ width: '24px', height: '8px', borderRadius: '4px', background: '#7C3AED' }}></span>
            <span style={{ width: '8px', height: '8px', borderRadius: '4px', background: '#382C5C' }}></span>
            <span style={{ width: '8px', height: '8px', borderRadius: '4px', background: '#382C5C' }}></span>
            <span style={{ width: '8px', height: '8px', borderRadius: '4px', background: '#382C5C' }}></span>
          </div>

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
            <div style={{ color: '#fff', fontSize: '20px', fontWeight: '700', textAlign: 'center', fontFamily: "'Space Grotesk', sans-serif", marginBottom: '16px' }}>
              "Svět okolo tebe usnul. Lidé žijí v autopiloti."
            </div>
            <div style={{ color: '#9A9AB5', fontSize: '14px', textAlign: 'center', fontFamily: 'Inter', lineHeight: '1.5' }}>
              Každý den plníš výzvy v reálném světě, posouváš své hranice a buduješ svou postavu.
            </div>
          </div>

          <button 
            onClick={handleNext}
            style={{
              width: '100%',
              height: '48px',
              background: '#7C3AED',
              color: '#fff',
              fontFamily: 'Inter',
              fontWeight: '700',
              fontSize: '16px',
              border: 'none',
              borderRadius: '18px',
              cursor: 'pointer',
              marginTop: '20px'
            }}
          >
            Chci hrát
          </button>
        </div>
      )}

      {/* Step 2: Login */}
      {onboardingStep === 'login' && (
        <div style={{ width: '100%', maxWidth: '350px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ color: '#fff', fontSize: '24px', fontWeight: '700', textAlign: 'center', fontFamily: "'Space Grotesk', sans-serif" }}>Vytvoř si profil</div>
          <div style={{ color: '#9A9AB5', fontSize: '14px', textAlign: 'center', fontFamily: 'Inter', marginBottom: '16px' }}>Pro uložení tvého postupu a odznaku doera.</div>

          <button 
            onClick={() => login('google')}
            style={{
              width: '100%',
              height: '48px',
              background: '#2A2142',
              border: '1px solid #382C5C',
              borderRadius: '14px',
              color: '#fff',
              fontWeight: '600',
              fontSize: '14px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '10px',
              cursor: 'pointer'
            }}
          >
            <Globe size={18} color="#4285F4" /> Pokračovat přes Google
          </button>
          
          <button
            onClick={() => login('discord')}
            style={{
              width: '100%',
              height: '48px',
              background: '#2A2142',
              border: '1px solid #382C5C',
              borderRadius: '14px',
              color: '#fff',
              fontWeight: '600',
              fontSize: '14px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '10px',
              cursor: 'pointer'
            }}
          >
            <MessageSquare size={18} color="#5865F2" /> Pokračovat přes Discord
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', margin: '8px 0' }}>
            <div style={{ flex: 1, height: '1px', background: '#382C5C' }}></div>
            <span style={{ color: '#6B6B8A', fontSize: '12px' }}>NEBO</span>
            <div style={{ flex: 1, height: '1px', background: '#382C5C' }}></div>
          </div>

          <button 
            onClick={() => login('guest')}
            style={{
              width: '100%',
              height: '44px',
              background: 'transparent',
              border: 'none',
              color: '#9A9AB5',
              fontSize: '13px',
              cursor: 'pointer'
            }}
          >
            Hrát jako anonymní host
          </button>
        </div>
      )}

      {/* Step 3: Nickname */}
      {onboardingStep === 'nickname' && (
        <div style={{ width: '100%', maxWidth: '350px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div style={{ color: '#fff', fontSize: '24px', fontWeight: '700', textAlign: 'center', fontFamily: "'Space Grotesk', sans-serif" }}>Jak ti máme říkat?</div>
          <div style={{ color: '#9A9AB5', fontSize: '14px', textAlign: 'center', fontFamily: 'Inter' }}>Tvoje přezdívka v síti Hry Reality.</div>

          <input 
            type="text" 
            value={tempName} 
            onChange={(e) => setTempName(e.target.value)} 
            placeholder="Tvá přezdívka"
            style={{
              width: '100%',
              height: '48px',
              background: '#2A2142',
              border: '1px solid #7C3AED',
              borderRadius: '14px',
              color: '#fff',
              padding: '0 16px',
              fontSize: '16px',
              outline: 'none'
            }}
          />

          <button 
            onClick={handleNext}
            style={{
              width: '100%',
              height: '48px',
              background: '#7C3AED',
              color: '#fff',
              fontWeight: '700',
              fontSize: '16px',
              border: 'none',
              borderRadius: '14px',
              cursor: 'pointer'
            }}
          >
            Uložit přezdívku
          </button>
        </div>
      )}

      {/* Step 4: Slib (Pledge) */}
      {onboardingStep === 'slib' && (
        <div style={{ width: '100%', maxWidth: '350px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div style={{ color: '#fff', fontSize: '24px', fontWeight: '700', textAlign: 'center', fontFamily: "'Space Grotesk', sans-serif" }}>Tůj slib Hráče</div>
          <div style={{ color: '#9A9AB5', fontSize: '14px', textAlign: 'center', fontFamily: 'Inter' }}>Zavaž se k akci, ne jen k teorii.</div>

          <textarea 
            value={tempPledge} 
            onChange={(e) => setTempPledge(e.target.value)}
            rows={4}
            style={{
              width: '100%',
              background: '#2A2142',
              border: '1px solid #7C3AED',
              borderRadius: '14px',
              color: '#fff',
              padding: '12px 16px',
              fontSize: '14px',
              outline: 'none',
              resize: 'none',
              lineHeight: '1.5'
            }}
          />

          <button 
            onClick={handleNext}
            style={{
              width: '100%',
              height: '48px',
              background: '#7C3AED',
              color: '#fff',
              fontWeight: '700',
              fontSize: '16px',
              border: 'none',
              borderRadius: '14px',
              cursor: 'pointer'
            }}
          >
            Potvrdit slib
          </button>
        </div>
      )}

      {/* Step 5: Reward */}
      {onboardingStep === 'reward' && (
        <div style={{ width: '100%', maxWidth: '350px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '20px', textAlign: 'center' }}>
          <Sparkles size={48} color="#A78BFA" />
          <div style={{ color: '#fff', fontSize: '26px', fontWeight: '700', fontFamily: "'Space Grotesk', sans-serif" }}>Vítej v Hře Reality!</div>
          <div style={{ color: '#9A9AB5', fontSize: '14px', fontFamily: 'Inter' }}>
            Získáváš prvních 10 XP a klíč od Uzlu 1. Tvá první výzva čeká na nástěnce.
          </div>

          <button 
            onClick={handleNext}
            style={{
              width: '100%',
              height: '48px',
              background: '#7C3AED',
              color: '#fff',
              fontWeight: '700',
              fontSize: '16px',
              border: 'none',
              borderRadius: '14px',
              cursor: 'pointer',
              marginTop: '10px'
            }}
          >
            Otevřít hlavní panel
          </button>
        </div>
      )}
    </div>
  );
}
