import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUserStore } from '../store/userStore';
import { supabase } from '../api/supabaseClient';
import { track } from '../lib/analytics';
import { buildReferralLink, shareContent } from '../lib/share';
import { ALL_CARDS, isCardUnlocked } from '../lib/cards';
import { keysLabel } from '../lib/plural';
import { getAvatarLevel } from '../lib/avatarLevels';
import MysteryBoxModal from './modals/MysteryBoxModal';
import ShareMomentButton from './common/ShareMomentButton';
import ActivationModal from './modals/ActivationModal';
import TryTooModal from './modals/TryTooModal';
import NotificationsPanel from './modals/NotificationsPanel';
import IdentityReveal from './modals/IdentityReveal';
import { getPushStatus, subscribeToPush, unsubscribeFromPush } from '../lib/push';
import { startCheckout } from '../lib/checkout';
import { isSoundMuted, playSound, setSoundMuted } from '../lib/sfx';
import {
  X, Check, KeyRound, Lock, Crown, ArrowRight, Shield, Zap,
  ImageIcon, Globe, Bell, Sparkles, Loader2, Volume2, VolumeX, Clock, Share2, Users, Sunrise, Rocket, Award, LogOut, Trash2
} from 'lucide-react';
import OnboardingFlow from './modals/OnboardingFlow';
import SeasonReflectionFlow from './modals/SeasonReflectionFlow';

const YEARLY_PASS_ENABLED = process.env.REACT_APP_PASS_YEARLY_ENABLED === 'true';
const DISCORD_INVITE_URL = process.env.REACT_APP_DISCORD_INVITE_URL || '';

