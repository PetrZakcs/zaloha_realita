const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(email) {
  return EMAIL_RE.test(String(email || '').trim());
}

export function isValidPassword(password) {
  return typeof password === 'string' && password.length > 8;
}
