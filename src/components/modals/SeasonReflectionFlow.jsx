import { useEffect, useState } from 'react';
import { useUserStore } from '../../store/userStore';
import { track } from '../../lib/analytics';
import { buildReferralLink, shareContent } from '../../lib/share';
import { startCheckout } from '../../lib/checkout';
import { ArrowRight, Share2, Sparkles, Lock, Check } from 'lucide-react';

// Optional, configured per environment once the client supplies them.
const VIP_DISCORD_URL = process.env.REACT_APP_DISCORD_VIP_URL || '';
const DEPOSIT_ENABLED = process.env.REACT_APP_DEPOSIT_ENABLED === 'true';


// "Referenční uzel" (MVP1 spec-5) — shown once, right after season completion. Eight steps,
// each intentionally tiny (spec's own "žádný dead time" rule): pre-frame -> reflection pause
// -> % slider -> NPS tap -> referral-intent tap -> pick-and-fill sentence -> identity-lock
// animation -> share card -> hidden node unlock. State lives in gameplaySlice
// (seasonReflectionStep/seasonReflectionAnswers) so a refresh mid-flow doesn't lose progress
// the same way the rest of onboarding already survives refreshes via the store.
//
// This is the app's main source of hard MVP1 validation data (% transformace, NPS, referral
// intent, UGC sentences) — see supabase_migration_season_reflection.sql for how it's stored.

const SENTENCE_TEMPLATES = [
  { id: 1, label: 'Předtím jsem ___, teď ___.', placeholder: 'Předtím jsem byl pozorovatel, teď jednám.' },
  { id: 2, label: 'Největší změna byla ___.', placeholder: 'Největší změna byla, že jsem přestal čekat.' },
  { id: 3, label: 'Uvědomil/a jsem si ___.', placeholder: 'Uvědomil jsem si, že vidím víc, než jsem si myslel.' }
];

const REFERRAL_OPTIONS = [0, 1, 2, 3];

function StepButton({ children, onClick, disabled, variant = 'primary' }) {
  const isPrimary = variant === 'primary';
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        width: '100%',
        height: '48px',
        background: disabled ? '#2E2650' : (isPrimary ? '#7C3AED' : 'transparent'),
        color: disabled ? '#6B6B8A' : (isPrimary ? '#fff' : '#9A9AB5'),
        fontFamily: 'Inter',
        fontWeight: '700',
        fontSize: '14px',
        border: isPrimary ? 'none' : '1px solid #382C5C',
        borderRadius: '16px',
        cursor: disabled ? 'not-allowed' : 'pointer',
        marginTop: '18px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '8px'
      }}
    >
      {children}
    </button>
  );
}

