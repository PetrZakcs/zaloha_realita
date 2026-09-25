import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Crown } from 'lucide-react';
import { useUserStore } from '../../store/userStore';

// Shared by MobileLeaderboard/DesktopLeaderboard. Both previously rendered a hard-coded
// podium of fictional players (Kometa, Vlk_42, Echo) and a fixed "+14 XP a budeš 6." line;
// everything here comes from the database.
//   'week'   — MVP1 spec-12 §5.3 "Top Doers this week" (5 players, get_weekly_top_doers)
//   'season' — all-time XP (get_leaderboard; Season 0 is the only season so far)
const TABS = [
  { key: 'week', label: 'Top Doers týdne' },
  { key: 'season', label: 'Sezóna' },
];

const PODIUM_STYLE = {
  1: { color: '#F5B73F', bg: '#3a2a1a', avatar: 70, block: 80 },
  2: { color: '#A78BFA', bg: '#241a3d', avatar: 58, block: 56 },
  3: { color: '#22C55E', bg: '#1a2e24', avatar: 58, block: 44 },
};

function initials(name) {
  return (name || '?').slice(0, 2).toUpperCase();
}

function PodiumSlot({ player, rank, unit, onOpen }) {
  const st = PODIUM_STYLE[rank];
  return (
    <button
      type="button"
      onClick={() => onOpen(player)}
      style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '7px', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
    >
      {rank === 1 && (
        <span style={{ display: 'inline-flex', color: st.color, filter: 'drop-shadow(0 0 8px rgba(245,183,63,.7))' }}>
          <Crown size={22} fill={st.color} />
        </span>
      )}
      <span style={{
        width: `${st.avatar}px`, height: `${st.avatar}px`, borderRadius: '50%', background: st.bg,
        border: `${rank === 1 ? 3 : 2.5}px solid ${st.color}`, display: 'flex', alignItems: 'center',
        justifyContent: 'center', fontWeight: 'bold', color: st.color, fontSize: rank === 1 ? '18px' : '15px'
      }}>
        {initials(player.name)}
      </span>
      <span style={{ fontFamily: 'Inter', fontWeight: rank === 1 ? 700 : 600, fontSize: '12px', color: '#F0F0F8', maxWidth: '84px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {player.name}
      </span>
      <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '11px', color: '#60A5FA' }}>
        {player.xp} {unit}
      </span>
      <div style={{
        width: rank === 1 ? '78px' : '70px', height: `${st.block}px`,
        background: `linear-gradient(180deg, ${st.bg}, #241C3C)`, border: `${rank === 1 ? 1 : 0.5}px solid ${rank === 1 ? st.color : '#382C5C'}`,
        borderRadius: '10px 10px 0 0', display: 'flex', alignItems: 'center', justifyContent: 'center'
      }}>
        <span style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, fontSize: rank === 1 ? '28px' : '22px', color: st.color }}>{rank}</span>
      </div>
    </button>
  );
}

export default function LeaderboardBoard({ compact = false }) {
  const navigate = useNavigate();
  const { user, leaderboard, weeklyTopDoers, fetchLeaderboard, fetchWeeklyTopDoers } = useUserStore();
  const [tab, setTab] = useState('week');

  useEffect(() => {
    fetchWeeklyTopDoers();
    fetchLeaderboard();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const players = tab === 'week' ? weeklyTopDoers : leaderboard;
  const unit = tab === 'week' ? 'XP tento týden' : 'XP';
  const loading = players === null || players === undefined;
  const list = players || [];
  const openProfile = (player) => player.id && navigate(`/profile/${player.id}`);

  // Podium order: 2 · 1 · 3
  const podium = [list[1] && { p: list[1], r: 2 }, list[0] && { p: list[0], r: 1 }, list[2] && { p: list[2], r: 3 }].filter(Boolean);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: compact ? '14px' : '18px' }}>
      <div style={{ display: 'flex', gap: '8px' }}>
        {TABS.map(t => {
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              style={{
                fontFamily: 'Inter', fontWeight: active ? 600 : 500, fontSize: '12px',
                color: active ? '#fff' : '#9A9AB5', background: active ? '#7C3AED' : 'transparent',
                border: active ? 'none' : '0.5px solid #382C5C', borderRadius: '20px', padding: '6px 14px', cursor: 'pointer'
              }}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {loading && (
        <div style={{ fontFamily: 'Inter', fontSize: '13px', color: '#6B6B8A', textAlign: 'center', padding: '24px 0' }}>Načítám…</div>
      )}

      {!loading && list.length === 0 && (
        <div style={{ fontFamily: 'Inter', fontSize: '13px', color: '#9A9AB5', textAlign: 'center', padding: '24px 12px', lineHeight: 1.5 }}>
          {tab === 'week'
            ? 'Tento týden ještě nikdo nedokončil výzvu. Buď první Top Doer.'
            : 'Žebříček se teprve plní.'}
        </div>
      )}

      {!loading && list.length > 0 && (
        <>
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'flex-end', gap: compact ? '12px' : '18px', padding: '8px 0 12px' }}>
            {podium.map(({ p, r }) => <PodiumSlot key={p.id} player={p} rank={r} unit="XP" onOpen={openProfile} />)}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {list.slice(3).map((player, index) => {
              const rank = index + 4;
              const isSelf = player.name === user?.name;
              return (
                <button
                  key={player.id}
                  type="button"
                  onClick={() => openProfile(player)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '12px', width: '100%', textAlign: 'left', cursor: 'pointer',
                    background: isSelf ? '#241a3d' : '#241C3C', border: isSelf ? '1px solid #7C3AED' : 'none',
                    borderRadius: '14px', padding: '10px 14px'
                  }}
                >
                  <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '13px', color: isSelf ? '#A78BFA' : '#6B6B8A', width: '22px' }}>{rank}</span>
                  <span style={{
                    width: '30px', height: '30px', borderRadius: '50%', background: '#1f2a3d', border: '1.5px solid #7C3AED',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 'bold', color: '#A78BFA'
                  }}>
                    {initials(player.name)}
                  </span>
                  <span style={{ flex: 1, fontFamily: 'Inter', fontWeight: isSelf ? 700 : 500, fontSize: '13px', color: '#F0F0F8' }}>
                    {player.name} {isSelf && <span style={{ fontWeight: 500, fontSize: '10px', color: '#A78BFA' }}>· ty</span>}
                  </span>
                  <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '12px', color: '#60A5FA' }}>
                    {player.xp} {unit}
                  </span>
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
