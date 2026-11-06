import { useEffect, useState } from 'react';
import { useUserStore } from '../../store/userStore';

// Game Bible · Identity "IDENTITY SLOT SYSTEM" (MVP1: titles, 1–2 auras, 1 mask). Only items
// the player owns can be equipped (set_identity_slot() checks it server-side). Aura/mask
// content comes from the client's catalog — until then the slots say so honestly.
const SLOTS = [
  { kind: 'title', label: 'Zobrazený titul', field: 'displayTitle', emptyLabel: 'Lifetime titul' },
  { kind: 'aura', label: 'Aura', field: 'activeAura', emptyLabel: 'Bez aury' },
  { kind: 'mask', label: 'Maska', field: 'activeMask', emptyLabel: 'Bez masky' },
];

export default function IdentitySlots() {
  const { user, identityCatalog, ownedIdentityItems, fetchIdentityItems, setIdentitySlot } = useUserStore();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchIdentityItems();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const owned = new Set(ownedIdentityItems.map(i => i.item_key));

  const equip = async (kind, key) => {
    setBusy(true);
    const result = await setIdentitySlot(kind, key);
    setError(result.error || '');
    setBusy(false);
  };

  return (
    <div style={{ marginTop: '14px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {SLOTS.map(({ kind, label, field, emptyLabel }) => {
        const items = identityCatalog.filter(i => i.kind === kind);
        const mine = items.filter(i => owned.has(i.item_key));
        const active = user?.[field] || null;
        return (
          <div key={kind}>
            <div style={{ fontFamily: 'Inter', fontWeight: '600', fontSize: '11px', letterSpacing: '.1em', textTransform: 'uppercase', color: '#6B6B8A', marginBottom: '8px' }}>
              {label}
            </div>
            {items.length === 0 ? (
              <div style={{ fontFamily: 'Inter', fontSize: '12px', color: '#6B6B8A' }}>Obsah připravujeme.</div>
            ) : (
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <Chip label={emptyLabel} active={!active} disabled={busy} onClick={() => equip(kind, null)} />
                {mine.map(i => (
                  <Chip key={i.item_key} label={i.title} active={active === i.item_key} disabled={busy} onClick={() => equip(kind, i.item_key)} />
                ))}
                {items.filter(i => !owned.has(i.item_key)).map(i => (
                  <span key={i.item_key} title={i.unlock_hint || ''}
                    style={{ fontFamily: 'Inter', fontSize: '12px', color: '#6B6B8A', border: '1px dashed #382C5C', borderRadius: '12px', padding: '6px 10px' }}>
                    {i.title}{i.unlock_hint ? ` · ${i.unlock_hint}` : ''}
                  </span>
                ))}
              </div>
            )}
          </div>
        );
      })}
      {error && <div role="alert" style={{ fontFamily: 'Inter', fontSize: '12px', color: '#EF4444' }}>{error}</div>}
    </div>
  );
}

function Chip({ label, active, disabled, onClick }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled || active}
      style={{
        fontFamily: 'Inter', fontWeight: 600, fontSize: '12px', borderRadius: '12px', padding: '6px 10px', cursor: active ? 'default' : 'pointer',
        color: active ? '#fff' : '#A78BFA', background: active ? '#7C3AED' : 'transparent', border: `1px solid ${active ? '#7C3AED' : '#A78BFA'}`
      }}>
      {label}
    </button>
  );
}
