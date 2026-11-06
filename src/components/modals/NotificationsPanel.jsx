import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, Settings } from 'lucide-react';
import { useUserStore } from '../../store/userStore';

// Game Bible · Retention "NOTIFICATION ENGINE": real in-app notifications (written by the
// server on identity unlocks, level-ups, referral activations, reactions) + the player's
// category opt-outs and quiet hours. Safety/account messages can't be switched off.
const CATEGORY_LABELS = {
  action: 'Další krok',
  progress: 'Progres',
  social: 'Reakce a pozvaní hráči',
  identity: 'Nová identita',
  world: 'Dění ve světě',
  comeback: 'Návrat do hry',
  commerce: 'Nabídky',
};
const CATEGORY_COLOR = {
  action: '#22C55E', progress: '#4AA8FF', social: '#F5B73F', identity: '#A78BFA',
  world: '#38BDF8', comeback: '#22C55E', commerce: '#9A9AB5', system: '#EF4444',
};

function timeAgo(iso) {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (minutes < 60) return `před ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `před ${hours} h`;
  return new Date(iso).toLocaleDateString('cs-CZ');
}

export default function NotificationsPanel() {
  const {
    notificationsList, fetchNotifications, markNotificationsRead,
    notificationPrefs, fetchNotificationPrefs, saveNotificationPrefs, closeModal
  } = useUserStore();
  const navigate = useNavigate();
  const [showPrefs, setShowPrefs] = useState(false);
  const [off, setOff] = useState([]);
  const [quiet, setQuiet] = useState({ start: '', end: '' });
  const [saveState, setSaveState] = useState('');

  useEffect(() => {
    fetchNotifications().then(() => markNotificationsRead(null));
    fetchNotificationPrefs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!notificationPrefs) return;
    setOff(notificationPrefs.categories_off || []);
    setQuiet({ start: notificationPrefs.quiet_start ?? '', end: notificationPrefs.quiet_end ?? '' });
  }, [notificationPrefs]);

  const save = async () => {
    const toHour = (v) => (v === '' || v === null ? null : Math.min(23, Math.max(0, parseInt(v, 10) || 0)));
    const result = await saveNotificationPrefs({ categoriesOff: off, quietStart: toHour(quiet.start), quietEnd: toHour(quiet.end) });
    setSaveState(result.error || 'Uloženo');
  };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
        <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: '700', fontSize: '18px', color: '#fff' }}>Upozornění</div>
        <button type="button" onClick={() => setShowPrefs(v => !v)} aria-label="Nastavení upozornění"
          style={{ background: 'none', border: 'none', color: showPrefs ? '#A78BFA' : '#6B6B8A', cursor: 'pointer' }}>
          <Settings size={18} />
        </button>
      </div>

      {showPrefs ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
            <label key={key} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontFamily: 'Inter', fontSize: '13px', color: '#F0F0F8', cursor: 'pointer' }}>
              <input type="checkbox" checked={!off.includes(key)}
                onChange={(e) => setOff(prev => (e.target.checked ? prev.filter(k => k !== key) : [...prev, key]))} />
              {label}
            </label>
          ))}
          <div style={{ fontFamily: 'Inter', fontSize: '12px', color: '#9A9AB5', marginTop: '6px' }}>Tichý režim (hodiny, nepovinné)</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontFamily: 'Inter', fontSize: '13px', color: '#F0F0F8' }}>
            od <input type="number" min="0" max="23" value={quiet.start} onChange={(e) => setQuiet(q => ({ ...q, start: e.target.value }))}
              style={{ width: '56px', background: '#1C1630', border: '1px solid #382C5C', borderRadius: '8px', color: '#fff', padding: '6px' }} />
            do <input type="number" min="0" max="23" value={quiet.end} onChange={(e) => setQuiet(q => ({ ...q, end: e.target.value }))}
              style={{ width: '56px', background: '#1C1630', border: '1px solid #382C5C', borderRadius: '8px', color: '#fff', padding: '6px' }} />
          </div>
          <button type="button" onClick={save}
            style={{ marginTop: '8px', height: '40px', background: '#7C3AED', color: '#fff', border: 'none', borderRadius: '12px', fontFamily: 'Inter', fontWeight: 700, cursor: 'pointer' }}>
            Uložit
          </button>
          {saveState && <div style={{ fontFamily: 'Inter', fontSize: '12px', color: '#9A9AB5' }}>{saveState}</div>}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {notificationsList.length === 0 && (
            <div style={{ fontFamily: 'Inter', fontSize: '13px', color: '#6B6B8A' }}>Zatím žádná upozornění.</div>
          )}
          {notificationsList.map(n => (
            <div key={n.id}
              onClick={() => { if (n.link) { closeModal(); navigate(n.link); } }}
              style={{ display: 'flex', gap: '10px', background: '#1C1630', borderRadius: '12px', padding: '12px', alignItems: 'center', cursor: n.link ? 'pointer' : 'default' }}>
              <Bell size={18} style={{ color: CATEGORY_COLOR[n.category] || '#A78BFA', flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: 'Inter', fontWeight: '600', fontSize: '12px', color: '#fff' }}>{n.title}</div>
                {n.body && <div style={{ fontFamily: 'Inter', fontSize: '11px', color: '#9A9AB5', marginTop: '2px' }}>{n.body}</div>}
                <div style={{ fontFamily: 'Inter', fontSize: '10px', color: '#6B6B8A', marginTop: '2px' }}>{timeAgo(n.created_at)}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
