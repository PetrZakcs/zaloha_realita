import { useState, useEffect } from 'react';
import { useUserStore } from '../../store/userStore';
import { DEFAULT_USER } from '../../store/slices/authSlice';
import { MessageSquare, Globe, Sparkles, MonitorDown, Check } from 'lucide-react';
import EmailAuthForm from '../onboarding/EmailAuthForm';
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

// Ambient brand panel shown on the left for every step — matches the
// reference design's split-panel treatment instead of a separate blank
// splash frame (not idiomatic for a web app).
function BrandPanel({ playerCount }) {
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
      {playerCount != null && playerCount > 0 && (
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: '10px', marginTop: '32px' }}>
          <div style={{ display: 'flex' }}>
            <span style={{ width: '30px', height: '30px', borderRadius: '50%', background: '#241a3d', border: '2px solid #0D0A18' }}></span>
            <span style={{ width: '30px', height: '30px', borderRadius: '50%', background: '#2c2140', border: '2px solid #0D0A18', marginLeft: '-10px' }}></span>
            <span style={{ width: '30px', height: '30px', borderRadius: '50%', background: '#1f2a3d', border: '2px solid #0D0A18', marginLeft: '-10px' }}></span>
          </div>
          <div style={{ fontFamily: 'Inter', fontSize: '13px', color: '#6B6B8A' }}>
            <span style={{ color: '#A78BFA', fontWeight: '600' }}>{playerCount.toLocaleString('cs-CZ')} hráčů</span> se už do hry zapojilo
          </div>
        </div>
      )}
    </div>
  );
}

