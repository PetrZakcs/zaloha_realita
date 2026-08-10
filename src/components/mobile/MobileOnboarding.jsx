import { useState, useEffect } from 'react';
import { useUserStore } from '../../store/userStore';
import { DEFAULT_USER, MOBILE_ONBOARDING_STEPS } from '../../store/slices/authSlice';
import { Sparkles, Bot, Shield, Crown, Check } from 'lucide-react';
import EmailAuthForm from '../onboarding/EmailAuthForm';
import { GoogleIcon, DiscordIcon } from '../onboarding/AuthIcons';
import { setRememberMe } from '../../api/supabaseClient';

const RADIUS = 16;

// HANDOFF flow: 01 splash (logo/claim + Google/Discord/email auth, all on
// one screen) -> 02 intro (Zaya introduces herself + nickname, same screen)
// -> 03 slib (personal pledge, published as the first proof) -> 04 reward1
// (short auto-advancing badge+XP toast) -> 05 reward2 (full celebration +
// optional Hra Pass upsell -> Dashboard).
export default function MobileOnboarding() {
  const {
    user,
    onboardingStep,
    nextOnboardingStep,
    completeOnboarding,
    updateUser,
    submitPledge,
    login,
    openModal
  } = useUserStore();

  // Fields start empty — the suggested name/pledge shows only as a native
  // placeholder (DEFAULT_USER below) so it vanishes on the first keystroke
  // instead of having to be selected and deleted first.
  const [tempName, setTempName] = useState(user?.name && user.name !== DEFAULT_USER.name ? user.name : '');
  const [tempPledge, setTempPledge] = useState('');
  const [nameError, setNameError] = useState('');
  const [pledgeError, setPledgeError] = useState('');
  const [pendingProvider, setPendingProvider] = useState(null);
  // Applies to all 3 auth paths on the splash step, not just email — set
  // right before the actual sign-in call fires (see supabaseClient.js).
  const [rememberMe, setRememberMeChecked] = useState(true);

  useEffect(() => {
    if (user?.name && user.name !== DEFAULT_USER.name) {
      setTempName(user.name);
    }
  }, [user?.name]);

  // reward1 is a short auto-advancing toast (badge + XP, no button) — moves
  // on to reward2 by itself after a beat instead of waiting for a tap.
  useEffect(() => {
    if (onboardingStep !== 'reward1') return;
    const t = setTimeout(() => nextOnboardingStep(true), 2000);
    return () => clearTimeout(t);
  }, [onboardingStep, nextOnboardingStep]);

  const handleNicknameSubmit = () => {
    if (!tempName.trim()) { setNameError('Zadej svou přezdívku.'); return; }
    updateUser({ name: tempName.trim() });
    nextOnboardingStep(true);
  };

  const handlePledgeSubmit = () => {
    if (!tempPledge.trim()) { setPledgeError('Napiš svůj slib — ať máš co sdílet.'); return; }
    submitPledge(tempPledge.trim());
    nextOnboardingStep(true);
  };

  const handleOAuthClick = async (provider) => {
    setPendingProvider(provider);
    setRememberMe(rememberMe);
    const result = await login(provider);
    // OAuth navigates away on success, so this only really resolves on
    // failure (or for the local-only fallback) — reset the button either way.
    if (!result?.success) setPendingProvider(null);
  };

  const progressIndex = MOBILE_ONBOARDING_STEPS.indexOf(onboardingStep);

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
      <style>{`@keyframes iwauStepFade { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }`}</style>

      {progressIndex !== -1 && (
        <div style={{ width: '100%', maxWidth: '350px', display: 'flex', gap: '7px', justifyContent: 'center', flexShrink: 0, marginBottom: '24px' }}>
          {MOBILE_ONBOARDING_STEPS.map((step, i) => (
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

      {/* key={onboardingStep} restarts the fade on every step change — the
          swap between conditional blocks below is otherwise a hard cut. */}
      <div key={onboardingStep} style={{ flex: 1, minHeight: 0, width: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', animation: 'iwauStepFade .32s cubic-bezier(.16,1,.3,1)' }}>

        {/* 01 · Splash — logo, claim, and all 3 auth paths on one screen. */}
        {onboardingStep === 'splash' && (
          <div style={{ width: '100%', maxWidth: '350px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '14px', textAlign: 'center', marginBottom: '6px' }}>
              <span style={{ display: 'inline-flex', width: '52px', height: '52px', filter: 'drop-shadow(0 0 18px rgba(124,58,237,.55))' }}>
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
              <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: '700', fontSize: '28px', color: '#F0F0F8', letterSpacing: '.02em', lineHeight: 1.1 }}>
                HRA <span style={{ color: '#A78BFA' }}>REALITY</span>
              </div>
              <div style={{ fontFamily: 'Inter', fontSize: '14px', color: '#9A9AB5', lineHeight: '1.5' }}>
                Přestaň jen sledovat svůj život.<br />
                <span style={{ color: '#A78BFA', fontWeight: '600' }}>Začni ho hrát.</span>
              </div>
            </div>

            <button onClick={() => handleOAuthClick('google')} disabled={pendingProvider === 'google'} style={oauthButtonStyle(pendingProvider === 'google')}>
              <GoogleIcon size={18} /> {pendingProvider === 'google' ? 'Připojuji…' : 'Pokračovat přes Google'}
            </button>
            <button onClick={() => handleOAuthClick('discord')} disabled={pendingProvider === 'discord'} style={oauthButtonStyle(pendingProvider === 'discord')}>
              <DiscordIcon size={18} /> {pendingProvider === 'discord' ? 'Připojuji…' : 'Pokračovat přes Discord'}
            </button>

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', margin: '2px 0' }}>
              <div style={{ flex: 1, height: '1px', background: '#382C5C' }}></div>
              <span style={{ color: '#6B6B8A', fontSize: '12px', fontFamily: 'Inter' }}>NEBO E-MAILEM</span>
              <div style={{ flex: 1, height: '1px', background: '#382C5C' }}></div>
            </div>

            <EmailAuthForm radius={RADIUS} rememberMe={rememberMe} />

            <button
              type="button"
              onClick={() => setRememberMeChecked(v => !v)}
              style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'transparent', border: 'none', cursor: 'pointer', padding: '2px 0', alignSelf: 'center' }}
            >
              <span style={{
                width: '16px', height: '16px', borderRadius: '4px', border: `1.5px solid ${rememberMe ? '#7C3AED' : '#382C5C'}`,
                background: rememberMe ? '#7C3AED' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
              }}>
                {rememberMe && <Check size={11} color="#fff" strokeWidth={3} />}
              </span>
              <span style={{ color: '#9A9AB5', fontSize: '12px', fontFamily: 'Inter' }}>Zapamatovat si mě na tomto zařízení</span>
            </button>
          </div>
        )}

        {/* 02 · Onboarding — Emoční intro. Zaya se představí + hráč rovnou
            zadá přezdívku na téže obrazovce (žádná samostatná stránka). */}
        {onboardingStep === 'intro' && (
          <div style={{ width: '100%', maxWidth: '350px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div style={{
              borderRadius: '16px',
              border: '1px solid #382C5C',
              background: 'repeating-linear-gradient(135deg,#1C1630,#1C1630 10px,#241C3C 10px,#241C3C 20px)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              padding: '24px',
              gap: '12px',
              textAlign: 'center'
            }}>
              <span style={{
                width: '48px', height: '48px', borderRadius: '50%', background: '#241a3d', border: '1.5px solid #7C3AED',
                display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 18px rgba(124,58,237,.35)'
              }}>
                <Bot size={22} color="#A78BFA" />
              </span>
              <div style={{ color: '#7C3AED', fontSize: '11px', letterSpacing: '2px', fontFamily: "'JetBrains Mono', monospace" }}>ZAYA_SYSTEM // CONNECTED</div>
              <div style={{ color: '#F0F0F8', fontSize: '18px', fontWeight: '700', fontFamily: "'Space Grotesk', sans-serif" }}>
                Ahoj. Jsem Zaya — budu tě provázet.
              </div>
              <div style={{ color: '#9A9AB5', fontSize: '13px', lineHeight: '1.55', fontFamily: 'Inter' }}>
                Tohle není další appka, kterou smažeš za týden. Každý den ti dám jednu reálnou výzvu — splníš ji ve skutečném světě, ne v telefonu.
              </div>
            </div>

            <div>
              <div style={{ color: '#F0F0F8', fontSize: '15px', fontWeight: '600', fontFamily: 'Inter', marginBottom: '10px' }}>Jak ti mám říkat?</div>
              <input
                type="text"
                value={tempName}
                onChange={(e) => { setTempName(e.target.value); if (nameError) setNameError(''); }}
                placeholder={DEFAULT_USER.name}
                style={{
                  width: '100%',
                  height: '48px',
                  background: '#2A2142',
                  border: `1px solid ${nameError ? '#EF4444' : '#7C3AED'}`,
                  borderRadius: `${RADIUS}px`,
                  color: '#F0F0F8',
                  padding: '0 16px',
                  fontSize: '16px',
                  outline: 'none',
                  boxSizing: 'border-box'
                }}
              />
              {nameError && (
                <div style={{ color: '#EF4444', fontSize: '12px', fontFamily: 'Inter', marginTop: '8px' }}>{nameError}</div>
              )}
            </div>

            <button onClick={handleNicknameSubmit} style={primaryButtonStyle}>
              Pokračovat
            </button>
          </div>
        )}

        {/* 03 · Onboarding — Slib. Osobní závazek, ke kterému se appka
            později může vracet — a zároveň hráčův první reálný proof
            (viz submitPledge v authSlice.js, publikuje se do feedu). */}
        {onboardingStep === 'slib' && (
          <div style={{ width: '100%', maxWidth: '350px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div style={{ color: '#F0F0F8', fontSize: '24px', fontWeight: '700', textAlign: 'center', fontFamily: "'Space Grotesk', sans-serif" }}>Tvůj slib</div>
            <div style={{ color: '#9A9AB5', fontSize: '14px', textAlign: 'center', fontFamily: 'Inter' }}>
              Zavaž se k akci, ne jen k teorii — Zaya se k tomuhle slibu ještě vrátí.
            </div>

            <textarea
              value={tempPledge}
              onChange={(e) => { setTempPledge(e.target.value); if (pledgeError) setPledgeError(''); }}
              placeholder={DEFAULT_USER.pledge}
              rows={4}
              style={{
                width: '100%',
                background: '#2A2142',
                border: `1px solid ${pledgeError ? '#EF4444' : '#7C3AED'}`,
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
            {pledgeError && (
              <div style={{ color: '#EF4444', fontSize: '12px', fontFamily: 'Inter' }}>{pledgeError}</div>
            )}

            <button onClick={handlePledgeSubmit} style={primaryButtonStyle}>
              Zveřejnit a pokračovat
            </button>
          </div>
        )}

        {/* 04 · Reward Moment (první) — krátký auto-toast, žádné tlačítko. */}
        {onboardingStep === 'reward1' && (
          <div style={{ width: '100%', maxWidth: '350px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '14px', textAlign: 'center' }}>
            <div style={{
              width: '92px', height: '92px', borderRadius: '50%', background: 'linear-gradient(150deg,#241a3d,#1C1630)',
              border: '1.5px solid #A78BFA', display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 0 28px rgba(167,139,250,.45)', animation: 'ringPulse 1.6s ease-out infinite'
            }}>
              <Shield size={40} color="#A78BFA" />
            </div>
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '11px', letterSpacing: '.12em', color: '#A78BFA', textTransform: 'uppercase' }}>
              Odznak Doer odemčen
            </div>
            <div style={{
              fontFamily: "'Space Grotesk', sans-serif", fontWeight: '700', fontSize: '48px', color: '#4AA8FF',
              textShadow: '0 0 20px rgba(74,168,255,.7), 0 0 40px rgba(59,130,246,.4)'
            }}>
              +10 XP
            </div>
          </div>
        )}

        {/* 05 · Reward Moment (druhý) — plná oslavná karta, volitelný Hra
            Pass upsell, CTA na Dashboard (completeOnboarding). */}
        {onboardingStep === 'reward2' && (
          <div style={{ width: '100%', maxWidth: '350px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '18px', textAlign: 'center' }}>
            <Sparkles size={48} color="#A78BFA" />
            <div>
              <div style={{ color: '#F0F0F8', fontSize: '26px', fontWeight: '700', fontFamily: "'Space Grotesk', sans-serif" }}>Vítej v Hře Reality!</div>
              <div style={{ color: '#9A9AB5', fontSize: '14px', fontFamily: 'Inter', marginTop: '8px' }}>
                Máš prvních 10 XP a klíč od Uzlu 1. Tvá první výzva čeká na nástěnce.
              </div>
            </div>

            <div style={{
              width: '100%', background: '#241C3C', border: '1px dashed #F5B73F', borderRadius: '16px',
              padding: '14px', display: 'flex', flexDirection: 'column', gap: '8px', textAlign: 'left'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Crown size={16} color="#F5B73F" />
                <span style={{ fontFamily: 'Inter', fontWeight: '600', fontSize: '13px', color: '#F0F0F8' }}>Volitelné: Hra Pass</span>
              </div>
              <div style={{ fontFamily: 'Inter', fontSize: '12px', color: '#9A9AB5', lineHeight: '1.5' }}>
                Prémiové výzvy, exkluzivní odznaky a celý příběh se Zayou — 149 Kč / měsíc.
              </div>
              <button
                onClick={() => { completeOnboarding(); openModal('paywall'); }}
                style={{
                  alignSelf: 'flex-start', background: 'transparent', border: 'none', color: '#F5B73F',
                  fontFamily: 'Inter', fontWeight: '600', fontSize: '12px', cursor: 'pointer', padding: 0, marginTop: '2px'
                }}
              >
                Zjistit více →
              </button>
            </div>

            <button onClick={() => completeOnboarding()} style={primaryButtonStyle}>
              Otevřít hlavní panel
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
