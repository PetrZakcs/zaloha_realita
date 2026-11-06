import { Component } from 'react';
import { reportClientError } from '../../lib/analytics';

// Without this any render error leaves a blank page and nobody ever learns about it.
export default class ErrorBoundary extends Component {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error, info) {
    reportClientError(error, { source: 'react', stack: info?.componentStack?.slice(0, 500) });
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div style={{ position: 'fixed', inset: 0, background: '#0D0A18', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '12px', padding: '24px', textAlign: 'center' }}>
        <h1 style={{ margin: 0, fontFamily: "'Space Grotesk', sans-serif", fontSize: '22px', color: '#F0F0F8' }}>Něco se pokazilo</h1>
        <p style={{ margin: 0, fontFamily: 'Inter, sans-serif', fontSize: '14px', color: '#9A9AB5', lineHeight: 1.5 }}>Tvůj postup je v bezpečí. Stačí aplikaci načíst znovu.</p>
        <button type="button" onClick={() => window.location.reload()}
          style={{ marginTop: '6px', height: '46px', padding: '0 26px', background: '#7C3AED', color: '#fff', border: 'none', borderRadius: '14px', fontFamily: 'Inter, sans-serif', fontWeight: 700, fontSize: '15px', cursor: 'pointer' }}>
          Načíst znovu
        </button>
      </div>
    );
  }
}
