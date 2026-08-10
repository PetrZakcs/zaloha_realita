import LegalPage from './LegalPage';

export default function Terms() {
  return (
    <LegalPage
      title="Obchodní podmínky"
      updatedAt="8. 8. 2026 (placeholder)"
      sections={[
        {
          heading: '1. Kdo jsme',
          body: [
            'Aplikaci Hra Reality (iWau) provozuje [DOPLNIT: obchodní jméno, IČO, sídlo provozovatele]. Kontakt: [DOPLNIT: e-mail].'
          ]
        },
        {
          heading: '2. Co aplikace nabízí',
          body: [
            'Hra Reality je herní aplikace s reálnými výzvami, příběhem a odměnami (XP, klíče, odznaky). Základní obsah je zdarma. Placený doplněk "Hra Pass" odemyká bonusový obsah popsaný v aplikaci v okamžiku nákupu.'
          ]
        },
        {
          heading: '3. Hra Pass a platby',
          body: [
            'Hra Pass je měsíční předplatné za 149 Kč / měsíc s automatickou obnovou, dokud ho nezrušíš. [DOPLNIT: roční varianta a její cena — bude doplněno.]',
            'Předplatné lze kdykoliv zrušit [DOPLNIT: postup zrušení / odkaz na správu předplatného]. Zrušení zamezí další obnově, již zaplacené období zůstává aktivní do konce.',
            'Platby zpracovává Stripe. Aplikace samotná čísla platebních karet neukládá.'
          ]
        },
        {
          heading: '4. Odstoupení od smlouvy (EU spotřebitelé)',
          body: [
            '[DOPLNIT: text o právu na odstoupení do 14 dnů dle občanského zákoníku / směrnice EU o právech spotřebitelů, včetně výjimek pro digitální obsah spotřebovaný se souhlasem zákazníka.]'
          ]
        },
        {
          heading: '5. Herní odměny (XP, klíče, odznaky)',
          body: [
            'XP, klíče a odznaky jsou virtuální herní prvky bez peněžní hodnoty, nejsou převoditelné ani směnitelné za reálné peníze mimo mechanismy výslovně popsané v aplikaci.'
          ]
        },
        {
          heading: '6. Chování v aplikaci',
          body: [
            'Zakázáno je zneužívání herních mechanik (např. podvodné/opakované odesílání důkazů), obtěžování ostatních uživatelů ve Feedu a nahrávání nevhodného obsahu. Provozovatel si vyhrazuje právo účet omezit nebo zrušit.'
          ]
        },
        {
          heading: '7. Odpovědnost',
          body: [
            '[DOPLNIT: standardní omezení odpovědnosti, zejména za real-world výzvy — uživatel je provádí na vlastní riziko.]'
          ]
        },
        {
          heading: '8. Změny podmínek',
          body: [
            'Tyto podmínky můžeme čas od času upravit. O podstatných změnách budeme informovat v aplikaci.'
          ]
        }
      ]}
    />
  );
}
