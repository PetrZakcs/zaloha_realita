import { useEffect, useState } from 'react';
import { supabase } from '../../api/supabaseClient';

// Game Bible dashboards for the product team: Retention "RETENTION DASHBOARD", Viral/Referral
// "MVP1 … KPI", Feed "FEED HEALTH DASHBOARD". One admin RPC (admin_kpi_snapshot) feeds it all.
// Numbers + tables only — every value is visible as text.

const C = { surface: '#15111E', border: '#1B1430', text: '#F0F0F8', muted: '#6B6B8A', secondary: '#9A9AB5', accent: '#7C3AED' };
const pct = (part, whole) => (whole > 0 ? `${Math.round((part / whole) * 100)} %` : '–');
const num = (v) => (v === null || v === undefined ? '–' : Number(v).toLocaleString('cs-CZ'));

function Tile({ label, value, hint }) {
  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: '14px', padding: '14px 16px', minWidth: '150px', flex: '1 1 150px' }}>
      <div style={{ fontFamily: 'Inter', fontSize: '11px', color: C.muted, textTransform: 'uppercase', letterSpacing: '.06em' }}>{label}</div>
      <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, fontSize: '24px', color: C.text, marginTop: '4px' }}>{value}</div>
      {hint && <div style={{ fontFamily: 'Inter', fontSize: '11px', color: C.secondary, marginTop: '2px' }}>{hint}</div>}
    </div>
  );
}

function Section({ title, note, children }) {
  return (
    <section style={{ marginBottom: '26px' }}>
      <h3 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: '16px', color: C.text, margin: '0 0 4px' }}>{title}</h3>
      {note && <div style={{ fontFamily: 'Inter', fontSize: '12px', color: C.muted, marginBottom: '10px' }}>{note}</div>}
      {children}
    </section>
  );
}

