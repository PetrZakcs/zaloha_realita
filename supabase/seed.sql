-- iWAU / Hra Reality — Complete Season 0 Story & Challenge Seed Data (Nodes 1-9)
-- Execute in Supabase SQL Editor to populate story_nodes, challenges, and challenge_steps.

-- 1. Insert Theme
INSERT INTO public.themes (id, slug, name, description, theme_order, is_active)
VALUES (
  't-env-reset', 
  'season-0-probuzeni', 
  'Season 0 · Probuzení Doera', 
  '9 uzlů pro prolomení autopilota reality a vybudování postavy v reálném světě.', 
  1, 
  TRUE
) ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description;

-- 2. Insert Story Nodes (Nodes 1 to 9)
INSERT INTO public.story_nodes (id, theme_id, node_order, type, title, cutscene_text, requires_pass)
VALUES 
(
  'n-node-1', 
  't-env-reset', 
  1, 
  'CHALLENGE', 
  'Uzel 1 · Zastavení Autopilota', 
  'Většina lidí kolem tebe dnes neudělá nic nového. Budou pasivně skrolovat, dokud den neskončí. Ty jsi tady, protože jsi se rozhodl probudit. Zastav se a na 3 minuty pouze pozoruj světa bez obrazovky.', 
  FALSE
),
(
  'n-node-2', 
  't-env-reset', 
  2, 
  'CHALLENGE', 
  'Uzel 2 · Signal Cut (Detox)', 
  'Uzel 2 se aktivuje. Průměrný člověk stráví 6 hodin denně pohledem do skla. Vypni notifikace, odlož displej na 45 minut a vyfoť analogový prostor okolo sebe.', 
  FALSE
),
(
  'n-node-3', 
  't-env-reset', 
  3, 
  'CHALLENGE', 
  'Uzel 3 · Prokaž, že nejsi NPC', 
  'Jsi připraven na fyzický krok v reálném světě. Najdi 3 odhozené kusy odpadu, seber je a vyhoď do koše. Malým činem dokážeš svému mozku, že jsi aktivní tvůrce prostředí.', 
  FALSE
),
(
  'n-node-4', 
  't-env-reset', 
  4, 
  'CHALLENGE', 
  'Uzel 4 · Hlas v Mrtvém Pásmu', 
  'Lidé zapomněli na reálné vazby. Pošli upřímnou zprávu starému příteli, se kterým jsi nemluvil přes 3 měsíce, nebo pozdrav člověka ve tvém okolí s očním kontaktem.', 
  FALSE
),
(
  'n-node-5', 
  't-env-reset', 
  5, 
  'CHALLENGE', 
  'Uzel 5 · Fyzická Hrana', 
  'Tvoje tělo určuje tvůj stav. Dnes dáš svému systému chladný restart. Dej si 2 minuty ledové sprchy nebo splň 50 kliků/dřepů rozložených během dne.', 
  TRUE
),
(
  'n-node-6', 
  't-env-reset', 
  6, 
  'CHALLENGE', 
  'Uzel 6 · Analogový Otisk', 
  'AI tvoří obrázky a kódy, ale ty tvoříš v reálném světě. Napiš ručně na papír 3 životní zásady nebo nakresli rychlou skicu bez použiití počítače.', 
  TRUE
),
(
  'n-node-7', 
  't-env-reset', 
  7, 
  'CHALLENGE', 
  'Uzel 7 · Architekt Dobra', 
  'Vygeneruj dobro v prostředí bez nároku na odměnu. Zaplať kávu neznámému člověku nebo nech na veřejném místě pozitivní ručně psaný vzkaz.', 
  TRUE
),
(
  'n-node-8', 
  't-env-reset', 
  8, 
  'CHALLENGE', 
  'Uzel 8 · Pozorovatel Sítě', 
  'Vyjdi ven na 30 minut bez sluchátek a bez zadaného cílů. Pozoruj rytmus města či přírody a vyfoť jeden unikátní architektonický nebo přírodní detail.', 
  TRUE
),
(
  'n-node-9', 
  't-env-reset', 
  9, 
  'FINAL', 
  'Uzel 9 · Boss Fight: Prolomení Sítě ZAYA', 
  'Finální zkouška Season 0. Udělej celodenní reset: 24 hodin bez sociálních sítí, 10 000 kroků v reálu a splnění 1 dobrého skutku. Tímto dokončíš Season 0 a odemkneš kartu DOER MVP-1.', 
  FALSE
) ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title, cutscene_text = EXCLUDED.cutscene_text, requires_pass = EXCLUDED.requires_pass;

