# Hra Reality: uživatelský manuál

Manuál popisuje aplikaci MVP1. Části označené „pracovní obsah“ fungují, ale texty a výzvy nahradí finální obsah od objednatele. Vzhled se může změnit podle finálního designu.

## Pro hráče

### Instalace a přihlášení

1. Otevři aplikaci v prohlížeči. Na iPhonu v Safari zvol Sdílet → Přidat na plochu. Na Androidu v Chrome zvol Nainstalovat aplikaci.
2. Přihlas se účtem Google nebo Discord.
3. Projdi krátký úvod: co hra je, instinktivní volba, přezdívka, slib a první výzva. Většinu kroků můžeš přeskočit.

### Jak se hraje

1. **Domů a Feed** ukazují další krok. Kartu s aktuálním uzlem otevřeš klepnutím.
2. **Uzel** má příběh a výzvu. Výzvu splň ve skutečném životě a dolož ji textem, fotkou nebo videem.
3. **Veřejný nebo soukromý důkaz:** klíč dostaneš jen za veřejný. Soukromý vidíš pouze ty.
4. **Kontrola:** veřejný důkaz se ve feedu ukáže až po kontrole obsahu. Když kontrolou neprojde, dostaneš oznámení s důvodem.
5. **Odměny:** XP zvyšují úroveň a mění avatar. Klíče otevírají mystery boxy a další části hry.

### Rychlé menu

Pod hlavní kartou najdeš Mystery boxy, Žebříček, Mapu questů, Pass a Sdílení. Po dokončení sezóny přibude Integrace.

### Founder Pass

Pass odemyká pokračování bez čekání, streak a fragmenty, Founder identitu, 20 % XP navíc a klíč navíc za veřejný důkaz na milnících. Předplatné spravuješ v Nastavení.

### Po dokončení sezóny

Závěrečná reflexe tě převede do **integrační fáze**. Signály se otevírají postupně, odpovídáš na ně krátkým textem a dostáváš XP. S Passem sbíráš fragmenty a za celý cyklus dostaneš klíč. Později se otevře **mezivrstva**, most k další sezóně (pracovní obsah).

### Soukromí a účet

V Profilu otevři ozubené kolo:

- **Na veřejném profilu ukázat:** vypneš postup, poslední důkazy nebo showcase a sbírku. Jméno, avatar a titul zůstávají vidět. Veřejné důkazy zůstávají ve feedu, skryješ je volbou u důkazu nebo jeho smazáním.
- **Oznámení:** zapnutí a vypnutí push.
- **Smazání účtu:** odstraní účet a jeho data.

## Pro administrátora

Správa je na adrese `/admin`, případně Nastavení → Správa obsahu. Vidí ji jen účet označený jako admin.

| Záložka | K čemu slouží |
|---|---|
| Příběh & Výzvy | Úprava uzlů, textů a výzev. Změny potvrď Uložit obsah. |
| Hráči | Vyhledání hráče a jeho stavu. |
| Moderace | Fronta důkazů, zamítnuté, živé a soukromé důkazy. Schválení, stažení, smazání. |
| KPI | Aktivace, retence, důkazy, streaky, nákupy, reference, integrace za zvolené období. |
| Katalogy | Sezóny, ceny, boxy a karty, Integrace a další číselníky. |
| Kontrola | Přehled, co v obsahu ještě chybí před spuštěním. |

### Moderace

1. AI kontrola schválí nebo zamítne veřejnou fotku a text. Nejisté případy a videa čekají na člověka ve **Frontě**.
2. Admin může rozhodnutí AI kdykoli změnit. **Zamítnutí** důkaz stáhne z feedu a hráči přijde oznámení.
3. Nahlášený důkaz se po dosažení limitu sám skryje a čeká na rozhodnutí.

### Wow karty a zprávy světa

V Moderaci napiš text a zvol **Wow karta** (zvýrazněná karta) nebo běžnou zprávu světa. Objeví se všem ve feedu.

### Integrace a nastavení hry

- **Katalogy → Integrace:** název, text, otázka a den otevření každého signálu.
- **Herní konfigurace:** bonus Passu (`pass_xp_bonus_pct`, `pass_key_bonus_nodes`), XP za signál (`integration_xp`), velikost cyklu (`fragments_per_cycle`) a odměna za cyklus (`cycle_reward_keys`).

## Řešení potíží

| Potíž | Co udělat |
|---|---|
| Důkaz není ve feedu | Čeká na kontrolu. Podívej se na stav v profilu. Admin ho najde ve Frontě. |
| Nechodí oznámení | Zkontroluj povolení v Nastavení a v systému telefonu. Na iPhonu musí být aplikace přidaná na plochu. |
| Platba proběhla, Pass se neukazuje | Obnov aplikaci. Pokud problém trvá, admin zkontroluje hráče a Stripe. |
| Aplikace ukazuje starou verzi | Zavři ji a znovu otevři, nová verze se načte sama. |
