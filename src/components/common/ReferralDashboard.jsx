import { useEffect, useState } from 'react';
import { UserPlus } from 'lucide-react';
import { useUserStore } from '../../store/userStore';
import { buildReferralLink, shareContent } from '../../lib/share';
import { track } from '../../lib/analytics';
import { supabase } from '../../api/supabaseClient';
import { keysLabel } from '../../lib/plural';

// Game Bible · Referral "MVP1 DASHBOARD": "Přivedl jsi N hráčů · Activated · Qualified ·
// Pending · Next: … [POZVAT]". Pending = registered, no first quest yet; Activated = first
// quest done; Qualified = + 3 meaningful active days. No network tree. spec-18: every Pass payment
// of an invited player earns the inviter in-game rewards (keys + XP), never money.
export default function ReferralDashboard() {
  const { user, referralDashboard, fetchReferralDashboard } = useUserStore();

  const [purchaseRewards, setPurchaseRewards] = useState([]);

  useEffect(() => {
    fetchReferralDashboard();
    if (user?.id) {
      supabase.from('referral_purchase_rewards').select('keys, xp').eq('referrer_id', user.id)
        .then(({ data }) => setPurchaseRewards(data || []));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const invite = async () => {
    track('invite_clicked', { source: 'referral_dashboard' });
    const url = buildReferralLink(user?.referralCode, { shareType: 'invite' });
    const result = await shareContent({ title: 'Hra Reality', text: `${user?.name || 'Hráč'} tě zve do Hry Reality.`, url });
    if (result.shared) track('share_completed', { source: 'referral_dashboard', share_type: 'invite', method: result.method });
  };

  const d = referralDashboard;
  const stat = (label, value, color) => (
    <div style={{ flex: 1, textAlign: 'center' }}>
      <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, fontSize: '20px', color }}>{value ?? '–'}</div>
      <div style={{ fontFamily: 'Inter', fontSize: '10px', color: '#6B6B8A' }}>{label}</div>
    </div>
  );

  return (
    <div style={{ background: '#1C1630', border: '0.5px solid #382C5C', borderRadius: '16px', padding: '14px' }}>
      <div style={{ fontFamily: 'Inter', fontWeight: 600, fontSize: '11px', letterSpacing: '.1em', textTransform: 'uppercase', color: '#6B6B8A', marginBottom: '10px' }}>
        Pozvaní hráči{d ? ` · ${d.invited}` : ''}
      </div>
      <div style={{ display: 'flex', gap: '6px' }}>
        {stat('Kvalifikovaní', d?.qualified, '#22C55E')}
        {stat('Aktivovaní', d?.activated, '#4AA8FF')}
        {stat('Čekající', d?.pending, '#9A9AB5')}
      </div>
      {d && (
        <div style={{ fontFamily: 'Inter', fontSize: '12px', color: '#9A9AB5', marginTop: '10px', lineHeight: 1.5 }}>
          {d.current_title && <>Titul: <strong style={{ color: '#F0F0F8' }}>{d.current_title}</strong><br /></>}
          {d.next_title
            ? <>Další: {Math.max(0, d.next_title_at - d.qualified)} kvalifikovaných hráčů → <strong style={{ color: '#A78BFA' }}>{d.next_title}</strong></>
            : 'Máš nejvyšší titul za pozvání.'}
        </div>
      )}
      <div style={{ fontFamily: 'Inter', fontSize: '11px', color: '#6B6B8A', marginTop: '6px' }}>
        Kvalifikovaný hráč = dokončil první quest a byl aktivní 3 dny. Za každou platbu Passu pozvaného hráče získáš herní odměnu.
      </div>
      {purchaseRewards.length > 0 && (
        <div style={{ fontFamily: 'Inter', fontSize: '12px', color: '#F5B73F', marginTop: '6px' }}>
          Z Passů pozvaných: +{keysLabel(purchaseRewards.reduce((sum, r) => sum + r.keys, 0))} a +{purchaseRewards.reduce((sum, r) => sum + r.xp, 0)} XP
        </div>
      )}
      <button type="button" onClick={invite} disabled={!user?.referralCode}
        style={{ marginTop: '12px', width: '100%', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', background: '#7C3AED', color: '#fff', border: 'none', borderRadius: '12px', fontFamily: 'Inter', fontWeight: 700, fontSize: '13px', cursor: 'pointer' }}>
        <UserPlus size={15} /> Pozvat
      </button>
    </div>
  );
}
