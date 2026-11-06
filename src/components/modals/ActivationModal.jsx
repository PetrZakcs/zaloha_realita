import { useState } from 'react';
import { useUserStore } from '../../store/userStore';
import { track } from '../../lib/analytics';

// Finishing a skipped onboarding (spec-14): the pledge = first public proof (+1 key via
// publish_pledge), then complete_onboarding grants +50 XP and lifts the NPC state.
export default function ActivationModal() {
  const { submitPledge, completeOnboarding, closeModal } = useUserStore();
  const [pledge, setPledge] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!pledge.trim()) { setError('Napiš svůj slib — jednu větu „Jsem člověk, co…“.'); return; }
    setBusy(true);
    await submitPledge(pledge.trim());
    await completeOnboarding();
    track('onboarding_activated_later');
    setBusy(false);
    closeModal();
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', textAlign: 'center' }}>
      <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, fontSize: '22px', color: '#fff' }}>Aktivuj svou identitu</div>
      <div style={{ fontFamily: 'Inter', fontSize: '13px', color: '#9A9AB5', lineHeight: 1.5 }}>
        Tvůj slib se zveřejní jako tvůj první důkaz. Získáš +50 XP, první klíč a tvůj avatar přestane být šedý.
      </div>
      <textarea
        value={pledge}
        onChange={(e) => { setPledge(e.target.value); if (error) setError(''); }}
        placeholder="Jsem člověk, co…"
        rows={3}
        maxLength={280}
        style={{
          width: '100%', background: '#2A2142', border: `1px solid ${error ? '#EF4444' : '#7C3AED'}`, borderRadius: '14px',
          color: '#F0F0F8', padding: '12px 14px', fontSize: '14px', outline: 'none', resize: 'none', boxSizing: 'border-box'
        }}
      />
      {error && <div role="alert" style={{ color: '#EF4444', fontSize: '12px', fontFamily: 'Inter' }}>{error}</div>}
      <button
        type="button"
        onClick={submit}
        disabled={busy}
        style={{ width: '100%', height: '46px', background: '#7C3AED', color: '#fff', fontFamily: 'Inter', fontWeight: 700, fontSize: '15px', border: 'none', borderRadius: '16px', cursor: 'pointer', opacity: busy ? 0.7 : 1 }}
      >
        {busy ? 'Aktivuji…' : 'Zveřejnit a aktivovat'}
      </button>
    </div>
  );
}
