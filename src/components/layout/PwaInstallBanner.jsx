import { useState } from 'react';
import { Download, X, Share } from 'lucide-react';
import { usePwaInstall } from '../../hooks/usePwaInstall';

export default function PwaInstallBanner() {
  const { isInstallable, isInstalled, isIOS, promptInstall } = usePwaInstall();
  const [dismissed, setDismissed] = useState(false);

  if (dismissed || isInstalled || (!isInstallable && !isIOS)) {
    return null;
  }

  return (
    <div style={{
      background: 'linear-gradient(135deg, rgba(21, 17, 30, 0.95) 0%, rgba(30, 20, 50, 0.95) 100%)',
      backdropFilter: 'blur(12px)',
      border: '1px solid rgba(124, 58, 237, 0.4)',
      borderRadius: '16px',
      margin: '12px 16px',
      padding: '14px 16px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      boxShadow: '0 8px 24px rgba(124, 58, 237, 0.25)',
      position: 'relative',
      zIndex: 100
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <div style={{
          width: '42px',
          height: '42px',
          borderRadius: '10px',
          background: 'linear-gradient(135deg, #7C3AED 0%, #EC4899 100%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#fff',
          boxShadow: '0 0 12px rgba(124, 58, 237, 0.5)'
        }}>
          <Download size={22} />
        </div>
        <div>
          <div style={{
            color: '#FFFFFF',
            fontWeight: 700,
            fontSize: '14px',
            fontFamily: "'Space Grotesk', sans-serif"
          }}>
            Nainstaluj iWau na plochu
          </div>
          <div style={{
            color: '#9CA3AF',
            fontSize: '12px',
            marginTop: '2px',
            fontFamily: 'Inter, sans-serif'
          }}>
            {isIOS ? 'Klepni na Sdílet a Přidat na plochu' : 'Rychlejší načítání & okamžitá hra'}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        {isInstallable && (
          <button
            onClick={promptInstall}
            style={{
              background: '#7C3AED',
              color: '#FFFFFF',
              border: 'none',
              borderRadius: '8px',
              padding: '8px 14px',
              fontWeight: 600,
              fontSize: '12px',
              cursor: 'pointer',
              fontFamily: 'Inter, sans-serif',
              boxShadow: '0 2px 8px rgba(124, 58, 237, 0.4)'
            }}
          >
            Instalovat
          </button>
        )}
        {isIOS && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            color: '#A78BFA',
            fontSize: '11px',
            fontWeight: 600
          }}>
            <Share size={14} /> Sdílet
          </div>
        )}
        <button
          onClick={() => setDismissed(true)}
          style={{
            background: 'transparent',
            border: 'none',
            color: '#6B7280',
            cursor: 'pointer',
            padding: '4px',
            display: 'flex',
            alignItems: 'center'
          }}
          aria-label="Zavřít banner"
        >
          <X size={18} />
        </button>
      </div>
    </div>
  );
}
