// Extra OAuth providers from the MVP1 spec (Apple, Facebook). Each must first be enabled in
// Supabase → Authentication → Providers, so the buttons only render once the matching env
// flag is set — otherwise the click would end on a provider error page.
export const EXTRA_OAUTH_PROVIDERS = [
  { id: 'apple', label: 'Apple', enabled: process.env.REACT_APP_AUTH_APPLE_ENABLED === 'true' },
  { id: 'facebook', label: 'Facebook', enabled: process.env.REACT_APP_AUTH_FACEBOOK_ENABLED === 'true' },
].filter(p => p.enabled);
