import { useEffect, useState } from 'react';

export default function AppShell({ mobile: MobileComp, desktop: DesktopComp }) {
  const [isMobile, setIsMobile] = useState(window.innerWidth < 1024);

  useEffect(() => {
    const media = window.matchMedia('(max-width: 1023px)');
    const listener = (e) => setIsMobile(e.matches);
    media.addEventListener('change', listener);
    return () => media.removeEventListener('change', listener);
  }, []);

  return isMobile ? <MobileComp /> : <DesktopComp />;
}
