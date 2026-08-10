import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.REACT_APP_SUPABASE_URL || 'https://placeholder-url.supabase.co';
const supabaseAnonKey = process.env.REACT_APP_SUPABASE_ANON_KEY || 'placeholder-anon-key';

// "Zapamatovat si mě" — real (not decorative) session persistence toggle.
// Supabase's default storage always writes to localStorage, so the session
// survives closing the browser no matter what. To make an unchecked
// "remember me" actually mean something, this adapter checks a plain
// localStorage flag *at the moment auth tokens are written* and routes them
// to sessionStorage instead (cleared when the browser/tab closes) when the
// user opted out. No flag set yet (e.g. existing sessions from before this
// existed) defaults to "remembered", matching the previous always-on
// behavior — nobody gets silently signed out by this change.
const REMEMBER_ME_KEY = 'iwau_remember_me';

export function setRememberMe(remember) {
  localStorage.setItem(REMEMBER_ME_KEY, remember ? 'true' : 'false');
}

function isRemembered() {
  return localStorage.getItem(REMEMBER_ME_KEY) !== 'false';
}

const rememberAwareStorage = {
  getItem: (key) => (isRemembered() ? localStorage.getItem(key) : sessionStorage.getItem(key)),
  setItem: (key, value) => {
    if (isRemembered()) {
      localStorage.setItem(key, value);
      sessionStorage.removeItem(key);
    } else {
      sessionStorage.setItem(key, value);
      localStorage.removeItem(key);
    }
  },
  removeItem: (key) => {
    localStorage.removeItem(key);
    sessionStorage.removeItem(key);
  }
};

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: { storage: rememberAwareStorage }
});
