import { create } from 'zustand';
import { createAuthSlice, DEFAULT_USER } from './slices/authSlice';
import { createFeedSlice } from './slices/feedSlice';
import { createGameplaySlice } from './slices/gameplaySlice';

export { DEFAULT_USER };

export const useUserStore = create((set, get) => ({
  ...createAuthSlice(set, get),
  ...createFeedSlice(set, get),
  ...createGameplaySlice(set, get)
}));
