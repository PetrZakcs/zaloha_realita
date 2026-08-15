import { useState, useEffect } from 'react';
import { useUserStore } from '../../store/userStore';
import { track } from '../../lib/analytics';
import { getAvatarLevel } from '../../lib/avatarLevels';
import { ALL_CARDS, findCard } from '../../lib/cards';
import { DESKTOP_ONBOARDING_STEPS } from '../../store/slices/authSlice';
import { Sparkles, MonitorDown, Check, Radio, Gift, Crown, ArrowDown, ArrowUp } from 'lucide-react';
import EmailAuthForm from '../onboarding/EmailAuthForm';
import { GoogleIcon, DiscordIcon } from '../onboarding/AuthIcons';
import { usePwaInstall } from '../../hooks/usePwaInstall';

const RADIUS = 16;

const Logo = ({ size = 40 }) => (
  <span style={{ display: 'inline-flex', width: `${size}px`, height: `${size}px`, flexShrink: 0 }}>
    <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ width: '100%', height: '100%' }}>
      <defs>
        <linearGradient id="iwg_desk_onb" x1="8" y1="5" x2="40" y2="42" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#B24EE8" />
          <stop offset="1" stopColor="#6E18A0" />
        </linearGradient>
      </defs>
      <path d="M11 5 L24 13 L37 5 L43 19 L35 42 L24 34 L13 42 L5 19 Z" fill="url(#iwg_desk_onb)" stroke="url(#iwg_desk_onb)" strokeWidth="3" strokeLinejoin="round" />
      <path d="M24 25 L24 11 M24 25 L13.5 36 M24 25 L34.5 36" fill="none" stroke="#fff" strokeWidth="5.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  </span>
);

// Right-panel card shell. Defined at module scope (not inside
// DesktopOnboarding) on purpose — a component defined inside another
// component's body gets a brand-new function identity on every render, which
// makes React treat it as a different component type and remount its whole
// subtree. That was destroying and recreating the <input> DOM node on every
// keystroke, so the field lost focus after each character (had to click back
// in before typing the next one). Module-scope keeps its identity stable.
const Card = ({ children, maxWidth = 440 }) => (
  <div style={{ width: '100%', flexShrink: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '0 64px' }}>
    <div style={{ width: '100%', maxWidth: `${maxWidth}px` }}>{children}</div>
  </div>
);

// Czech pluralizes both the noun and the verb by count (1 / 2-4 / 5+) — a
// flat "X hráčů ... zapojilo" read as broken grammar at low numbers
// ("1 hráčů", "2 hráčů se zapojilo" are both wrong).
function formatPlayerCount(n) {
  if (n === 1) return { label: '1 hráč', verb: 'se už do hry zapojil' };
  if (n >= 2 && n <= 4) return { label: `${n} hráči`, verb: 'se už do hry zapojili' };
  return { label: `${n.toLocaleString('cs-CZ')} hráčů`, verb: 'se už do hry zapojilo' };
}

// Ambient brand panel shown on the left for every step — matches the
// reference design's split-panel treatment instead of a separate blank
// splash frame (not idiomatic for a web app).
function BrandPanel({ playerCount }) {
  const playerCountText = playerCount != null && playerCount > 0 ? formatPlayerCount(playerCount) : null;
  return (
    <div style={{
      flex: 1,
      background: 'linear-gradient(150deg,#1a1230,#0D0A18 65%)',
      borderRight: '1px solid #1B1430',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      padding: '0 64px',
      position: 'relative',
      overflow: 'hidden',
      minWidth: 0
    }}>
      <div style={{ position: 'absolute', inset: 0, backgroundImage: 'radial-gradient(circle at 30% 20%, rgba(124,58,237,.22), transparent 45%)' }} />
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '28px' }}>
        <Logo size={40} />
        <span style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: '700', fontSize: '22px', color: '#F0F0F8' }}>
          HRA<span style={{ color: '#A78BFA' }}>REALITY</span>
        </span>
      </div>
      <div style={{ position: 'relative', fontFamily: "'Space Grotesk', sans-serif", fontWeight: '700', fontSize: '34px', lineHeight: 1.25, maxWidth: '420px', color: '#F0F0F8' }}>
        Přestaň scrollovat. Začni hrát realitu.
      </div>
      <div style={{ position: 'relative', fontFamily: 'Inter', fontSize: '15px', color: '#9A9AB5', marginTop: '16px', maxWidth: '400px', lineHeight: '1.6' }}>
        Denní výzvy, komunita Doerů a příběh, který postupuje podle toho, co skutečně uděláš.
      </div>
      {/* Real count from get_player_count(), not a fake number — render
          nothing while it's still loading rather than show 0/a placeholder. */}
      {playerCountText && (
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: '10px', marginTop: '32px' }}>
          <div style={{ display: 'flex' }}>
            <span style={{ width: '30px', height: '30px', borderRadius: '50%', background: '#241a3d', border: '2px solid #0D0A18' }}></span>
            <span style={{ width: '30px', height: '30px', borderRadius: '50%', background: '#2c2140', border: '2px solid #0D0A18', marginLeft: '-10px' }}></span>
            <span style={{ width: '30px', height: '30px', borderRadius: '50%', background: '#1f2a3d', border: '2px solid #0D0A18', marginLeft: '-10px' }}></span>
          </div>
          <div style={{ fontFamily: 'Inter', fontSize: '13px', color: '#6B6B8A' }}>
            <span style={{ color: '#A78BFA', fontWeight: '600' }}>{playerCountText.label}</span> {playerCountText.verb}
          </div>
        </div>
      )}
    </div>
  );
}

