import { create } from 'zustand';
import { createAuthSlice, DEFAULT_USER } from './slices/authSlice';
import { createFeedSlice, DEFAULT_FEED, DEFAULT_LEADERBOARD } from './slices/feedSlice';
import { createGameplaySlice } from './slices/gameplaySlice';

export { DEFAULT_USER, DEFAULT_FEED, DEFAULT_LEADERBOARD };

export const useUserStore = create((set, get) => ({
  ...createAuthSlice(set, get),
  ...createFeedSlice(set, get),
  ...createGameplaySlice(set, get)
}));
