import { useState } from 'react';
import AdminEditableTable from './AdminEditableTable';

// Content catalogs + balancing (Collection "ECONOMY CONFIGURATION — server-configurable",
// Identity "CONTENT GOVERNANCE"). The client supplies names/art; admins enter them here.
const RARITIES = ['common', 'rare', 'epic', 'legendary'];

const SECTIONS = {
  config: {
    label: 'Balancování',
    props: {
      table: 'game_config', keyField: 'key', orderBy: 'key',
      note: 'Hodnoty jsou JSON (číslo, pole nebo objekt). Sloupec „Zdroj“ říká, odkud hodnota pochází — čísla označená „orientační“ upraví game designer.',
      fields: [
        { key: 'key', label: 'Klíč', type: 'text', readOnlyOnEdit: true },
        { key: 'value', label: 'Hodnota', type: 'json' },
        { key: 'description', label: 'Popis', type: 'textarea' },
        { key: 'source', label: 'Zdroj', type: 'textarea' },
      ],
    },
  },
  identity: {
    label: 'Identita',
    props: {
      table: 'identity_items', keyField: 'item_key', orderBy: 'sort_order',
      note: 'Aury, masky, tituly a značky. Položky se nemažou — vlastníkům zůstávají. Barva aury: {"color":"#22C55E"}.',
      newRow: { item_key: '', kind: 'aura', title: '', description: '', rarity: 'common', acquisition: 'earned', unlock_hint: '', sort_order: 100, visual: {} },
      fields: [
        { key: 'item_key', label: 'Klíč', type: 'text', readOnlyOnEdit: true },
        { key: 'kind', label: 'Typ', type: 'select', options: ['aura', 'mask', 'title', 'season_mark'] },
        { key: 'title', label: 'Název', type: 'text' },
        { key: 'description', label: 'Význam', type: 'textarea' },
        { key: 'rarity', label: 'Rarita', type: 'select', options: RARITIES },
        { key: 'acquisition', label: 'Získání', type: 'select', options: ['earned', 'pass', 'legacy', 'admin'] },
        { key: 'unlock_hint', label: 'Jak získat', type: 'textarea' },
        { key: 'visual', label: 'Vizuál', type: 'json' },
        { key: 'sort_order', label: 'Pořadí', type: 'number' },
      ],
    },
  },
  badges: {
    label: 'Odznaky uzlů',
    props: {
      table: 'node_rewards', keyField: 'node_order', orderBy: 'node_order',
      note: 'Odznak, který hráč získá splněním questu v uzlu.',
      newRow: { node_order: null, badge_key: '', title: '', description: '', rarity: 'common' },
      fields: [
        { key: 'node_order', label: 'Uzel', type: 'number', readOnlyOnEdit: true },
        { key: 'badge_key', label: 'Klíč', type: 'text', readOnlyOnEdit: true },
        { key: 'title', label: 'Název', type: 'text' },
        { key: 'description', label: 'Popis', type: 'textarea' },
        { key: 'rarity', label: 'Rarita', type: 'select', options: RARITIES },
      ],
    },
  },
  box: {
    label: 'Obsah boxů',
    props: {
      table: 'mystery_box_pool', keyField: 'card_key', orderBy: 'card_key',
      note: 'Co může padnout z Mystery Boxu. Váha = relativní šance. Položku vypneš odškrtnutím „Aktivní“.',
      newRow: { card_key: '', title: '', rarity: 'common', description: '', weight: 100, active: true },
      fields: [
        { key: 'card_key', label: 'Klíč', type: 'text', readOnlyOnEdit: true },
        { key: 'title', label: 'Název', type: 'text' },
        { key: 'rarity', label: 'Rarita', type: 'select', options: RARITIES },
        { key: 'description', label: 'Popis', type: 'textarea' },
        { key: 'weight', label: 'Váha', type: 'number' },
        { key: 'active', label: 'Aktivní', type: 'bool' },
      ],
    },
  },
  integration: {
    label: 'Integrace',
    props: {
      table: 'integration_signals', keyField: 'id', orderBy: 'sort_order',
      note: 'Signály po dokončení sezóny. „Den“ se počítá od vstupu hráče do integrační fáze. Obsah je pracovní ze zadání, finální dodá klient.',
      newRow: { id: '', phase: 'integration', sort_order: 0, unlock_day: 0, title: '', body: '', prompt: '', is_active: true },
      fields: [
        { key: 'id', label: 'ID', type: 'text', readOnlyOnEdit: true },
        { key: 'phase', label: 'Vrstva', type: 'select', options: ['integration', 'bridge'] },
        { key: 'sort_order', label: 'Pořadí', type: 'number' },
        { key: 'unlock_day', label: 'Den', type: 'number' },
        { key: 'title', label: 'Název', type: 'text' },
        { key: 'body', label: 'Text', type: 'textarea' },
        { key: 'prompt', label: 'Otázka', type: 'textarea' },
        { key: 'is_active', label: 'Aktivní', type: 'bool' },
      ],
    },
  },
  seasons: {
    label: 'Sezóny',
    props: {
      table: 'seasons', keyField: 'id', orderBy: 'id',
      note: 'Název a termíny sezóny (formát data: 2026-11-01T00:00:00Z).',
      newRow: { id: '', name: '', starts_at: null, ends_at: null, is_active: false },
      fields: [
        { key: 'id', label: 'ID', type: 'text', readOnlyOnEdit: true },
        { key: 'name', label: 'Název', type: 'text' },
        { key: 'starts_at', label: 'Začátek', type: 'datetime' },
        { key: 'ends_at', label: 'Konec', type: 'datetime' },
        { key: 'is_active', label: 'Aktivní', type: 'bool' },
      ],
    },
  },
};

export default function AdminCatalogs() {
  const [section, setSection] = useState('config');
  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
        {Object.entries(SECTIONS).map(([key, s]) => (
          <button key={key} type="button" onClick={() => setSection(key)}
            style={{ background: section === key ? '#7C3AED' : 'transparent', color: section === key ? '#fff' : '#9A9AB5', border: `1px solid ${section === key ? '#7C3AED' : '#382C5C'}`, borderRadius: '8px', padding: '6px 12px', fontFamily: 'Inter', fontSize: '12px', cursor: 'pointer' }}>
            {s.label}
          </button>
        ))}
      </div>
      <AdminEditableTable key={section} {...SECTIONS[section].props} />
    </div>
  );
}
