import AppShell from './layout/AppShell';
import MobileLeaderboard from './mobile/MobileLeaderboard';
import DesktopLeaderboard from './desktop/DesktopLeaderboard';

export default function Leaderboard() {
  return (
    <AppShell 
      mobile={MobileLeaderboard} 
      desktop={DesktopLeaderboard} 
    />
  );
}
