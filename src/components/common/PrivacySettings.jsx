import { useEffect, useState } from 'react';
import { supabase } from '../../api/supabaseClient';

const OPTIONS = [
  { key: 'show_progress', label: 'Postup v příběhu' },
  { key: 'show_proofs', label: 'Poslední důkazy' },
  { key: 'show_collection', label: 'Showcase a sbírka' },
];

// spec-12 §2.4 "Sám si určuji co chci a co nechci zveřejnit": what other players see on the
// public profile. Identity (name, avatar, title) stays visible, and each proof keeps its own
// public or private choice.
export default function PrivacySettings({ userId }) {
  const [values, setValues] = useState({ show_progress: true, show_proofs: true, show_collection: true });
  const [error, setError] = useState('');

  useEffect(() => {
    if (!userId) return undefined;
    let cancelled = false;
    supabase.from('player_privacy').select('show_progress, show_proofs, show_collection').eq('user_id', userId).maybeSingle()
      .then(({ data }) => { if (!cancelled && data) setValues(data); });
    return () => { cancelled = true; };
  }, [userId]);

  const toggle = async (key) => {
    const next = { ...values, [key]: !values[key] };
    const previous = values;
    setValues(next);
    setError('');
    const { error: rpcError } = await supabase.rpc('set_my_privacy', {
      p_show_progress: next.show_progress, p_show_proofs: next.show_proofs, p_show_collection: next.show_collection,
    });
    if (rpcError) {
      setValues(previous);
      setError('Nastavení se nepodařilo uložit.');
    }
  };

  return (
    <fieldset style={{ border: 'none', padding: 0, margin: '10px 0 0' }}>
      <legend style={{ fontFamily: 'Inter', fontSize: '11px', color: '#6B6B8A', textTransform: 'uppercase', padding: 0, marginBottom: '6px' }}>Na veřejném profilu ukázat</legend>
      {OPTIONS.map(({ key, label }) => (
        <label key={key} style={{ display: 'flex', alignItems: 'center', gap: '8px', minHeight: '32px', fontFamily: 'Inter', fontSize: '13px', color: '#F0F0F8', cursor: 'pointer' }}>
          <input type="checkbox" checked={values[key]} onChange={() => toggle(key)} />
          {label}
        </label>
      ))}
      {error && <div role="alert" style={{ fontFamily: 'Inter', fontSize: '12px', color: '#EF4444' }}>{error}</div>}
    </fieldset>
  );
}