-- 3. Insert Challenges for Nodes
INSERT INTO public.challenges (id, story_node_id, title, description, why_text, proof_type, timebox_seconds, reward_keys, reward_xp)
VALUES 
(
  'c-node-1', 
  'n-node-1', 
  '3 minuty ticha', 
  'Zastav se a po dobu 3 minut pouze pozoruj okolí bez koukání do mobilu.', 
  'Uvědomíš si, kolik detailů ti denně uniká v autopilotu.', 
  'TEXT', 
  180, 
  1, 
  25
),
(
  'c-node-2', 
  'n-node-2', 
  'Signal Cut', 
  'Odlož telefon na 45 minut, vypni notifikace a vyfoť analogové zátiší.', 
  'Získáš zpět svou pozornost a klid v mysli.', 
  'PHOTO', 
  2700, 
  2, 
  40
),
(
  'c-npc-challenge', 
  'n-node-3', 
  'Prokaž, že nejsi NPC', 
  'Jeden mikro-zásah do reality. Do 15 minut. Najdi 3 odhozené kusy odpadu, seber je a vyhoď do koše.', 
  'Tímto malým činem ukážeš světu, že jednáš z vlastní vůle, ne jako naprogramovaný NPC.', 
  'PHOTO', 
  900, 
  2, 
  50
),
(
  'c-node-4', 
  'n-node-4', 
  'Hlas v Mrtvém Pásmu', 
  'Napiš upřímnou zprávu příteli, se kterým jsi nemluvil déle než 3 měsíce.', 
  'Obnovíš reálné lidské spojení v odosobněné době.', 
  'TEXT', 
  3600, 
  3, 
  75
),
(
  'c-node-5', 
  'n-node-5', 
  'Chladný Restart', 
  '2 minuty studené sprchy nebo 50 kliků/dřepů rozložených v dni.', 
  'Prudce zvýšíš hladinu dopaminu a prověříš svou vůli.', 
  'PHOTO', 
  1800, 
  3, 
  100
),
(
  'c-node-6', 
  'n-node-6', 
  'Analogový Otisk', 
  'Napiš ručně na papír 3 své osobní zásady nebo nakresli skicu.', 
  'Zanecháš hmatatelný otisk v reálném světě.', 
  'PHOTO', 
  2400, 
  4, 
  125
),
(
  'c-node-7', 
  'n-node-7', 
  'Anonymní Gesto', 
  'Kup kávu někomu neznámému nebo nech milý vzkaz na veřejném místě.', 
  'Štědrost bez očekávání ti dává obrovskou osobní sílu.', 
  'PHOTO', 
  3600, 
  4, 
  150
),
(
  'c-node-8', 
  'n-node-8', 
  'Offline Procházka', 
  'Jdi na 30 minut ven bez sluchátek. Vyfoť unikátní detail města či přírody.', 
  'Naučíš se vnímat krásu přítomného okamžiku.', 
  'PHOTO', 
  1800, 
  5, 
  200
),
(
  'c-boss-challenge', 
  'n-node-9', 
  'Prolomení Sítě ZAYA (Boss Fight)', 
  'Celodenní výzva: 24h bez sociálních sítí + 10 000 kroků + 1 dobrý skutek.', 
  'Stáváš se oficiálně potvrzeným Doerem Season 0.', 
  'PHOTO', 
  86400, 
  10, 
  500
) ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title, description = EXCLUDED.description, why_text = EXCLUDED.why_text, proof_type = EXCLUDED.proof_type, reward_keys = EXCLUDED.reward_keys, reward_xp = EXCLUDED.reward_xp;

-- 4. Insert Steps for Challenges
INSERT INTO public.challenge_steps (id, challenge_id, step_order, text)
VALUES 
('cs-1-1', 'c-node-1', 1, 'Sedni si nebo se postav na klidné místo.'),
('cs-1-2', 'c-node-1', 2, 'Spusť 3minutový časovač.'),
('cs-1-3', 'c-node-1', 3, 'Pouze pozoruj lidi a věci kolem.'),
('cs-1-4', 'c-node-1', 4, 'Napiš krátkou myšlenku nebo pocit.'),

('cs-3-1', 'c-npc-challenge', 1, 'Vyjdi ven z domu nebo kanceláře.'),
('cs-3-2', 'c-npc-challenge', 2, 'Najdi v okruhu 100 metrů 3 odhozené odpadky.'),
('cs-3-3', 'c-npc-challenge', 3, 'Odnes je k nejbližšímu popelnici či koši.'),
('cs-3-4', 'c-npc-challenge', 4, 'Vyfoť je těsně před vyhozením jako důkaz.'),

('cs-9-1', 'c-boss-challenge', 1, 'Zapni mód nerušit na telefonu na 24 hodin.'),
('cs-9-2', 'c-boss-challenge', 2, 'Ujdi v reálném světě minimálně 10 000 kroků.'),
('cs-9-3', 'c-boss-challenge', 3, 'Udělej 1 nesobecký dobrý skutek v okolí.'),
('cs-9-4', 'c-boss-challenge', 4, 'Vyfoť finální okamžik tvé výzvy.')
ON CONFLICT (id) DO UPDATE SET text = EXCLUDED.text;