export default function SeasonReflectionFlow() {
  const {
    user,
    seasonReflectionStep: step,
    setSeasonReflectionStep,
    seasonReflectionAnswers: answers,
    updateSeasonReflectionAnswers,
    submitSeasonReflection,
    closeModal
  } = useUserStore();

  const [submitting, setSubmitting] = useState(false);
  const [shareState, setShareState] = useState('idle'); // idle | copied
  const [priceAnswer, setPriceAnswer] = useState(null);
  const [wantsNextTheme, setWantsNextTheme] = useState(false);

  const go = (next) => setSeasonReflectionStep(next);

  // Steps 2 (reflection pause) and 6 (identity-lock) are the only two spots the spec
  // explicitly wants a beat rather than a tap — everything else advances on user action.
  useEffect(() => {
    if (step === 'identity-lock') {
      const t = setTimeout(() => go('share'), 1600);
      return () => clearTimeout(t);
    }
  }, [step]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleShare = async () => {
    const shareText = `${user?.name || 'Hráč'} dokončil Hru Reality — ${answers.percent}% posun. "${answers.sentenceText}"`;
    track('season_share_clicked');
    const result = await shareContent({
      title: 'Dokončil jsem Hru Reality',
      text: shareText,
      url: buildReferralLink(user?.referralCode)
    });
    if (result.shared) {
      if (result.method === 'clipboard') setShareState('copied');
      track('season_share_completed', { method: result.method });
    }
    go('unlocked');
  };

  return (
    <div style={{ textAlign: 'center' }}>
      {step === 'pre-frame' && (
        <div>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '11px', color: '#6B6B8A', letterSpacing: '.08em' }}>
            SYSTÉM: SEKVENCE DOKONČENA
          </div>
          <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: '700', fontSize: '22px', color: '#fff', marginTop: '10px', lineHeight: '1.3' }}>
            7 uzlů.<br />7 rozhodnutí.
          </div>
          <div style={{ fontFamily: 'Inter', fontSize: '13px', color: '#9A9AB5', marginTop: '10px' }}>
            Ne každý se dostane až sem.
          </div>
          <StepButton onClick={() => go('reflection')}>Pokračovat <ArrowRight size={16} /></StepButton>
        </div>
      )}

      {step === 'reflection' && (
        <div>
          <div style={{ fontFamily: 'Inter', fontSize: '14px', color: '#F0F0F8', lineHeight: '1.6' }}>
            Na začátku jsi vstoupil jako pozorovatel.<br />Teď jsi prošel systémem.
          </div>
          <div style={{ fontFamily: 'Inter', fontSize: '13px', color: '#9A9AB5', marginTop: '14px' }}>
            Než půjdeš dál: zastav se na chvíli.
          </div>
          <StepButton onClick={() => go('slider')}>Pokračovat <ArrowRight size={16} /></StepButton>
        </div>
      )}

      {step === 'slider' && (
        <div>
          <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: '700', fontSize: '17px', color: '#fff' }}>
            O kolik % ses reálně posunul/a?
          </div>
          <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: '700', fontSize: '40px', color: '#A78BFA', marginTop: '18px' }}>
            {answers.percent}%
          </div>
          <input
            type="range"
            min={0}
            max={100}
            value={answers.percent}
            onChange={(e) => updateSeasonReflectionAnswers({ percent: Number(e.target.value) })}
            style={{ width: '100%', marginTop: '14px', accentColor: '#7C3AED' }}
          />
          <StepButton onClick={() => go('nps')}>Pokračovat <ArrowRight size={16} /></StepButton>
        </div>
      )}

      {step === 'nps' && (
        <div>
          <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: '700', fontSize: '17px', color: '#fff' }}>
            Doporučil/a bys to někomu?
          </div>
          <div style={{ display: 'flex', gap: '10px', marginTop: '18px' }}>
            <button
              onClick={() => { updateSeasonReflectionAnswers({ wouldRecommend: true }); go('referral-intent'); }}
              style={{ flex: 1, height: '48px', background: '#1C1630', border: '1px solid #22C55E', borderRadius: '14px', color: '#22C55E', fontFamily: 'Inter', fontWeight: '700', fontSize: '14px', cursor: 'pointer' }}
            >
              Ano
            </button>
            <button
              onClick={() => { updateSeasonReflectionAnswers({ wouldRecommend: false }); go('referral-intent'); }}
              style={{ flex: 1, height: '48px', background: '#1C1630', border: '1px solid #382C5C', borderRadius: '14px', color: '#9A9AB5', fontFamily: 'Inter', fontWeight: '700', fontSize: '14px', cursor: 'pointer' }}
            >
              Ne
            </button>
          </div>
        </div>
      )}

      {step === 'referral-intent' && (
        <div>
          <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: '700', fontSize: '17px', color: '#fff' }}>
            Kolik lidí bys do toho vzal/a s sebou?
          </div>
          <div style={{ display: 'flex', gap: '8px', marginTop: '18px' }}>
            {REFERRAL_OPTIONS.map((n) => (
              <button
                key={n}
                onClick={() => { updateSeasonReflectionAnswers({ referralIntent: n }); go('sentence'); }}
                style={{ flex: 1, height: '48px', background: '#1C1630', border: '1px solid #382C5C', borderRadius: '14px', color: '#F0F0F8', fontFamily: 'Inter', fontWeight: '700', fontSize: '14px', cursor: 'pointer' }}
              >
                {n === 3 ? '3+' : n}
              </button>
            ))}
          </div>
        </div>
      )}

      {step === 'sentence' && (
        <div style={{ textAlign: 'left' }}>
          <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: '700', fontSize: '17px', color: '#fff', textAlign: 'center' }}>
            Vyber jednu větu a doplň ji
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '16px' }}>
            {SENTENCE_TEMPLATES.map((t) => (
              <button
                key={t.id}
                onClick={() => updateSeasonReflectionAnswers({ sentenceTemplate: t.id })}
                style={{
                  textAlign: 'left',
                  padding: '10px 12px',
                  borderRadius: '12px',
                  background: answers.sentenceTemplate === t.id ? '#2E2650' : '#1C1630',
                  border: answers.sentenceTemplate === t.id ? '1px solid #7C3AED' : '1px solid #382C5C',
                  color: '#F0F0F8',
                  fontFamily: 'Inter',
                  fontSize: '13px',
                  cursor: 'pointer'
                }}
              >
                {t.label}
              </button>
            ))}
          </div>

          {answers.sentenceTemplate && (
            <textarea
              value={answers.sentenceText}
              onChange={(e) => updateSeasonReflectionAnswers({ sentenceText: e.target.value })}
              placeholder={SENTENCE_TEMPLATES.find(t => t.id === answers.sentenceTemplate)?.placeholder}
              maxLength={500}
              style={{
                width: '100%',
                height: '90px',
                background: '#1C1630',
                border: '0.5px solid #382C5C',
                borderRadius: '12px',
                padding: '10px',
                fontFamily: 'Inter',
                fontSize: '13px',
                color: '#fff',
                resize: 'none',
                outline: 'none',
                boxSizing: 'border-box',
                marginTop: '12px'
              }}
            />
          )}

          <StepButton
            disabled={!answers.sentenceTemplate || !answers.sentenceText.trim() || submitting}
            onClick={async () => {
              setSubmitting(true);
              await submitSeasonReflection();
              setSubmitting(false);
            }}
          >
            {submitting ? 'Odesílám…' : <>Dokončit <ArrowRight size={16} /></>}
          </StepButton>
        </div>
      )}

      {step === 'identity-lock' && (
        <div>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '11px', color: '#6B6B8A', letterSpacing: '.08em' }}>
            STATUS AKTUALIZOVÁN
          </div>
          <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: '700', fontSize: '20px', color: '#fff', marginTop: '10px' }}>
            POZOROVATEL → HRÁČ
          </div>
          <div style={{ fontFamily: 'Inter', fontSize: '13px', color: '#9A9AB5', marginTop: '10px' }}>
            Tvoje rozhodnutí: dokončit.
          </div>
        </div>
      )}

      {step === 'share' && (
        <div>
          <div style={{
            background: '#1C1630',
            border: '1px solid #382C5C',
            borderRadius: '16px',
            padding: '16px',
            textAlign: 'left'
          }}>
            <div style={{ fontFamily: 'Inter', fontWeight: '700', fontSize: '13px', color: '#fff' }}>{user?.name || 'Hráč'}</div>
            <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: '700', fontSize: '15px', color: '#A78BFA', marginTop: '4px' }}>
              Dokončil Hru Reality
            </div>
            <div style={{ fontFamily: 'Inter', fontSize: '12px', color: '#9A9AB5', marginTop: '8px' }}>
              {answers.percent}% reálný posun
            </div>
            {answers.sentenceText && (
              <div style={{ fontFamily: 'Inter', fontSize: '12px', color: '#F0F0F8', marginTop: '8px', fontStyle: 'italic' }}>
                „{answers.sentenceText}"
              </div>
            )}
          </div>

          <StepButton onClick={handleShare}>
            {shareState === 'copied' ? <>Zkopírováno <Check size={16} /></> : <>Sdílej svůj výsledek <Share2 size={16} /></>}
          </StepButton>
          <StepButton variant="secondary" onClick={() => go('unlocked')}>Přeskočit</StepButton>
        </div>
      )}

      {step === 'unlocked' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '14px' }}>
            <span style={{
              width: '54px',
              height: '54px',
              borderRadius: '50%',
              background: '#241a3d',
              border: '2px solid #7C3AED',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 0 20px rgba(124,58,237,.4)'
            }}>
              <Sparkles size={26} style={{ color: '#A78BFA' }} />
            </span>
          </div>
          <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: '700', fontSize: '19px', color: '#fff' }}>
            Odemčeno: Hidden Node
          </div>
          <div style={{ fontFamily: 'Inter', fontSize: '13px', color: '#9A9AB5', marginTop: '8px', lineHeight: '1.5' }}>
            Získal/a jsi odznak <strong style={{ color: '#F0F0F8' }}>Light Bearer Season 0</strong> a přístup do VIP Discord roomu.
          </div>
          {VIP_DISCORD_URL && (
            <a
              href={VIP_DISCORD_URL}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => track('vip_discord_clicked')}
              style={{ display: 'block', fontFamily: 'Inter', fontWeight: 600, fontSize: '13px', color: '#A78BFA', marginTop: '12px' }}
            >
              Vstoupit do VIP Discord roomu →
            </a>
          )}

          {/* spec-19 C) monetization signals: price sensitivity, purchase intent, deposit */}
          <div style={{ marginTop: '20px', textAlign: 'left', background: '#1C1630', border: '0.5px solid #382C5C', borderRadius: '14px', padding: '14px' }}>
            <div style={{ fontFamily: 'Inter', fontWeight: 600, fontSize: '13px', color: '#F0F0F8' }}>Kolik bys dal/a za pokračování?</div>
            <div style={{ display: 'flex', gap: '6px', marginTop: '10px', flexWrap: 'wrap' }}>
              {[49, 99, 149, 199].map(price => (
                <button
                  key={price}
                  type="button"
                  onClick={() => { setPriceAnswer(price); track('price_sensitivity_answered', { price_czk: price }); }}
                  style={{
                    fontFamily: 'Inter', fontWeight: 600, fontSize: '12px', borderRadius: '20px', padding: '6px 12px', cursor: 'pointer',
                    background: priceAnswer === price ? '#7C3AED' : 'transparent', color: priceAnswer === price ? '#fff' : '#A78BFA',
                    border: '1px solid #7C3AED'
                  }}
                >
                  {price} Kč
                </button>
              ))}
            </div>
            <button
              type="button"
              disabled={wantsNextTheme}
              onClick={() => { setWantsNextTheme(true); track('purchase_intent_next_theme'); }}
              style={{ marginTop: '12px', background: 'none', border: 'none', padding: 0, fontFamily: 'Inter', fontWeight: 600, fontSize: '13px', color: wantsNextTheme ? '#22C55E' : '#F5B73F', cursor: wantsNextTheme ? 'default' : 'pointer' }}
            >
              {wantsNextTheme ? '✓ Dáme ti vědět, až bude další téma' : 'Chci další téma →'}
            </button>
            {DEPOSIT_ENABLED && (
              <button
                type="button"
                onClick={async () => {
                  const result = await startCheckout('deposit');
                  if (result.error) alert('Rezervaci se nepodařilo zahájit. Zkus to prosím později.');
                }}
                style={{ display: 'block', marginTop: '10px', background: 'none', border: 'none', padding: 0, fontFamily: 'Inter', fontWeight: 600, fontSize: '13px', color: '#F5B73F', cursor: 'pointer' }}
              >
                Rezervuj si místo v další sezóně (vratná záloha) →
              </button>
            )}
          </div>

          <StepButton
            onClick={() => {
              track('referential_node_completed');
              closeModal();
            }}
          >
            <Lock size={16} /> Zavřít
          </StepButton>
        </div>
      )}
    </div>
  );
}
