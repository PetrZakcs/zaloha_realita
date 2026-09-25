import { supabase } from '../api/supabaseClient';
import { track } from './analytics';

// Starts a Stripe Checkout for one of the server-whitelisted plans ('monthly' | 'yearly' |
// 'deposit'; price ids live in stripe-checkout's secrets). Redirects on success.
// Returns { error: 'no_session' | 'failed' } when it can't redirect.
export async function startCheckout(plan) {
  track('pass_checkout_started', { plan });
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    track('pass_checkout_blocked', { reason: 'no_session', plan });
    return { error: 'no_session' };
  }

  try {
    const response = await fetch(`${process.env.REACT_APP_SUPABASE_URL}/functions/v1/stripe-checkout`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // The player's own JWT — stripe-checkout identifies the buyer from it.
        Authorization: `Bearer ${session.access_token}`
      },
      body: JSON.stringify({ plan })
    });
    const resData = await response.json();
    if (!resData.sessionUrl) throw new Error(resData.error || 'No checkout URL');
    window.location.href = resData.sessionUrl;
    return {};
  } catch (err) {
    // No fail-open grant: pass_holder is set only by stripe-webhook after a verified payment.
    console.warn('Stripe checkout call failed.', err);
    track('pass_checkout_failed', { plan, error: String(err?.message || err) });
    return { error: 'failed' };
  }
}
