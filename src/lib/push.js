// Web Push subscribe/unsubscribe (MVP1 spec-3 §14A retention notifications). The actual
// sending is server-side (supabase/functions/send-retention-push); this is the browser half:
// request permission, subscribe via the Push API, and hand the subscription to Supabase so
// the scheduled sender knows where to deliver. See public/service-worker.js for the receiving
// half (push/notificationclick handlers).
import { supabase } from '../api/supabaseClient';

const VAPID_PUBLIC_KEY = process.env.REACT_APP_VAPID_PUBLIC_KEY;

// PushManager.subscribe() needs the VAPID public key as a raw Uint8Array, not the
// base64url string it's normally shared as.
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

export function isPushSupported() {
  return 'serviceWorker' in navigator && 'PushManager' in window;
}

// 'unsupported' | 'denied' | 'subscribed' | 'not-subscribed'
export async function getPushStatus() {
  if (!isPushSupported()) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    return subscription ? 'subscribed' : 'not-subscribed';
  } catch (e) {
    return 'not-subscribed';
  }
}

export async function subscribeToPush() {
  if (!isPushSupported()) {
    return { success: false, error: 'Tento prohlížeč nepodporuje oznámení.' };
  }
  if (!VAPID_PUBLIC_KEY) {
    return { success: false, error: 'Oznámení nejsou zatím nakonfigurovaná.' };
  }

  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      return { success: false, error: 'Oznámení nebyla povolena.' };
    }

    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
    });

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return { success: false, error: 'Nejsi přihlášen/a.' };

    const json = subscription.toJSON();
    const { error } = await supabase.from('push_subscriptions').upsert(
      {
        user_id: session.user.id,
        endpoint: json.endpoint,
        p256dh: json.keys.p256dh,
        auth: json.keys.auth
      },
      { onConflict: 'endpoint' }
    );

    if (error) throw error;
    return { success: true };
  } catch (e) {
    console.warn('Push subscription failed.', e);
    return { success: false, error: 'Oznámení se nepodařilo aktivovat.' };
  }
}

export async function unsubscribeFromPush() {
  if (!isPushSupported()) return { success: true };
  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    if (subscription) {
      const endpoint = subscription.endpoint;
      await subscription.unsubscribe();
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        await supabase.from('push_subscriptions').delete().eq('endpoint', endpoint);
      }
    }
    return { success: true };
  } catch (e) {
    console.warn('Push unsubscribe failed.', e);
    return { success: false };
  }
}
