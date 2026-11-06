import { useEffect, useState } from 'react';
import { Gift } from 'lucide-react';
import { useUserStore } from '../../store/userStore';
import ShareMomentButton from '../common/ShareMomentButton';

const RARITY = {
  common: { label: 'Common', color: '#9A9AB5' },
  rare: { label: 'Rare', color: '#4AA8FF' },
  epic: { label: 'Epic', color: '#A78BFA' },
  legendary: { label: 'Legendary', color: '#F5B73F' },
};

// MVP1 spec-12 §2.1 — one box per 3 earned keys. The draw happens server-side
// (open_mystery_box RPC); this only shows the result.
export default function MysteryBoxModal() {
  const { mysteryBoxes, fetchMysteryBoxes, openMysteryBox, closeModal } = useUserStore();
  const [state, setState] = useState('idle'); // idle | opening | revealed | empty | failed
  const [card, setCard] = useState(null);

  useEffect(() => {
    fetchMysteryBoxes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const open = async () => {
    const box = mysteryBoxes[0];
    if (!box) return;
    setState('opening');
    const result = await openMysteryBox(box.id);
    if (result.card) {
      setCard(result.card);
      setState('revealed');
    } else {
      setState(result.error === 'empty' ? 'empty' : 'failed');
    }
  };

  const rarity = RARITY[card?.rarity] || RARITY.common;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
      <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '11px', letterSpacing: '.12em', color: '#F5B73F', textTransform: 'uppercase' }}>
        Mystery Box
      </div>

      {state === 'revealed' && card ? (
        <>
          <div style={{
            width: '120px', height: '160px', margin: '22px 0 14px', borderRadius: '16px',
            background: 'linear-gradient(150deg,#241a3d,#1C1630)', border: `2px solid ${rarity.color}`,
            boxShadow: `0 0 28px ${rarity.color}66`, display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, fontSize: '16px', color: '#fff', padding: '10px'
          }}>
            {card.title}
          </div>
          <div style={{ fontFamily: 'Inter', fontWeight: 600, fontSize: '10px', letterSpacing: '.1em', textTransform: 'uppercase', color: rarity.color, border: `1px solid ${rarity.color}`, borderRadius: '20px', padding: '3px 11px' }}>
            {rarity.label}
          </div>
          {card.description && (
            <div style={{ fontFamily: 'Inter', fontSize: '13px', color: '#9A9AB5', marginTop: '12px', lineHeight: 1.5 }}>{card.description}</div>
          )}
          {/* Game Bible · Viral "COLLECTION DROP CARD" */}
          <div style={{ width: '100%', marginTop: '14px' }}>
            <ShareMomentButton variant="collection" progressText={`${card.title} · ${rarity.label}`} label="Sdílet kartu" />
          </div>
        </>
      ) : (
        <div style={{ margin: '22px 0 14px', color: '#F5B73F', filter: 'drop-shadow(0 0 16px rgba(245,183,63,.5))' }}>
          <Gift size={72} />
        </div>
      )}

      <div style={{ fontFamily: 'Inter', fontSize: '13px', color: '#9A9AB5', marginTop: '8px', lineHeight: 1.5 }}>
        {state === 'idle' && (mysteryBoxes.length > 0
          ? `Za každý 3. získaný klíč dostaneš box. Čeká na tebe: ${mysteryBoxes.length}.`
          : 'Zatím nemáš žádný box. Další získáš za každé 3 klíče.')}
        {state === 'opening' && 'Otevírám…'}
        {state === 'empty' && 'Obsah boxů se právě připravuje. Tvůj box ti zůstává, otevřeš ho později.'}
        {state === 'failed' && 'Box se nepodařilo otevřít. Zkus to prosím znovu.'}
      </div>

      {(state === 'idle' || state === 'failed') && mysteryBoxes.length > 0 ? (
        <button
          onClick={open}
          style={{ width: '100%', height: '46px', background: '#F5B73F', color: '#15111E', fontFamily: 'Inter', fontWeight: 700, fontSize: '15px', border: 'none', borderRadius: '16px', cursor: 'pointer', marginTop: '20px' }}
        >
          Otevřít box
        </button>
      ) : state === 'revealed' && mysteryBoxes.length > 0 ? (
        <button
          onClick={() => { setCard(null); setState('idle'); }}
          style={{ width: '100%', height: '46px', background: '#F5B73F', color: '#15111E', fontFamily: 'Inter', fontWeight: 700, fontSize: '15px', border: 'none', borderRadius: '16px', cursor: 'pointer', marginTop: '20px' }}
        >
          Otevřít další ({mysteryBoxes.length})
        </button>
      ) : (
        <button
          onClick={closeModal}
          style={{ width: '100%', height: '46px', background: '#7C3AED', color: '#fff', fontFamily: 'Inter', fontWeight: 700, fontSize: '15px', border: 'none', borderRadius: '16px', cursor: 'pointer', marginTop: '20px' }}
        >
          Pokračovat
        </button>
      )}
    </div>
  );
}
