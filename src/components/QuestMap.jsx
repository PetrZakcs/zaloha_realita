import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Check, Crown, Lock, Play } from 'lucide-react';
import { useUserStore } from '../store/userStore';

// spec-12 §4.2 "Mapa Questů": the whole path at a glance, including what the Pass unlocks.
export default function QuestMap() {
  const navigate = useNavigate();
  const { user, allStoryNodes, loadAllStoryNodes } = useUserStore();

  useEffect(() => {
    if (allStoryNodes.length === 0) loadAllStoryNodes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const uzel = user?.uzel ?? 0;

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '20px', display: 'flex', flexDirection: 'column', gap: '10px', maxWidth: '640px', width: '100%', margin: '0 auto', boxSizing: 'border-box' }}>
      <button type="button" onClick={() => navigate('/')} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: 'none', border: 'none', color: '#9A9AB5', fontFamily: 'Inter', fontSize: '13px', cursor: 'pointer', padding: 0, alignSelf: 'flex-start' }}>
        <ArrowLeft size={16} /> Zpět
      </button>
      <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, fontSize: '22px', color: '#F0F0F8' }}>Mapa questů</div>
      {allStoryNodes.map(node => {
        const done = node.node_order < uzel;
        const current = node.node_order === uzel;
        const finale = node.type === 'REFERENTIAL' || node.type === 'FINAL';
        const color = done ? '#22C55E' : current ? '#A78BFA' : node.requires_pass ? '#F5B73F' : '#6B6B8A';
        const Icon = done ? Check : current ? Play : finale ? Crown : Lock;
        const note = done ? 'Splněno' : current ? 'Tady jsi' : node.requires_pass && !user?.passHolder ? 'S Passem bez čekání' : 'Čeká na tebe';
        return (
          <button
            key={node.id}
            type="button"
            disabled={!current}
            onClick={() => navigate('/story')}
            style={{ display: 'flex', alignItems: 'center', gap: '12px', width: '100%', textAlign: 'left', background: current ? '#2A1F4A' : '#241C3C', border: `0.5px solid ${current ? '#7C3AED' : '#382C5C'}`, borderRadius: '14px', padding: '12px 14px', cursor: current ? 'pointer' : 'default' }}
          >
            <span style={{ display: 'inline-flex', color }}><Icon size={18} /></span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: 'block', fontFamily: 'Inter', fontWeight: 600, fontSize: '14px', color: '#F0F0F8' }}>{node.title}</span>
              <span style={{ display: 'block', fontFamily: 'Inter', fontSize: '12px', color: '#6B6B8A', marginTop: '2px' }}>{note}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