// MVP1 spec-3 flow: entry (binary choice, no session) -> first-reward (local-only XP
// preview, no session) -> login (the only step touching Supabase Auth) -> avatar-upgrade
// (post-login beat) -> mystery-box (reveals the starter card) -> slib (pledge, published as
// the first real proof) -> reward2 (celebration + optional Hra Pass upsell) -> install
// (desktop-only PWA step) -> Dashboard. See DESKTOP_ONBOARDING_STEPS in authSlice.js for the
// authoritative step list/rationale.
export default function DesktopOnboarding() {
  const {
    user,
    onboardingStep,
    nextOnboardingStep,
    completeOnboarding,
    submitPledge,
    login,
    openModal,
    playerCount
  } = useUserStore();

  const [tempPledge, setTempPledge] = useState('');
  const [pledgeError, setPledgeError] = useState('');
  const [pendingProvider, setPendingProvider] = useState(null);
  const [boxOpened, setBoxOpened] = useState(false);
  const { isInstallable, isInstalled, promptInstall } = usePwaInstall();

  // Any step value not part of the desktop sequence (e.g. a legacy value
  // from before this rework) falls through to entry, consistent with
  // nextOnboardingStep's own fallback.
  const step = DESKTOP_ONBOARDING_STEPS.includes(onboardingStep) ? onboardingStep : 'entry';

  // first-reward and avatar-upgrade are short auto-advancing beats (see MobileOnboarding.jsx
  // for the same rationale) — mystery-box and slib wait for a real tap/input instead.
  useEffect(() => {
    if (step !== 'first-reward' && step !== 'avatar-upgrade') return;
    const t = setTimeout(() => nextOnboardingStep(false), step === 'first-reward' ? 1800 : 1400);
    return () => clearTimeout(t);
  }, [step, nextOnboardingStep]);

  const handleEntryChoice = (choice) => {
    track('entry_choice', { choice });
    nextOnboardingStep(false);
  };

  const handlePledgeSubmit = () => {
    if (!tempPledge.trim()) { setPledgeError('Napiš svůj slib — ať máš co sdílet.'); return; }
    submitPledge(tempPledge.trim());
    nextOnboardingStep(false);
  };

  const handleOAuthClick = async (provider) => {
    setPendingProvider(provider);
    const result = await login(provider);
    if (!result?.success) setPendingProvider(null);
  };

  const primaryButtonStyle = {
    width: '100%',
    height: '50px',
    background: '#7C3AED',
    color: '#fff',
    fontFamily: 'Inter',
    fontWeight: '700',
    fontSize: '15px',
    border: 'none',
    borderRadius: `${RADIUS}px`,
    cursor: 'pointer'
  };

  const oauthButtonStyle = (disabled) => ({
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '10px',
    width: '100%',
    height: '48px',
    background: '#2A2142',
    border: '1px solid #382C5C',
    borderRadius: `${RADIUS}px`,
    color: '#fff',
    fontFamily: 'Inter',
    fontWeight: '600',
    fontSize: '14px',
    cursor: disabled ? 'default' : 'pointer',
    opacity: disabled ? 0.6 : 1
  });

  const level0 = getAvatarLevel(0);
  const level1 = getAvatarLevel(1);
  const starterCard = findCard('doer-mvp1');

  let rightPanel;

  if (step === 'entry') {
    rightPanel = (
      <Card>
        <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: '700', fontSize: '24px', color: '#F0F0F8' }}>Tohle není hra.</div>
        <div style={{ fontFamily: 'Inter', fontSize: '14px', color: '#6B6B8A', marginTop: '8px' }}>Vyber instinktivně.</div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '24px' }}>
          <button onClick={() => handleEntryChoice('stagnuju')} style={{ ...oauthButtonStyle(false), height: '58px' }}>
            <ArrowDown size={16} color="#EF4444" /> Mám pocit, že stagnuju
          </button>
          <button onClick={() => handleEntryChoice('posouvam')} style={{ ...oauthButtonStyle(false), height: '58px' }}>
            <ArrowUp size={16} color="#22C55E" /> Mám pocit, že se posouvám
          </button>
        </div>
      </Card>
    );
  } else if (step === 'first-reward') {
    rightPanel = (
      <Card>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
          <div style={{
            width: '104px', height: '104px', borderRadius: '50%', background: 'linear-gradient(150deg,#241a3d,#1C1630)',
            border: '1.5px solid #A78BFA', display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 0 28px rgba(167,139,250,.45)', animation: 'ringPulse 1.6s ease-out infinite'
          }}>
            <Radio size={46} color="#A78BFA" />
          </div>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '11px', letterSpacing: '.12em', color: '#A78BFA', textTransform: 'uppercase', marginTop: '18px' }}>
            Signál zachycen
          </div>
          <div style={{ fontFamily: 'Inter', fontSize: '13px', color: '#9A9AB5', marginTop: '8px' }}>98 % lidí tohle ignoruje. Ty ne.</div>
          <div style={{
            fontFamily: "'Space Grotesk', sans-serif", fontWeight: '700', fontSize: '52px', color: '#4AA8FF',
            textShadow: '0 0 20px rgba(74,168,255,.7), 0 0 40px rgba(59,130,246,.4)', marginTop: '6px'
          }}>
            +50 XP
          </div>
          <div style={{ fontFamily: 'Inter', fontWeight: '600', fontSize: '13px', color: '#F0F0F8', marginTop: '8px' }}>
            Status: Pozorovatel · Level 1
          </div>
        </div>
      </Card>
    );
  } else if (step === 'login') {
    rightPanel = (
      <Card>
        <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: '700', fontSize: '24px', color: '#F0F0F8' }}>Ulož svůj postup</div>
        <div style={{ fontFamily: 'Inter', fontSize: '14px', color: '#6B6B8A', marginTop: '8px' }}>Pokud teď odejdeš, tenhle moment se neuloží.</div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '24px' }}>
          <button onClick={() => handleOAuthClick('google')} disabled={pendingProvider === 'google'} style={oauthButtonStyle(pendingProvider === 'google')}>
            <GoogleIcon size={18} /> {pendingProvider === 'google' ? 'Připojuji…' : 'Pokračovat přes Google'}
          </button>
          <button onClick={() => handleOAuthClick('discord')} disabled={pendingProvider === 'discord'} style={oauthButtonStyle(pendingProvider === 'discord')}>
            <DiscordIcon size={18} /> {pendingProvider === 'discord' ? 'Připojuji…' : 'Pokračovat přes Discord'}
          </button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', margin: '16px 0' }}>
          <div style={{ flex: 1, height: '1px', background: '#382C5C' }}></div>
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '10px', color: '#6B6B8A' }}>NEBO E-MAILEM</span>
          <div style={{ flex: 1, height: '1px', background: '#382C5C' }}></div>
        </div>

        <EmailAuthForm radius={RADIUS} />

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '20px', padding: '12px 14px', background: '#241C3C', border: '0.5px solid #382C5C', borderRadius: '10px' }}>
          <Sparkles size={18} color="#F5B73F" />
          <span style={{ fontFamily: 'Inter', fontSize: '13px', color: '#F0F0F8', fontWeight: '500' }}>Po registraci okamžitě získáš <span style={{ color: '#F5B73F', fontWeight: '600' }}>+1 klíč</span></span>
        </div>
        <div style={{ fontFamily: 'Inter', fontSize: '11px', color: '#6B6B8A', textAlign: 'center', marginTop: '16px', lineHeight: '1.55' }}>
          Pokračováním souhlasíš s <a href="/terms" style={{ color: '#9A9AB5' }}>podmínkami</a> a <a href="/privacy" style={{ color: '#9A9AB5' }}>zpracováním údajů</a>.
        </div>
      </Card>
    );
  } else if (step === 'avatar-upgrade') {
    rightPanel = (
      <Card>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
            <span style={{
              width: '72px', height: '72px', borderRadius: '50%', background: '#241C3C',
              border: `${level0.borderWidth}px solid ${level0.border}`, opacity: 0.5,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: "'Space Grotesk', sans-serif", fontWeight: '700', fontSize: '22px', color: level0.color
            }}>
              {(user?.name || 'H').slice(0, 2).toUpperCase()}
            </span>
            <span style={{ color: '#6B6B8A', fontSize: '20px' }}>→</span>
            <span style={{
              width: '88px', height: '88px', borderRadius: '50%', background: '#241C3C',
              border: `${level1.borderWidth}px solid ${level1.border}`, boxShadow: `0 0 ${level1.glow}px ${level1.border}aa`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: "'Space Grotesk', sans-serif", fontWeight: '700', fontSize: '26px', color: level1.color,
              animation: 'ringPulse 1.6s ease-out infinite'
            }}>
              {(user?.name || 'H').slice(0, 2).toUpperCase()}
            </span>
          </div>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '11px', letterSpacing: '.1em', color: '#A78BFA', textTransform: 'uppercase', marginTop: '20px' }}>
            Status aktivován
          </div>
          <div style={{ fontFamily: 'Inter', fontSize: '13px', color: '#9A9AB5', marginTop: '8px' }}>Tvoje identita se probouzí.</div>
        </div>
      </Card>
    );
  } else if (step === 'mystery-box') {
    rightPanel = (
      <Card>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
          {!boxOpened ? (
            <div onClick={() => setBoxOpened(true)} style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}>
              <div style={{
                width: '120px', height: '120px', borderRadius: '22px', background: 'linear-gradient(150deg,#241a3d,#1C1630)',
                border: '1.5px dashed #A78BFA', display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: '0 0 24px rgba(167,139,250,.35)'
              }}>
                <Gift size={48} color="#A78BFA" />
              </div>
              <div style={{ fontFamily: 'Inter', fontWeight: '600', fontSize: '14px', color: '#F0F0F8' }}>Klikni a otevři svůj první drop</div>
            </div>
          ) : (
            <>
              <div style={{
                width: '120px', height: '120px', borderRadius: '22px', background: starterCard?.bg || '#241a3d',
                border: `2px solid ${starterCard?.border || '#7C3AED'}`, display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: `0 0 28px ${starterCard?.border || '#7C3AED'}55`
              }}>
                <span style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: '700', fontSize: '16px', color: starterCard?.color || '#A78BFA' }}>{starterCard?.title || 'Doer'}</span>
              </div>
              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '11px', letterSpacing: '.1em', color: '#A78BFA', textTransform: 'uppercase', marginTop: '18px' }}>
                Získal/a jsi kartu
              </div>
              <div style={{ fontFamily: 'Inter', fontSize: '13px', color: '#9A9AB5', marginTop: '6px' }}>1 / {ALL_CARDS.length} ve tvém Inventáři</div>
              <button onClick={() => nextOnboardingStep(false)} style={{ ...primaryButtonStyle, marginTop: '22px' }}>Pokračovat</button>
            </>
          )}
        </div>
      </Card>
    );
  } else if (step === 'slib') {
    // Personal commitment the app can later refer back to — and also the
    // player's first real proof: submitPledge() saves it AND publishes it
    // as a real feed_posts row (see authSlice.js).
    rightPanel = (
      <Card>
        <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: '700', fontSize: '24px', color: '#F0F0F8' }}>Tvůj slib</div>
        <div style={{ fontFamily: 'Inter', fontSize: '14px', color: '#6B6B8A', marginTop: '8px' }}>Zavaž se k akci, ne jen k teorii — Zaya se k tomuhle slibu ještě vrátí.</div>
        <textarea
          value={tempPledge}
          onChange={(e) => { setTempPledge(e.target.value); if (pledgeError) setPledgeError(''); }}
          placeholder="Jsem člověk, co…"
          rows={4}
          style={{
            width: '100%', background: '#2A2142', border: `1px solid ${pledgeError ? '#EF4444' : '#7C3AED'}`, borderRadius: `${RADIUS}px`, color: '#F0F0F8',
            padding: '14px 16px', fontSize: '14px', outline: 'none', resize: 'none', lineHeight: '1.5', boxSizing: 'border-box', marginTop: '20px'
          }}
        />
        {pledgeError && (
          <div style={{ color: '#EF4444', fontSize: '12px', fontFamily: 'Inter', marginTop: '8px' }}>{pledgeError}</div>
        )}
        <button
          onClick={handlePledgeSubmit}
          style={{ ...primaryButtonStyle, marginTop: '20px' }}
        >
          Zveřejnit a pokračovat
        </button>
      </Card>
    );
  } else if (step === 'reward2') {
    rightPanel = (
      <Card>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
          <Sparkles size={48} color="#A78BFA" />
          <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: '700', fontSize: '26px', color: '#F0F0F8', marginTop: '18px' }}>Vítej v Hře Reality!</div>
          <div style={{ fontFamily: 'Inter', fontSize: '14px', color: '#9A9AB5', marginTop: '10px' }}>
            Máš prvních 10 XP a klíč od Uzlu 1. Tvá první výzva čeká na nástěnce.
          </div>

          <div style={{
            width: '100%', background: '#241C3C', border: '1px dashed #F5B73F', borderRadius: '16px',
            padding: '14px', display: 'flex', flexDirection: 'column', gap: '8px', textAlign: 'left', marginTop: '20px'
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

          <button onClick={() => nextOnboardingStep(false)} style={{ ...primaryButtonStyle, marginTop: '20px' }}>
            Pokračovat
          </button>
        </div>
      </Card>
    );
  } else if (step === 'install') {
    rightPanel = (
      <Card>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
          <div style={{
            width: '84px', height: '84px', borderRadius: '22px', background: 'linear-gradient(150deg,#241a3d,#1C1630)',
            border: '1px solid #382C5C', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 14px 40px rgba(124,58,237,.35)'
          }}>
            <Logo size={46} />
          </div>
          <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: '700', fontSize: '22px', color: '#F0F0F8', marginTop: '22px' }}>
            {isInstalled ? 'Appka je nainstalovaná' : 'Nainstaluj si Hru Reality'}
          </div>
          {!isInstalled && (
            <>
              <div style={{ fontFamily: 'Inter', fontSize: '14px', color: '#6B6B8A', marginTop: '10px', lineHeight: '1.55' }}>
                Přidej appku do panelu nástrojů prohlížeče — otevřeš ji jedním klikem, i offline.
              </div>
              <div style={{
                width: '100%', background: '#241C3C', border: '0.5px solid #382C5C', borderRadius: '14px', padding: '14px 16px',
                marginTop: '22px', display: 'flex', alignItems: 'center', gap: '10px', textAlign: 'left'
              }}>
                <MonitorDown size={18} color="#A78BFA" style={{ flexShrink: 0 }} />
                <span style={{ fontFamily: 'Inter', fontSize: '13px', color: '#F0F0F8' }}>Klikni na ikonu instalace v adresním řádku prohlížeče</span>
              </div>
            </>
          )}
          {isInstalled && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '14px', color: '#22C55E', fontFamily: 'Inter', fontSize: '13px' }}>
              <Check size={16} /> Hotovo
            </div>
          )}
          <button
            onClick={async () => { if (isInstallable) await promptInstall(); completeOnboarding(); }}
            style={{ ...primaryButtonStyle, marginTop: '24px' }}
          >
            {isInstalled ? 'Otevřít hlavní panel' : 'Nainstalovat'}
          </button>
          {!isInstalled && (
            <button
              onClick={() => completeOnboarding()}
              style={{ width: '100%', height: '44px', background: 'transparent', border: 'none', color: '#6B6B8A', fontFamily: 'Inter', fontWeight: '500', fontSize: '13px', cursor: 'pointer', marginTop: '6px' }}
            >
              Teď ne, pokračovat
            </button>
          )}
        </div>
      </Card>
    );
  }

  return (
    <div style={{
      position: 'absolute',
      inset: 0,
      zIndex: 100,
      display: 'flex',
      height: '100vh',
      width: '100vw',
      background: '#0C0A16',
      color: '#F0F0F8',
      fontFamily: 'Inter, sans-serif',
      overflow: 'hidden'
    }}>
      {/* key={step} restarts the fade on every step change instead of the
          previous hard cut — same <Card> component type/position otherwise
          wouldn't remount, so the animation would never retrigger. */}
      <style>{`@keyframes iwauStepFade { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }`}</style>
      <BrandPanel playerCount={playerCount} />
      <div
        key={step}
        style={{
          width: '460px', flexShrink: 0, display: 'flex', flexDirection: 'column',
          justifyContent: 'center', background: '#0D0A18', overflowY: 'auto',
          animation: 'iwauStepFade .32s cubic-bezier(.16,1,.3,1)'
        }}
      >
        {rightPanel}
      </div>
    </div>
  );
}
