import { useEffect, useState } from 'react';
import { supabase } from '../../api/supabaseClient';

// Player detail for the admin side panel (spec-21 §11: contact flags, segments, quality score,
// pass status, referral status, activity). Reads rely on the admin SELECT policies; the only
// write is player_admin_flags (admin-only RLS).
const SEGMENTS = [
  { value: '', label: 'Bez segmentu' },
  { value: 'core', label: 'Core hráč' },
  { value: 'whale', label: 'Whale' },
  { value: 'leader', label: 'Mikro-lídr' },
  { value: 'ambassador', label: 'Ambasador' },
  { value: 'risk', label: 'Riziko' },
];

const label = { fontFamily: 'Inter', fontSize: '11px', color: '#6B6B8A', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: '6px' };
const row = { display: 'flex', justifyContent: 'space-between', gap: '8px', fontFamily: 'Inter', fontSize: '12px', color: '#F0F0F8', padding: '3px 0' };
const muted = { color: '#9A9AB5' };
const fmt = (d) => (d ? new Date(d).toLocaleString('cs-CZ') : '—');

function PlayerFlags({ playerId }) {
  const [flags, setFlags] = useState({ contact_ok: false, segment: '', note: '' });
  const [quality, setQuality] = useState(null);
  const [state, setState] = useState('');

  useEffect(() => {
    let cancelled = false;
    setState('');
    (async () => {
      const [{ data }, { data: score }] = await Promise.all([
        supabase.from('player_admin_flags').select('contact_ok, segment, note').eq('user_id', playerId).maybeSingle(),
        supabase.rpc('player_quality_score', { p_user_id: playerId }),
      ]);
      if (cancelled) return;
      setFlags({ contact_ok: !!data?.contact_ok, segment: data?.segment || '', note: data?.note || '' });
      setQuality(score);
    })();
    return () => { cancelled = true; };
  }, [playerId]);

  const save = async () => {
    setState('Ukládám…');
    const { error } = await supabase.from('player_admin_flags').upsert({
      user_id: playerId,
      contact_ok: flags.contact_ok,
      segment: flags.segment || null,
      note: flags.note || null,
      updated_at: new Date().toISOString(),
    });
    setState(error ? `Nepovedlo se: ${error.message}` : 'Uloženo');
  };

  const field = { width: '100%', boxSizing: 'border-box', background: '#1C1630', border: '0.5px solid #382C5C', borderRadius: '8px', color: '#F0F0F8', fontFamily: 'Inter', fontSize: '12px', padding: '7px 9px', outline: 'none' };
  return (
    <div>
      <div style={label}>Interní hodnocení</div>
      <div style={row}><span style={muted}>Quality score (0–100)</span><span>{quality ?? '—'}</span></div>
      <label style={{ ...row, cursor: 'pointer' }}>
        <span style={muted}>Lze oslovit (contact flag)</span>
        <input type="checkbox" checked={flags.contact_ok} onChange={(e) => setFlags({ ...flags, contact_ok: e.target.checked })} />
      </label>
      <select aria-label="Segment" value={flags.segment} onChange={(e) => setFlags({ ...flags, segment: e.target.value })} style={{ ...field, marginTop: '6px' }}>
        {SEGMENTS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
      </select>
      <textarea aria-label="Poznámka" value={flags.note} onChange={(e) => setFlags({ ...flags, note: e.target.value })} placeholder="Poznámka (jen pro tým)" rows={2} maxLength={1000} style={{ ...field, marginTop: '6px', resize: 'vertical' }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '6px' }}>
        <button type="button" onClick={save} style={{ background: '#7C3AED', color: '#fff', border: 'none', borderRadius: '8px', padding: '6px 14px', fontFamily: 'Inter', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>Uložit</button>
        {state && <span style={{ ...muted, fontFamily: 'Inter', fontSize: '12px' }}>{state}</span>}
      </div>
    </div>
  );
}

export default function AdminPlayerDetail({ playerId }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!playerId) return;
    let cancelled = false;
    setData(null);
    setError('');
    (async () => {
      const [subs, referrals, referredBy, completions, proofs, boxes, keys, state] = await Promise.all([
        supabase.from('subscriptions').select('status, created_at, updated_at').eq('user_id', playerId).order('created_at', { ascending: false }),
        supabase.from('referral_signups').select('referred_id, created_at, activated_at').eq('referrer_id', playerId),
        supabase.from('referral_signups').select('referrer_id, activated_at').eq('referred_id', playerId).maybeSingle(),
        supabase.from('challenge_completions').select('challenge_id, completed_at, is_suspicious, suspicious_reason').eq('user_id', playerId).order('completed_at', { ascending: false }),
        supabase.from('feed_posts').select('id, is_public, hidden_by_reports, media_type').eq('user_id', playerId).eq('type', 'PROOF'),
        supabase.from('mystery_boxes').select('status').eq('user_id', playerId),
        supabase.from('key_transactions').select('amount, source, balance_after, created_at').eq('user_id', playerId).order('created_at', { ascending: false }).limit(15),
        supabase.from('player_state').select('onboarding_completed_at, onboarding_skipped_at').eq('user_id', playerId).maybeSingle(),
      ]);
      if (cancelled) return;
      const failed = [subs, referrals, completions, proofs, boxes, keys].find(r => r.error);
      if (failed) setError(failed.error.message);
      setData({
        subs: subs.data || [],
        referrals: referrals.data || [],
        referredBy: referredBy.data || null,
        completions: completions.data || [],
        proofs: proofs.data || [],
        boxes: boxes.data || [],
        keys: keys.data || [],
        state: state.data || null,
      });
    })();
    return () => { cancelled = true; };
  }, [playerId]);

  if (!data) return <div style={{ ...muted, fontFamily: 'Inter', fontSize: '12px' }}>Načítám detail…</div>;

  const activated = data.referrals.filter(r => r.activated_at).length;
  const suspicious = data.completions.filter(c => c.is_suspicious);
  const onboarding = data.state?.onboarding_completed_at
    ? `dokončen ${fmt(data.state.onboarding_completed_at)}`
    : data.state?.onboarding_skipped_at ? 'přeskočen (NPC)' : 'nedokončen';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {error && <div style={{ color: '#EF4444', fontFamily: 'Inter', fontSize: '12px' }}>Část dat se nenačetla: {error}</div>}

      <PlayerFlags playerId={playerId} />

      <div>
        <div style={label}>Aktivita</div>
        <div style={row}><span style={muted}>Onboarding</span><span>{onboarding}</span></div>
        <div style={row}><span style={muted}>Splněné výzvy</span><span>{data.completions.length}</span></div>
        <div style={row}><span style={muted}>Důkazy (veřejné / soukromé)</span><span>{data.proofs.filter(p => p.is_public).length} / {data.proofs.filter(p => !p.is_public).length}</span></div>
        <div style={row}><span style={muted}>Skryté nahlášením</span><span>{data.proofs.filter(p => p.hidden_by_reports).length}</span></div>
        <div style={row}><span style={muted}>Boxy (otevřené / čekající)</span><span>{data.boxes.filter(b => b.status === 'opened').length} / {data.boxes.filter(b => b.status === 'pending').length}</span></div>
        {suspicious.length > 0 && (
          <div style={{ marginTop: '6px', fontFamily: 'Inter', fontSize: '12px', color: '#F5B73F' }}>
            Podezřelé splnění: {suspicious.length}× ({suspicious.map(s => s.suspicious_reason).filter(Boolean).join(', ') || 'bez důvodu'})
          </div>
        )}
      </div>

      <div>
        <div style={label}>Pass / předplatné</div>
        {data.subs.length === 0 && <div style={{ ...row, ...muted }}>Žádné předplatné</div>}
        {data.subs.map((s, i) => (
          <div key={i} style={row}><span>{s.status}</span><span style={muted}>{fmt(s.updated_at)}</span></div>
        ))}
      </div>

      <div>
        <div style={label}>Referral</div>
        <div style={row}><span style={muted}>Přivedl hráčů</span><span>{data.referrals.length}</span></div>
        <div style={row}><span style={muted}>Z toho aktivovaných</span><span>{activated}</span></div>
        <div style={row}>
          <span style={muted}>Sám přišel přes referral</span>
          <span>{data.referredBy ? (data.referredBy.activated_at ? 'ano · aktivován' : 'ano · neaktivován') : 'ne'}</span>
        </div>
      </div>

      <div>
        <div style={label}>Poslední pohyby klíčů</div>
        {data.keys.length === 0 && <div style={{ ...row, ...muted }}>Žádné</div>}
        {data.keys.map((k, i) => (
          <div key={i} style={row}>
            <span style={{ color: k.amount >= 0 ? '#22C55E' : '#EF4444' }}>{k.amount > 0 ? `+${k.amount}` : k.amount}</span>
            <span style={muted}>{k.source}</span>
            <span style={muted}>{fmt(k.created_at)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
