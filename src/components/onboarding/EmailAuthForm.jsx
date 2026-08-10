import { useState } from 'react';
import { Mail } from 'lucide-react';
import { useUserStore } from '../../store/userStore';
import { isValidEmail, isValidPassword } from '../../utils/validation';

// Shared between MobileOnboarding and DesktopOnboarding — the email/password
// register+sign-in mini-form is identical in behavior on both platforms, only
// its outer container (card width, spacing) differs, so this owns all state
// and just takes a `radius` prop to match whichever platform embeds it.
export default function EmailAuthForm({ radius = 16 }) {
  const { registerWithEmail, loginWithEmail } = useUserStore();
  const [mode, setMode] = useState('register'); // 'register' | 'signin'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldError, setFieldError] = useState('');
  const [submitError, setSubmitError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [awaitingConfirmation, setAwaitingConfirmation] = useState(false);

  const handleSubmit = async () => {
    setSubmitError('');
    if (!isValidEmail(email)) {
      setFieldError('Zadej platný e-mail.');
      return;
    }
    if (!isValidPassword(password)) {
      setFieldError('Heslo musí mít víc než 8 znaků.');
      return;
    }
    setFieldError('');
    setSubmitting(true);
    const result = mode === 'register'
      ? await registerWithEmail(email, password)
      : await loginWithEmail(email, password);
    setSubmitting(false);

    if (!result.success) {
      setSubmitError(result.error || 'Něco se nepovedlo. Zkus to prosím znovu.');
      return;
    }
    if (mode === 'register' && result.needsConfirmation) {
      setAwaitingConfirmation(true);
      return;
    }
    // Otherwise: registerWithEmail already advanced onboardingStep to
    // 'nickname' itself, or loginWithEmail's success will resolve into
    // onboarded:true asynchronously via App.jsx's auth listener — nothing
    // further to do here in either case.
  };

  const inputStyle = {
    width: '100%',
    height: '46px',
    background: '#2A2142',
    border: '1px solid #382C5C',
    borderRadius: `${radius}px`,
    color: '#F0F0F8',
    padding: '0 14px',
    fontSize: '14px',
    fontFamily: 'Inter',
    outline: 'none',
    boxSizing: 'border-box'
  };

  if (awaitingConfirmation) {
    return (
      <div style={{
        textAlign: 'center',
        color: '#9A9AB5',
        fontFamily: 'Inter',
        fontSize: '13px',
        lineHeight: 1.55,
        background: '#1C1630',
        border: '1px solid #382C5C',
        borderRadius: `${radius}px`,
        padding: '16px'
      }}>
        <Mail size={20} color="#A78BFA" style={{ marginBottom: '8px' }} />
        <div>Zkontroluj e-mail a potvrď registraci kliknutím na odkaz, který jsme ti poslali.</div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      <div style={{ display: 'flex', background: '#1C1630', border: '1px solid #382C5C', borderRadius: `${radius}px`, padding: '4px' }}>
        <button
          type="button"
          onClick={() => { setMode('register'); setFieldError(''); setSubmitError(''); }}
          style={{
            flex: 1,
            height: '36px',
            background: mode === 'register' ? '#7C3AED' : 'transparent',
            color: mode === 'register' ? '#fff' : '#9A9AB5',
            border: 'none',
            borderRadius: `${Math.max(radius - 4, 8)}px`,
            fontFamily: 'Inter',
            fontWeight: '600',
            fontSize: '13px',
            cursor: 'pointer'
          }}
        >
          Vytvořit účet
        </button>
        <button
          type="button"
          onClick={() => { setMode('signin'); setFieldError(''); setSubmitError(''); }}
          style={{
            flex: 1,
            height: '36px',
            background: mode === 'signin' ? '#7C3AED' : 'transparent',
            color: mode === 'signin' ? '#fff' : '#9A9AB5',
            border: 'none',
            borderRadius: `${Math.max(radius - 4, 8)}px`,
            fontFamily: 'Inter',
            fontWeight: '600',
            fontSize: '13px',
            cursor: 'pointer'
          }}
        >
          Přihlásit se
        </button>
      </div>

      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="tvůj@email.cz"
        autoComplete="email"
        style={inputStyle}
      />
      <input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="Heslo"
        autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
        style={inputStyle}
      />

      {fieldError && (
        <div style={{ color: '#EF4444', fontSize: '12px', fontFamily: 'Inter' }}>{fieldError}</div>
      )}
      {submitError && (
        <div style={{ color: '#EF4444', fontSize: '12px', fontFamily: 'Inter' }}>{submitError}</div>
      )}

      <button
        type="button"
        onClick={handleSubmit}
        disabled={submitting}
        style={{
          width: '100%',
          height: '46px',
          background: submitting ? '#4A3D6E' : '#382C5C',
          border: '1px solid #7C3AED',
          borderRadius: `${radius}px`,
          color: '#fff',
          fontFamily: 'Inter',
          fontWeight: '700',
          fontSize: '14px',
          cursor: submitting ? 'default' : 'pointer'
        }}
      >
        {submitting ? 'Chvilku…' : (mode === 'register' ? 'Pokračovat s e-mailem' : 'Přihlásit se e-mailem')}
      </button>
    </div>
  );
}