export default function DesktopOnboarding() {
  const {
    user,
    onboardingStep,
    setOnboardingStep,
    nextOnboardingStep,
    completeOnboarding,
    updateUser,
    submitPledge,
    login,
    playerCount
  } = useUserStore();

  // Fields start empty — the suggested name/pledge shows only as a native
  // placeholder (via DEFAULT_USER below) so it vanishes on the first
  // keystroke instead of having to be selected and deleted first.
  const [tempName, setTempName] = useState(user?.name && user.name !== DEFAULT_USER.name ? user.name : '');
  const [tempPledge, setTempPledge] = useState('');
  const [pendingProvider, setPendingProvider] = useState(null);
  const { isInstallable, isInstalled, promptInstall } = usePwaInstall();

  useEffect(() => {
    if (user?.name && user.name !== DEFAULT_USER.name) setTempName(user.name);
  }, [user?.name]);

  // Any step value not part of the desktop sequence (e.g. 'splash' persisted
  // from a mobile session) falls through to intro, consistent with
  // nextOnboardingStep's own fallback.
  const step = ['intro', 'login', 'nickname', 'slib', 'reward', 'install'].includes(onboardingStep)
    ? onboardingStep
    : 'intro';

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

  let rightPanel;

  if (step === 'intro') {
    rightPanel = (
      <Card>
        <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: '700', fontSize: '26px', color: '#F0F0F8', lineHeight: 1.25 }}>
          Většina lidí jen konzumuje obsah.<br /><span style={{ color: '#A78BFA' }}>Hráči ne. Ti začnou okamžitě.</span>
        </div>
        <div style={{ fontFamily: 'Inter', fontSize: '14px', color: '#9A9AB5', marginTop: '16px', lineHeight: '1.6' }}>
          iWau HRA REALITY je systém krátkých výzev v reálném životě. Žádné pasivní sledování. Jen quest, akce a reálný progres.
        </div>
        <button onClick={() => nextOnboardingStep(false)} style={{ ...primaryButtonStyle, marginTop: '28px' }}>
          Začni hrát
        </button>
        <button
          onClick={() => setOnboardingStep('login')}
          style={{ width: '100%', height: '44px', background: 'transparent', border: '1px solid #382C5C', color: '#9A9AB5', fontFamily: 'Inter', fontWeight: '500', fontSize: '14px', borderRadius: `${RADIUS}px`, cursor: 'pointer', marginTop: '10px' }}
        >
          Mám už účet
        </button>
      </Card>
    );
  } else if (step === 'login') {
    rightPanel = (
      <Card>
        <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: '700', fontSize: '24px', color: '#F0F0F8' }}>Vytvoř si profil hráče</div>
        <div style={{ fontFamily: 'Inter', fontSize: '14px', color: '#6B6B8A', marginTop: '8px' }}>Trvá to 30 sekund.</div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '24px' }}>
          <button onClick={() => handleOAuthClick('google')} disabled={pendingProvider === 'google'} style={oauthButtonStyle(pendingProvider === 'google')}>
            <Globe size={18} color="#4285F4" /> {pendingProvider === 'google' ? 'Připojuji…' : 'Pokračovat přes Google'}
          </button>
          <button onClick={() => handleOAuthClick('discord')} disabled={pendingProvider === 'discord'} style={oauthButtonStyle(pendingProvider === 'discord')}>
            <MessageSquare size={18} color="#5865F2" /> {pendingProvider === 'discord' ? 'Připojuji…' : 'Pokračovat přes Discord'}
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
  } else if (step === 'nickname') {
    rightPanel = (
      <Card>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
          <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: '700', fontSize: '26px', color: '#F0F0F8' }}>Jak tě svět hry bude znát?</div>
          <div style={{
            width: '104px', height: '104px', borderRadius: '50%', background: '#241C3C', border: '2px solid #7C3AED',
            boxShadow: '0 0 20px rgba(124,58,237,.35)', display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: "'Space Grotesk', sans-serif", fontWeight: '700', fontSize: '34px', color: '#A78BFA', marginTop: '36px'
          }}>
            {(tempName || DEFAULT_USER.name).slice(0, 2).toUpperCase()}
          </div>
          <input
            type="text"
            value={tempName}
            onChange={(e) => setTempName(e.target.value)}
            placeholder={DEFAULT_USER.name}
            style={{
              marginTop: '28px', width: '100%', maxWidth: '280px', height: '48px', background: '#2A2142', border: '1px solid #7C3AED',
              borderRadius: `${RADIUS}px`, color: '#F0F0F8', padding: '0 16px', fontSize: '16px', outline: 'none', boxSizing: 'border-box',
              textAlign: 'center', fontFamily: "'Space Grotesk', sans-serif", fontWeight: '700'
            }}
          />
          <div style={{ fontFamily: 'Inter', fontSize: '13px', color: '#6B6B8A', marginTop: '16px', maxWidth: '340px', lineHeight: '1.5' }}>
            Vygenerovali jsme ti unikátní jméno. Můžeš ho nechat, nebo upravit.
          </div>
          <button
            onClick={() => { updateUser({ name: tempName.trim() || DEFAULT_USER.name }); nextOnboardingStep(false); }}
            style={{ ...primaryButtonStyle, width: '280px', marginTop: '36px' }}
          >
            Tohle jsem já
          </button>
        </div>
      </Card>
    );
  } else if (step === 'slib') {
    // First real micro-challenge (MVP1 §2.5/§6.2), not a private profile field —
    // submitPledge() both saves it and publishes it as a real feed_posts row.
    rightPanel = (
      <Card>
        <div style={{ display: 'inline-flex', fontFamily: "'JetBrains Mono', monospace", fontSize: '11px', fontWeight: '500', letterSpacing: '.14em', color: '#A78BFA', border: '1px solid #3A2A6E', borderRadius: '20px', padding: '5px 14px', marginBottom: '16px' }}>
          MIKRO-VÝZVA · 60 SEKUND
        </div>
        <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: '700', fontSize: '24px', color: '#F0F0F8' }}>Tvoje první výzva</div>
        <div style={{ fontFamily: 'Inter', fontSize: '14px', color: '#6B6B8A', marginTop: '8px' }}>Dokonči tuhle větu — hned se zveřejní ve Feedu ostatním hráčům.</div>
        <textarea
          value={tempPledge}
          onChange={(e) => setTempPledge(e.target.value)}
          placeholder={DEFAULT_USER.pledge}
          rows={4}
          style={{
            width: '100%', background: '#2A2142', border: '1px solid #7C3AED', borderRadius: `${RADIUS}px`, color: '#F0F0F8',
            padding: '14px 16px', fontSize: '14px', outline: 'none', resize: 'none', lineHeight: '1.5', boxSizing: 'border-box', marginTop: '20px'
          }}
        />
        <button
          onClick={() => { submitPledge(tempPledge.trim() || DEFAULT_USER.pledge); nextOnboardingStep(false); }}
          style={{ ...primaryButtonStyle, marginTop: '20px' }}
        >
          Zveřejnit a pokračovat
        </button>
      </Card>
    );
  } else if (step === 'reward') {
    rightPanel = (
      <Card>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
          <Sparkles size={48} color="#A78BFA" />
          <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: '700', fontSize: '26px', color: '#F0F0F8', marginTop: '18px' }}>Vítej v Hře Reality!</div>
          <div style={{ fontFamily: 'Inter', fontSize: '14px', color: '#9A9AB5', marginTop: '10px' }}>
            Získáváš prvních 10 XP a klíč od Uzlu 1. Tvá první výzva čeká na nástěnce.
          </div>
          <button onClick={() => nextOnboardingStep(false)} style={{ ...primaryButtonStyle, marginTop: '24px' }}>
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
      <BrandPanel playerCount={playerCount} />
      <div style={{ width: '460px', flexShrink: 0, display: 'flex', flexDirection: 'column', background: '#0D0A18', overflowY: 'auto' }}>
        {rightPanel}
      </div>
    </div>
  );
}
