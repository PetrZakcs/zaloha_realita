import AppShell from './layout/AppShell';
import MobileFeed from './mobile/MobileFeed';
import DesktopFeed from './desktop/DesktopFeed';

export default function Feed() {
  return (
    <AppShell 
      mobile={MobileFeed} 
      desktop={DesktopFeed} 
    />
  );
}
