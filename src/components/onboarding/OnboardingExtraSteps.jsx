import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Camera, Gift, Radio } from 'lucide-react';
import { useUserStore } from '../../store/userStore';
import { getPendingInvite, clearAttribution, captureExplicitCode } from '../../lib/attribution';
import { track } from '../../lib/analytics';
import { ALL_CARDS, findCard } from '../../lib/cards';
import { playSound } from '../../lib/sfx';
import ShareMomentButton from '../common/ShareMomentButton';

// Onboarding steps shared by MobileOnboarding and DesktopOnboarding (spec-14).

const inputStyle = {
  width: '100%', height: '48px', background: '#2A2142', border: '1px solid #7C3AED', borderRadius: '16px',
  color: '#F0F0F8', padding: '0 16px', fontSize: '15px', outline: 'none', boxSizing: 'border-box', fontFamily: 'Inter'
};
const primaryStyle = {
  width: '100%', height: '48px', background: '#7C3AED', color: '#fff', fontFamily: 'Inter', fontWeight: 700,
  fontSize: '16px', border: 'none', borderRadius: '16px', cursor: 'pointer'
};
const linkStyle = {
  background: 'none', border: 'none', color: '#6B6B8A', fontFamily: 'Inter', fontSize: '13px', cursor: 'pointer', padding: '6px'
};

// spec-14 §1 LANDING: "cíl: kliknout, ne číst". The invite banner keeps the reason an invited
// player came; the auth screen is one tap away.
export function LandingStep({ onEnter }) {
  useEffect(() => { track('landing_viewed'); }, []);
  return (
    <div style={{ width: '100%', maxWidth: '350px', display: 'flex', flexDirection: 'column', gap: '18px', textAlign: 'center' }}>
      <InviteBanner />
      <h1 style={{ margin: 0, fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, fontSize: '30px', lineHeight: 1.15, color: '#F0F0F8' }}>
        Staň se jedním z prvních hráčů nového způsobu, jak hrát svůj život.
      </h1>
      <div style={{ fontFamily: 'Inter', fontSize: '15px', color: '#9A9AB5', lineHeight: 1.6 }}>
        Krátké výzvy.<br />Okamžitý progres.<br />Reálná změna.
      </div>
      <button
        type="button"
        onClick={() => { track('landing_cta_clicked'); onEnter(); }}
        style={{ ...primaryStyle, height: '54px', fontSize: '17px', boxShadow: '0 10px 30px rgba(124,58,237,.45)' }}
      >
        Vstoupit do hry
      </button>
      <InviteCodeEntry />
    </div>
  );
}

