import AppShell from './layout/AppShell';
import MobileProfile from './mobile/MobileProfile';
import DesktopProfile from './desktop/DesktopProfile';

export default function Profile() {
  return (
    <AppShell 
      mobile={MobileProfile} 
      desktop={DesktopProfile} 
    />
  );
}