export default function ModalManager() {
  const navigate = useNavigate();
  const {
    user,
    onboarded,
    sessionChecked,
    activeModal,
    activeChallenge,
    activeNodeLoops,
    activeStoryNode,
    closeModal,
    openModal,
    updateUser,
    submitProof,
    mockLogs,
    logout,
    deleteAccount,
    passActivation,
    activeStoryNodeSteps,
    allStoryNodes,
    unlockedCards,
    advanceNode,
    referralSignupsCount,
    fetchReferralStats,
    changeDisplayNameOnce,
    welcomeBackDays,
    playerProgress,
    identityReveal,
    proofError,
    lastReward,
    mysteryBoxes
  } = useUserStore();

  // Onboarding text states
  const [tempName, setTempName] = useState(user?.name || 'TemnýPozorovatel');
  const [tempPledge, setTempPledge] = useState('Jsem člověk, co přestal čekat a začal jednat.');
  const [textProof, setTextProof] = useState('');
  const [publicToggle, setPublicToggle] = useState(false);
  const [proofMode, setProofMode] = useState('photo'); // 'photo' | 'text'
  const [photoFile, setPhotoFile] = useState(null);
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState(null);
  const [referralShareState, setReferralShareState] = useState('idle'); // 'idle' | 'copied'
  const [pushStatus, setPushStatus] = useState('not-subscribed'); // see src/lib/push.js getPushStatus()
  const [pushBusy, setPushBusy] = useState(false);
  const [passPlan, setPassPlan] = useState('monthly'); // 'monthly' | 'yearly'
  const [portalBusy, setPortalBusy] = useState(false);
  const [soundMuted, setSoundMutedState] = useState(() => isSoundMuted());
  const [deleteStep, setDeleteStep] = useState(0); // 0 | 1 (asked to confirm)
  const [deleteError, setDeleteError] = useState('');
  const questStartedAt = useRef(null);

  // "Zrušíš kdykoliv" — Stripe Customer Portal via the stripe-portal edge function.
  const openBillingPortal = async () => {
    setPortalBusy(true);
    track('billing_portal_opened');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('No session');
      const response = await fetch(`${process.env.REACT_APP_SUPABASE_URL}/functions/v1/stripe-portal`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` }
      });
      const resData = await response.json();
      if (!resData.url) throw new Error(resData.error || 'Portal unavailable');
      window.location.href = resData.url;
    } catch (e) {
      console.warn('Billing portal failed.', e);
      alert('Správu předplatného se nepodařilo otevřít. Zkus to prosím později.');
      setPortalBusy(false);
    }
  };

  // Identity reveal waits until no other modal (e.g. the quest celebration) is open.
  useEffect(() => {
    if (identityReveal && !activeModal) openModal('identity-reveal');
  }, [identityReveal, activeModal, openModal]);

  // Sync temp name when user store updates
  useEffect(() => {
    if (user?.name) {
      setTempName(user.name);
    }
  }, [user?.name]);

  // XP countup state
  const [xpDisplay, setXpDisplay] = useState(0);
  useEffect(() => {
    if (activeModal === 'celebration-xp') playSound('reward');
    if (activeModal === 'celebration-badge') playSound('levelUp');
    if (activeModal === 'pass-activated' && passActivation === 'active') playSound('levelUp');
    if (activeModal === 'celebration-xp' || activeModal === 'success-overlay') {
      const target = user?.xp || 0;
      const start = Math.max(0, target - (lastReward?.xpGained || 0));
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
  }, [activeModal, user?.xp, lastReward?.xpGained, passActivation]);

  // Referral count/link is shown in both the paywall's earn-to-unlock CTA and Settings —
  // refresh it whenever either opens instead of only once at login, so a milestone reward
  // granted in another tab/session shows up without a full app reload.
  useEffect(() => {
    if (activeModal === 'paywall' || activeModal === 'settings') {
      setReferralShareState('idle');
      fetchReferralStats();
    }
    if (activeModal === 'settings') {
      setDeleteStep(0);
      setDeleteError('');
      getPushStatus().then(setPushStatus);
    }
  }, [activeModal]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (activeModal === 'welcome-back') {
      track('welcome_back_shown', { days: welcomeBackDays, absence_state: playerProgress?.absence_state || null });
    }
  }, [activeModal]); // eslint-disable-line react-hooks/exhaustive-deps

  // spec-11 "CORE GAME" KPI: challenge start/view funnel — previously untracked, so there
  // was no way to compute "kolik výzev bylo spuštěno" or a start->proof completion ratio.
  useEffect(() => {
    if (activeModal === 'challenge-detail') {
      track('challenge_viewed', { node: user?.uzel, challenge_id: activeChallenge?.id });
    }
    if (activeModal === 'proof-upload') {
      questStartedAt.current = Date.now();
      track('challenge_started', { node: user?.uzel, challenge_id: activeChallenge?.id });
    }
  }, [activeModal]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reset the proof form each time the upload modal is (re)opened
  useEffect(() => {
    if (activeModal === 'proof-upload') {
      const defaultMode = activeChallenge?.proof_type === 'TEXT' ? 'text' : 'photo';
      setProofMode(defaultMode);
      setPhotoFile(null);
      setPhotoPreviewUrl(null);
      setTextProof('');
      setPublicToggle(true);
    }
  }, [activeModal, activeChallenge?.proof_type]);

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

  // The Glitch Moment plays instead of the node transition and hands over to it when closed, so
  // the paywall (which advancing the 3rd node opens) can't overwrite it mid-animation.
  const finishGlitchMoment = () => {
    closeModal();
    advanceNode();
  };

  const finishCelebration = async () => {
    if (lastReward?.proofNumber === 3 && !lastReward?.alreadyCompleted && !localStorage.getItem('glitchMomentShown')) {
      localStorage.setItem('glitchMomentShown', 'true');
      openModal('glitch-moment');
      return;
    }
    await advanceNode();
    // spec-17 §3: onboarding → first quest → first proof → first reward → feed.
    if (lastReward?.firstQuest) navigate('/feed');
  };

  const monthlyPrice = user?.passLapsed ? 199 : 149;
  const totalNodes = allStoryNodes.length || 9;
  const lastQuestNode = allStoryNodes.filter(n => n.type === 'CHALLENGE').slice(-1)[0]?.node_order;

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
            onClick={activeModal === 'glitch-moment' ? finishGlitchMoment : closeModal}
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
        {activeModal === 'challenge-detail' && activeChallenge && (
          <div>
            <div style={{ height: '120px', borderRadius: '16px', background: 'repeating-linear-gradient(135deg,#1C1630,#1C1630 10px,#241C3C 10px,#241C3C 20px)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '6px', marginBottom: '14px', flexShrink: 0 }}>
              <ImageIcon size={24} style={{ color: '#22C55E' }} />
              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '9px', color: '#6B6B8A' }}>Uzel {user?.uzel ?? 1} / {totalNodes}</span>
            </div>
            
            <div style={{ fontFamily: 'Inter', fontWeight: '600', fontSize: '10px', letterSpacing: '.12em', textTransform: 'uppercase', color: '#8B5CF6' }}>
              Uzel {user?.uzel ?? 1}{activeNodeLoops.length > 1 ? ` · Loop ${(activeNodeLoops.findIndex(l => l.id === activeChallenge.id) + 1) || 1}/${activeNodeLoops.length}` : ''}{activeChallenge.estimated_minutes ? ` · ~${activeChallenge.estimated_minutes} min` : ''}
            </div>
            <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: '700', fontSize: '22px', marginTop: '6px', color: '#fff' }}>
              {activeChallenge.title}
            </div>
            <div style={{ borderLeft: '2px solid #7C3AED', paddingLeft: '10px', marginTop: '12px' }}>
              <span style={{ fontFamily: 'Inter', fontStyle: 'italic', fontSize: '12px', color: '#9A9AB5' }}>
                {activeChallenge.description}
              </span>
            </div>

            {activeChallenge.why_text && (
              <div style={{ fontFamily: 'Inter', fontSize: '12px', color: '#A78BFA', marginTop: '10px', lineHeight: 1.5 }}>
                Proč: {activeChallenge.why_text}
              </div>
            )}

            {activeStoryNodeSteps.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '16px' }}>
                {activeStoryNodeSteps.map(step => (
                  <div key={step.id} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#7C3AED', flexShrink: 0 }}></span>
                    <span style={{ fontFamily: 'Inter', fontSize: '12px', color: '#F0F0F8' }}>{step.text}</span>
                  </div>
                ))}
              </div>
            )}

            <div style={{ marginTop: '18px' }}>
              <div style={{ fontFamily: 'Inter', fontWeight: '600', fontSize: '10px', color: '#6B6B8A', marginBottom: '8px' }}>Odměny za splnění:</div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <div style={{ flex: 1, background: '#2A1E10', border: '1px solid #F5B73F', borderRadius: '12px', padding: '10px 4px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                  <KeyRound size={16} style={{ color: '#F5B73F' }} />
                  <span style={{ fontFamily: 'Inter', fontSize: '10px', color: '#F5B73F', fontWeight: '600' }}>+{keysLabel(activeChallenge.reward_keys)} (veřejný)</span>
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
                <ImageIcon size={13} /> Foto / video
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
                  background: photoPreviewUrl && !photoFile?.type?.startsWith('video/')
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
                  accept="image/*,video/*"
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
                {photoPreviewUrl && photoFile?.type?.startsWith('video/') && (
                  <video src={photoPreviewUrl} muted playsInline controls style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', borderRadius: '14px', background: '#000' }} />
                )}
                {!photoPreviewUrl && (
                  <>
                    <ImageIcon size={28} style={{ color: '#6B6B8A' }} />
                    <span style={{ fontFamily: 'Inter', fontSize: '11px', color: '#6B6B8A' }}>
                      VYBRAT NEBO NATOČIT DŮKAZ
                    </span>
                    <span style={{ fontFamily: 'Inter', fontSize: '10px', color: '#4A3D6E' }}>
                      foto max 10 MB · video max 50 MB
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
                <Globe size={13} /> Veřejný (+{keysLabel(activeChallenge?.reward_keys ?? 1)})
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
                <Lock size={13} /> Soukromý (0 klíčů)
              </button>
            </div>

            {proofError && (
              <div role="alert" style={{ fontFamily: 'Inter', fontSize: '12px', color: '#EF4444', background: 'rgba(239,68,68,.1)', borderRadius: '10px', padding: '8px 12px', marginTop: '12px' }}>
                {proofError}
              </div>
            )}

            <button
              disabled={proofMode === 'photo' ? !photoFile : !textProof.trim()}
              onClick={() => {
                submitProof({
                  text: proofMode === 'text' ? textProof : '',
                  photoFile: proofMode === 'photo' ? photoFile : null,
                  is_public: publicToggle,
                  startedAt: questStartedAt.current
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
              {user?.passHolder
                ? <>Udrž streak <span style={{ color: '#22C55E', fontWeight: '600' }}>3 dny</span> a odemkneš další fragment.</>
                : <>Další fragmenty a streak sbírají <span style={{ color: '#F5B73F', fontWeight: '600' }}>Founder hráči</span>.</>}
            </div>

            <button
              onClick={finishGlitchMoment}
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
              Pokračovat
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

        {activeModal === 'mystery-box' && <MysteryBoxModal />}
        {activeModal === 'activation' && <ActivationModal />}
        {activeModal === 'try-too' && <TryTooModal />}
        {activeModal === 'identity-reveal' && <IdentityReveal />}

        {/* MODAL 4: Success Overlay */}
        {activeModal === 'success-overlay' && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
            <span style={{ display: 'inline-flex', width: '48px', height: '48px', color: '#22C55E', marginBottom: '14px' }}>
              <Check size={48} style={{ filter: 'drop-shadow(0 0 10px rgba(34,197,94,.5))' }} />
            </span>
            <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: '700', fontSize: '24px', color: '#fff' }}>
              {lastReward?.alreadyCompleted ? 'Tuhle výzvu už máš splněnou' : 'Zásah zapsán!'}
            </div>
            <div style={{ fontFamily: 'Inter', fontSize: '13px', color: '#9A9AB5', marginTop: '6px' }}>
              {lastReward?.alreadyCompleted
                ? 'Odměna se za stejnou výzvu nepřipisuje dvakrát. Můžeš pokračovat dál.'
                : 'Tvůj důkaz je uložený ve světě Hry Reality. Jsi o krok dál.'}
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
              +{lastReward?.xpGained ?? 0}
            </div>
            <div style={{ fontFamily: 'Inter', fontSize: '13px', color: '#9A9AB5' }}>
              Nové skóre: <span style={{ color: '#fff', fontWeight: 'bold' }}>{xpDisplay} XP</span>
            </div>

            <button 
              onClick={() => {
                // Level-up screen only when the avatar level actually went up.
                if ((lastReward?.levelAfter || 0) > (lastReward?.levelBefore || 0)) {
                  openModal('celebration-badge');
                } else {
                  openModal('celebration-keys');
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
              Tvůj avatar se posunul!
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
              {getAvatarLevel(lastReward?.levelAfter).name}
            </div>
            <div style={{ fontFamily: 'Inter', fontWeight: '600', fontSize: '10px', letterSpacing: '.1em', textTransform: 'uppercase', color: '#A78BFA', border: '1px solid #A78BFA', borderRadius: '20px', padding: '3px 11px', marginTop: '6px' }}>
              Úroveň {lastReward?.levelAfter ?? 0}
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
              {(lastReward?.keysGained || 0) > 0 ? 'Klíče připsány' : 'Soukromý důkaz'}
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
              {(lastReward?.keysGained || 0) > 0 ? `+${keysLabel(lastReward.keysGained)}` : 'Bez klíče'}
            </div>
            {(lastReward?.keysGained || 0) === 0 && !lastReward?.alreadyCompleted && (
              <div style={{ fontFamily: 'Inter', fontSize: '12px', color: '#9A9AB5', marginTop: '6px' }}>
                Klíč dostáváš za veřejný důkaz ve feedu.
              </div>
            )}

            <div style={{ width: '100%', background: '#1C1630', border: '0.5px solid #382C5C', borderRadius: '14px', padding: '10px', marginTop: '16px', textAlign: 'center' }}>
              <div style={{ fontFamily: 'Inter', fontSize: '10px', color: '#6B6B8A' }}>Celkem</div>
              <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: '700', fontSize: '19px', color: '#F5B73F', marginTop: '2px' }}>
                {keysLabel(user?.keys_count ?? 0)}
              </div>
            </div>

            {mysteryBoxes.length > 0 && (
              <button
                onClick={() => openModal('mystery-box')}
                style={{ width: '100%', height: '42px', background: 'transparent', color: '#F5B73F', fontFamily: 'Inter', fontWeight: 700, fontSize: '14px', border: '1.5px solid #F5B73F', borderRadius: '14px', cursor: 'pointer', marginTop: '14px' }}
              >
                🎁 Máš {mysteryBoxes.length === 1 ? 'nový Mystery Box' : `${mysteryBoxes.length} Mystery Boxy`} — otevřít
              </button>
            )}

            {/* spec-17 §14: sharing only at strong moments — here the first proof (+1 klíč, not
                mandatory, 1 click). First box/title/mask, purchase and the certificate have
                their own share buttons. */}
            {lastReward?.firstQuest && (
              <div style={{ width: '100%', marginTop: '14px' }}>
                <ShareMomentButton
                  variant={lastReward.hasMedia ? 'proof' : 'quest'}
                  rewardSource={{ type: 'challenge', id: lastReward.challengeId }}
                  questId={lastReward.challengeId}
                  progressText={`Uzel ${user?.uzel ?? 1} / ${totalNodes}`}
                  sentence={lastReward.proofText}
                  label="Ukaž, že nejsi NPC"
                />
              </div>
            )}

            {/* Game Bible · Viral "RANK / MASTERY CARD" — only when the Lifetime Level went up */}
            {(lastReward?.lifetimeLevelAfter || 0) > (lastReward?.lifetimeLevelBefore || 0) && (
              <div style={{ width: '100%', marginTop: '10px' }}>
                <div style={{ fontFamily: 'Inter', fontSize: '13px', color: '#4AA8FF', fontWeight: 700, marginBottom: '8px' }}>
                  Level {lastReward.lifetimeLevelAfter}!
                </div>
                <ShareMomentButton variant="rank" progressText={`Level ${lastReward.lifetimeLevelAfter}`} label="Sdílet nový level" />
              </div>
            )}

            {/* Game Bible · Retention "D1 RETURN HOOK" + "NEXT QUEST PREVIEW": the player leaves
                knowing what's next and how close the next box is. */}
            {playerProgress && !lastReward?.alreadyCompleted && (
              <div style={{ width: '100%', background: '#1C1630', border: '0.5px solid #382C5C', borderRadius: '14px', padding: '10px 12px', marginTop: '14px', textAlign: 'left' }}>
                {playerProgress.next_quest_title && (
                  <div style={{ fontFamily: 'Inter', fontSize: '12px', color: '#F0F0F8' }}>
                    Další krok: <strong>{playerProgress.next_quest_title}</strong>
                    {playerProgress.next_quest_minutes ? <span style={{ color: '#9A9AB5' }}> · ~{playerProgress.next_quest_minutes} min</span> : null}
                  </div>
                )}
                <div style={{ fontFamily: 'Inter', fontSize: '11px', color: '#F5B73F', marginTop: '4px' }}>
                  {playerProgress.keys_toward_box}/{playerProgress.keys_per_box} klíčů k dalšímu Mystery Boxu
                </div>
              </div>
            )}

            {/* spec-15: Pass seed after node 2, nudge after node 4, "regret sale" after the last
                quest. Context only, never a gate. */}
            {!user?.passHolder && !lastReward?.alreadyCompleted && lastReward?.node === 2 && (
              <div style={{ fontFamily: 'Inter', fontSize: '12px', color: '#9A9AB5', marginTop: '14px', lineHeight: 1.5 }}>
                Founder hráči mají zvýrazněné důkazy a plný přístup bez čekání.
              </div>
            )}
            {!user?.passHolder && !lastReward?.alreadyCompleted && lastReward?.node === 4 && (
              <button
                onClick={() => { track('paywall_opened', { source: 'node_4_nudge' }); openModal('paywall'); }}
                style={{ background: 'none', border: 'none', fontFamily: 'Inter', fontSize: '12px', color: '#F5B73F', marginTop: '14px', cursor: 'pointer', lineHeight: 1.5 }}
              >
                Chceš, aby tvůj důkaz byl ve feedu zvýrazněný? Founder Pass →
              </button>
            )}
            {!user?.passHolder && !lastReward?.alreadyCompleted && lastReward?.node === lastQuestNode && (
              <button
                onClick={() => { track('paywall_opened', { source: 'regret_sale' }); openModal('paywall'); }}
                style={{ background: '#1C1630', border: '0.5px solid #382C5C', borderRadius: '12px', padding: '10px 12px', fontFamily: 'Inter', fontSize: '12px', color: '#9A9AB5', marginTop: '14px', cursor: 'pointer', lineHeight: 1.5, textAlign: 'left' }}
              >
                S Passem bys tu měl(a) Founder rámeček, zvýrazněné důkazy, plný certifikát a výraznější finální status. <span style={{ color: '#F5B73F' }}>Zjistit víc →</span>
              </button>
            )}

            {/* spec-18 MOMENT 2 (3rd proof) and spec-19 §6 (5th proof) behaviour triggers */}
            {lastReward?.proofNumber === 3 && !user?.passHolder && (
              <div style={{ fontFamily: 'Inter', fontSize: '12px', color: '#A78BFA', marginTop: '14px', lineHeight: 1.5 }}>
                Vidíme, že to bereš vážně. Pozvi 2 hráče a další vrstvu odemkneš okamžitě.
              </div>
            )}
            {lastReward?.proofNumber === 5 && !user?.passHolder && (
              <button
                onClick={() => { track('paywall_opened', { source: 'fifth_proof_trigger' }); openModal('paywall'); }}
                style={{ background: 'none', border: 'none', fontFamily: 'Inter', fontSize: '12px', color: '#F5B73F', marginTop: '14px', cursor: 'pointer', lineHeight: 1.5 }}
              >
                Vidíme, že to bereš vážně. Founder Pass ti odemkne plnou sezónu →
              </button>
            )}

            <button
              onClick={finishCelebration}
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
              Pokračovat
            </button>
          </div>
        )}

        {/* MODAL: spec-20 "po nákupu: Status aktivován. Jsi Founder." */}
        {activeModal === 'pass-activated' && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: '12px' }}>
            {passActivation === 'active' ? (
              <>
                <span style={{ width: '84px', height: '84px', borderRadius: '50%', background: '#2A1E10', border: '2px solid #F5B73F', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 32px rgba(245,183,63,.55)', animation: 'ringPulse 1.6s ease-out infinite' }}>
                  <Crown size={40} style={{ color: '#F5B73F' }} />
                </span>
                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '11px', letterSpacing: '.12em', color: '#F5B73F', textTransform: 'uppercase' }}>Status aktivován</div>
                <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: '700', fontSize: '26px', color: '#fff' }}>Jsi Founder.</div>
                <div style={{ fontFamily: 'Inter', fontSize: '13px', color: '#9A9AB5', lineHeight: 1.5 }}>Máš Founder rámeček a značku, zvýrazněné důkazy a celou sezónu bez čekání.</div>
                <ShareMomentButton variant="identity" rewardSource={{ type: 'pass', id: 'founder' }} progressText="Founder" label="Sdílet status" />
                <button onClick={closeModal} style={{ width: '100%', height: '46px', background: '#F5B73F', color: '#2A1E10', fontFamily: 'Inter', fontWeight: '700', fontSize: '15px', border: 'none', borderRadius: '16px', cursor: 'pointer' }}>Pokračovat ve hře</button>
              </>
            ) : passActivation === 'delayed' ? (
              <>
                <Clock size={36} style={{ color: '#9A9AB5' }} />
                <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: '700', fontSize: '20px', color: '#fff' }}>Platbu jsme přijali</div>
                <div style={{ fontFamily: 'Inter', fontSize: '13px', color: '#9A9AB5', lineHeight: 1.5 }}>Aktivace trvá déle než obvykle. Pass se ti zapne sám, stačí za chvíli znovu otevřít aplikaci.</div>
                <button onClick={closeModal} style={{ width: '100%', height: '46px', background: '#7C3AED', color: '#fff', fontFamily: 'Inter', fontWeight: '700', fontSize: '15px', border: 'none', borderRadius: '16px', cursor: 'pointer' }}>Rozumím</button>
              </>
            ) : (
              <>
                <Loader2 size={36} className="spin-ico" style={{ color: '#F5B73F' }} />
                <div style={{ fontFamily: 'Inter', fontSize: '13px', color: '#9A9AB5' }}>Aktivuji tvůj Founder Pass…</div>
              </>
            )}
          </div>
        )}

        {/* MODAL 8: Founder Pass. Every benefit listed here is real and implemented (spec-13:
            "objektivní rozdíly, ne marketingové"). */}
        {activeModal === 'paywall' && user?.passHolder && (
          <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
            <Crown size={36} style={{ color: '#F5B73F' }} />
            <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: '700', fontSize: '22px', color: '#fff' }}>Jsi Founder</div>
            <div style={{ fontFamily: 'Inter', fontSize: '13px', color: '#9A9AB5', lineHeight: 1.5 }}>Tvůj Founder Pass je aktivní. Celá sezóna bez čekání, zvýrazněné důkazy a plný certifikát.</div>
            <button onClick={openBillingPortal} disabled={portalBusy} style={{ width: '100%', height: '42px', background: 'transparent', border: '1px solid #F5B73F', color: '#F5B73F', fontFamily: 'Inter', fontWeight: '600', fontSize: '13px', borderRadius: '12px', cursor: 'pointer', marginTop: '6px' }}>
              {portalBusy ? 'Otevírám…' : 'Spravovat / zrušit předplatné'}
            </button>
          </div>
        )}
        {activeModal === 'paywall' && !user?.passHolder && (
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
            <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: '700', fontSize: '22px', color: '#fff', lineHeight: 1.2 }}>
              Dostal ses dál než většina nových hráčů.
            </div>
            <div style={{ fontFamily: 'Inter', fontSize: '13px', color: '#9A9AB5', marginTop: '6px', lineHeight: '1.45' }}>
              Teď se rozhoduje, jestli zůstaneš pozorovatel… nebo se staneš aktivním hráčem.
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '16px', textAlign: 'left' }}>
              {[
                { Icon: Rocket, text: 'Celá sezóna hned, bez limitu 1 uzel denně' },
                { Icon: Crown, text: 'Founder rámeček, značka a titul na profilu' },
                { Icon: Sparkles, text: 'Zvýrazněné a viditelnější důkazy ve feedu' },
                { Icon: Award, text: 'Plný certifikát po dokončení sezóny' },
                { Icon: KeyRound, text: 'Streak a sbírání fragmentů kódu' },
              ].map(({ Icon, text }) => (
                <div key={text} style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#1C1630', borderRadius: '12px', padding: '10px 12px' }}>
                  <span style={{ color: '#F5B73F', display: 'inline-flex' }}><Icon size={16} /></span>
                  <span style={{ fontFamily: 'Inter', fontSize: '12px', color: '#F0F0F8' }}>{text}</span>
                </div>
              ))}
            </div>

            <div style={{
              background: '#2A1E10',
              border: '1px dashed #F5B73F',
              borderRadius: '16px',
              padding: '14px',
              marginTop: '18px'
            }}>
              {/* Roční varianta (spec-20: 999 Kč/rok) se zobrazí až po nastavení
                  REACT_APP_PASS_YEARLY_ENABLED=true + STRIPE_PRICE_ID_YEARLY v stripe-checkout. */}
              {YEARLY_PASS_ENABLED && (
                <div style={{ display: 'flex', gap: '6px', justifyContent: 'center', marginBottom: '10px' }}>
                  {[{ key: 'monthly', label: 'Měsíčně' }, { key: 'yearly', label: 'Ročně' }].map(opt => (
                    <button
                      key={opt.key}
                      type="button"
                      onClick={() => setPassPlan(opt.key)}
                      style={{
                        fontFamily: 'Inter', fontWeight: 600, fontSize: '12px', borderRadius: '20px', padding: '5px 14px', cursor: 'pointer',
                        background: passPlan === opt.key ? '#F5B73F' : 'transparent', color: passPlan === opt.key ? '#15111E' : '#F5B73F',
                        border: '1px solid #F5B73F'
                      }}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              )}
              <div style={{ fontFamily: 'Inter', fontSize: '12px', color: '#F5B73F' }}>Founder Pass · {passPlan === 'yearly' ? 'roční' : 'měsíční'}</div>
              <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: '700', fontSize: '26px', color: '#fff', marginTop: '4px' }}>
                {passPlan === 'yearly' ? '999 Kč' : `${monthlyPrice} Kč`} <span style={{ fontSize: '14px', color: '#9A9AB5', fontWeight: '500' }}>{passPlan === 'yearly' ? '/ rok' : '/ měsíc'}</span>
              </div>
              <div style={{ fontFamily: 'Inter', fontSize: '11px', color: '#9A9AB5', marginTop: '4px' }}>
                {passPlan === 'monthly' && !user?.passLapsed ? 'Tato cena ti zůstane, dokud Pass nezrušíš (pak 199 Kč). ' : ''}Zrušíš kdykoliv v Nastavení.
              </div>
            </div>

            <button
              onClick={async () => {
                const result = await startCheckout(passPlan);
                if (result.error === 'no_session') {
                  alert('Pro aktivaci Founder Passu se prosím nejdřív přihlas.');
                  closeModal();
                } else if (result.error) {
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
              Odemknout Founder Pass
            </button>

            {/* MVP1 spec soft-paywall: declining the Pass doesn't dead-end a free player —
                they can still take 1 story node/day (supabase_migration_free_daily_node.sql).
                Secondary, deliberately less prominent than the purchase CTA above. */}
            <button
              onClick={() => {
                track('paywall_declined_free_daily', { node: user?.uzel });
                closeModal();
                advanceNode(true);
              }}
              style={{
                width: '100%',
                height: '40px',
                background: 'transparent',
                color: '#9A9AB5',
                fontFamily: 'Inter',
                fontWeight: '600',
                fontSize: '13px',
                border: '1px solid #382C5C',
                borderRadius: '14px',
                cursor: 'pointer',
                marginTop: '10px'
              }}
            >
              Pokračovat zdarma (1 uzel denně)
            </button>

            {/* Earn-to-unlock (spec-4/spec-9): "Odemknout zdarma — přiveď 2 hráče". A
                supplement to the Pass, never a replacement — see
                supabase_migration_referral_system.sql for the exact reward (one stored
                pass-gate skip at 2 referred signups, consumed by advance_node()). */}
            <div style={{
              background: '#1C1630',
              border: '1px dashed #382C5C',
              borderRadius: '16px',
              padding: '14px',
              marginTop: '10px',
              textAlign: 'left'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#A78BFA' }}>
                <Users size={14} />
                <span style={{ fontFamily: 'Inter', fontWeight: '700', fontSize: '12px' }}>Nebo odemkni zdarma — přiveď 2 hráče</span>
              </div>
              <div style={{ fontFamily: 'Inter', fontSize: '11px', color: '#9A9AB5', marginTop: '4px' }}>
                {referralSignupsCount === null ? 'Načítám…' : `${Math.min(referralSignupsCount, 2)}/2 aktivních hráčů — počítá se, až pozvaný dokončí první výzvu. Druhý ti hned odemkne další uzel.`}
              </div>
              <button
                onClick={async () => {
                  track('referral_link_shared', { source: 'paywall' });
                  const result = await shareContent({
                    title: 'Hra Reality',
                    text: `${user?.name || 'Hráč'} tě zve do Hry Reality. Pojď hrát se mnou:`,
                    url: buildReferralLink(user?.referralCode)
                  });
                  if (result.shared) {
                    track('referral_link_share_completed', { source: 'paywall', method: result.method });
                    if (result.method === 'clipboard') setReferralShareState('copied');
                  }
                }}
                style={{
                  width: '100%',
                  height: '36px',
                  background: 'transparent',
                  color: '#A78BFA',
                  fontFamily: 'Inter',
                  fontWeight: '600',
                  fontSize: '12px',
                  border: '1px solid #382C5C',
                  borderRadius: '10px',
                  cursor: 'pointer',
                  marginTop: '10px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px'
                }}
              >
                {referralShareState === 'copied' ? <>Odkaz zkopírován <Check size={14} /></> : <>Sdílet zvací odkaz <Share2 size={14} /></>}
              </button>
            </div>

            <div style={{ fontFamily: 'Inter', fontSize: '11px', color: '#6B6B8A', textAlign: 'center', marginTop: '10px', lineHeight: '1.5' }}>
              Nákupem souhlasíš s <a href="/terms" style={{ color: '#9A9AB5', textDecoration: 'underline' }}>Obchodními podmínkami</a> a <a href="/privacy" style={{ color: '#9A9AB5', textDecoration: 'underline' }}>Zásadami ochrany osobních údajů</a>.
            </div>
          </div>
        )}

        {/* MODAL: Daily free-node limit reached (soft-gate, see advanceNode() / spec-8 §"Zamčený uzel") */}
        {activeModal === 'node-daily-limit' && (
          <div style={{ textAlign: 'center' }}>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '14px' }}>
              <span style={{
                width: '54px',
                height: '54px',
                borderRadius: '50%',
                background: '#1C1630',
                border: '2px solid #382C5C',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <Clock size={26} style={{ color: '#9A9AB5' }} />
              </span>
            </div>
            <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: '700', fontSize: '20px', color: '#fff' }}>
              Dnešní uzel je vyčerpán
            </div>
            <div style={{ fontFamily: 'Inter', fontSize: '13px', color: '#9A9AB5', marginTop: '8px', lineHeight: '1.5' }}>
              Bez Passu můžeš postoupit jen o 1 uzel denně. Tvůj progres čeká — vrať se zítra, nebo pokračuj hned bez čekání s Founder Passem.
            </div>

            <button
              onClick={() => { track('paywall_opened', { source: 'node_daily_limit' }); openModal('paywall'); }}
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
                marginTop: '20px'
              }}
            >
              Odemknout Founder Pass
            </button>

            <button
              onClick={closeModal}
              style={{
                width: '100%',
                height: '40px',
                background: 'transparent',
                color: '#6B6B8A',
                fontFamily: 'Inter',
                fontWeight: '600',
                fontSize: '13px',
                border: 'none',
                cursor: 'pointer',
                marginTop: '8px'
              }}
            >
              Zavřít
            </button>
          </div>
        )}

        {/* MODAL: Welcome back — D1 hook (spec-3 §14C) / 48h+ retention (spec-8 §7). Same
            underlying moment (a return session after a day-boundary gap, see fetchUser()),
            different copy by how many days it's been. No push/email infra behind this —
            it only fires because the player already opened the app; that's the ceiling of
            what's possible without notification permissions + a scheduled sender. */}
        {activeModal === 'welcome-back' && (() => {
          // Game Bible · Retention "COMEBACK ENGINE": 3+ days without a meaningful action →
          // "Tvoje cesta zůstala tady", one small step, never guilt or an offer.
          const comeback = playerProgress && playerProgress.absence_state !== 'active';
          if (comeback) {
            const pct = playerProgress.theme_total > 0 ? Math.round((playerProgress.theme_done / playerProgress.theme_total) * 100) : 0;
            return (
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: '700', fontSize: '20px', color: '#fff' }}>Vítej zpátky</div>
                <div style={{ fontFamily: 'Inter', fontSize: '14px', color: '#F0F0F8', marginTop: '10px', lineHeight: '1.5' }}>Tvoje cesta zůstala tady.</div>
                {playerProgress.node_title && (
                  <div style={{ fontFamily: 'Inter', fontSize: '13px', color: '#9A9AB5', marginTop: '6px' }}>
                    Posledně jsi pracoval(a) na: <strong style={{ color: '#fff' }}>{playerProgress.node_title}</strong> — {pct} %
                  </div>
                )}
                <div style={{ fontFamily: 'Inter', fontSize: '13px', color: '#9A9AB5', marginTop: '6px' }}>Dnes můžeš pokračovat jedním krokem.</div>
                <button
                  onClick={() => { track('comeback_continue', { state: playerProgress.absence_state, days: playerProgress.days_since_meaningful }); closeModal(); navigate('/story'); }}
                  style={{ width: '100%', height: '48px', background: '#7C3AED', color: '#fff', fontFamily: 'Inter', fontWeight: '700', fontSize: '15px', border: 'none', borderRadius: '16px', cursor: 'pointer', marginTop: '18px' }}
                >
                  Pokračovat
                </button>
              </div>
            );
          }
          const isD1 = welcomeBackDays === 1;
          return (
            <div style={{ textAlign: 'center' }}>
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '14px' }}>
                <span style={{
                  width: '54px',
                  height: '54px',
                  borderRadius: '50%',
                  background: isD1 ? '#1C2E24' : '#1C1630',
                  border: `2px solid ${isD1 ? '#22C55E' : '#382C5C'}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  <Sunrise size={26} style={{ color: isD1 ? '#22C55E' : '#9A9AB5' }} />
                </span>
              </div>

              <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: '700', fontSize: '19px', color: '#fff' }}>
                {isD1 ? 'Nový den' : 'Tvůj progres čeká'}
              </div>

              <div style={{ fontFamily: 'Inter', fontSize: '13px', color: '#9A9AB5', marginTop: '8px', lineHeight: '1.5' }}>
                {isD1
                  ? (activeStoryNode ? `Uzel „${activeStoryNode.title}" je připraven. Jsi připraven/a pokračovat?` : 'Další uzel je odemčen. Jsi připraven/a pokračovat?')
                  : (user?.passHolder
                      ? 'Founder hráči pokračují bez omezení — vrať se do hry.'
                      : 'Founder hráči mají plný přístup bez čekání.')}
              </div>

              <button
                onClick={() => { track('welcome_back_continue', { days: welcomeBackDays }); closeModal(); navigate('/story'); }}
                style={{
                  width: '100%',
                  height: '48px',
                  background: '#7C3AED',
                  color: '#fff',
                  fontFamily: 'Inter',
                  fontWeight: '700',
                  fontSize: '15px',
                  border: 'none',
                  borderRadius: '16px',
                  cursor: 'pointer',
                  marginTop: '18px'
                }}
              >
                Pokračovat
              </button>

              {!isD1 && !user?.passHolder && (
                <button
                  onClick={() => { track('welcome_back_paywall_opened', { days: welcomeBackDays }); openModal('paywall'); }}
                  style={{
                    width: '100%',
                    height: '40px',
                    background: 'transparent',
                    color: '#F5B73F',
                    fontFamily: 'Inter',
                    fontWeight: '600',
                    fontSize: '13px',
                    border: '1px solid #F5B73F',
                    borderRadius: '14px',
                    cursor: 'pointer',
                    marginTop: '10px'
                  }}
                >
                  Odemknout Founder Pass
                </button>
              )}
            </div>
          );
        })()}

        {/* MODAL: Referenční uzel — season-close reflection flow (spec-5). See
            components/modals/SeasonReflectionFlow.jsx for the 8-step flow itself; this
            just hosts it inside the same modal chrome/backdrop as everything else here. */}
        {activeModal === 'season-reflection' && <SeasonReflectionFlow />}

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
                {/* spec-10 §3: 1 free rename ever, enforced server-side (changeDisplayNameOnce()
                    / protect_profile_privileges()) — this is just an honest heads-up, not the
                    actual gate, so it can't be bypassed by editing the DOM. */}
                {user?.displayNameChangeUsed && (
                  <div style={{ fontFamily: 'Inter', fontSize: '10px', color: '#6B6B8A', marginTop: '4px' }}>
                    Bezplatnou změnu jména jsi už využil/a.
                  </div>
                )}
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

            {/* Oznámení (spec-3 §14A Web Push retention) — subscribe/unsubscribe only; the
                actual sending is a scheduled server-side job (send-retention-push), this
                just controls whether this device/browser is on the recipient list. */}
            {pushStatus !== 'unsupported' && (
              <div style={{
                background: '#1C1630',
                border: '0.5px solid #382C5C',
                borderRadius: '14px',
                padding: '12px',
                marginTop: '14px',
                display: 'flex',
                alignItems: 'center',
                gap: '10px'
              }}>
                <span style={{ display: 'inline-flex', width: '16px', height: '16px', color: '#A78BFA', flexShrink: 0 }}><Bell size={16} /></span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontFamily: 'Inter', fontWeight: '700', fontSize: '12px', color: '#F0F0F8' }}>Oznámení</div>
                  <div style={{ fontFamily: 'Inter', fontSize: '11px', color: '#9A9AB5', marginTop: '2px' }}>
                    {pushStatus === 'denied' ? 'Zakázáno v prohlížeči' : pushStatus === 'subscribed' ? 'Zapnuto na tomto zařízení' : 'Připomeneme, když se progres zastaví'}
                  </div>
                </div>
                <button
                  disabled={pushBusy || pushStatus === 'denied'}
                  onClick={async () => {
                    setPushBusy(true);
                    if (pushStatus === 'subscribed') {
                      await unsubscribeFromPush();
                      track('push_unsubscribed');
                      setPushStatus('not-subscribed');
                    } else {
                      const result = await subscribeToPush();
                      track(result.success ? 'push_subscribed' : 'push_subscribe_failed', { error: result.error });
                      setPushStatus(await getPushStatus());
                      if (!result.success && result.error) alert(result.error);
                    }
                    setPushBusy(false);
                  }}
                  style={{
                    height: '30px',
                    padding: '0 14px',
                    background: pushStatus === 'subscribed' ? 'transparent' : '#7C3AED',
                    color: pushStatus === 'subscribed' ? '#9A9AB5' : '#fff',
                    fontFamily: 'Inter',
                    fontWeight: '600',
                    fontSize: '11px',
                    border: pushStatus === 'subscribed' ? '1px solid #382C5C' : 'none',
                    borderRadius: '10px',
                    cursor: pushStatus === 'denied' ? 'not-allowed' : 'pointer',
                    opacity: pushBusy ? 0.6 : 1,
                    flexShrink: 0
                  }}
                >
                  {pushStatus === 'subscribed' ? 'Vypnout' : 'Zapnout'}
                </button>
              </div>
            )}

            {/* Pozvi přátele (spec-7 referral) — same link/reward mechanism as the paywall's
                earn-to-unlock CTA, surfaced here too since not everyone hits a locked node
                before they'd want to invite someone. */}
            <div style={{
              background: '#1C1630',
              border: '0.5px solid #382C5C',
              borderRadius: '14px',
              padding: '12px',
              marginTop: '14px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#A78BFA' }}>
                <Users size={14} />
                <span style={{ fontFamily: 'Inter', fontWeight: '700', fontSize: '12px' }}>Pozvi přátele</span>
              </div>
              <div style={{ fontFamily: 'Inter', fontSize: '11px', color: '#9A9AB5', marginTop: '4px' }}>
                {referralSignupsCount === null
                  ? 'Načítám…'
                  : `${referralSignupsCount} aktivních pozvaných (dokončili první výzvu) · 1. = +1 klíč, 2. = odemkni uzel zdarma, 3. = vzácná karta, 5. = odznak`}
              </div>
              <button
                onClick={async () => {
                  track('referral_link_shared', { source: 'settings' });
                  const result = await shareContent({
                    title: 'Hra Reality',
                    text: `${user?.name || 'Hráč'} tě zve do Hry Reality. Pojď hrát se mnou:`,
                    url: buildReferralLink(user?.referralCode)
                  });
                  if (result.shared) {
                    track('referral_link_share_completed', { source: 'settings', method: result.method });
                    if (result.method === 'clipboard') setReferralShareState('copied');
                  }
                }}
                style={{
                  width: '100%',
                  height: '36px',
                  background: 'transparent',
                  color: '#A78BFA',
                  fontFamily: 'Inter',
                  fontWeight: '600',
                  fontSize: '12px',
                  border: '1px solid #382C5C',
                  borderRadius: '10px',
                  cursor: 'pointer',
                  marginTop: '10px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px'
                }}
              >
                {referralShareState === 'copied' ? <>Odkaz zkopírován <Check size={14} /></> : <>Sdílet zvací odkaz <Share2 size={14} /></>}
              </button>
            </div>

            <button
              onClick={async () => {
                if (tempPledge !== user?.pledge) {
                  updateUser({ pledge: tempPledge });
                }

                const nameChanged = tempName.trim() && tempName.trim() !== user?.name;
                if (nameChanged) {
                  const result = await changeDisplayNameOnce(tempName.trim());
                  if (!result.success) {
                    alert(result.error || 'Změnu jména se nepodařilo uložit.');
                    return;
                  }
                }

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

            {/* spec-12 §3: community lives on Discord — direct link from the app */}
            {DISCORD_INVITE_URL && (
              <a
                href={DISCORD_INVITE_URL}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => track('discord_community_clicked', { source: 'settings' })}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', height: '40px',
                  border: '1px solid #5865F2', color: '#A5ADFF', fontFamily: 'Inter', fontWeight: '600', fontSize: '13px',
                  borderRadius: '12px', marginTop: '10px', textDecoration: 'none'
                }}
              >
                Komunita na Discordu →
              </a>
            )}

            {user?.passHolder && (
              <button
                onClick={openBillingPortal}
                disabled={portalBusy}
                style={{
                  width: '100%', height: '40px', background: 'transparent', border: '1px solid #F5B73F', color: '#F5B73F',
                  fontFamily: 'Inter', fontWeight: '600', fontSize: '13px', borderRadius: '12px', cursor: 'pointer', marginTop: '10px'
                }}
              >
                {portalBusy ? 'Otevírám…' : 'Spravovat / zrušit předplatné'}
              </button>
            )}

            <button
              onClick={() => { setSoundMuted(!soundMuted); setSoundMutedState(!soundMuted); }}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', width: '100%', height: '40px', background: 'transparent', color: '#9A9AB5', fontFamily: 'Inter', fontWeight: '600', fontSize: '13px', border: '1px solid #382C5C', borderRadius: '12px', cursor: 'pointer', marginTop: '10px' }}
            >
              {soundMuted ? <><VolumeX size={15} /> Zvuky vypnuté</> : <><Volume2 size={15} /> Zvuky zapnuté</>}
            </button>

            <button
              onClick={async () => { closeModal(); await logout(); navigate('/'); }}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', width: '100%', height: '40px', background: 'transparent', color: '#F0F0F8', fontFamily: 'Inter', fontWeight: '600', fontSize: '13px', border: '1px solid #382C5C', borderRadius: '12px', cursor: 'pointer', marginTop: '10px' }}
            >
              <LogOut size={15} /> Odhlásit se
            </button>

            {deleteStep === 0 ? (
              <button
                onClick={() => setDeleteStep(1)}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', width: '100%', height: '40px', background: 'transparent', color: '#EF4444', fontFamily: 'Inter', fontWeight: '600', fontSize: '13px', border: '1px solid #EF4444', borderRadius: '12px', cursor: 'pointer', marginTop: '10px' }}
              >
                <Trash2 size={15} /> Smazat účet
              </button>
            ) : (
              <div style={{ border: '1px solid #EF4444', borderRadius: '12px', padding: '12px', marginTop: '10px' }}>
                <div style={{ fontFamily: 'Inter', fontSize: '12px', color: '#F0F0F8', lineHeight: 1.5 }}>
                  Trvale smažeme tvůj účet, postup, důkazy a fotky. Vrátit to nejde.
                </div>
                {deleteError && <div role="alert" style={{ fontFamily: 'Inter', fontSize: '12px', color: '#EF4444', marginTop: '6px' }}>{deleteError}</div>}
                <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
                  <button onClick={() => setDeleteStep(0)} style={{ flex: 1, height: '36px', background: 'transparent', color: '#9A9AB5', border: '1px solid #382C5C', borderRadius: '10px', fontFamily: 'Inter', fontSize: '12px', cursor: 'pointer' }}>Zpět</button>
                  <button
                    onClick={async () => {
                      setDeleteError('');
                      const result = await deleteAccount();
                      if (result.error) { setDeleteError(result.error); return; }
                      navigate('/');
                    }}
                    style={{ flex: 1, height: '36px', background: '#EF4444', color: '#fff', border: 'none', borderRadius: '10px', fontFamily: 'Inter', fontWeight: '700', fontSize: '12px', cursor: 'pointer' }}
                  >
                    Smazat natrvalo
                  </button>
                </div>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'center', gap: '14px', marginTop: '18px' }}>
              <a href="/terms" style={{ fontFamily: 'Inter', fontSize: '12px', color: '#6B6B8A', textDecoration: 'underline' }}>Obchodní podmínky</a>
              <a href="/privacy" style={{ fontFamily: 'Inter', fontSize: '12px', color: '#6B6B8A', textDecoration: 'underline' }}>Ochrana osobních údajů</a>
            </div>
          </div>
        )}

        {/* MODAL 10: Notifications — real server notifications + preferences */}
        {activeModal === 'notifications' && <NotificationsPanel />}

        {/* MODAL 11: Collections / Sbírky */}
        {activeModal === 'collections' && (() => {
          const unlockedBadges = ALL_CARDS.filter(card =>
            isCardUnlocked(card, unlockedCards)
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
                      const isUnlocked = isCardUnlocked(card, unlockedCards);
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