// spec-14 §3 FIRST REWARD: the +50 XP is granted by the server when this shows; spec timing is
// 600–900 ms for the whole reveal, running alongside the buttons rather than blocking them.
export function FirstRewardStep({ onNext }) {
  const { user, grantOnboardingRewards } = useUserStore();
  useEffect(() => {
    grantOnboardingRewards();
    playSound('reward');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const reveal = (delay) => ({ animation: 'iwauStepFade .3s cubic-bezier(.16,1,.3,1) both', animationDelay: `${delay}ms` });
  return (
    <div style={{ width: '100%', maxWidth: '350px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '14px', textAlign: 'center' }}>
      <div style={{
        width: '92px', height: '92px', borderRadius: '50%', background: 'linear-gradient(150deg,#241a3d,#1C1630)',
        border: '1.5px solid #A78BFA', display: 'flex', alignItems: 'center', justifyContent: 'center',
        boxShadow: '0 0 28px rgba(167,139,250,.45)', animation: 'ringPulse 1.6s ease-out infinite'
      }}>
        <Radio size={40} color="#A78BFA" />
      </div>
      <div style={{ ...reveal(150), fontFamily: "'JetBrains Mono', monospace", fontSize: '11px', letterSpacing: '.12em', color: '#A78BFA', textTransform: 'uppercase' }}>
        Signál zachycen
      </div>
      <div style={{ ...reveal(150), fontFamily: 'Inter', fontSize: '13px', color: '#9A9AB5', lineHeight: 1.5 }}>
        98 % lidí tohle ignoruje. Ty ne.
      </div>
      <div style={{
        ...reveal(350), fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, fontSize: '44px', color: '#4AA8FF',
        textShadow: '0 0 20px rgba(74,168,255,.7), 0 0 40px rgba(59,130,246,.4)'
      }}>
        +50 XP
      </div>
      <div style={{ ...reveal(350), fontFamily: 'Inter', fontWeight: 600, fontSize: '12px', color: '#F0F0F8' }}>
        Status: Pozorovatel · Level 1
      </div>
      <div style={{ ...reveal(600), width: '100%', display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '6px' }}>
        <ShareMomentButton
          variant="signal"
          rewardSource={{ type: 'onboarding', id: 'onboarding' }}
          sentence={user?.pledge}
          progressText="Pozorovatel · Level 1"
          label="Sdílej svůj signál"
        />
        <button type="button" onClick={onNext} style={primaryStyle}>Pokračovat</button>
      </div>
    </div>
  );
}

// spec-14 §5 SURPRISE REWARD: first drop, one guaranteed common card, second share moment.
export function FirstDropStep({ onNext }) {
  const [opened, setOpened] = useState(false);
  const card = findCard('doer-mvp1');
  const open = () => { setOpened(true); playSound('levelUp'); track('onboarding_box_opened'); };
  if (!opened) {
    return (
      <button type="button" onClick={open} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}>
        <span style={{
          width: '110px', height: '110px', borderRadius: '20px', background: 'linear-gradient(150deg,#241a3d,#1C1630)',
          border: '1.5px dashed #A78BFA', display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 0 24px rgba(167,139,250,.35)', animation: 'ringPulse 1.6s ease-out infinite'
        }}>
          <Gift size={44} color="#A78BFA" />
        </span>
        <span style={{ fontFamily: 'Inter', fontWeight: 600, fontSize: '14px', color: '#F0F0F8' }}>Odemčeno: první drop. Klepni a otevři.</span>
      </button>
    );
  }
  return (
    <div style={{ width: '100%', maxWidth: '350px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', textAlign: 'center' }}>
      <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '11px', letterSpacing: '.12em', color: '#A78BFA', textTransform: 'uppercase' }}>Odhaleno</div>
      <div style={{
        width: '110px', height: '110px', borderRadius: '20px', background: card?.bg || '#241a3d',
        border: `2px solid ${card?.border || '#7C3AED'}`, display: 'flex', alignItems: 'center', justifyContent: 'center',
        boxShadow: `0 0 28px ${card?.border || '#7C3AED'}55`, animation: 'iwauStepFade .3s cubic-bezier(.16,1,.3,1)'
      }}>
        <span style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, fontSize: '15px', color: card?.color || '#A78BFA' }}>{card?.title || 'Doer'}</span>
      </div>
      <div style={{ fontFamily: 'Inter', fontSize: '13px', color: '#F0F0F8', fontWeight: 600 }}>Získal/a jsi kartu {card?.title || 'Doer'}</div>
      <div style={{ fontFamily: 'Inter', fontSize: '12px', color: '#9A9AB5', lineHeight: 1.5 }}>
        Důkaz, že jsi ve hře od začátku. 1 / {ALL_CARDS.length} ve sbírce.
      </div>
      <ShareMomentButton variant="collection" progressText={`1 / ${ALL_CARDS.length} ve sbírce`} sentence={card?.title} label="Sdílet kartu" />
      <button type="button" onClick={onNext} style={primaryStyle}>Pokračovat</button>
    </div>
  );
}

// "Přeskočit onboarding" — the player enters the game as an NPC (spec-14) and is nudged
// to finish activation later from the dashboard.
export function SkipOnboardingLink({ step }) {
  const { skipOnboarding } = useUserStore();
  return (
    <button type="button" onClick={() => skipOnboarding(step)} style={linkStyle}>
      Přeskočit onboarding
    </button>
  );
}

