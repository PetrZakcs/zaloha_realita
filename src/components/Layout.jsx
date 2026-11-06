import { useEffect, useRef } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useUserStore } from '../store/userStore';
import { track } from '../lib/analytics';
import { useIsMobile } from '../hooks/useIsMobile';
import {
  Home as HomeIcon,
  LayoutGrid,
  Users,
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
import OfflineBanner from './layout/OfflineBanner';
import PlayerAvatar from './common/PlayerAvatar';
import { levelProgress } from '../lib/levels';

// Top Doers reset on Monday (get_weekly_top_doers counts XP since Monday).
function daysToWeeklyReset(now = new Date()) {
  const day = now.getDay() === 0 ? 7 : now.getDay();
  return 8 - day;
}

export default function Layout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, onboarded, openModal, notificationsList, feed, weeklyTopDoers, fetchWeeklyTopDoers } = useUserStore();
  // Community content stays hidden until the first quest (spec-17 §3).
  const railPosts = user?.questsCompleted === 0 ? [] : feed.filter(p => p.type === 'PROOF').slice(0, 3);

  const isMobile = useIsMobile();

  useEffect(() => {
    if (!isMobile && onboarded && weeklyTopDoers === null) fetchWeeklyTopDoers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMobile, onboarded]);

  // spec-17 §3: from the second session the app opens straight into the feed, once the player
  // has finished a first quest. Only on the page load, so "Domů" keeps working afterwards.
  const openedRef = useRef(false);
  const questsCompleted = user?.questsCompleted;
  useEffect(() => {
    if (openedRef.current || !onboarded || questsCompleted == null) return;
    openedRef.current = true;
    if (location.pathname === '/' && questsCompleted > 0) navigate('/feed', { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onboarded, questsCompleted]);

  // Redirect to Splash if not onboarded
  if (!onboarded) {
    return <ModalManager />;
  }

  const nav = [
    { id: 'home', icon: <HomeIcon size={20} />, label: 'Domů', path: '/' },
    { id: 'feed', icon: <LayoutGrid size={20} />, label: 'Feed', path: '/feed' },
    { id: 'artefakty', icon: <Sparkles size={20} />, label: 'Artefakty', path: '/inventory' },
    { id: 'community', icon: <Users size={20} />, label: 'Komunita', path: '/leaderboard' },
    { id: 'profile', icon: <UserIcon size={20} />, label: 'Profil', path: '/profile' },
  ];

  const xpLevel = levelProgress(user?.xp ?? 0);
  const unreadNotifications = notificationsList.filter(n => !n.read_at).length;

  const isNavItemActive = (item) => item.path ? location.pathname === item.path : false;

  // Helper to resolve desktop header title based on route
  const getDesktopTitle = () => {
    switch (location.pathname) {
      case '/':
        return (
          <div>
            <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: '700', fontSize: '22px' }}>
              Ahoj, <span style={{ color: '#A78BFA' }}>{user?.name || 'Hráč'}</span> 👋
            </div>
            <div style={{ fontFamily: 'Inter', fontSize: '13px', color: '#6B6B8A', marginTop: '2px' }}>
              Máš rozdělaný Uzel {user?.uzel ?? 1}. Pojď do toho.
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
              Komunita
            </div>
            <div style={{ fontFamily: 'Inter', fontSize: '13px', color: '#6B6B8A', marginTop: '2px' }}>
              Týdenní žebříček se resetuje za {daysToWeeklyReset()} {daysToWeeklyReset() === 1 ? 'den' : daysToWeeklyReset() < 5 ? 'dny' : 'dní'}.
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

          {/* App Top Bar — spec-17 §4: avatar, XP / progress, keys, notifications, Pass CTA */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            padding: 'calc(8px + env(safe-area-inset-top, 0px)) 16px 12px',
            flexShrink: 0
          }}>
            <PlayerAvatar
              name={user?.name}
              avatarUrl={user?.avatarUrl}
              level={user?.badges_count ?? 1}
              frameKey={user?.activeFrame || (user?.passHolder ? 'frame-founder' : null)}
              npc={user?.onboardingCompleted === false}
              size={32}
              onClick={() => navigate('/profile')}
            />
            <button
              type="button"
              onClick={() => navigate('/profile')}
              aria-label={`Level ${xpLevel.level}, ${user?.xp ?? 0} XP`}
              style={{ flex: 1, minWidth: 0, background: 'none', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left' }}
            >
              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '10px', color: '#9A9AB5', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                Lv {xpLevel.level} · {user?.xp ?? 0} XP
              </div>
              <div style={{ height: '4px', borderRadius: '2px', background: '#2A2142', marginTop: '4px', overflow: 'hidden' }}>
                <div style={{ width: `${xpLevel.percent}%`, height: '100%', background: 'linear-gradient(90deg,#3B82F6,#A78BFA)' }} />
              </div>
            </button>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', fontFamily: 'Inter', fontWeight: 700, fontSize: '12px', color: '#F5B73F', flexShrink: 0 }}>
              <KeyRound size={13} /> {user?.keys_count ?? 0}
            </span>
            <button
              type="button"
              onClick={() => openModal('notifications')}
              aria-label={unreadNotifications > 0 ? `Oznámení, nepřečtených ${unreadNotifications}` : 'Oznámení'}
              style={{ position: 'relative', display: 'inline-flex', background: 'none', border: 'none', padding: '2px', color: '#9A9AB5', cursor: 'pointer', flexShrink: 0 }}
            >
              <Bell size={18} />
              {unreadNotifications > 0 && <span style={{ position: 'absolute', top: 0, right: 0, width: '8px', height: '8px', borderRadius: '50%', background: '#EF4444' }} />}
            </button>
            {user?.passHolder ? (
              <button type="button" style={{ background: 'none', fontFamily: 'Inter', fontWeight: 600, fontSize: '10px', color: '#F5B73F', border: '1px solid #F5B73F', boxShadow: '0 0 8px rgba(245,183,63,.3)', borderRadius: '7px', padding: '4px 7px', cursor: 'pointer', flexShrink: 0, whiteSpace: 'nowrap' }}
                onClick={() => { track('paywall_opened', { source: 'header_badge_active' }); openModal('paywall'); }}>
                👑 Founder
              </button>
            ) : (
              <button type="button" style={{ background: 'none', fontFamily: 'Inter', fontWeight: 600, fontSize: '10px', color: '#F5B73F', border: '1px solid rgba(245,183,63,.55)', borderRadius: '7px', padding: '4px 7px', cursor: 'pointer', flexShrink: 0, whiteSpace: 'nowrap' }}
                onClick={() => { track('paywall_opened', { source: 'header_badge_upsell' }); openModal('paywall'); }}>
                🔓 Pass
              </button>
            )}
          </div>
          <OfflineBanner />

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

        <OfflineBanner />
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

            {/* Founder Pass Upsell Banner */}
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
                <span style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: '700', fontSize: '13px', color: '#F5B73F' }}>FOUNDER PASS</span>
              </div>
              <div style={{ fontFamily: 'Inter', fontSize: '11px', color: '#9A9AB5', marginTop: '6px', lineHeight: '1.5' }}>
                {user?.passHolder ? 'Celá sezóna bez čekání je aktivní.' : 'Celá sezóna bez čekání a Founder identita.'}
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
                {(user?.name || 'H').slice(0, 2).toUpperCase()}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: 'Inter', fontWeight: '600', fontSize: '12px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {user?.name || 'TemnýPozorovatel'}
                </div>
                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '10px', color: '#6B6B8A' }}>
                  {user?.rarity || 'Rare'} · {user?.xp ?? 0} XP
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
              {user?.passHolder && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#1C1630', border: '0.5px solid #382C5C', borderRadius: '12px', padding: '8px 12px' }}>
                <span className="flame-ico" style={{ display: 'inline-flex', width: '16px', height: '16px', color: '#F5B73F' }}><Flame size={16} /></span>
                <span style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: '700', fontSize: '14px', color: '#F5B73F' }}>{user?.streak ?? 0}</span>
              </div>
              )}
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#1C1630', border: '0.5px solid #382C5C', borderRadius: '12px', padding: '8px 12px' }}>
                <span style={{ display: 'inline-flex', width: '16px', height: '16px', color: '#F5B73F' }}><KeyRound size={16} /></span>
                <span style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: '700', fontSize: '14px', color: '#F5B73F' }}>{user?.keys_count ?? 0}</span>
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
                #{user?.xp ?? 0} XP
              </span>
              <span 
                onClick={() => openModal('notifications')}
                style={{ display: 'inline-flex', width: '20px', height: '20px', color: '#6B6B8A', cursor: 'pointer', position: 'relative' }}
              >
                <Bell size={18} />
                {notificationsList.some(n => !n.read_at) && (
                  <span style={{ position: 'absolute', top: 0, right: 0, width: '6px', height: '6px', background: '#7C3AED', borderRadius: '50%' }}></span>
                )}
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
            {/* Real data only: latest public posts + this week's Top Doers (no demo players). */}
            <div style={{ padding: '22px 18px 8px' }}>
              <div style={{ fontFamily: 'Inter', fontWeight: '600', fontSize: '11px', letterSpacing: '.12em', textTransform: 'uppercase', color: '#6B6B8A', marginBottom: '14px' }}>
                Komunita · právě teď
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {railPosts.length === 0 && (
                  <div style={{ fontFamily: 'Inter', fontSize: '12px', color: '#6B6B8A' }}>Zatím žádné důkazy.</div>
                )}
                {railPosts.map(post => (
                  <div key={post.id} onClick={() => navigate('/feed')} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', background: '#15111E', border: '0.5px solid #2A2142', borderRadius: '16px', padding: '12px', cursor: 'pointer' }}>
                    <PlayerAvatar name={post.user_name} avatarUrl={post.author_avatar_url} level={post.author_avatar_level ?? 1}
                      frameKey={post.author_frame || (post.author_pass_holder ? 'frame-founder' : null)} npc={post.author_onboarded === false}
auraColor={post.author_aura_color} maskTitle={post.author_mask} size={32} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                        <span style={{ fontFamily: 'Inter', fontWeight: '600', fontSize: '12px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{post.user_name}</span>
                        {post.author_level != null && (
                          <span style={{ fontFamily: 'Inter', fontSize: '9px', color: '#A78BFA', border: '0.5px solid #A78BFA', borderRadius: '20px', padding: '1px 6px' }}>Lv {post.author_level}</span>
                        )}
                      </div>
                      <div style={{ fontFamily: 'Inter', fontSize: '11px', color: '#9A9AB5', marginTop: '3px', lineHeight: '1.45', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                        {post.content}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '6px' }}>
                        <span style={{ display: 'inline-flex', width: '12px', height: '12px', color: '#F5B73F' }}><Flame size={12} /></span>
                        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '10px', color: '#6B6B8A' }}>
                          {(post.reactions_fire || 0) + (post.reactions_plant || 0) + (post.reactions_eye || 0)}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ padding: '14px 18px 20px', borderTop: '1px solid #1B1430', marginTop: '6px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
                <span style={{ fontFamily: 'Inter', fontWeight: '600', fontSize: '11px', letterSpacing: '.12em', textTransform: 'uppercase', color: '#6B6B8A' }}>
                  Top Doers · týden
                </span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
                {weeklyTopDoers === null && <div style={{ fontFamily: 'Inter', fontSize: '12px', color: '#6B6B8A' }}>Načítám…</div>}
                {weeklyTopDoers?.length === 0 && <div style={{ fontFamily: 'Inter', fontSize: '12px', color: '#6B6B8A' }}>Tento týden zatím nikdo.</div>}
                {(weeklyTopDoers || []).map((p, idx) => {
                  const isMe = p.id === user?.id;
                  return (
                    <div key={p.id} style={{
                      display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 10px', borderRadius: '12px',
                      background: isMe ? '#241C3C' : '#15111E', border: isMe ? '1px solid #7C3AED' : 'none'
                    }}>
                      <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '12px', color: idx === 0 ? '#F5B73F' : '#6B6B8A', width: '16px' }}>{idx + 1}</span>
                      <span style={{ flex: 1, fontFamily: 'Inter', fontWeight: isMe ? '700' : '500', fontSize: '12px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{isMe ? 'Ty' : p.name}</span>
                      <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '11px', color: '#60A5FA' }}>{p.xp}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

      {/* Modal Overlay Controller */}
      <ModalManager />
    </div>
  );
}
