import { useState } from 'react';
import { VenetianMask, Award, Sparkles } from 'lucide-react';
import { useUserStore } from '../../store/userStore';
import ShareMomentButton from '../common/ShareMomentButton';

// Game Bible · Identity "IDENTITY MOMENTS" / Viral "FIRST MASK CEREMONY":
// reveal → preview → equip → share. Share comes after the player has had their own moment.
const SOURCE_LABEL = {
  first_mask: 'za první skutečné questy',
  referral: 'za hráče, které jsi přivedl(a)',
  season: 'za dokončení sezóny',
};

export default function IdentityReveal() {
  const { identityReveal: item, clearIdentityReveal, closeModal, setIdentitySlot } = useUserStore();
  const [equipped, setEquipped] = useState(false);
  if (!item) return null;

  const equippable = ['mask', 'aura', 'title'].includes(item.kind);
  const Icon = item.kind === 'mask' ? VenetianMask : item.kind === 'title' ? Award : Sparkles;
  const color = item.visual?.color || '#A78BFA';
  const close = () => { clearIdentityReveal(); closeModal(); };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: '10px' }}>
      <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '11px', letterSpacing: '.12em', color, textTransform: 'uppercase' }}>
        {item.kind === 'mask' ? 'Maska získána' : item.kind === 'title' ? 'Nový titul' : 'Nová identita'}
      </div>
      <div style={{ width: '96px', height: '96px', borderRadius: '50%', border: `2px solid ${color}`, boxShadow: `0 0 28px ${color}66`, display: 'flex', alignItems: 'center', justifyContent: 'center', color, margin: '6px 0' }}>
        <Icon size={44} />
      </div>
      <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, fontSize: '22px', color: '#fff' }}>{item.title}</div>
      {item.description && <div style={{ fontFamily: 'Inter', fontSize: '13px', color: '#9A9AB5', lineHeight: 1.5 }}>{item.description}</div>}
      <div style={{ fontFamily: 'Inter', fontSize: '11px', color: '#6B6B8A' }}>
        Získáno {SOURCE_LABEL[item.source] || ''} · {new Date(item.earned_at || Date.now()).toLocaleDateString('cs-CZ')}
      </div>
      {equippable && (
        <button type="button" disabled={equipped}
          onClick={async () => { const r = await setIdentitySlot(item.kind, item.item_key); if (!r.error) setEquipped(true); }}
          style={{ width: '100%', height: '44px', background: equipped ? 'rgba(34,197,94,.12)' : '#7C3AED', color: equipped ? '#22C55E' : '#fff', border: equipped ? '1px solid #22C55E' : 'none', borderRadius: '14px', fontFamily: 'Inter', fontWeight: 700, fontSize: '14px', cursor: equipped ? 'default' : 'pointer', marginTop: '6px' }}>
          {equipped ? 'Nasazeno' : 'Nasadit'}
        </button>
      )}
      <ShareMomentButton variant="identity" progressText={item.title} sentence={item.description || null} label="Sdílet" />
      <button type="button" onClick={close} style={{ background: 'none', border: 'none', color: '#6B6B8A', fontFamily: 'Inter', fontSize: '13px', cursor: 'pointer', padding: '6px' }}>
        Zavřít
      </button>
    </div>
  );
}