// spec-14 ENTRY: "Kdo jsi jako hráč? Vytvoř svou přezdívku · Vložit foto". Both optional —
// without a nickname the auto-generated one stays, without a photo the default avatar.
// spec-3 §2 "ENTRY + FIRST ACTION" and spec-12 §2.5 intro: what the game is, then one instinctive
// click that moves on by itself. The answer only feeds the onboarding KPIs.
export function EntryStep({ onNext }) {
  const choose = (answer) => {
    track('onboarding_entry_answered', { answer });
    onNext();
  };
  return (
    <div style={{ width: '100%', textAlign: 'center' }}>
      <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, fontSize: '24px', color: '#F0F0F8' }}>Tohle není hra.</div>
      <div style={{ fontFamily: 'Inter', fontSize: '14px', color: '#9A9AB5', lineHeight: 1.5, marginTop: '10px' }}>
        Plníš krátké výzvy ve skutečném životě, dokládáš je a tvoje postava roste s tebou. Další krok je vždycky jeden a jasný.
      </div>
      <div style={{ fontFamily: 'Inter', fontWeight: 600, fontSize: '14px', color: '#F0F0F8', marginTop: '20px' }}>Vyber instinktivně:</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '12px' }}>
        {[['stagnating', 'Mám pocit, že stagnuju'], ['moving', 'Mám pocit, že se posouvám']].map(([value, label]) => (
          <button key={value} type="button" onClick={() => choose(value)} style={{ minHeight: '48px', background: '#241C3C', border: '1px solid #7C3AED', borderRadius: '14px', color: '#F0F0F8', fontFamily: 'Inter', fontWeight: 600, fontSize: '14px', cursor: 'pointer' }}>
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function IdentityStep({ onNext }) {
  const { user, setInitialNickname, uploadAvatar } = useUserStore();
  const [nickname, setNickname] = useState('');
  const [photo, setPhoto] = useState(null);
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  const submit = async () => {
    setBusy(true);
    setError('');
    if (nickname.trim()) {
      const result = await setInitialNickname(nickname.trim());
      if (result.error) { setError(result.error); setBusy(false); return; }
    }
    if (photo) {
      const result = await uploadAvatar(photo);
      if (result.error) { setError(result.error); setBusy(false); return; }
    }
    setBusy(false);
    onNext();
  };

  return (
    <div style={{ width: '100%', maxWidth: '350px', display: 'flex', flexDirection: 'column', gap: '16px', textAlign: 'center' }}>
      <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, fontSize: '24px', color: '#F0F0F8' }}>Kdo jsi jako hráč?</div>
      <div style={{ fontFamily: 'Inter', fontSize: '13px', color: '#9A9AB5', lineHeight: 1.5 }}>
        Vytvoř si viditelnou přezdívku ve hře. Když ji nevyplníš, zůstaneš <strong style={{ color: '#F0F0F8' }}>{user?.name || 'Pozorovatel'}</strong> — změnit ji můžeš později v profilu.
      </div>

      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        aria-label="Nahrát profilovou fotku"
        style={{
          alignSelf: 'center', width: '88px', height: '88px', borderRadius: '50%', border: '1.5px dashed #A78BFA',
          background: preview ? `center / cover no-repeat url(${preview})` : '#241C3C', color: '#A78BFA',
          display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer'
        }}
      >
        {!preview && <Camera size={26} />}
      </button>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          if (preview) URL.revokeObjectURL(preview);
          setPhoto(f);
          setPreview(URL.createObjectURL(f));
        }}
      />
      <div style={{ fontFamily: 'Inter', fontSize: '11px', color: '#6B6B8A', marginTop: '-8px' }}>Fotka je volitelná (max 2 MB)</div>

      <input
        value={nickname}
        onChange={(e) => { setNickname(e.target.value); if (error) setError(''); }}
        placeholder="Tvoje přezdívka"
        maxLength={20}
        style={inputStyle}
      />
      {error && <div role="alert" style={{ color: '#EF4444', fontSize: '12px', fontFamily: 'Inter' }}>{error}</div>}

      <button type="button" onClick={submit} disabled={busy} style={{ ...primaryStyle, opacity: busy ? 0.7 : 1 }}>
        {busy ? 'Ukládám…' : 'Pokračovat'}
      </button>
      <div style={{ display: 'flex', justifyContent: 'center', gap: '12px' }}>
        <button type="button" onClick={onNext} style={linkStyle}>Přeskočit tento krok</button>
        <SkipOnboardingLink step="identity" />
      </div>
    </div>
  );
}

