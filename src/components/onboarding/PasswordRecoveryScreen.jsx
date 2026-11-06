import { useState } from 'react';
import { useUserStore } from '../../store/userStore';
import { isValidPassword } from '../../utils/validation';

// Shown when the app is opened from the password reset e-mail. Above everything else, because
// the player may be on the landing or already in the game.
export default function PasswordRecoveryScreen() {
  const { passwordRecovery, setNewPassword, setPasswordRecovery } = useUserStore();
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (!passwordRecovery) return null;

  const submit = async () => {
    if (!isValidPassword(password)) { setError('Heslo musí mít víc než 8 znaků.'); return; }
    setBusy(true);
    setError('');
    const result = await setNewPassword(password);
    setBusy(false);
    if (result.error) setError(result.error);
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 300, background: '#0D0A18', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
      <div style={{ width: '100%', maxWidth: '350px', display: 'flex', flexDirection: 'column', gap: '14px', textAlign: 'center' }}>
        <h1 style={{ margin: 0, fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, fontSize: '24px', color: '#F0F0F8' }}>Nastav si nové heslo</h1>
        <input
          type="password"
          value={password}
          onChange={(e) => { setPassword(e.target.value); if (error) setError(''); }}
          placeholder="Nové heslo"
          autoComplete="new-password"
          aria-label="Nové heslo"
          style={{ width: '100%', height: '48px', background: '#2A2142', border: '1px solid #7C3AED', borderRadius: '16px', color: '#F0F0F8', padding: '0 16px', fontSize: '15px', outline: 'none', boxSizing: 'border-box', fontFamily: 'Inter' }}
        />
        {error && <div role="alert" style={{ color: '#EF4444', fontSize: '12px', fontFamily: 'Inter' }}>{error}</div>}
        <button type="button" onClick={submit} disabled={busy}
          style={{ width: '100%', height: '48px', background: '#7C3AED', color: '#fff', fontFamily: 'Inter', fontWeight: 700, fontSize: '15px', border: 'none', borderRadius: '16px', cursor: 'pointer', opacity: busy ? 0.7 : 1 }}>
          {busy ? 'Ukládám…' : 'Uložit heslo'}
        </button>
        <button type="button" onClick={() => setPasswordRecovery(false)} style={{ background: 'none', border: 'none', color: '#6B6B8A', fontFamily: 'Inter', fontSize: '13px', cursor: 'pointer' }}>
          Teď ne
        </button>
      </div>
    </div>
  );
}
