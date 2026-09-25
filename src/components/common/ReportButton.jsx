import { useState } from 'react';
import { Flag } from 'lucide-react';
import { useUserStore } from '../../store/userStore';

// MVP1 spec-12 §8.3 "základní moderation (report button)". Three distinct reports hide the
// post until an admin reviews it (report_post() in 20260925130000_mvp1_spec_debt.sql).
const REASONS = [
  { key: 'inappropriate', label: 'Nevhodný obsah' },
  { key: 'spam', label: 'Spam' },
  { key: 'harassment', label: 'Obtěžování' },
  { key: 'dangerous', label: 'Nebezpečná aktivita' },
  { key: 'privacy', label: 'Porušení soukromí' },
  { key: 'other', label: 'Jiné' },
];

export default function ReportButton({ post }) {
  const { user, reportPost } = useUserStore();
  const [open, setOpen] = useState(false);
  const [state, setState] = useState('idle'); // idle | sending | done | error

  // Nothing to report on system/seed rows, and players can't report themselves.
  if (!post.user_id || post.user_name === user?.name) return null;

  const submit = async (reason) => {
    setState('sending');
    const result = await reportPost(post.id, reason);
    setState(result.success ? 'done' : 'error');
    setOpen(false);
  };

  if (state === 'done') {
    return <span style={{ fontFamily: 'Inter', fontSize: '11px', color: '#6B6B8A' }}>Nahlášeno</span>;
  }

  return (
    <span style={{ position: 'relative', display: 'inline-flex' }}>
      <button
        type="button"
        aria-label="Nahlásit příspěvek"
        title="Nahlásit"
        disabled={state === 'sending'}
        onClick={(e) => { e.stopPropagation(); setOpen(o => !o); }}
        style={{ display: 'inline-flex', background: 'none', border: 'none', padding: 0, color: state === 'error' ? '#EF4444' : '#6B6B8A', cursor: 'pointer' }}
      >
        <Flag size={14} />
      </button>
      {open && (
        <div
          role="menu"
          onClick={(e) => e.stopPropagation()}
          style={{
            position: 'absolute', right: 0, bottom: '22px', zIndex: 20, minWidth: '180px',
            background: '#1C1630', border: '0.5px solid #382C5C', borderRadius: '12px', padding: '6px',
            boxShadow: '0 8px 24px rgba(0,0,0,.5)'
          }}
        >
          <div style={{ fontFamily: 'Inter', fontSize: '11px', color: '#9A9AB5', padding: '4px 8px 6px' }}>Proč to nahlašuješ?</div>
          {REASONS.map(r => (
            <button
              key={r.key}
              type="button"
              role="menuitem"
              onClick={() => submit(r.key)}
              style={{ display: 'block', width: '100%', textAlign: 'left', background: 'none', border: 'none', color: '#F0F0F8', fontFamily: 'Inter', fontSize: '12px', padding: '7px 8px', borderRadius: '8px', cursor: 'pointer' }}
            >
              {r.label}
            </button>
          ))}
        </div>
      )}
    </span>
  );
}