function Table({ columns, rows }) {
  if (!rows || rows.length === 0) return <div style={{ fontFamily: 'Inter', fontSize: '12px', color: C.muted }}>Zatím žádná data.</div>;
  return (
    <div style={{ overflowX: 'auto', background: C.surface, border: `1px solid ${C.border}`, borderRadius: '12px' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'Inter', fontSize: '12.5px' }}>
        <thead>
          <tr style={{ color: C.muted, textAlign: 'left' }}>
            {columns.map(c => <th key={c.label} style={{ padding: '10px 12px', fontWeight: 600, textAlign: c.align || 'left', borderBottom: `1px solid ${C.border}` }}>{c.label}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} style={{ color: C.text, borderBottom: `1px solid ${C.border}` }}>
              {columns.map(c => <td key={c.label} style={{ padding: '9px 12px', textAlign: c.align || 'left', fontVariantNumeric: 'tabular-nums' }}>{c.render(r)}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// A funnel as a table: each step with its count and conversion from the previous step.
function Funnel({ steps }) {
  return (
    <Table
      columns={[
        { label: 'Krok', render: s => s.label },
        { label: 'Počet', align: 'right', render: s => num(s.value) },
        { label: 'Z předchozího', align: 'right', render: s => (s.prev === undefined ? '' : pct(s.value, s.prev)) },
      ]}
      rows={steps.map((s, i) => ({ ...s, prev: i === 0 ? undefined : steps[i - 1].value }))}
    />
  );
}

export default function AdminKpi() {
  const [days, setDays] = useState(30);
  const [data, setData] = useState(null);
  const [business, setBusiness] = useState(null);
  const [extended, setExtended] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setData(null);
    supabase.rpc('admin_kpi_extended', { p_days: days }).then(({ data: snapshot }) => {
      if (!cancelled) setExtended(snapshot || null);
    });
    supabase.rpc('admin_kpi_business', { p_days: days }).then(({ data: snapshot }) => {
      if (!cancelled) setBusiness(snapshot || null);
    });
    supabase.rpc('admin_kpi_snapshot', { p_days: days }).then(({ data: snapshot, error: rpcError }) => {
      if (cancelled) return;
      if (rpcError) setError(rpcError.message); else { setError(''); setData(snapshot); }
    });
    return () => { cancelled = true; };
  }, [days]);

  const t = data?.totals || {};
  const e = data?.engagement || {};
  const q = data?.quest_funnel || {};
  const v = data?.viral_funnel || {};
  const f = data?.feed_health || {};

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
      <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', alignItems: 'center' }}>
        <span style={{ fontFamily: 'Inter', fontSize: '12px', color: C.muted, marginRight: '4px' }}>Období:</span>
        {[7, 30, 90].map(d => (
          <button key={d} type="button" onClick={() => setDays(d)}
            style={{ background: days === d ? C.accent : 'transparent', color: days === d ? '#fff' : C.secondary, border: `1px solid ${days === d ? C.accent : '#382C5C'}`, borderRadius: '8px', padding: '5px 12px', fontFamily: 'Inter', fontSize: '12px', cursor: 'pointer' }}>
            {d} dní
          </button>
        ))}
      </div>

      {error && <div style={{ color: '#EF4444', fontFamily: 'Inter', fontSize: '13px' }}>KPI se nepodařilo načíst: {error}</div>}
      {!data && !error && <div style={{ color: C.muted, fontFamily: 'Inter', fontSize: '13px' }}>Načítám…</div>}

      {data && (
        <>
          <Section title="Přehled">
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              <Tile label="Hráči celkem" value={num(t.players)} />
              <Tile label={`Noví za ${data.period_days} dní`} value={num(t.new_players)} />
              <Tile label="Aktivní (reálná akce)" value={num(t.meaningful_players)} hint={`za ${data.period_days} dní`} />
              <Tile label="Pass" value={num(t.pass_holders)} />
            </div>
          </Section>

          {business && (
            <>
              <Section title="Top KPI" note="To, co zadání chce sledovat denně. Čas k první výzvě je medián od registrace.">
                <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                  <Tile label="Čas do první výzvy" value={business.entry.median_minutes_to_first_quest != null ? `${num(business.entry.median_minutes_to_first_quest)} min` : '–'} hint={`do 24 h: ${pct(business.entry.first_quest_within_24h, business.entry.registered)}`} />
                  <Tile label="Výzva → důkaz" value={business.quest_timing.avg_seconds_start_to_proof != null ? `${num(business.quest_timing.avg_seconds_start_to_proof)} s` : '–'} hint={`${num(business.quest_timing.proofs)} důkazů z ${num(business.quest_timing.quest_starts)} startů`} />
                  <Tile label="Retence D3" value={pct(business.retention.d3_players, business.entry.registered)} hint={`aktivní dny v 1. týdnu: ${business.retention.avg_active_days_first_7 ?? '–'}`} />
                  <Tile label="Feed session" value={business.feed.avg_session_seconds != null ? `${num(business.feed.avg_session_seconds)} s` : '–'} />
                </div>
              </Section>
              <Section title="Vstup" note="Landing → klik → registrace.">
                <Funnel steps={[
                  { label: 'Zobrazení landingu', value: business.entry.landing_views },
                  { label: 'Klik na Vstoupit do hry', value: business.entry.landing_clicks },
                  { label: 'Registrace', value: business.entry.registered },
                ]} />
              </Section>
              <Section title="Founder Pass" note="Paywall → checkout → nákup. Obnovení se počítá jen u kupujících, kteří už měli možnost obnovit.">
                <Funnel steps={[
                  { label: 'Viděli paywall', value: business.pass_funnel.paywall_viewers },
                  { label: 'Spustili checkout', value: business.pass_funnel.checkout_started },
                  { label: 'Koupili', value: business.pass_funnel.buyers },
                ]} />
                <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginTop: '12px' }}>
                  <Tile label="Obnovení 2. měsíc" value={pct(business.renewal.renewed, business.renewal.eligible)} hint={`${num(business.renewal.renewed)} z ${num(business.renewal.eligible)}`} />
                  <Tile label="Zálohy" value={num(business.pass_funnel.deposits)} />
                  <Tile label="Chci další téma" value={num(business.pass_funnel.intent_next_theme)} />
                  <Tile label="Odměny z Passů pozvaných" value={num(business.renewal.referral_purchase_rewards)} />
                </div>
              </Section>
              {extended && (
                <>
                  <Section title="Důkazy" note="Za zvolené období.">
                    <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                      <Tile label="Hráči s 1+ důkazem" value={num(extended.proofs.players_1_plus)} />
                      <Tile label="Hráči s 3+ důkazy" value={num(extended.proofs.players_3_plus)} />
                      <Tile label="Průměr na hráče" value={extended.proofs.avg_per_player ?? '—'} />
                      <Tile label="Foto / video / text" value={`${num(extended.proofs.photo)} / ${num(extended.proofs.video)} / ${num(extended.proofs.text)}`} />
                      <Tile label="Veřejné / soukromé" value={`${num(extended.proofs.public)} / ${num(extended.proofs.private)}`} />
                    </div>
                  </Section>
                  <Section title="Návyk a komunita" note="Distribuce streaků je aktuální stav.">
                    <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                      <Tile label="Streak 1–2 / 3–4 / 5–6 / 7+" value={`${num(extended.streaks['1_2'])} / ${num(extended.streaks['3_4'])} / ${num(extended.streaks['5_6'])} / ${num(extended.streaks['7_plus'])}`} />
                      <Tile label="Session na hráče" value={extended.sessions.avg_per_player ?? '—'} />
                      <Tile label="Otevřeli feed" value={num(extended.sessions.feed_openers)} />
                      <Tile label="Reagující hráči" value={num(extended.sessions.reacting_players)} />
                      <Tile label="Zobrazení profilů" value={`${num(extended.sessions.profile_views)} (${num(extended.sessions.profile_viewers)} hráčů)`} />
                    </div>
                  </Section>
                  <Section title="Integrace" note="Po dokončení sezóny.">
                    <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                      <Tile label="Vstoupili" value={num(extended.integration.started)} />
                      <Tile label="1+ signál" value={num(extended.integration.signals_1_plus)} />
                      <Tile label="3+ signály" value={num(extended.integration.signals_3_plus)} />
                      <Tile label="Fragmenty" value={num(extended.integration.fragments)} />
                      <Tile label="První cyklus" value={num(extended.integration.first_cycle_players)} />
                      <Tile label="Cykly celkem" value={num(extended.integration.cycles)} />
                      <Tile label="V mezivrstvě" value={num(extended.integration.bridge_players)} />
                    </div>
                  </Section>
                  <Section title="Po nákupu">
                    <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                      <Tile label="Medián dní do nákupu" value={extended.purchase.median_days_to_purchase ?? '—'} />
                      <Tile label="Aktivní po nákupu" value={num(extended.purchase.active_after_purchase)} />
                    </div>
                  </Section>
                </>
              )}
              <Section title="Reference" note="Referenční uzel: tvrdá data o hodnotě.">
                <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                  <Tile label="Dokončili" value={num(business.reference.completed)} />
                  <Tile label="Průměrná transformace" value={business.reference.avg_transformation != null ? `${num(business.reference.avg_transformation)} %` : '–'} />
                  <Tile label="Doporučili by" value={pct(business.reference.would_recommend, business.reference.completed)} />
                </div>
              </Section>
            </>
          )}

          <Section title="Aktivace" note="Registrace → onboarding → 1., 2. a 3. quest (podle týdne registrace).">
            <Table
              columns={[
                { label: 'Týden', render: r => r.signup_week },
                { label: 'Registrace', align: 'right', render: r => num(r.registered) },
                { label: 'Onboarding', align: 'right', render: r => `${num(r.onboarded)} · ${pct(r.onboarded, r.registered)}` },
                { label: 'Q1', align: 'right', render: r => `${num(r.q1)} · ${pct(r.q1, r.registered)}` },
                { label: 'Q2', align: 'right', render: r => `${num(r.q2)} · ${pct(r.q2, r.q1)} z Q1` },
                { label: 'Q3', align: 'right', render: r => `${num(r.q3)} · ${pct(r.q3, r.q1)} z Q1` },
              ]}
              rows={data.activation}
            />
          </Section>

          <Section title="Reality retention" note="Hráč udělal skutečnou akci (quest) v daném okně po registraci.">
            <Table
              columns={[
                { label: 'Týden', render: r => r.signup_week },
                { label: 'Hráči', align: 'right', render: r => num(r.players) },
                { label: 'D1', align: 'right', render: r => pct(r.d1, r.players) },
                { label: 'D7 (den 1–7)', align: 'right', render: r => pct(r.d7_window, r.players) },
                { label: 'D30 (den 24–30)', align: 'right', render: r => pct(r.d30_window, r.players) },
              ]}
              rows={data.reality_retention}
            />
          </Section>

          <Section title="Zapojení">
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              <Tile label="Aktivní dny / týden" value={e.meaningful_days_per_player_7d ?? '–'} hint={`${num(e.meaningful_players_7d)} hráčů za 7 dní`} />
              <Tile label="Proof rate" value={pct(e.proof_players_30d, e.app_open_players_30d)} hint={`${num(e.proof_players_30d)} z ${num(e.app_open_players_30d)} (30 dní)`} />
              <Tile label="Share rate" value={pct(e.share_players_30d, e.app_open_players_30d)} hint={`${num(e.share_players_30d)} hráčů (30 dní)`} />
              <Tile label="Comeback rate" value={pct(e.comeback_continues_30d, e.comeback_views_30d)} hint={`${num(e.comeback_continues_30d)} z ${num(e.comeback_views_30d)} návratů`} />
            </div>
          </Section>

          <Section title="Questy">
            <Funnel steps={[
              { label: 'Zobrazení questu', value: q.quest_view },
              { label: 'Start questu', value: q.quest_start },
              { label: 'Dokončený quest', value: q.quest_completed },
            ]} />
            <div style={{ fontFamily: 'Inter', fontSize: '12px', color: C.secondary, marginTop: '8px' }}>
              Dokončené uzly: {num(q.node_completed)} · dokončené sezóny: {num(q.season_completed)}
            </div>
          </Section>

          <Section title="Uzly" note="Kolik hráčů dokončilo quest v každém uzlu (celkově).">
            <Table columns={[
              { label: 'Uzel', render: r => `${r.node_order} · ${r.title}` },
              { label: 'Hráči', align: 'right', render: r => num(r.players_completed) },
            ]} rows={data.node_funnel} />
          </Section>

          <Section title="Viral a pozvánky" note="Sdílení → landing → registrace → aktivace → kvalifikace.">
            <Funnel steps={[
              { label: 'Sdílení zahájeno', value: v.share_started },
              { label: 'Sdílení dokončeno', value: v.share_completed },
              { label: 'Návštěva landingu z odkazu', value: v.landing_views },
              { label: 'Registrace přes pozvánku', value: v.referred_registrations },
              { label: 'Aktivovaní (1. quest)', value: v.referred_activations },
              { label: 'Kvalifikovaní (3 aktivní dny)', value: v.referred_qualified },
            ]} />
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginTop: '12px' }}>
              <Tile label="K (deduplikované)" value={v.k_deduplicated ?? '–'} hint="noví aktivovaní z pozvánek / ostatní aktivovaní" />
              <Tile label="Sdílející hráči" value={num(v.sharers)} />
              <Tile label="Odeslané pozvánky" value={num(v.invites_sent)} />
            </div>
            <div style={{ marginTop: '12px' }}>
              <Table columns={[
                { label: 'Zdroj', render: r => r.source_type },
                { label: 'Registrace', align: 'right', render: r => num(r.registered) },
                { label: 'Aktivovaní', align: 'right', render: r => `${num(r.activated)} · ${pct(r.activated, r.registered)}` },
                { label: 'Kvalifikovaní', align: 'right', render: r => `${num(r.qualified)} · ${pct(r.qualified, r.registered)}` },
                { label: 'Zvoucí hráči', align: 'right', render: r => num(r.referrers) },
              ]} rows={data.referrals_by_source} />
            </div>
          </Section>

          <Section title="Zdraví feedu">
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              <Tile label="Příspěvky" value={num(f.posts)} />
              <Tile label="Zobrazení" value={num(f.impressions)} />
              <Tile label="Reakce" value={num(f.reactions)} />
              <Tile label="Důkazy s reakcí do 24 h" value={pct(f.proofs_reacted_24h, f.public_proofs)} hint={`${num(f.proofs_reacted_24h)} z ${num(f.public_proofs)} veřejných důkazů`} />
              <Tile label="Questy otevřené z feedu" value={num(f.quest_opens_from_feed)} hint="„Zkus taky“" />
              <Tile label="Dočteno do konce" value={num(f.feed_end_reached)} hint="„Jsi v obraze“ → Hrát" />
              <Tile label="Skryto / nahlášeno / blokováno" value={`${num(f.hidden)} / ${num(f.reports)} / ${num(f.blocks)}`} />
            </div>
          </Section>
        </>
      )}
    </div>
  );
}
