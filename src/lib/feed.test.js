import { mapFeedRow } from '../store/slices/feedSlice';
import { FRAMES, findFrame, isFrameUnlocked } from './frames';

test('mapFeedRow fills safe defaults for a minimal row', () => {
  const post = mapFeedRow({ id: 'p1', content: 'x' });
  expect(post).toMatchObject({
    user_name: 'Hráč', type: 'PROOF', media_type: null, challenge_id: null,
    author_onboarded: true, is_first_proof: false, reactions_fire: 0, reactions_plant: 0, is_public: true,
  });
});

test('mapFeedRow keeps video media type and legacy lightning reactions', () => {
  const post = mapFeedRow({ id: 'p2', image_url: 'a.mp4', media_type: 'video', reactions_lightning: 4, author_onboarded: false });
  expect(post.media_type).toBe('video');
  expect(post.reactions_plant).toBe(4);
  expect(post.author_onboarded).toBe(false);
  expect(mapFeedRow({ id: 'p3', image_url: 'a.jpg' }).media_type).toBe('image');
});

test('frames unlock by avatar level, Founder frame only with a pass', () => {
  expect(isFrameUnlocked(findFrame('frame-3'), { level: 2 })).toBe(false);
  expect(isFrameUnlocked(findFrame('frame-3'), { level: 3 })).toBe(true);
  expect(isFrameUnlocked(findFrame('frame-founder'), { level: 5 })).toBe(false);
  expect(isFrameUnlocked(findFrame('frame-founder'), { passHolder: true })).toBe(true);
  expect(findFrame('nope')).toBeNull();
  expect(FRAMES).toHaveLength(6);
});
