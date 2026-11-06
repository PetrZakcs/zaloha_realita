import { useUserStore } from '../../store/userStore';

// spec-14: a player who skipped onboarding stays an NPC (grey avatar) and "musí ho aplikace
// navádět na to, ať si udělá verifikaci onboardingem a tím se aktivuje a získá XP a klíče".
export default function NpcBanner() {
  const { user, openModal } = useUserStore();
  if (!user || user.onboardingCompleted !== false) return null;
  return (
    <button
      type="button"
      onClick={() => openModal('activation')}
      style={{
        display: 'block', width: '100%', textAlign: 'left', background: '#1C1630', border: '1px dashed #6B6B8A',
        borderRadius: '16px', padding: '12px 16px', cursor: 'pointer', flexShrink: 0
      }}
    >
      <div style={{ fontFamily: 'Inter', fontWeight: 700, fontSize: '13px', color: '#F0F0F8' }}>Jsi zatím NPC — tvůj avatar je šedý</div>
      <div style={{ fontFamily: 'Inter', fontSize: '12px', color: '#9A9AB5', marginTop: '3px' }}>
        Dokonči aktivaci: napiš svůj slib a získej +50 XP a první klíč →
      </div>
    </button>
  );
}
