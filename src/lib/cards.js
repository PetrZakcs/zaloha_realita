// Single source of truth for the app's card/badge catalog — previously defined inline
// inside ModalManager.jsx's 'collections' modal only, so Profile/Inventory had no way to
// reuse it and fell back to 4 cycling mock icon styles instead of real owned cards.
export const ALL_CARDS = [
  // Always shown unlocked — the one guaranteed starter card every account has, regardless
  // of what's actually in user_cards yet (matches the pre-existing 'collections' modal
  // behavior this was extracted from).
  { key: 'doer-mvp1', title: 'Doer', bg: '#241a3d', border: '#7C3AED', color: '#A78BFA', alwaysUnlocked: true },
  { key: 'c-node-1-card', title: 'Ticho', bg: '#2A1E10', border: '#F5B73F', color: '#F5B73F' },
  { key: 'c-node-2-card', title: 'Detox', bg: '#1C2E24', border: '#22C55E', color: '#22C55E' },
  { key: 'c-npc-challenge-card', title: 'NPC Hero', bg: '#14223D', border: '#4AA8FF', color: '#4AA8FF' },
  { key: 'c-node-4-card', title: 'Strom', bg: '#241a3d', border: '#7C3AED', color: '#A78BFA' },
  { key: 'c-node-5-card', title: 'Kniha', bg: '#2A1E10', border: '#F5B73F', color: '#F5B73F' },
  { key: 'c-node-6-card', title: 'Zpráva', bg: '#1C2E24', border: '#22C55E', color: '#22C55E' },
  { key: 'c-node-7-card', title: 'Úsvit', bg: '#14223D', border: '#4AA8FF', color: '#4AA8FF' },
  // Granted by submit_season_reflection() — Hidden Node unlock (spec-5).
  { key: 'light-bearer-season0', title: 'Light Bearer', bg: '#241a3d', border: '#F5B73F', color: '#F5B73F' },
  // Granted by handle_referral_signup() — referral milestone rewards (spec-7).
  { key: 'referral-rare-3', title: 'Šiřitel', bg: '#1C2E24', border: '#22C55E', color: '#22C55E' },
  { key: 'referral-badge-5', title: 'Nositel Světla', bg: '#14223D', border: '#4AA8FF', color: '#4AA8FF' }
];

export function isCardUnlocked(card, unlockedCards) {
  return card.alwaysUnlocked || unlockedCards.some(uc => uc.card_key === card.key);
}

export function findCard(cardKey) {
  return ALL_CARDS.find(c => c.key === cardKey) || null;
}
