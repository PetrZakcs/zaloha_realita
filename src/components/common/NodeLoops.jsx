import { Check } from 'lucide-react';
import { useUserStore } from '../../store/userStore';

// Game Bible · Progression "NODES": a node can hold several loops. Shows where the player is
// inside the node; renders nothing for single-loop nodes.
export default function NodeLoops() {
  const { activeNodeLoops, activeChallenge } = useUserStore();
  if (activeNodeLoops.length < 2) return null;
  return (
    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', margin: '6px 0 2px' }}>
      {activeNodeLoops.map((loop, idx) => {
        const current = loop.id === activeChallenge?.id;
        return (
          <span key={loop.id} title={loop.title}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: '4px', fontFamily: 'Inter', fontSize: '10px', fontWeight: 600,
              padding: '3px 8px', borderRadius: '20px',
              color: loop.done ? '#22C55E' : current ? '#fff' : '#9A9AB5',
              background: current ? '#7C3AED' : 'transparent',
              border: `1px solid ${loop.done ? '#22C55E' : current ? '#7C3AED' : '#382C5C'}`
            }}>
            {loop.done && <Check size={10} />}Loop {idx + 1}{loop.is_mandatory ? '' : ' · volitelný'}
          </span>
        );
      })}
    </div>
  );
}
