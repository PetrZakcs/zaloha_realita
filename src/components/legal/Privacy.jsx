import LegalPage from './LegalPage';

export default function Privacy() {
  return (
    <LegalPage
      title="Zásady ochrany osobních údajů"
      updatedAt="8. 8. 2026 (placeholder)"
      sections={[
        {
          heading: '1. Správce údajů',
          body: [
            '[DOPLNIT: obchodní jméno, IČO, sídlo, kontaktní e-mail provozovatele Hra Reality / iWau.]'
          ]
        },
        {
          heading: '2. Jaké údaje zpracováváme',
          body: [
            'Účet: e-mail (u přihlášení přes Google/Discord), zobrazované jméno, Discord ID (pokud propojíš účet).',
            'Herní data: XP, počet klíčů, dosažený uzel příběhu, odznaky, tvůj "slib", stav Founder Passu.',
            'Obsah, který nahraješ: fotky jako důkaz splnění výzvy a text příspěvku do Feedu — pokud je příspěvek veřejný, je viditelný ostatním uživatelům; nahrané fotky jsou technicky dostupné komukoliv, kdo zná jejich přímý odkaz.',
            'Technická/analytická data: anonymní identifikátor zařízení, čas a typ akcí v aplikaci (např. dokončení výzvy, spuštění přihlášení) — pro pochopení používání aplikace, ne pro cílenou reklamu.',
            'Platební údaje: čísla karet nezpracováváme ani neukládáme my — platby řeší Stripe jako samostatný správce.'
          ]
        },
        {
          heading: '3. Proč údaje zpracováváme (právní základ)',
          body: [
            'Plnění smlouvy — vedení herního účtu a poskytnutí obsahu, který sis objednal/-a (např. Founder Pass).',
            'Oprávněný zájem — základní analytika používání aplikace, prevence zneužití herních mechanik.',
            'Souhlas — kde je vyžadován (např. při propojení Discord účtu, marketingová komunikace, pokud existuje).'
          ]
        },
        {
          heading: '4. S kým údaje sdílíme',
          body: [
            'Supabase (databáze a autentizace, EU/US infrastruktura) — technický zpracovatel.',
            'Stripe (platby) — pokud si aktivuješ Founder Pass.',
            'Anthropic (AI kontrola obsahu, USA) — fotky a texty veřejných důkazů automaticky kontrolujeme, než se zobrazí ve feedu. Soukromé důkazy ani videa AI neposíláme. Rozhodnutí AI může přezkoumat a změnit admin.',
            '[DOPLNIT: Airtable/Discord integrace — pokud propojíš Discord účet, informace o odemčených odměnách se synchronizují do externího Airtable přes vlastní backend integraci.]',
            'Údaje neprodáváme třetím stranám pro marketingové účely.'
          ]
        },
        {
          heading: '5. Jak dlouho údaje uchováváme',
          body: [
            '[DOPLNIT: konkrétní retenční doby — např. po dobu existence účtu + X měsíců po smazání, analytické záznamy X měsíců.]'
          ]
        },
        {
          heading: '6. Tvá práva',
          body: [
            'Máš právo na přístup ke svým údajům, jejich opravu, výmaz, omezení zpracování, přenositelnost a právo vznést námitku. Žádost můžeš poslat na [DOPLNIT: kontaktní e-mail]. Účet včetně postupu, důkazů a fotek si smažeš sám/sama v aplikaci v Nastavení → Smazat účet.'
          ]
        },
        {
          heading: '7. Cookies a lokální úložiště',
          body: [
            'Aplikace ukládá do localStorage tvého zařízení herní stav (XP, postup, přihlášení) a anonymní ID pro analytiku, aby fungovala i offline. Nepoužíváme reklamní cookies třetích stran.'
          ]
        },
        {
          heading: '8. Děti',
          body: [
            '[DOPLNIT: věkové omezení aplikace, pokud existuje.]'
          ]
        },
        {
          heading: '9. Změny těchto zásad',
          body: [
            'Tyto zásady můžeme čas od času upravit. O podstatných změnách budeme informovat v aplikaci.'
          ]
        }
      ]}
    />
  );
}
