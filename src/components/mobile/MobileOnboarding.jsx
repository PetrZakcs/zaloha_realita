import { useState, useEffect } from 'react';
import { useUserStore } from '../../store/userStore';
import { getAvatarLevel } from '../../lib/avatarLevels';
import { MOBILE_ONBOARDING_STEPS } from '../../store/slices/authSlice';
import EmailAuthForm from '../onboarding/EmailAuthForm';
import { GoogleIcon, DiscordIcon } from '../onboarding/AuthIcons';
import { EXTRA_OAUTH_PROVIDERS } from '../../lib/authProviders';
import { EntryStep, LandingStep, FirstRewardStep, FirstDropStep, IdentityStep, TransitionStep } from '../onboarding/OnboardingExtraSteps';

const RADIUS = 16;

// Spec-14 flow, see MOBILE_ONBOARDING_STEPS in authSlice.js for the step list and rationale.
export default function MobileOnboarding() {
  const {
    user,
    onboardingStep,
    nextOnboardingStep,
    submitPledge,
    login
  } = useUserStore();

  const [tempPledge, setTempPledge] = useState('');
  const [pledgeError, setPledgeError] = useState('');
  const [pendingProvider, setPendingProvider] = useState(null);

  // avatar-upgrade is a short auto-advancing beat (spec timing 700–1000 ms, "žádný dead time").
  useEffect(() => {
    if (onboardingStep !== 'avatar-upgrade') return undefined;
    const t = setTimeout(() => nextOnboardingStep(true), 1000);
    return () => clearTimeout(t);
  }, [onboardingStep, nextOnboardingStep]);

  const handlePledgeSubmit = () => {
    if (!tempPledge.trim()) { setPledgeError('Napiš jednu větu — nebo tenhle krok přeskoč.'); return; }
    submitPledge(tempPledge.trim());
    nextOnboardingStep(true);
  };

  const handleOAuthClick = async (provider) => {
    setPendingProvider(provider);
    const result = await login(provider);
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

  const level0 = getAvatarLevel(0);
  const level1 = getAvatarLevel(1);

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
        <div style={{ width: '100%', maxWidth: '350px', display: 'flex', gap: '6px', justifyContent: 'center', flexShrink: 0, marginBottom: '24px' }}>
          {MOBILE_ONBOARDING_STEPS.map((step, i) => (
            <span key={step} style={{
              width: i === progressIndex ? '22px' : '7px',
              height: '7px',
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

        {onboardingStep === 'landing' && <LandingStep onEnter={() => nextOnboardingStep(true)} />}

        {/* Login — the only step that touches Supabase Auth. */}
        {onboardingStep === 'login' && (
          <div style={{ width: '100%', maxWidth: '350px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px', textAlign: 'center', marginBottom: '6px' }}>
              <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: '700', fontSize: '22px', color: '#F0F0F8' }}>
                Vstup do hry
              </div>
              <div style={{ fontFamily: 'Inter', fontSize: '13px', color: '#9A9AB5', lineHeight: '1.5' }}>
                Tvůj postup se ukládá od první akce.
              </div>
            </div>

            <button onClick={() => handleOAuthClick('google')} disabled={pendingProvider === 'google'} style={oauthButtonStyle(pendingProvider === 'google')}>
              <GoogleIcon size={18} /> {pendingProvider === 'google' ? 'Připojuji…' : 'Pokračovat přes Google'}
            </button>
            <button onClick={() => handleOAuthClick('discord')} disabled={pendingProvider === 'discord'} style={oauthButtonStyle(pendingProvider === 'discord')}>
              <DiscordIcon size={18} /> {pendingProvider === 'discord' ? 'Připojuji…' : 'Pokračovat přes Discord'}
            </button>
            {EXTRA_OAUTH_PROVIDERS.map(p => (
              <button key={p.id} onClick={() => handleOAuthClick(p.id)} disabled={pendingProvider === p.id} style={oauthButtonStyle(pendingProvider === p.id)}>
                {pendingProvider === p.id ? 'Připojuji…' : `Pokračovat přes ${p.label}`}
              </button>
            ))}

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', margin: '2px 0' }}>
              <div style={{ flex: 1, height: '1px', background: '#382C5C' }}></div>
              <span style={{ color: '#6B6B8A', fontSize: '12px', fontFamily: 'Inter' }}>NEBO E-MAILEM</span>
              <div style={{ flex: 1, height: '1px', background: '#382C5C' }}></div>
            </div>

            <EmailAuthForm radius={RADIUS} />
            <div style={{ fontFamily: 'Inter', fontSize: '11px', color: '#6B6B8A', textAlign: 'center', lineHeight: '1.55' }}>
              Pokračováním souhlasíš s <a href="/terms" style={{ color: '#9A9AB5' }}>podmínkami</a> a <a href="/privacy" style={{ color: '#9A9AB5' }}>zpracováním údajů</a>.
            </div>
          </div>
        )}

        {onboardingStep === 'entry' && <EntryStep onNext={() => nextOnboardingStep(true)} />}
        {onboardingStep === 'identity' && <IdentityStep onNext={() => nextOnboardingStep(true)} />}
        {onboardingStep === 'first-reward' && <FirstRewardStep onNext={() => nextOnboardingStep(true)} />}

        {/* Avatar upgrade — Stav 0 (NPC, šedá) -> Stav 1 (Pozorovatel, glow), same styling as
            Profil/Inventář (src/lib/avatarLevels.js). Auto-advances. */}
        {onboardingStep === 'avatar-upgrade' && (
          <div style={{ width: '100%', maxWidth: '350px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px', textAlign: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '18px' }}>
              <span style={{
                width: '64px', height: '64px', borderRadius: '50%', background: '#241C3C',
                border: `${level0.borderWidth}px solid ${level0.border}`, opacity: 0.5,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: "'Space Grotesk', sans-serif", fontWeight: '700', fontSize: '20px', color: level0.color
              }}>
                {(user?.name || 'H').slice(0, 2).toUpperCase()}
              </span>
              <span style={{ color: '#6B6B8A', fontSize: '18px' }}>→</span>
              <span style={{
                width: '76px', height: '76px', borderRadius: '50%', background: '#241C3C',
                border: `${level1.borderWidth}px solid ${level1.border}`, boxShadow: `0 0 ${level1.glow}px ${level1.border}aa`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: "'Space Grotesk', sans-serif", fontWeight: '700', fontSize: '24px', color: level1.color,
                animation: 'ringPulse 1.6s ease-out infinite'
              }}>
                {(user?.name || 'H').slice(0, 2).toUpperCase()}
              </span>
            </div>
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '11px', letterSpacing: '.1em', color: '#A78BFA', textTransform: 'uppercase' }}>
              Status aktivován
            </div>
            <div style={{ fontFamily: 'Inter', fontSize: '13px', color: '#9A9AB5' }}>
              Tvoje identita se probouzí.
            </div>
          </div>
        )}

        {onboardingStep === 'mystery-box' && <FirstDropStep onNext={() => nextOnboardingStep(true)} />}

        {/* Onboarding proof (spec-14 §4) — jedna věta do 30–60 s, ve feedu má vlastní vzhled
            (type ONBOARDING). Za zveřejnění +1 klíč, jde přeskočit, ale pak bez klíče. */}
        {onboardingStep === 'slib' && (
          <div style={{ width: '100%', maxWidth: '350px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div style={{ color: '#F0F0F8', fontSize: '24px', fontWeight: '700', textAlign: 'center', fontFamily: "'Space Grotesk', sans-serif" }}>Tvůj první důkaz</div>
            <div style={{ color: '#9A9AB5', fontSize: '14px', textAlign: 'center', fontFamily: 'Inter' }}>
              Jedna věta. Uvidí ji ostatní hráči ve feedu a dostaneš za ni první klíč.
            </div>

            <textarea
              value={tempPledge}
              onChange={(e) => { setTempPledge(e.target.value); if (pledgeError) setPledgeError(''); }}
              placeholder="Jsem člověk, co…"
              rows={3}
              maxLength={280}
              aria-label="Tvůj první důkaz"
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
              Zveřejnit · +1 klíč
            </button>
            <button type="button" onClick={() => nextOnboardingStep(true)} style={{ background: 'none', border: 'none', color: '#6B6B8A', fontFamily: 'Inter', fontSize: '13px', cursor: 'pointer' }}>
              Přeskočit tento krok (bez klíče)
            </button>
          </div>
        )}

        {onboardingStep === 'transition' && <TransitionStep />}
      </div>
    </div>
  );
}
