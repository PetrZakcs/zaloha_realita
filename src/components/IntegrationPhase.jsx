import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Check, Lock } from 'lucide-react';
import { supabase } from '../api/supabaseClient';
import { useUserStore } from '../store/userStore';
import { track } from '../lib/analytics';

// spec-2 "ARCHITEKTURA RETENTION MOSTU": after the season the game moves on to light reflection
// and micro-actions (integration), then the deeper bridge layer towards MVP2. One screen for
// both layouts; the signals and their days come from the database and are editable in admin.
function SignalCard({ signal, onDone }) {
  const [answer, setAnswer] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    setBusy(true);
    setError('');
    const { error: rpcError } = await supabase.rpc('complete_integration_signal', { p_signal_id: signal.id, p_answer: answer });
    setBusy(false);
    if (rpcError) {
      setError('Odpověď se nepodařilo uložit. Zkus to prosím znovu.');
      return;
    }
    track('integration_signal_completed', { signal_id: signal.id, phase: signal.phase });
    onDone();
  };

  const locked = !signal.unlocked;
  return (
    <div style={{ background: '#241C3C', border: `0.5px solid ${signal.done ? '#22C55E' : '#382C5C'}`, borderRadius: '16px', padding: '14px 16px', opacity: locked ? 0.6 : 1 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span style={{ display: 'inline-flex', color: signal.done ? '#22C55E' : locked ? '#6B6B8A' : '#A78BFA' }}>
          {signal.done ? <Check size={16} /> : locked ? <Lock size={14} /> : null}
        </span>
        <span style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, fontSize: '15px', color: '#F0F0F8' }}>{signal.title}</span>
      </div>
      {locked ? (
        <div style={{ fontFamily: 'Inter', fontSize: '12px', color: '#6B6B8A', marginTop: '6px' }}>Otevře se {signal.unlock_day}. den.</div>
      ) : (
        <>
          {signal.body && <div style={{ fontFamily: 'Inter', fontSize: '13px', color: '#9A9AB5', marginTop: '6px', lineHeight: 1.5 }}>{signal.body}</div>}
          <div style={{ fontFamily: 'Inter', fontSize: '13px', color: '#F0F0F8', marginTop: '8px', lineHeight: 1.5 }}>{signal.prompt}</div>
          {signal.done ? (
            <div style={{ fontFamily: 'Inter', fontSize: '12px', color: '#9A9AB5', marginTop: '8px', whiteSpace: 'pre-wrap' }}>{signal.answer}</div>
          ) : (
            <>
              <textarea
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                maxLength={500}
                rows={3}
                aria-label={signal.prompt}
                style={{ width: '100%', boxSizing: 'border-box', marginTop: '10px', background: '#15111E', border: '1px solid #382C5C', borderRadius: '10px', padding: '10px 12px', color: '#fff', fontFamily: 'Inter', fontSize: '13px', resize: 'vertical' }}
              />
              {error && <div role="alert" style={{ fontFamily: 'Inter', fontSize: '12px', color: '#EF4444', marginTop: '6px' }}>{error}</div>}
              <button
                type="button"
                onClick={submit}
                disabled={busy || !answer.trim()}
                style={{ marginTop: '10px', height: '38px', padding: '0 16px', background: '#7C3AED', color: '#fff', border: 'none', borderRadius: '10px', fontFamily: 'Inter', fontWeight: 600, fontSize: '13px', cursor: busy || !answer.trim() ? 'default' : 'pointer', opacity: busy || !answer.trim() ? 0.5 : 1 }}
              >
                Odeslat
              </button>
            </>
          )}
        </>
      )}
    </div>
  );
}

export default function IntegrationPhase() {
  const navigate = useNavigate();
  const { openModal, fetchPlayerProgress } = useUserStore();
  const [state, setState] = useState(null);

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc('get_integration_state');
    setState(error ? { active: false } : data);
  }, []);

  useEffect(() => {
    load();
    track('integration_viewed');
  }, [load]);

  if (!state) return <div style={{ flex: 1 }} />;

  const back = (
    <button type="button" onClick={() => navigate('/')} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: 'none', border: 'none', color: '#9A9AB5', fontFamily: 'Inter', fontSize: '13px', cursor: 'pointer', padding: 0 }}>
      <ArrowLeft size={16} /> Zpět
    </button>
  );

  if (!state.active) {
    return (
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>
        {back}
        <div style={{ fontFamily: 'Inter', fontSize: '14px', color: '#9A9AB5', marginTop: '16px' }}>Integrační fáze se otevře po dokončení sezóny.</div>
      </div>
    );
  }

  const integration = state.signals.filter(s => s.phase === 'integration');
  const bridge = state.signals.filter(s => s.phase === 'bridge');
  const refresh = () => { load(); fetchPlayerProgress(); };

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px', maxWidth: '640px', width: '100%', margin: '0 auto', boxSizing: 'border-box' }}>
      {back}
      <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, fontSize: '22px', color: '#F0F0F8' }}>Integrační fáze</div>
      <div style={{ fontFamily: 'Inter', fontSize: '13px', color: '#9A9AB5', lineHeight: 1.5 }}>První vrstva dokončena. Teď z toho děláš součást života: pár lehkých signálů týdně, žádný spěch.</div>

      <div style={{ background: '#1C1630', border: '0.5px solid #382C5C', borderRadius: '14px', padding: '12px 14px', fontFamily: 'Inter', fontSize: '13px', color: '#F0F0F8' }}>
        {state.pass ? (
          <>Fragmenty: <strong>{state.fragments}</strong> · dokončené cykly: <strong>{state.cycles}</strong> · cyklus má {state.per_cycle} fragmentů</>
        ) : (
          <button type="button" onClick={() => openModal('paywall')} style={{ background: 'none', border: 'none', padding: 0, color: '#F5B73F', fontFamily: 'Inter', fontSize: '13px', cursor: 'pointer', textAlign: 'left' }}>
            Signály dávají XP všem. Fragmenty a jejich cykly sbíráš s Passem →
          </button>
        )}
      </div>

      {integration.map(s => <SignalCard key={s.id} signal={s} onDone={refresh} />)}

      {bridge.length > 0 && (
        <>
          <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, fontSize: '18px', color: '#F0F0F8', marginTop: '10px' }}>Mezivrstva</div>
          <div style={{ fontFamily: 'Inter', fontSize: '13px', color: '#9A9AB5', lineHeight: 1.5 }}>Méně akce, více smyslu. Most k další sezóně.</div>
          {bridge.map(s => <SignalCard key={s.id} signal={s} onDone={refresh} />)}
        </>
      )}
    </div>
  );
}