// Game Bible · Viral "VIRAL LANDING PAGE" — the landing keeps the reason the player came:
// "Vitex tě vyzval k Questu „…". Zabere … Zahraj ho zdarma." Renders nothing without an invite.
export function InviteBanner({ style = {} }) {
  const { inviteContext, fetchInviteContext } = useUserStore();
  const [invite] = useState(() => getPendingInvite());

  useEffect(() => {
    if (invite?.code) fetchInviteContext(invite.code, invite.questId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!invite || !inviteContext?.inviter_name) return null;
  return (
    <div style={{ background: '#1C1630', border: '1px solid #7C3AED', borderRadius: '16px', padding: '12px 14px', textAlign: 'left', ...style }}>
      <div style={{ fontFamily: 'Inter', fontSize: '13px', color: '#F0F0F8', lineHeight: 1.5 }}>
        {inviteContext.quest_title
          ? <><strong>{inviteContext.inviter_name}</strong> tě vyzval(a) k Questu „{inviteContext.quest_title}“.</>
          : <><strong>{inviteContext.inviter_name}</strong> tě zve do Hry Reality.</>}
      </div>
      <div style={{ fontFamily: 'Inter', fontSize: '12px', color: '#9A9AB5', marginTop: '4px' }}>
        {inviteContext.quest_minutes ? `Zabere zhruba ${inviteContext.quest_minutes} min. ` : ''}Zahraj zdarma.
      </div>
    </div>
  );
}

// Referral "OFFLINE ATTRIBUTION": a player who got a code (event, QR, a friend) can type it in
// before signing up. Verified against get_invite_context(); an unknown code is not stored.
export function InviteCodeEntry({ style = {} }) {
  const { fetchInviteContext } = useUserStore();
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState('');
  const [state, setState] = useState(''); // '' | checking | ok:<name> | unknown

  const apply = async () => {
    setState('checking');
    const context = await fetchInviteContext(code.trim().toUpperCase(), null);
    if (context?.inviter_name) {
      captureExplicitCode(code);
      track('invite_code_entered', { valid: true });
      setState(`ok:${context.inviter_name}`);
    } else {
      track('invite_code_entered', { valid: false });
      setState('unknown');
    }
  };

  if (state.startsWith('ok:')) {
    return <div style={{ fontFamily: 'Inter', fontSize: '12px', color: '#22C55E', textAlign: 'center', ...style }}>Pozvánka od {state.slice(3)} uložena.</div>;
  }
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} style={{ ...linkStyle, ...style }}>
        Mám kód pozvánky
      </button>
    );
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', ...style }}>
      <div style={{ display: 'flex', gap: '8px' }}>
        <input value={code} onChange={(e) => { setCode(e.target.value); setState(''); }} placeholder="Kód pozvánky" maxLength={40}
          style={{ ...inputStyle, height: '42px', flex: 1 }} />
        <button type="button" onClick={apply} disabled={code.trim().length < 4 || state === 'checking'}
          style={{ ...primaryStyle, width: 'auto', height: '42px', padding: '0 16px', fontSize: '14px' }}>
          Použít
        </button>
      </div>
      {state === 'unknown' && <div role="alert" style={{ fontFamily: 'Inter', fontSize: '12px', color: '#EF4444' }}>Tento kód neexistuje.</div>}
    </div>
  );
}

// spec-14 §6 "Další úroveň je připravena. Odteď záleží na tom, co uděláš ty." — shown ~1.5 s,
// then straight into the first story node (not the feed — spec-17 §3). A player who came from
// a quest invite is handed to that quest (Game Bible · Viral "NEW PLAYER HANDOFF").
export function TransitionStep() {
  const { completeOnboarding, openTryToo } = useUserStore();
  const navigate = useNavigate();
  useEffect(() => {
    const t = setTimeout(async () => {
      await completeOnboarding();
      const invite = getPendingInvite();
      clearAttribution();
      navigate('/story');
      if (invite?.questId) {
        track('invite_quest_handoff', { quest_id: invite.questId });
        openTryToo({ challenge_id: invite.questId });
      }
    }, 1500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div style={{ width: '100%', maxWidth: '350px', textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, fontSize: '26px', color: '#F0F0F8' }}>Další úroveň je připravena.</div>
      <div style={{ fontFamily: 'Inter', fontSize: '15px', color: '#9A9AB5', lineHeight: 1.6 }}>
        Odteď záleží na tom,<br />co uděláš ty.
      </div>
    </div>
  );
}
