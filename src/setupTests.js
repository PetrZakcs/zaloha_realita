// jest-dom adds custom jest matchers for asserting on DOM nodes.
// allows you to do things like:
// expect(element).toHaveTextContent(/react/i)
// learn more: https://github.com/testing-library/jest-dom
import '@testing-library/jest-dom';

// jest-environment-jsdom (bundled by react-scripts 5 / Jest 27) doesn't put
// TextEncoder/TextDecoder on the global scope the way real browsers and Node do.
// react-router-dom v7 needs them at module-load time (see package.json's
// moduleNameMapper for the matching react-router-dom/v7 Jest fix), so without
// this every test that imports it fails before running a single test with
// "ReferenceError: TextEncoder is not defined".
import { TextEncoder, TextDecoder } from 'util';
if (typeof global.TextEncoder === 'undefined') global.TextEncoder = TextEncoder;
if (typeof global.TextDecoder === 'undefined') global.TextDecoder = TextDecoder;

// jsdom (bundled by react-scripts 5 / Jest 27) doesn't expose window.crypto
// either, so analytics.js's `crypto.randomUUID ? ... : fallback` guard throws
// "ReferenceError: crypto is not defined" before it can even check — the
// global itself is missing, not just the method. Node's own webcrypto covers it.
if (typeof global.crypto === 'undefined') {
  global.crypto = require('node:crypto').webcrypto;
}

// jsdom doesn't implement window.matchMedia at all. usePwaInstall.js (mounted by
// App/Layout on every render) calls it unconditionally to detect standalone/PWA
// display mode, so without this every test that mounts the app tree throws
// "window.matchMedia is not a function" before rendering anything.
if (typeof window.matchMedia !== 'function') {
  window.matchMedia = (query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  });
}
