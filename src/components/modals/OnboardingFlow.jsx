import { useIsMobile } from '../../hooks/useIsMobile';
import MobileOnboarding from '../mobile/MobileOnboarding';
import DesktopOnboarding from '../desktop/DesktopOnboarding';

// Thin platform dispatcher — see MobileOnboarding.jsx / DesktopOnboarding.jsx
// for the actual step flows. Both pull everything they need from
// useUserStore() directly, matching the Mobile*/Desktop* pattern used
// throughout the rest of the app.
export default function OnboardingFlow() {
  const isMobile = useIsMobile();
  return isMobile ? <MobileOnboarding /> : <DesktopOnboarding />;
}
