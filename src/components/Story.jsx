import AppShell from './layout/AppShell';
import MobileStory from './mobile/MobileStory';
import DesktopStory from './desktop/DesktopStory';

export default function Story() {
  return (
    <AppShell 
      mobile={MobileStory} 
      desktop={DesktopStory} 
    />
  );
}
