import { track } from './analytics';

// Feed Engine "MVP1 — ANALYTICS: impressions". Each post counts once per session; ids are
// batched into one analytics event every few seconds instead of a row per post.
const seen = new Set();
let pending = [];
let timer = null;

function flush() {
  timer = null;
  if (pending.length === 0) return;
  const batch = pending;
  pending = [];
  track('feed_impressions', { post_ids: batch, count: batch.length });
}

export function recordImpression(postId) {
  if (!postId || seen.has(postId)) return;
  seen.add(postId);
  pending.push(postId);
  if (!timer) timer = setTimeout(flush, 5000);
}

// Observes elements carrying data-post-id; returns a cleanup function.
export function observeImpressions(container) {
  if (!container || typeof IntersectionObserver === 'undefined') return () => {};
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting && entry.intersectionRatio >= 0.5) {
        recordImpression(entry.target.getAttribute('data-post-id'));
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: [0.5] });
  container.querySelectorAll('[data-post-id]').forEach(el => observer.observe(el));
  return () => observer.disconnect();
}
