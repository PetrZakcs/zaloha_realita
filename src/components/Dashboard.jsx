import AppShell from './layout/AppShell';
import MobileDashboard from './mobile/MobileDashboard';
import DesktopDashboard from './desktop/DesktopDashboard';

export default function Dashboard() {
  return (
    <AppShell 
      mobile={MobileDashboard} 
      desktop={DesktopDashboard} 
    />
  );
}
