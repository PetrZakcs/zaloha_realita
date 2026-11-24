import { useEffect, useState } from 'react';
import { Trash2, Check, EyeOff } from 'lucide-react';
import { resolveMediaUrl } from '../../lib/privateMedia';

export const MODERATION_LABELS = {
  pending: { text: 'Čeká na AI', color: '#F5B73F' },
  needs_review: { text: 'Ke kontrole', color: '#F5B73F' },
  approved: { text: 'Ve feedu', color: '#22C55E' },
  rejected: { text: 'Stažený', color: '#EF4444' },
  not_required: { text: 'Soukromý', color: '#9A9AB5' },
};

const CATEGORY_LABELS = {
  sexual: 'nahota / sex',
  minor_safety: 'bezpečnost dětí',
  violence: 'násilí',
  self_harm: 'sebepoškozování',
  hate_harassment: 'nenávist / šikana',
  dangerous_illegal: 'nebezpečné / nelegální',
  personal_data: 'osobní údaje',
  spam_scam: 'spam / podvod',
  other: 'jiné',
};

const actionButton = (color) => ({
  display: 'flex',
  alignItems: 'center',
  gap: '4px',
  background: 'transparent',
  border: `1px solid ${color}`,
  borderRadius: '8px',
  color,
  padding: '6px 10px',
  fontFamily: 'Inter',
  fontWeight: '600',
  fontSize: '11.5px',
  cursor: 'pointer',
});

export default function AdminModerationCard({ post, onModerate, onDelete }) {
  // Private proofs need a signed URL; a public one comes back unchanged.
  const [mediaUrl, setMediaUrl] = useState(null);
  const [mediaFailed, setMediaFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setMediaFailed(false);
    resolveMediaUrl(post.image_url).then((url) => {
      if (cancelled) return;
      setMediaUrl(url);
      if (post.image_url && !url) setMediaFailed(true);
    });
    return () => { cancelled = true; };
  }, [post.image_url]);

  const label = post.hidden_by_reports
    ? { text: 'Skrytý po nahlášení', color: '#EF4444' }
    : MODERATION_LABELS[post.moderation_status] || MODERATION_LABELS.approved;
  const isPrivate = post.moderation_status === 'not_required';
  const live = post.moderation_status === 'approved' && !post.hidden_by_reports;

  return (
    <div style={{ background: '#15111E', border: '1px solid #1B1430', borderRadius: '14px', padding: '16px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minHeight: '140px' }}>
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
          <span style={{ fontFamily: 'Inter', fontWeight: '700', fontSize: '14px', color: '#fff' }}>{post.user_name}</span>
          <span style={{ fontSize: '11px', color: '#6B6B8A' }}>{new Date(post.created_at).toLocaleDateString('cs-CZ')}</span>
        </div>

        <div style={{ fontFamily: 'Inter', fontSize: '11.5px', fontWeight: '600', color: label.color, marginBottom: '8px' }}>
          {label.text}{post.moderated_by === 'ai' ? ' · rozhodla AI' : post.moderated_by ? ' · rozhodl admin' : ''}
        </div>

        {(post.moderation_reason || post.moderation_categories?.length > 0) && (
          <div style={{ fontFamily: 'Inter', fontSize: '11.5px', color: '#C4C4DA', background: 'rgba(245,183,63,.08)', borderRadius: '8px', padding: '6px 10px', marginBottom: '10px' }}>
            {post.moderation_categories?.length > 0 && (
              <strong>{post.moderation_categories.map(c => CATEGORY_LABELS[c] || c).join(', ')}. </strong>
            )}
            {post.moderation_reason}
          </div>
        )}

        {post.reports.length > 0 && (
          <div style={{ fontFamily: 'Inter', fontSize: '11.5px', color: '#EF4444', background: 'rgba(239,68,68,.1)', borderRadius: '8px', padding: '6px 10px', marginBottom: '10px' }}>
            ⚠ {post.reports.length}× nahlášeno ({[...new Set(post.reports.map(r => r.reason))].join(', ')})
            {post.hidden_by_reports && ' · skryto do kontroly'}
          </div>
        )}

        {mediaFailed && (
          <div style={{ fontFamily: 'Inter', fontSize: '11.5px', color: '#EF4444', marginBottom: '10px' }}>Soubor se nepodařilo načíst.</div>
        )}
        {mediaUrl && post.media_type === 'video' && (
          <video src={mediaUrl} controls playsInline preload="metadata" style={{ width: '100%', maxHeight: '220px', borderRadius: '10px', marginBottom: '10px', background: '#000' }} />
        )}
        {mediaUrl && post.media_type !== 'video' && (
          <img src={mediaUrl} alt={`Důkaz od ${post.user_name}`} onError={() => setMediaFailed(true)} style={{ width: '100%', maxHeight: '220px', objectFit: 'cover', borderRadius: '10px', marginBottom: '10px' }} />
        )}

        <p style={{ fontFamily: 'Inter', fontSize: '13px', color: '#F0F0F8', lineHeight: '1.5', margin: '0 0 16px 0' }}>{post.content}</p>
      </div>

      <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', alignItems: 'center', borderTop: '0.5px solid #1B1430', paddingTop: '12px' }}>
        {!isPrivate && !live && (
          <button type="button" onClick={() => onModerate(post, 'approve')} style={actionButton('#22C55E')}>
            <Check size={13} /> Schválit
          </button>
        )}
        {!isPrivate && post.moderation_status !== 'rejected' && (
          <button type="button" onClick={() => onModerate(post, 'reject')} style={actionButton('#F5B73F')}>
            <EyeOff size={13} /> Stáhnout
          </button>
        )}
        <button type="button" onClick={() => onDelete(post)} style={actionButton('#EF4444')}>
          <Trash2 size={13} /> Smazat
        </button>
      </div>
    </div>
  );
}
