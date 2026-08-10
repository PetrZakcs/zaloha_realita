import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

// Shared shell for standalone legal screens (S4 Terms / S5 Privacy from HANDOFF.md).
// Content below is a generic CZ/EU placeholder — NOT reviewed by a lawyer and NOT
// confirmed by the client. Must be replaced with real legal text before relying on it.
export default function LegalPage({ title, updatedAt, sections }) {
  const navigate = useNavigate();

  return (
    <div style={{
      minHeight: '100vh',
      background: '#15111E',
      color: '#F0F0F8',
      fontFamily: 'Inter, sans-serif'
    }}>
      <div style={{
        position: 'sticky',
        top: 0,
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        padding: '16px 20px',
        background: '#15111E',
        borderBottom: '0.5px solid #382C5C',
        zIndex: 10
      }}>
        <button
          onClick={() => navigate(-1)}
          aria-label="Zpět"
          style={{
            background: '#1C1630',
            border: '0.5px solid #382C5C',
            borderRadius: '10px',
            width: '36px',
            height: '36px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#F0F0F8',
            cursor: 'pointer'
          }}
        >
          <ArrowLeft size={18} />
        </button>
        <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: '700', fontSize: '20px' }}>
          {title}
        </div>
      </div>

      <div style={{ maxWidth: '680px', margin: '0 auto', padding: '24px 20px 60px' }}>
        <div style={{
          background: '#241C3C',
          border: '0.5px solid #382C5C',
          borderRadius: '16px',
          padding: '14px 16px',
          fontSize: '12px',
          color: '#9A9AB5',
          marginBottom: '24px'
        }}>
          Toto je obecný vzorový text, zatím nepotvrzený klientem ani právníkem. Nespoléhej na něj jako na finální právní dokument. Naposledy upraveno: {updatedAt}.
        </div>

        {sections.map((section, i) => (
          <div key={i} style={{ marginBottom: '22px' }}>
            <div style={{
              fontFamily: "'Space Grotesk', sans-serif",
              fontWeight: '700',
              fontSize: '16px',
              color: '#fff',
              marginBottom: '8px'
            }}>
              {section.heading}
            </div>
            {section.body.map((p, j) => (
              <p key={j} style={{ fontSize: '14px', lineHeight: '1.6', color: '#C8C8DC', margin: '0 0 8px' }}>
                {p}
              </p>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
