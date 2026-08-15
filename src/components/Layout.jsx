import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useUserStore } from '../store/userStore';
import { track } from '../lib/analytics';
import { useIsMobile } from '../hooks/useIsMobile';
import {
  Home as HomeIcon,
  LayoutGrid,
  Trophy,
  User as UserIcon,
  Flame,
  KeyRound,
  Bell,
  Settings,
  Crown,
  Sparkles
} from 'lucide-react';
import ModalManager from './ModalManager';
import PwaInstallBanner from './layout/PwaInstallBanner';

export default function Layout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, onboarded, openModal, addReaction } = useUserStore();
  const isMobile = useIsMobile();

  // Redirect to Splash if not onboarded
  if (!onboarded) {
    return <ModalManager />;
  }

  const nav = [
    { id: 'home', icon: <HomeIcon size={20} />, label: 'Domů', path: '/' },
    { id: 'feed', icon: <LayoutGrid size={20} />, label: 'Feed', path: '/feed' },
    { id: 'artefakty', icon: <Sparkles size={20} />, label: 'Artefakty', path: '/inventory' },
    { id: 'leaderboard', icon: <Trophy size={20} />, label: 'Žebříček', path: '/leaderboard' },
    { id: 'profile', icon: <UserIcon size={20} />, label: 'Profil', path: '/profile' },
  ];

  const isNavItemActive = (item) => item.path ? location.pathname === item.path : false;

  // Helper to resolve desktop header title based on route
  const getDesktopTitle = () => {
    switch (location.pathname) {
      case '/':
        return (
          <div>
            <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: '700', fontSize: '22px' }}>
              Ahoj, <span style={{ color: '#A78BFA' }}>{user?.name || 'TP'}</span> 👋
            </div>
            <div style={{ fontFamily: 'Inter', fontSize: '13px', color: '#6B6B8A', marginTop: '2px' }}>
              Máš rozdělaný Uzel {user?.uzel ?? 3}. Pojď do toho.
            </div>
          </div>
        );
      case '/story':
        return (
          <div>
            <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: '700', fontSize: '22px' }}>
              Příběh se Zayou
            </div>
            <div style={{ fontFamily: 'Inter', fontSize: '13px', color: '#6B6B8A', marginTop: '2px' }}>
              Postupuj uzly a plň úkoly.
            </div>
          </div>
        );
      case '/feed':
        return (
          <div>
            <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: '700', fontSize: '22px' }}>
              Komunita · Důkazy
            </div>
            <div style={{ fontFamily: 'Inter', fontSize: '13px', color: '#6B6B8A', marginTop: '2px' }}>
              Sleduj reálné zásahy ostatních hráčů.
            </div>
          </div>
        );
      case '/leaderboard':
        return (
          <div>
            <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: '700', fontSize: '22px' }}>
              Žebříček sezóny
            </div>
            <div style={{ fontFamily: 'Inter', fontSize: '13px', color: '#6B6B8A', marginTop: '2px' }}>
              Týdenní reset proběhne za 2 dny.
            </div>
          </div>
        );
      case '/profile':
        return (
          <div>
            <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: '700', fontSize: '22px' }}>
              Tvůj profil
            </div>
            <div style={{ fontFamily: 'Inter', fontSize: '13px', color: '#6B6B8A', marginTop: '2px' }}>
              Správa sbírek, odznaků a klíčů.
            </div>
          </div>
        );
      default:
        return null;
    }
  };

  if (isMobile) {
    return (
      <div style={{
        position: 'relative',
        width: '100%',
        height: '100dvh',
        maxHeight: '100dvh',
        background: '#15111E',
        backgroundImage: 'radial-gradient(circle at 15% 0%, rgba(124, 58, 237, 0.16), transparent 45%)',
        color: '#F0F0F8',
        fontFamily: 'Inter, sans-serif',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column'
      }}>

          {/* App Top Bar */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '8px 20px 14px',
            flexShrink: 0
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
              <span style={{ display: 'inline-flex', width: '17px', height: '17px' }}>
                <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ width: '100%', height: '100%' }}>
                  <defs>
                    <linearGradient id="iwg" x1="8" y1="5" x2="40" y2="42" gradientUnits="userSpaceOnUse">
                      <stop offset="0" stopColor="#B24EE8" />
                      <stop offset="1" stopColor="#6E18A0" />
                    </linearGradient>
                  </defs>
                  <path d="M11 5 L24 13 L37 5 L43 19 L35 42 L24 34 L13 42 L5 19 Z" fill="url(#iwg)" stroke="url(#iwg)" strokeWidth="3" strokeLinejoin="round" />
                  <path d="M24 25 L24 11 M24 25 L13.5 36 M24 25 L34.5 36" fill="none" stroke="#fff" strokeWidth="5.2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
              <span style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: '700', fontSize: '15px' }}>
                iWau HRA <span style={{ color: '#A78BFA' }}>REALITY</span>
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {user?.passHolder ? (
                <span style={{
                  fontFamily: 'Inter',
                  fontWeight: '600',
                  fontSize: '10px',
                  color: '#F5B73F',
                  border: '1px solid #F5B73F',
                  boxShadow: '0 0 8px rgba(245,183,63,.3)',
                  borderRadius: '7px',
                  padding: '4px 8px',
                  cursor: 'pointer'
                }} onClick={() => { track('paywall_opened', { source: 'header_badge_active' }); openModal('paywall'); }}>
                  PASS
                </span>
              ) : (
                <span style={{
                  fontFamily: 'Inter',
                  fontWeight: '500',
                  fontSize: '10px',
                  color: '#6B6B8A',
                  border: '1.5px dashed #382C5C',
                  borderRadius: '7px',
                  padding: '4px 8px',
                  cursor: 'pointer'
                }} onClick={() => { track('paywall_opened', { source: 'header_badge_upsell' }); openModal('paywall'); }}>
                  + PASS
                </span>
              )}
              <span style={{
                fontFamily: "'JetBrains Mono', monospace",
                fontWeight: '500',
                fontSize: '12px',
                color: '#fff',
                background: 'linear-gradient(135deg,#2563EB,#3B82F6)',
                borderRadius: '7px',
                padding: '5px 9px'
              }}>
                #{user?.xp || 0} XP
              </span>
            </div>
          </div>

          {/* Main Content Area */}
          <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', paddingBottom: '90px' }}>
            <PwaInstallBanner />
            <Outlet />
          </div>

          {/* Bottom Nav Capsule (Centered Dock) */}
          <div style={{
            position: 'fixed',
            bottom: 0,
            left: 0,
            width: '100%',
            zIndex: 99,
            display: 'flex',
            justify: 'center',
            padding: '0 12px calc(10px + env(safe-area-inset-bottom, 0px))',
            pointerEvents: 'none',
            boxSizing: 'border-box'
          }}>
            <div style={{
              width: '100%',
              maxWidth: '430px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '6px 4px',
              border: '1px solid rgba(124, 58, 237, 0.3)',
              borderRadius: '26px',
              background: 'rgba(21, 17, 30, 0.94)',
              boxShadow: '0 10px 30px rgba(0, 0, 0, 0.6), 0 0 15px rgba(124, 58, 237, 0.15)',
              backdropFilter: 'blur(16px)',
              WebkitBackdropFilter: 'blur(16px)',
              pointerEvents: 'auto',
              boxSizing: 'border-box'
            }}>
              {nav.map((item) => {
                const { icon, label, path, action } = item;
                const active = isNavItemActive(item);
                return (
                  <button
                    key={item.id}
                    onClick={() => action ? action() : navigate(path)}
                    style={{
                      flex: 1,
                      minWidth: 0,
                      background: 'transparent',
                      border: 'none',
                      padding: '6px 0 4px',
                      cursor: 'pointer',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '3px',
                      transition: 'all 0.2s ease',
                      WebkitTapHighlightColor: 'transparent'
                    }}
                  >
                    <span style={{ 
                      display: 'inline-flex', 
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: '40px', 
                      height: '26px',
                      borderRadius: '13px',
                      background: active ? 'radial-gradient(circle, rgba(124,58,237,0.55), rgba(124,58,237,0.18))' : 'transparent',
                      boxShadow: active ? '0 0 12px rgba(124,58,237,0.5)' : 'none',
                      color: active ? '#A78BFA' : '#6B6B8A',
                      transition: 'all 0.2s ease'
                    }}>
                      {icon}
                    </span>
                    <span style={{
                      fontFamily: 'Inter, sans-serif',
                      fontWeight: active ? '700' : '500',
                      fontSize: '10px',
                      color: active ? '#FFFFFF' : '#6B6B8A',
                      letterSpacing: '-0.01em',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      maxWidth: '100%'
                    }}>
                      {label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Modal Overlay Controller */}
          <ModalManager />
        </div>
      );
    }

  // DESKTOP LAYOUT (>= 1024px)
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100vh',
      width: '100vw',
      background: '#0D0A18',
      backgroundImage: 'radial-gradient(circle at 12% 0%, rgba(124,58,237,.14), transparent 40%)',
      color: '#F0F0F8',
      fontFamily: 'Inter, sans-serif',
      overflow: 'hidden'
    }}>

        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
          {/* SIDEBAR */}
          <div style={{
            width: '240px',
            flexShrink: 0,
            background: '#0A0712',
            borderRight: '1px solid #1B1430',
            display: 'flex',
            flexDirection: 'column',
            padding: '22px 14px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '9px', padding: '0 8px 24px' }}>
              <span style={{ display: 'inline-flex', width: '22px', height: '22px' }}>
                <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ width: '100%', height: '100%' }}>
                  <path d="M11 5 L24 13 L37 5 L43 19 L35 42 L24 34 L13 42 L5 19 Z" fill="url(#iwg_desk)" stroke="url(#iwg_desk)" strokeWidth="3" strokeLinejoin="round" />
                  <path d="M24 25 L24 11 M24 25 L13.5 36 M24 25 L34.5 36" fill="none" stroke="#fff" strokeWidth="5.2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
              <span style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: '700', fontSize: '16px' }}>
                HRA<span style={{ color: '#A78BFA' }}>REALITY</span>
              </span>
            </div>

            {/* Navigation Tabs */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
              {nav.map((item) => {
                const { icon, label, path, action } = item;
                const active = isNavItemActive(item);
                return (
                  <button
                    key={item.id}
                    onClick={() => action ? action() : navigate(path)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      padding: '12px',
                      borderRadius: '14px',
                      background: active ? '#241C3C' : 'transparent',
                      border: 'none',
                      color: active ? '#F0F0F8' : '#9A9AB5',
                      cursor: 'pointer',
                      position: 'relative',
                      textAlign: 'left',
                      fontFamily: 'Inter, sans-serif',
                      fontWeight: active ? '600' : '500',
                      fontSize: '14px',
                      transition: 'all .2s'
                    }}
                  >
                    {active && (
                      <span style={{
                        position: 'absolute',
                        left: 0,
                        top: '10px',
                        bottom: '10px',
                        width: '3px',
                        borderRadius: '2px',
                        background: '#7C3AED'
                      }}></span>
                    )}
                    <span style={{ display: 'inline-flex', width: '19px', height: '19px', color: active ? '#A78BFA' : '#6B6B8A' }}>
                      {icon}
                    </span>
                    <span>{label}</span>
                  </button>
                );
              })}
            </div>

            <div style={{ flex: 1 }}></div>

            {/* Hra Pass Upsell Banner */}
            <div className="sheen-wrap" style={{
              background: 'linear-gradient(150deg,#2A1E10,#1C1630)',
              border: '0.5px solid #F5B73F',
              borderRadius: '16px',
              padding: '14px',
              marginBottom: '14px',
              cursor: 'pointer'
            }} onClick={() => { track('paywall_opened', { source: 'sidebar_banner' }); openModal('paywall'); }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
                <span style={{ display: 'inline-flex', width: '16px', height: '16px', color: '#F5B73F' }}><Crown size={14} /></span>
                <span style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: '700', fontSize: '13px', color: '#F5B73F' }}>HRA PASS</span>
              </div>
              <div style={{ fontFamily: 'Inter', fontSize: '11px', color: '#9A9AB5', marginTop: '6px', lineHeight: '1.5' }}>
                {user?.passHolder ? 'Sezónní výzvy plně aktivní!' : 'Bonusové výzvy a plný příběh sezóny.'}
              </div>
              {!user?.passHolder && (
                <div style={{ fontFamily: 'Inter', fontWeight: '600', fontSize: '12px', color: '#F5B73F', marginTop: '9px' }}>
                  Odemknout →
                </div>
              )}
            </div>

            {/* Profile Info Footer */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              padding: '10px',
              borderRadius: '14px',
              background: '#15111E'
            }}>
              <span style={{
                width: '34px',
                height: '34px',
                borderRadius: '50%',
                background: '#241C3C',
                border: '1.5px solid #7C3AED',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontFamily: "'Space Grotesk', sans-serif",
                fontWeight: '700',
                fontSize: '13px',
                color: '#A78BFA',
                flexShrink: 0
              }}>
                {(user?.name || 'TP').slice(0, 2).toUpperCase()}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: 'Inter', fontWeight: '600', fontSize: '12px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {user?.name || 'TemnýPozorovatel'}
                </div>
                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '10px', color: '#6B6B8A' }}>
                  {user?.rarity || 'Rare'} · {user?.xp || 240} XP
                </div>
              </div>
              <span 
                onClick={() => openModal('settings')}
                style={{ display: 'inline-flex', width: '16px', height: '16px', color: '#6B6B8A', cursor: 'pointer' }}
              >
                <Settings size={16} />
              </span>
            </div>
          </div>

          {/* MAIN PAGE AREA */}
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {/* Top Bar Header */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '20px',
              padding: '20px 28px',
              borderBottom: '1px solid #1B1430',
              flexShrink: 0
            }}>
              {getDesktopTitle()}
              <div style={{ flex: 1 }}></div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#1C1630', border: '0.5px solid #382C5C', borderRadius: '12px', padding: '8px 12px' }}>
                <span className="flame-ico" style={{ display: 'inline-flex', width: '16px', height: '16px', color: '#F5B73F' }}><Flame size={16} /></span>
                <span style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: '700', fontSize: '14px', color: '#F5B73F' }}>{user?.streak || 5}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#1C1630', border: '0.5px solid #382C5C', borderRadius: '12px', padding: '8px 12px' }}>
                <span style={{ display: 'inline-flex', width: '16px', height: '16px', color: '#F5B73F' }}><KeyRound size={16} /></span>
                <span style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: '700', fontSize: '14px', color: '#F5B73F' }}>{user?.keys_count || 7}</span>
              </div>
              <span style={{
                fontFamily: "'JetBrains Mono', monospace",
                fontWeight: '500',
                fontSize: '13px',
                color: '#fff',
                background: 'linear-gradient(135deg,#2563EB,#3B82F6)',
                borderRadius: '12px',
                padding: '9px 13px',
                boxShadow: '0 0 12px rgba(59,130,246,.3)'
              }}>
                #{user?.xp || 240} XP
              </span>
              <span 
                onClick={() => openModal('notifications')}
                style={{ display: 'inline-flex', width: '20px', height: '20px', color: '#6B6B8A', cursor: 'pointer', position: 'relative' }}
              >
                <Bell size={18} />
                <span style={{ position: 'absolute', top: 0, right: 0, width: '6px', height: '6px', background: '#7C3AED', borderRadius: '50%' }}></span>
              </span>
            </div>

            {/* Inner Content Component */}
            <div style={{ flex: 1, overflowY: 'auto' }}>
              <Outlet />
            </div>
          </div>

          {/* RIGHT SIDE RAIL (COMMUNITY + WEEKLY LEADERBOARD) */}
          <div style={{
            width: '300px',
            flexShrink: 0,
            background: '#0A0712',
            borderLeft: '1px solid #1B1430',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden'
          }}>
            <div style={{ padding: '22px 18px 8px' }}>
              <div style={{ fontFamily: 'Inter', fontWeight: '600', fontSize: '11px', letterSpacing: '.12em', textTransform: 'uppercase', color: '#6B6B8A', marginBottom: '14px' }}>
                Komunita · právě teď
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', background: '#15111E', border: '0.5px solid #2A2142', borderRadius: '16px', padding: '12px' }}>
                  <span style={{ width: '32px', height: '32px', borderRadius: '50%', background: '#1f2a3d', border: '1.5px solid #7C3AED', flexShrink: 0 }}></span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                      <span style={{ fontFamily: 'Inter', fontWeight: '600', fontSize: '12px' }}>NeonLiška</span>
                      <span style={{ fontFamily: 'Inter', fontSize: '9px', color: '#A78BFA', border: '0.5px solid #A78BFA', borderRadius: '20px', padding: '1px 6px' }}>Doer</span>
                    </div>
                    <div style={{ fontFamily: 'Inter', fontSize: '11px', color: '#9A9AB5', marginTop: '3px', lineHeight: '1.45' }}>
                      Sebrala 3 kelímky 🟢
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '6px', cursor: 'pointer' }} onClick={() => addReaction('f1', 'fire')}>
                      <span style={{ display: 'inline-flex', width: '12px', height: '12px', color: '#F5B73F' }}><Flame size={12} /></span>
                      <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '10px', color: '#6B6B8A' }}>34</span>
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', background: '#15111E', border: '0.5px solid #2A2142', borderRadius: '16px', padding: '12px' }}>
                  <span style={{ width: '32px', height: '32px', borderRadius: '50%', background: '#241C3C', border: '1.5px solid #7C3AED', flexShrink: 0 }}></span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                      <span style={{ fontFamily: 'Inter', fontWeight: '600', fontSize: '12px' }}>RychlýDoer</span>
                      <span style={{ fontFamily: 'Inter', fontSize: '9px', color: '#A78BFA', border: '0.5px solid #A78BFA', borderRadius: '20px', padding: '1px 6px' }}>Doer</span>
                    </div>
                    <div style={{ fontFamily: 'Inter', fontSize: '11px', color: '#9A9AB5', marginTop: '3px', lineHeight: '1.45' }}>
                      Napsal kámošce po půl roce
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '6px', cursor: 'pointer' }} onClick={() => addReaction('f2', 'fire')}>
                      <span style={{ display: 'inline-flex', width: '12px', height: '12px', color: '#F5B73F' }}><Flame size={12} /></span>
                      <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '10px', color: '#6B6B8A' }}>21</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div style={{ padding: '14px 18px 20px', borderTop: '1px solid #1B1430', marginTop: '6px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
                <span style={{ fontFamily: 'Inter', fontWeight: '600', fontSize: '11px', letterSpacing: '.12em', textTransform: 'uppercase', color: '#6B6B8A' }}>
                  Žebříček · týden
                </span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 10px', background: '#15111E', borderRadius: '12px' }}>
                  <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '12px', color: '#F5B73F', width: '16px' }}>1</span>
                  <span style={{ width: '24px', height: '24px', borderRadius: '50%', background: '#241C3C', border: '1.5px solid #F5B73F' }}></span>
                  <span style={{ flex: 1, fontFamily: 'Inter', fontWeight: '500', fontSize: '12px' }}>Kometa</span>
                  <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '11px', color: '#60A5FA' }}>412</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 10px', background: '#15111E', borderRadius: '12px' }}>
                  <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '12px', color: '#6B6B8A', width: '16px' }}>2</span>
                  <span style={{ width: '24px', height: '24px', borderRadius: '50%', background: '#1f2a3d', border: '1.5px solid #7C3AED' }}></span>
                  <span style={{ flex: 1, fontFamily: 'Inter', fontWeight: '500', fontSize: '12px' }}>Vlk_42</span>
                  <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '11px', color: '#60A5FA' }}>388</span>
                </div>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  padding: '8px 10px',
                  background: '#241C3C',
                  border: '1px solid #7C3AED',
                  borderRadius: '12px',
                  boxShadow: '0 0 12px rgba(124,58,237,.2)'
                }}>
                  <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '12px', color: '#A78BFA', width: '16px' }}>7</span>
                  <span style={{ width: '24px', height: '24px', borderRadius: '50%', background: '#15111E', border: '1.5px solid #A78BFA' }}></span>
                  <span style={{ flex: 1, fontFamily: 'Inter', fontWeight: '700', fontSize: '12px' }}>Ty</span>
                  <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '11px', color: '#fff' }}>{user?.xp || 240}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

      {/* Modal Overlay Controller */}
      <ModalManager />
    </div>
  );
}
