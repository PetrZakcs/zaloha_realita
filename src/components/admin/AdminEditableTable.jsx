import { useEffect, useState } from 'react';
import { supabase } from '../../api/supabaseClient';

// Small generic editor for admin catalog tables (admin RLS already allows writes).
// Rows are never deleted from here: identity items stay with their owners (Identity
// "Retired item majitelům zůstává"), box items are switched off via `active`.
//
// fields: [{ key, label, type: 'text' | 'textarea' | 'number' | 'bool' | 'select' | 'json' | 'datetime', options?, readOnlyOnEdit? }]
const inputStyle = { width: '100%', background: '#0D0A18', border: '1px solid #382C5C', borderRadius: '8px', padding: '6px 8px', color: '#fff', fontFamily: 'Inter', fontSize: '12px', boxSizing: 'border-box' };

function Field({ field, value, onChange, disabled }) {
  if (field.type === 'bool') {
    return <input type="checkbox" checked={!!value} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />;
  }
  if (field.type === 'select') {
    return (
      <select value={value ?? ''} disabled={disabled} onChange={(e) => onChange(e.target.value)} style={inputStyle}>
        {field.options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    );
  }
  if (field.type === 'textarea' || field.type === 'json') {
    const text = field.type === 'json' && typeof value !== 'string' ? JSON.stringify(value ?? {}) : (value ?? '');
    return <textarea rows={2} value={text} disabled={disabled} onChange={(e) => onChange(e.target.value)} style={{ ...inputStyle, resize: 'vertical' }} />;
  }
  return (
    <input type={field.type === 'number' ? 'number' : 'text'} value={value ?? ''} disabled={disabled}
      onChange={(e) => onChange(field.type === 'number' ? (e.target.value === '' ? null : Number(e.target.value)) : e.target.value)}
      style={inputStyle} />
  );
}

export default function AdminEditableTable({ table, keyField, fields, orderBy, newRow, note }) {
  const [rows, setRows] = useState([]);
  const [dirty, setDirty] = useState({});
  const [status, setStatus] = useState('');

  const load = async () => {
    const { data, error } = await supabase.from(table).select('*').order(orderBy || keyField);
    if (error) setStatus(`Chyba načtení: ${error.message}`);
    setRows((data || []).map(r => ({ ...r, __saved: true })));
    setDirty({});
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [table]);

  const update = (index, key, value) => {
    setRows(prev => prev.map((r, i) => (i === index ? { ...r, [key]: value } : r)));
    setDirty(prev => ({ ...prev, [index]: true }));
  };

  const save = async (index) => {
    const row = { ...rows[index] };
    delete row.__saved;
    for (const f of fields) {
      if (f.type === 'datetime' && row[f.key] === '') row[f.key] = null;
      if (f.type === 'json' && typeof row[f.key] === 'string') {
        try { row[f.key] = JSON.parse(row[f.key] || '{}'); } catch (e) { setStatus(`${f.label}: neplatný JSON`); return; }
      }
    }
    if (!row[keyField]) { setStatus(`Vyplň ${keyField}`); return; }
    const { error } = await supabase.from(table).upsert(row, { onConflict: keyField });
    if (error) { setStatus(`Uložení selhalo: ${error.message}`); return; }
    setStatus('Uloženo');
    setRows(prev => prev.map((r, i) => (i === index ? { ...r, __saved: true } : r)));
    setDirty(prev => ({ ...prev, [index]: false }));
  };

  return (
    <div>
      {note && <div style={{ fontFamily: 'Inter', fontSize: '12px', color: '#6B6B8A', marginBottom: '10px' }}>{note}</div>}
      <div style={{ overflowX: 'auto', background: '#15111E', border: '1px solid #1B1430', borderRadius: '12px' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'Inter', fontSize: '12px' }}>
          <thead>
            <tr style={{ color: '#6B6B8A', textAlign: 'left' }}>
              {fields.map(f => <th key={f.key} style={{ padding: '8px', borderBottom: '1px solid #1B1430', fontWeight: 600 }}>{f.label}</th>)}
              <th style={{ padding: '8px', borderBottom: '1px solid #1B1430' }}></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={index} style={{ borderBottom: '1px solid #130F24', verticalAlign: 'top' }}>
                {fields.map(f => (
                  <td key={f.key} style={{ padding: '6px 8px', minWidth: f.type === 'bool' ? 0 : '110px' }}>
                    <Field field={f} value={row[f.key]} disabled={f.readOnlyOnEdit && row.__saved} onChange={(v) => update(index, f.key, v)} />
                  </td>
                ))}
                <td style={{ padding: '6px 8px' }}>
                  <button type="button" onClick={() => save(index)} disabled={!dirty[index]}
                    style={{ background: dirty[index] ? '#7C3AED' : '#1C1630', color: '#fff', border: 'none', borderRadius: '8px', padding: '6px 10px', fontFamily: 'Inter', fontSize: '12px', cursor: dirty[index] ? 'pointer' : 'default' }}>
                    Uložit
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '10px' }}>
        {newRow && (
          <button type="button" onClick={() => { setRows(prev => [...prev, { ...newRow }]); setDirty(prev => ({ ...prev, [rows.length]: true })); }}
            style={{ background: 'transparent', color: '#A78BFA', border: '1px dashed #A78BFA', borderRadius: '8px', padding: '6px 12px', fontFamily: 'Inter', fontSize: '12px', cursor: 'pointer' }}>
            + Přidat
          </button>
        )}
        {status && <span style={{ fontFamily: 'Inter', fontSize: '12px', color: '#9A9AB5' }}>{status}</span>}
      </div>
    </div>
  );
}
