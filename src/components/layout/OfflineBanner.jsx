import { useEffect, useState } from 'react';
import { WifiOff } from 'lucide-react';

// The game needs the server for every action, so the honest offline state is to say so.
export default function OfflineBanner() {
  const [offline, setOffline] = useState(() => !navigator.onLine);

  useEffect(() => {
    const update = () => setOffline(!navigator.onLine);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);

  if (!offline) return null;
  return (
    <div role="status" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', background: '#2A1E10', borderBottom: '1px solid #F5B73F', color: '#F5B73F', fontFamily: 'Inter, sans-serif', fontSize: '12px', padding: '7px 12px', flexShrink: 0 }}>
      <WifiOff size={14} /> Jsi offline. Důkaz odešleš, až se připojíš.
    </div>
  );
}
