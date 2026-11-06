import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import reportWebVitals from './reportWebVitals';
import ErrorBoundary from './components/common/ErrorBoundary';
import { reportClientError } from './lib/analytics';
import * as serviceWorkerRegistration from './serviceWorkerRegistration';

window.addEventListener('error', (event) => reportClientError(event.error || event.message, { source: 'window' }));
window.addEventListener('unhandledrejection', (event) => reportClientError(event.reason, { source: 'promise' }));

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);

serviceWorkerRegistration.register();

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
