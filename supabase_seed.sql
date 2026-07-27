-- iWAU / Hra Reality — Illustrative Seed Data for Theme: Environmentální reset (Nodes 0-8)
-- Run this in the Supabase SQL Editor to populate the story and challenge contents.

-- 1. Insert Theme
INSERT INTO public.themes (id, slug, name, description, theme_order, is_active)
VALUES (
  't-env-reset', 
  'environmentalni-reset', 
  'Environmentální reset', 
  'Jeden mikro-zásah do reality. Ozdrav své okolí i mysl.', 
  1, 
  TRUE
) ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description;

-- 2. Insert Story Nodes (Nodes 0 to 8)
INSERT INTO public.story_nodes (id, theme_id, node_order, type, title, cutscene_text, requires_pass)
VALUES 
(
  'n-intro', 
  't-env-reset', 
  0, 
  'INTRO', 
  'Volání Zaya', 
  'Vítej. Okolo tebe je šum. Lidé na ulicích chodí jako spící NPC, uzavření ve svých mobilech a myšlenkách. Tvým prvním úkolem je zastavit se a začít vnímat realitu. Jsi připraven na skutečné probuzení?', 
  FALSE
),
(
  'n-node-1', 
  't-env-reset', 
  1, 
  'CHALLENGE', 
  'První zastavení', 
  'Výborně. Uzel 1 se aktivuje. Tvá první výzva: Zastav se a po dobu 3 minut nic nedělej. Pouze pozoruj svět okolo sebe bez koukání do mobilu. Napiš mi sem, co tě během této chvíle napadlo.', 
  FALSE
),
(
  'n-node-2', 
  't-env-reset', 
  2, 
  'CHALLENGE', 
  'Digitální detox', 
  'Uzel 2. Lidé tráví průměrně 6 hodin denně na displejích. Dokážeš dnes odložit telefon na 2 hodiny? Jako důkaz popiš, čemu jsi se během té doby věnoval.', 
  FALSE
),
(
  'n-node-3', 
  't-env-reset', 
  3, 
  'CHALLENGE', 
  'Prokaž, že nejsi NPC', 
  'Uzel 3 se aktivuje. Tvoje výzva: "Prokaž, že nejsi NPC". Najdi venku 3 odhozené kusy odpadu, seber je a vyhoď do koše. Tímto malým činem změníš realitu a ukážeš, že jednáš.', 
  FALSE
),
(
  'n-node-4', 
  't-env-reset', 
  4, 
  'CHALLENGE', 
  'Hluboký nádech', 
  'Uzel 4 (HRA PASS). Vyjdi do přírody. Najdi strom, dotkni se ho a zhluboka se nadechni. Vyfoť strom jako důkaz tvého spojení s realitou.', 
  TRUE
),
(
  'n-node-5', 
  't-env-reset', 
  5, 
  'CHALLENGE', 
  'Knihovna moudrosti', 
  'Uzel 5 (HRA PASS). Navštiv nejbližší knihovnu nebo knihkupectví. Najdi knihu, která tě zaujme, otevři ji na náhodné stránce a přečti si jednu větu. Přeneseš ji sem?', 
  TRUE
),
(
  'n-node-6', 
  't-env-reset', 
  6, 
  'CHALLENGE', 
  'Zpráva příteli', 
  'Uzel 6 (HRA PASS). Napiš kamarádovi nebo známému, se kterým jsi dlouho nemluvil. Pošli mu upřímnou zprávu, jak se má. Vyfoť nebo popiš jeho reakci.', 
  TRUE
),
(
  'n-node-7', 
  't-env-reset', 
  7, 
  'CHALLENGE', 
  'Ranní východ', 
  'Uzel 7 (HRA PASS). Vzbuď se zítra s východem slunce. Udělej pár kroků na čerstvém vzduchu a popiš ten pocit nového dne.', 
  TRUE
),
(
  'n-final', 
  't-env-reset', 
  8, 
  'REFERENTIAL', 
  'Ohlédnutí do zrcadla', 
  'Dosáhl jsi konce první sezóny. Dokončil jsi integrační cyklus. Jak moc se tvůj pohled na realitu za tento týden změnil?', 
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
  'Uvědomíš si, kolik detailů ti denně uniká.', 
  'TEXT', 
  180, 
  1, 
  10
),
(
  'c-node-2', 
  'n-node-2', 
  'Odlož displej', 
  'Odlož telefon na 2 hodiny a popiš, co jsi dělal.', 
  'Zjistíš, kolik času máš, když nejsi připoutaný k obrazovce.', 
  'TEXT', 
  7200, 
  1, 
  15
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
  'Spojení se stromem', 
  'Najdi strom, dotkni se ho a zhluboka se nadechni. Vyfoť strom jako důkaz.', 
  'Uzemníš se a uklidníš svou mysl.', 
  'PHOTO', 
  1800, 
  2, 
  40
),
(
  'c-node-5', 
  'n-node-5', 
  'Náhodná moudrost', 
  'Otevři knihu na náhodné stránce a opiš jednu větu.', 
  'Najdeš myšlenku, kterou jsi v tuto chvíli možná potřeboval slyšet.', 
  'TEXT', 
  2400, 
  2, 
  40
),
(
  'c-node-6', 
  'n-node-6', 
  'Připojení k příteli', 
  'Pošli upřímnou zprávu starému příteli a popiš jeho odpověď.', 
  'Obnovíš staré pouto a přineseš radost někomu dalšímu.', 
  'TEXT', 
  3600, 
  2, 
  45
),
(
  'c-node-7', 
  'n-node-7', 
  'Svědek úsvitu', 
  'Vzbuď se s východem slunce a udělej pár kroků na vzduchu. Popiš pocit.', 
  'Zažiješ klid a novou energii na začátku dne.', 
  'TEXT', 
  1800, 
  2, 
  50
) ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title, description = EXCLUDED.description, why_text = EXCLUDED.why_text, proof_type = EXCLUDED.proof_type, reward_keys = EXCLUDED.reward_keys, reward_xp = EXCLUDED.reward_xp;

-- 4. Insert Steps for the NPC Challenge (Node 3)
INSERT INTO public.challenge_steps (id, challenge_id, step_order, text)
VALUES 
('cs-3-1', 'c-npc-challenge', 1, 'Vyjdi ven z domu nebo kanceláře.'),
('cs-3-2', 'c-npc-challenge', 2, 'Najdi v okruhu 100 metrů 3 odhozené odpadky.'),
('cs-3-3', 'c-npc-challenge', 3, 'Odnes je k nejbližšímu popelnici či koši.'),
('cs-3-4', 'c-npc-challenge', 4, 'Vyfoť je těsně před vyhozením jako důkaz.')
ON CONFLICT (id) DO UPDATE SET text = EXCLUDED.text;
