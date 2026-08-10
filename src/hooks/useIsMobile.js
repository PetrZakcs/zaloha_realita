import { useState, useEffect } from 'react';

const MOBILE_BREAKPOINT = 1024;

// Shared breakpoint check — was previously duplicated inline in Layout.jsx;
// OnboardingFlow now needs the exact same platform decision.
export function useIsMobile() {
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < MOBILE_BREAKPOINT);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return isMobile;
}
