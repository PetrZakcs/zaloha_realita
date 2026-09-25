import { useState, useEffect } from 'react';
import { useUserStore } from '../../store/userStore';
import { track } from '../../lib/analytics';
import { getAvatarLevel } from '../../lib/avatarLevels';
import { ALL_CARDS, findCard } from '../../lib/cards';
import { MOBILE_ONBOARDING_STEPS } from '../../store/slices/authSlice';
import { Radio, Sparkles, Gift, Crown, Share, ArrowDown, ArrowUp } from 'lucide-react';
import EmailAuthForm from '../onboarding/EmailAuthForm';
import { GoogleIcon, DiscordIcon } from '../onboarding/AuthIcons';
import { EXTRA_OAUTH_PROVIDERS } from '../../lib/authProviders';
import { usePwaInstall } from '../../hooks/usePwaInstall';

const RADIUS = 16;

// MVP1 spec-3 flow: entry (binary choice, no session) -> first-reward (local-only XP
// preview, no session) -> login (the only step touching Supabase Auth) -> avatar-upgrade
// (post-login beat) -> mystery-box (reveals the starter card) -> slib (pledge, published as
// the first real proof) -> reward2 (celebration + optional Hra Pass upsell -> Dashboard).
// See MOBILE_ONBOARDING_STEPS in authSlice.js for the authoritative step list/rationale.
export default function MobileOnboarding() {
  const {
    user,
    onboardingStep,
    nextOnboardingStep,
    completeOnboarding,
    submitPledge,
    login,
    openModal
  } = useUserStore();
  const { isIOS, isInstalled: pwaInstalled } = usePwaInstall();

  const [tempPledge, setTempPledge] = useState('');
  const [pledgeError, setPledgeError] = useState('');
  const [pendingProvider, setPendingProvider] = useState(null);
  const [boxOpened, setBoxOpened] = useState(false);

  // first-reward and avatar-upgrade are short auto-advancing beats — spec-3's own timing
  // rule ("žádný dead time", whole onboarding max 90-110s) means these must not wait on a
  // tap. mystery-box and slib DO wait for a tap (opening the box, writing the pledge) —
  // those are the moments spec explicitly wants to feel like a real action, not a beat.
  useEffect(() => {
    if (onboardingStep !== 'first-reward' && onboardingStep !== 'avatar-upgrade') return;
    const t = setTimeout(() => nextOnboardingStep(true), onboardingStep === 'first-reward' ? 1800 : 1400);
    return () => clearTimeout(t);
  }, [onboardingStep, nextOnboardingStep]);

  const handleEntryChoice = (choice) => {
    track('entry_choice', { choice });
    nextOnboardingStep(true);
  };

  const handlePledgeSubmit = () => {
    if (!tempPledge.trim()) { setPledgeError('Napiš svůj slib — ať máš co sdílet.'); return; }
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
  const starterCard = findCard('doer-mvp1');

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

        {/* 01 · Entry — hero + instinctive binary choice. No session yet. */}
        {onboardingStep === 'entry' && (
          <div style={{ width: '100%', maxWidth: '350px', display: 'flex', flexDirection: 'column', gap: '22px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '14px', textAlign: 'center' }}>
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
              <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: '700', fontSize: '26px', color: '#F0F0F8', letterSpacing: '.02em', lineHeight: 1.1 }}>
                HRA <span style={{ color: '#A78BFA' }}>REALITY</span>
              </div>
              <div style={{ fontFamily: 'Inter', fontSize: '14px', color: '#9A9AB5', lineHeight: '1.5' }}>
                Tohle není hra. Vyber instinktivně:
              </div>
            </div>

            <button onClick={() => handleEntryChoice('stagnuju')} style={{ ...oauthButtonStyle(false), height: '58px', flexDirection: 'column', gap: '2px' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: '700' }}><ArrowDown size={16} color="#EF4444" /> Mám pocit, že stagnuju</span>
            </button>
            <button onClick={() => handleEntryChoice('posouvam')} style={{ ...oauthButtonStyle(false), height: '58px', flexDirection: 'column', gap: '2px' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: '700' }}><ArrowUp size={16} color="#22C55E" /> Mám pocit, že se posouvám</span>
            </button>
          </div>
        )}

        {/* 02 · First reward — local-only preview, nothing persisted (no account exists
            yet). Auto-advances (see useEffect above). */}
        {onboardingStep === 'first-reward' && (
          <div style={{ width: '100%', maxWidth: '350px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '14px', textAlign: 'center' }}>
            <div style={{
              width: '92px', height: '92px', borderRadius: '50%', background: 'linear-gradient(150deg,#241a3d,#1C1630)',
              border: '1.5px solid #A78BFA', display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 0 28px rgba(167,139,250,.45)', animation: 'ringPulse 1.6s ease-out infinite'
            }}>
              <Radio size={40} color="#A78BFA" />
            </div>
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '11px', letterSpacing: '.12em', color: '#A78BFA', textTransform: 'uppercase' }}>
              Signál zachycen
            </div>
            <div style={{ fontFamily: 'Inter', fontSize: '13px', color: '#9A9AB5', lineHeight: '1.5' }}>
              98 % lidí tohle ignoruje. Ty ne.
            </div>
            <div style={{
              fontFamily: "'Space Grotesk', sans-serif", fontWeight: '700', fontSize: '44px', color: '#4AA8FF',
              textShadow: '0 0 20px rgba(74,168,255,.7), 0 0 40px rgba(59,130,246,.4)'
            }}>
              +50 XP
            </div>
            <div style={{ fontFamily: 'Inter', fontWeight: '600', fontSize: '12px', color: '#F0F0F8' }}>
              Status: Pozorovatel · Level 1
            </div>
          </div>
        )}

        {/* 03 · Login — the only step that touches Supabase Auth. Reframed per spec-3:
            "ulož si tenhle moment", not a generic signup gate. */}
        {onboardingStep === 'login' && (
          <div style={{ width: '100%', maxWidth: '350px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px', textAlign: 'center', marginBottom: '6px' }}>
              <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: '700', fontSize: '22px', color: '#F0F0F8' }}>
                Ulož svůj postup
              </div>
              <div style={{ fontFamily: 'Inter', fontSize: '13px', color: '#9A9AB5', lineHeight: '1.5' }}>
                Pokud teď odejdeš, tenhle moment se neuloží.
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
          </div>
        )}

        {/* 04 · Avatar upgrade — short post-login beat. Stav 0 (NPC, šedá) -> Stav 1
            (Pozorovatel, glow) using the same avatar-level styling as Profil/Inventář
            (src/lib/avatarLevels.js) — narrative-only here, not tied to the real
            avatar_level column (that's already 1 in the DB by this point regardless).
            Auto-advances. */}
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

        {/* 05 · Mystery box — reveals the always-unlocked starter card (see
            src/lib/cards.js — 'doer-mvp1' is granted to every account implicitly). Requires
            a tap to open, matching spec-3's "otevření" beat rather than auto-advancing. */}
        {onboardingStep === 'mystery-box' && (
          <div style={{ width: '100%', maxWidth: '350px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '18px', textAlign: 'center' }}>
            {!boxOpened ? (
              <div onClick={() => setBoxOpened(true)} style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}>
                <div style={{
                  width: '110px', height: '110px', borderRadius: '20px', background: 'linear-gradient(150deg,#241a3d,#1C1630)',
                  border: '1.5px dashed #A78BFA', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  boxShadow: '0 0 24px rgba(167,139,250,.35)'
                }}>
                  <Gift size={44} color="#A78BFA" />
                </div>
                <div style={{ fontFamily: 'Inter', fontWeight: '600', fontSize: '14px', color: '#F0F0F8' }}>Klepnutím otevři svůj první drop</div>
              </div>
            ) : (
              <>
                <div style={{
                  width: '110px', height: '110px', borderRadius: '20px', background: starterCard?.bg || '#241a3d',
                  border: `2px solid ${starterCard?.border || '#7C3AED'}`, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  boxShadow: `0 0 28px ${starterCard?.border || '#7C3AED'}55`, animation: 'iwauStepFade .4s cubic-bezier(.16,1,.3,1)'
                }}>
                  <span style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: '700', fontSize: '15px', color: starterCard?.color || '#A78BFA' }}>{starterCard?.title || 'Doer'}</span>
                </div>
                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '11px', letterSpacing: '.1em', color: '#A78BFA', textTransform: 'uppercase' }}>
                  Získal/a jsi kartu
                </div>
                <div style={{ fontFamily: 'Inter', fontSize: '13px', color: '#9A9AB5' }}>1 / {ALL_CARDS.length} ve tvém Inventáři</div>
                <button onClick={() => nextOnboardingStep(true)} style={primaryButtonStyle}>Pokračovat</button>
              </>
            )}
          </div>
        )}

        {/* 06 · Slib — osobní závazek, ke kterému se appka později může vracet — a
            zároveň hráčův první reálný proof (viz submitPledge v authSlice.js). */}
        {onboardingStep === 'slib' && (
          <div style={{ width: '100%', maxWidth: '350px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div style={{ color: '#F0F0F8', fontSize: '24px', fontWeight: '700', textAlign: 'center', fontFamily: "'Space Grotesk', sans-serif" }}>Tvůj slib</div>
            <div style={{ color: '#9A9AB5', fontSize: '14px', textAlign: 'center', fontFamily: 'Inter' }}>
              Zavaž se k akci, ne jen k teorii — Zaya se k tomuhle slibu ještě vrátí.
            </div>

            <textarea
              value={tempPledge}
              onChange={(e) => { setTempPledge(e.target.value); if (pledgeError) setPledgeError(''); }}
              placeholder="Jsem člověk, co…"
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

        {/* 07 · Reward2 — plná oslavná karta, volitelný Hra Pass upsell, CTA na Dashboard. */}
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

            {/* iOS Safari has no beforeinstallprompt API — the Share sheet is
                the only way to add to Home Screen there, so this has to be
                explicit instructions, not a button. */}
            {isIOS && !pwaInstalled && (
              <div style={{
                width: '100%', background: '#1C1630', border: '0.5px solid #382C5C', borderRadius: '14px',
                padding: '12px 14px', display: 'flex', alignItems: 'center', gap: '10px', textAlign: 'left'
              }}>
                <Share size={18} color="#A78BFA" style={{ flexShrink: 0 }} />
                <span style={{ fontFamily: 'Inter', fontSize: '12px', color: '#F0F0F8' }}>
                  Přidej si appku na plochu: klepni na <strong>Sdílet</strong> a pak <strong>Přidat na plochu</strong>.
                </span>
              </div>
            )}

            <button onClick={() => completeOnboarding()} style={primaryButtonStyle}>
              Otevřít hlavní panel
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
