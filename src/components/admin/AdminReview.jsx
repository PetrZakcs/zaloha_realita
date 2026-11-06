import { useEffect, useState } from 'react';
import { supabase } from '../../api/supabaseClient';

// Fraud review (Referral "REFERRAL FRAUD ENGINE" / "REWARD HOLDS" / "RECRUITER QUALITY RATE",
// Progression "manual review u high-status achievementů"): suspicious quest completions,
// referral rewards held by the velocity cap, referrers with many sign-ups and few activations.
const box = { background: '#15111E', border: '1px solid #1B1430', borderRadius: '12px', padding: '12px 14px' };
const h = { fontFamily: "'Space Grotesk', sans-serif", fontSize: '15px', color: '#F0F0F8', margin: '0 0 8px' };
const row = { display: 'flex', alignItems: 'center', gap: '10px', fontFamily: 'Inter', fontSize: '12.5px', color: '#F0F0F8', padding: '6px 0', borderBottom: '1px solid #130F24' };
const muted = { color: '#9A9AB5' };

export default function AdminReview() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');

  const load = async () => {
    const { data: queue, error: rpcError } = await supabase.rpc('admin_review_queue');
    if (rpcError) setError(rpcError.message); else { setError(''); setData(queue); }
  };

  useEffect(() => { load(); }, []);

  const resolve = async (id, release) => {
    setBusy(id);
    const { error: rpcError } = await supabase.rpc('admin_resolve_referral_hold', { p_hold_id: id, p_release: release });
    setBusy('');
    if (rpcError) { alert('Akce selhala: ' + rpcError.message); return; }
    load();
  };

  if (error) return <div style={{ padding: '24px', color: '#EF4444', fontFamily: 'Inter' }}>Frontu se nepodařilo načíst: {error}</div>;
  if (!data) return <div style={{ padding: '24px', color: '#6B6B8A', fontFamily: 'Inter' }}>Načítám…</div>;

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '24px', display: 'flex', flexDirection: 'column', gap: '18px' }}>
      <div style={box}>
        <h3 style={h}>Pozastavené odměny za pozvánky · {data.referral_holds.length}</h3>
        <div style={{ fontFamily: 'Inter', fontSize: '12px', color: '#6B6B8A', marginBottom: '6px' }}>
          Odměna se pozastaví, když hráč za 24 h aktivuje víc pozvaných, než dovoluje limit (Balancování → referral_reward_daily_cap).
        </div>
        {data.referral_holds.length === 0 && <div style={{ ...row, ...muted }}>Nic ke kontrole.</div>}
        {data.referral_holds.map(hd => (
          <div key={hd.id} style={row}>
            <span style={{ flex: 1 }}><strong>{hd.referrer}</strong> ← {hd.referred} <span style={muted}>· krok {hd.step} · {hd.reason}</span></span>
            <button type="button" disabled={busy === hd.id} onClick={() => resolve(hd.id, true)}
              style={{ background: '#16a34a', color: '#fff', border: 'none', borderRadius: '8px', padding: '5px 10px', fontSize: '12px', cursor: 'pointer' }}>Uvolnit</button>
            <button type="button" disabled={busy === hd.id} onClick={() => resolve(hd.id, false)}
              style={{ background: 'transparent', color: '#EF4444', border: '1px solid #EF4444', borderRadius: '8px', padding: '5px 10px', fontSize: '12px', cursor: 'pointer' }}>Zamítnout</button>
          </div>
        ))}
      </div>

      <div style={box}>
        <h3 style={h}>Podezřelá splnění questů · {data.suspicious_completions.length}</h3>
        {data.suspicious_completions.length === 0 && <div style={{ ...row, ...muted }}>Nic ke kontrole.</div>}
        {data.suspicious_completions.map((c, i) => (
          <div key={i} style={row}>
            <span style={{ flex: 1 }}><strong>{c.display_name}</strong> <span style={muted}>· {c.challenge_id} · {new Date(c.completed_at).toLocaleString('cs-CZ')}</span></span>
            <span style={{ color: '#F5B73F' }}>{c.reason || 'bez důvodu'}</span>
          </div>
        ))}
      </div>

      <div style={box}>
        <h3 style={h}>Zvoucí s nízkou kvalitou · {data.low_quality_referrers.length}</h3>
        <div style={{ fontFamily: 'Inter', fontSize: '12px', color: '#6B6B8A', marginBottom: '6px' }}>
          Aspoň 5 registrací a méně než 20 % aktivovaných.
        </div>
        {data.low_quality_referrers.length === 0 && <div style={{ ...row, ...muted }}>Nic ke kontrole.</div>}
        {data.low_quality_referrers.map((r, i) => (
          <div key={i} style={row}>
            <span style={{ flex: 1 }}><strong>{r.display_name}</strong></span>
            <span style={muted}>{r.registered} registrací · {r.activated} aktivovaných · {Math.round(r.activation_rate * 100)} %</span>
          </div>
        ))}
      </div>
    </div>
  );
}
