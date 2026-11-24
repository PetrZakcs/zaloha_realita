-- Game flow test for the Game Bible MVP1 migration — expected values are in the labels.
\set ON_ERROR_STOP 1
\pset tuples_only on
\pset format unaligned
-- content (as postgres)
INSERT INTO themes (id, slug, name) VALUES ('t1','t1','Téma');
INSERT INTO story_nodes (id, theme_id, node_order, type, title, cutscene_text, requires_pass) VALUES
 ('n1','t1',1,'CHALLENGE','Uzel 1','x',false),('n2','t1',2,'CHALLENGE','Uzel 2','x',false),('n3','t1',3,'CHALLENGE','Uzel 3','x',false);
INSERT INTO challenges (id, story_node_id, title, description, proof_type, reward_xp, reward_keys, loop_order, is_mandatory, estimated_minutes) VALUES
 ('c1a','n1','Loop A','d','TEXT',60,1,1,true,5),('c1b','n1','Loop B','d','TEXT',60,1,2,true,5),('c1opt','n1','Volitelný','d','TEXT',10,1,3,false,5),
 ('c2','n2','Quest 2','d','TEXT',60,1,1,true,10),('c3','n3','Quest 3','d','TEXT',60,1,1,true,10);
INSERT INTO auth.users (id, email) VALUES ('a1b2c3d4-1111-4aaa-8aaa-123456789abc','a@x.cz'),('f9e8d7c6-2222-4bbb-9bbb-cba987654321','b@x.cz'),('5a5a5a5a-3333-4ccc-accc-0f0f0f0f0f0f','admin@x.cz');

-- ===== player A signs up
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','a1b2c3d4-1111-4aaa-8aaa-123456789abc',false);
INSERT INTO profiles (id,email,display_name,xp,uzel,keys_balance,current_streak,avatar_level,pass_holder) VALUES ('a1b2c3d4-1111-4aaa-8aaa-123456789abc','a@x.cz','Alfa',999,9,99,50,5,true);
SELECT 'A after insert (xp,uzel,keys,pass):', xp, uzel, keys_balance, pass_holder FROM profiles WHERE id=auth.uid();
SELECT 'A onboarding:', * FROM complete_onboarding();
RESET ROLE; SELECT set_config('request.jwt.claim.sub','',false);
SELECT referral_code FROM profiles WHERE display_name='Alfa' \gset a_
-- ===== anon landing
SET ROLE anon;
SELECT set_config('request.jwt.claim.sub','',false);
SELECT 'invite ctx:', * FROM get_invite_context(:'a_referral_code','c1a');
RESET ROLE; SELECT set_config('request.jwt.claim.sub','',false);
-- ===== player B via referral
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','f9e8d7c6-2222-4bbb-9bbb-cba987654321',false);
INSERT INTO profiles (id,email,display_name,referred_by_code) VALUES ('f9e8d7c6-2222-4bbb-9bbb-cba987654321','b@x.cz','Beta',:'a_referral_code');
SELECT 'B attribution:', record_referral_attribution('{"ref":"X","quest":"c1a","share_type":"quest_invite","evil":"drop me"}','{"ref":"X","quest":"c1a","share_type":"proof"}');
SELECT 'B attribution again:', record_referral_attribution('{}','{}');
SELECT 'B quest before onboarding:', new_xp FROM complete_challenge('c1a','proof B1',NULL,true);
RESET ROLE; SELECT set_config('request.jwt.claim.sub','',false);
SELECT 'referral row (activated? should be null):', activated_at IS NOT NULL, source_type, source_quest_id, first_touch FROM referral_signups;
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','f9e8d7c6-2222-4bbb-9bbb-cba987654321',false);
SELECT 'B onboarding:', * FROM complete_onboarding();
SELECT 'B quest 2 (c1b):', new_xp, new_keys_balance FROM complete_challenge('c1b','proof B2',NULL,true);
SELECT 'B progress:', * FROM get_player_progress();
SELECT 'B advance:', * FROM advance_node(false);
RESET ROLE; SELECT set_config('request.jwt.claim.sub','',false);
SELECT 'referral activated now:', activated_at IS NOT NULL, qualified_at IS NOT NULL FROM referral_signups;
SELECT 'B streak/days:', current_streak, (SELECT count(*) FROM player_active_days WHERE user_id=p.id) FROM profiles p WHERE display_name='Beta';
-- simulate two earlier meaningful days for B
INSERT INTO player_active_days VALUES ('f9e8d7c6-2222-4bbb-9bbb-cba987654321', current_date-2, 'quest'), ('f9e8d7c6-2222-4bbb-9bbb-cba987654321', current_date-1, 'quest');
DELETE FROM player_active_days WHERE user_id='f9e8d7c6-2222-4bbb-9bbb-cba987654321' AND day=(timezone('utc',now()))::date;
UPDATE profiles SET current_streak=2 WHERE display_name='Beta';
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','f9e8d7c6-2222-4bbb-9bbb-cba987654321',false);
SELECT 'B quest 3 (c2):', new_xp FROM complete_challenge('c2','proof B3',NULL,true);
SELECT 'B daily activity:', * FROM record_daily_activity();
RESET ROLE; SELECT set_config('request.jwt.claim.sub','',false);
SELECT 'B streak now (expect 3):', current_streak, longest_streak FROM profiles WHERE display_name='Beta';
SELECT 'referral qualified:', qualified_at IS NOT NULL FROM referral_signups;
SELECT 'A identity items:', string_agg(item_key, ',') FROM player_identity_items WHERE user_id='a1b2c3d4-1111-4aaa-8aaa-123456789abc';
SELECT 'A notifications:', string_agg(category||'/'||title, ' | ' ORDER BY created_at) FROM player_notifications WHERE user_id='a1b2c3d4-1111-4aaa-8aaa-123456789abc';
-- moderate-proof's job in production: everything so far passed the check
UPDATE feed_posts SET moderation_status='approved' WHERE moderation_status='pending';
-- ===== A reacts on B's post
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','a1b2c3d4-1111-4aaa-8aaa-123456789abc',false);
SELECT id AS bpost FROM feed_posts WHERE user_name='Beta' AND type='PROOF' ORDER BY created_at LIMIT 1 \gset
SELECT 'react fire:', * FROM increment_feed_reaction(:'bpost','fire');
SELECT 'react fire again:', * FROM increment_feed_reaction(:'bpost','fire');
SELECT 'react plant (switch):', * FROM increment_feed_reaction(:'bpost','plant');
SELECT 'dashboard A:', * FROM get_referral_dashboard();
SELECT 'feed A:', type, user_name, my_reaction, author_level, author_title, is_first_proof FROM get_feed(10);
SELECT 'set title:', set_identity_slot('title','recruiter-signaler');
SELECT 'public A:', status_title, lifetime_level, display_title FROM profiles_public WHERE display_name='Alfa';
RESET ROLE; SELECT set_config('request.jwt.claim.sub','',false);
SELECT 'reaction rows for A on post:', count(*) FROM feed_reactions WHERE user_id='a1b2c3d4-1111-4aaa-8aaa-123456789abc';
SELECT 'B notifications:', string_agg(category||'/'||title, ' | ' ORDER BY created_at) FROM player_notifications WHERE user_id='f9e8d7c6-2222-4bbb-9bbb-cba987654321';
SELECT 'events:', string_agg(event_type, ',' ORDER BY id) FROM game_events;
SELECT 'public B:', status_title, lifetime_level, xp FROM profiles_public WHERE display_name='Beta';
-- ===== negative: equip unowned, non-admin world post, notification read
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','f9e8d7c6-2222-4bbb-9bbb-cba987654321',false);
DO $$ BEGIN PERFORM set_identity_slot('title','recruiter-signaler'); RAISE NOTICE 'BUG: equip unowned allowed'; EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'ok: unowned equip refused'; END $$;
DO $$ BEGIN PERFORM publish_world_post('x'); RAISE NOTICE 'BUG: world post by non-admin'; EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'ok: world post refused'; END $$;
DO $$ BEGIN INSERT INTO game_events(user_id,event_type) VALUES (auth.uid(),'fake'); RAISE NOTICE 'BUG: client wrote game_events'; EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'ok: game_events insert refused'; END $$;
DO $$ BEGIN INSERT INTO player_notifications(user_id,category,title) VALUES (auth.uid(),'system','x'); RAISE NOTICE 'BUG: client wrote notifications'; EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'ok: notification insert refused'; END $$;
SELECT 'B sees others notifications:', count(*) FROM player_notifications WHERE user_id <> auth.uid();
SELECT 'mark read:', mark_notifications_read(NULL);
SELECT 'B unread after:', count(*) FROM player_notifications WHERE read_at IS NULL;
SELECT 'prefs:', set_notification_preferences(ARRAY['commerce','bogus'], 22::smallint, 7::smallint);
SELECT 'prefs row:', categories_off, quiet_start, quiet_end FROM notification_preferences;
RESET ROLE; SELECT set_config('request.jwt.claim.sub','',false);
-- ===== season mark + admin world post
INSERT INTO season_reflections (user_id, transformation_percent, would_recommend, referral_intent, sentence_template, sentence_text)
VALUES ('f9e8d7c6-2222-4bbb-9bbb-cba987654321', 70, true, 2, 1, 'Jsem jiný.');
SELECT 'B season mark:', string_agg(item_key, ',') FROM player_identity_items WHERE user_id='f9e8d7c6-2222-4bbb-9bbb-cba987654321';
INSERT INTO profiles (id,email,display_name) VALUES ('5a5a5a5a-3333-4ccc-accc-0f0f0f0f0f0f','admin@x.cz','Admin');
UPDATE profiles SET is_admin=true WHERE display_name='Admin';
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','5a5a5a5a-3333-4ccc-accc-0f0f0f0f0f0f',false);
SELECT 'world post:', publish_world_post('Portál je otevřen do neděle.') IS NOT NULL;
RESET ROLE; SELECT set_config('request.jwt.claim.sub','',false);
SELECT 'levels:', string_agg(x||'->'||lifetime_level(x), ' ') FROM unnest(ARRAY[0,99,100,229,230,415,600,1999,2000,99999,100000,101600]) x;
SELECT 'kpi_activation:', registered, onboarded, q1, q2, q3 FROM kpi_activation;
SELECT 'kpi_referrals:', * FROM kpi_referrals;

-- ================= Phase A (20261020120000) =================
SELECT 'B xp after node XP (expect 280+500 season):', xp FROM profiles WHERE display_name='Beta';
SELECT 'B first mask:', string_agg(item_key, ',' ORDER BY item_key) FROM player_identity_items WHERE user_id='f9e8d7c6-2222-4bbb-9bbb-cba987654321';
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','f9e8d7c6-2222-4bbb-9bbb-cba987654321',false);
SELECT 'B progress v2 (keys toward box / per box / season):', keys_toward_box, keys_per_box, season_name, absence_state FROM get_player_progress();
SELECT 'B equip mask:', set_identity_slot('mask','mask-first');
DO $$ BEGIN PERFORM set_primary_badge('not-mine'); RAISE NOTICE 'BUG: unowned badge'; EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'ok: unowned primary badge refused'; END $$;
-- A blocks B → B cannot react to A's posts, A no longer sees B in the feed
RESET ROLE; SELECT set_config('request.jwt.claim.sub','',false);
SELECT id AS apost FROM feed_posts WHERE user_name='Alfa' ORDER BY created_at LIMIT 1 \gset
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','a1b2c3d4-1111-4aaa-8aaa-123456789abc',false);
SELECT 'A blocks B:', set_user_block('f9e8d7c6-2222-4bbb-9bbb-cba987654321', true);
SELECT 'A feed authors after block:', string_agg(DISTINCT user_name, ',') FROM get_feed(20);
SELECT 'A hides own post (allowed, idempotent):', hide_post(:'apost');
SELECT set_config('request.jwt.claim.sub','5a5a5a5a-3333-4ccc-accc-0f0f0f0f0f0f',false);
SELECT 'admin reports A post with reason hate:', report_post(:'apost', 'hate') IS NOT NULL;
SELECT set_config('request.jwt.claim.sub','f9e8d7c6-2222-4bbb-9bbb-cba987654321',false);
DO $$ DECLARE p uuid; BEGIN SELECT id INTO p FROM feed_posts WHERE user_name='Alfa' ORDER BY created_at LIMIT 1;
  PERFORM increment_feed_reaction(p, 'fire'); RAISE NOTICE 'BUG: blocked user reacted';
EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'ok: blocked user cannot react'; END $$;
DO $$ DECLARE p uuid; BEGIN SELECT id INTO p FROM feed_posts WHERE user_name='Alfa' ORDER BY created_at LIMIT 1;
  PERFORM report_post(p, 'bogus'); RAISE NOTICE 'BUG: bogus reason accepted';
EXCEPTION WHEN check_violation THEN RAISE NOTICE 'ok: unknown report reason refused'; END $$;
RESET ROLE; SELECT set_config('request.jwt.claim.sub','',false);
-- referral velocity cap → hold → admin release
UPDATE game_config SET value='0' WHERE key='referral_reward_daily_cap';
INSERT INTO auth.users (id, email) VALUES ('0c0c0c0c-4444-4ddd-bddd-0d0d0d0d0d0d','c@x.cz');
SELECT referral_code FROM profiles WHERE display_name='Alfa' \gset a_
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','0c0c0c0c-4444-4ddd-bddd-0d0d0d0d0d0d',false);
INSERT INTO profiles (id,email,display_name,referred_by_code) VALUES ('0c0c0c0c-4444-4ddd-bddd-0d0d0d0d0d0d','c@x.cz','Gama',:'a_referral_code');
SELECT 'C onboarding:', * FROM complete_onboarding();
SELECT 'C quest:', new_xp FROM complete_challenge('c1a','proof C',NULL,true);
RESET ROLE; SELECT set_config('request.jwt.claim.sub','',false);
SELECT 'hold created (step 2 pending):', ladder_step, status FROM referral_reward_holds;
SELECT 'A free credits before release:', free_node_credits FROM profiles WHERE display_name='Alfa';
SELECT id AS holdid FROM referral_reward_holds LIMIT 1 \gset
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','5a5a5a5a-3333-4ccc-accc-0f0f0f0f0f0f',false);
SELECT 'admin release:', admin_resolve_referral_hold(:'holdid', true);
RESET ROLE; SELECT set_config('request.jwt.claim.sub','',false);
SELECT 'A free credits after release (expect +1):', free_node_credits FROM profiles WHERE display_name='Alfa';
SELECT 'config-driven level (curve unchanged):', lifetime_level(2000), lifetime_level(101600);
SELECT 'kpi_reality_retention rows:', count(*) FROM kpi_reality_retention;
SELECT 'kpi_engagement:', meaningful_players_7d, proof_players_30d FROM kpi_engagement;

-- ================= Phase B (20261020130000) =================
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','5a5a5a5a-3333-4ccc-accc-0f0f0f0f0f0f',false);
SELECT 'kpi snapshot keys:', (SELECT string_agg(k, ',' ORDER BY k) FROM jsonb_object_keys(admin_kpi_snapshot(30)) k);
SELECT 'kpi viral funnel:', admin_kpi_snapshot(30)->'viral_funnel';
SELECT 'kpi feed health:', admin_kpi_snapshot(30)->'feed_health';
SELECT 'review queue:', admin_review_queue();
SELECT 'export rows:', count(*) FROM admin_players_export();
SELECT set_config('request.jwt.claim.sub','f9e8d7c6-2222-4bbb-9bbb-cba987654321',false);
DO $$ BEGIN PERFORM admin_kpi_snapshot(30); RAISE NOTICE 'BUG: non-admin kpi'; EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'ok: kpi admin-only'; END $$;
DO $$ BEGIN PERFORM * FROM admin_players_export(); RAISE NOTICE 'BUG: non-admin export'; EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'ok: export admin-only'; END $$;
RESET ROLE; SELECT set_config('request.jwt.claim.sub','',false);

-- ================= MVP1 finish (20261106120000) =================
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','f9e8d7c6-2222-4bbb-9bbb-cba987654321',false);
DO $$ BEGIN PERFORM admin_kpi_business(30); RAISE NOTICE 'BUG: non-admin business kpi'; EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'ok: business kpi admin-only'; END $$;
DO $$ BEGIN PERFORM record_pass_payment('f9e8d7c6-2222-4bbb-9bbb-cba987654321','in_x',149,'x'); RAISE NOTICE 'BUG: client recorded a payment'; EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'ok: payment RPC service-only'; END $$;
INSERT INTO player_admin_flags (user_id) SELECT id FROM profiles LIMIT 0;
DO $$ BEGIN
  INSERT INTO player_admin_flags (user_id, contact_ok) VALUES ('f9e8d7c6-2222-4bbb-9bbb-cba987654321', true);
  RAISE NOTICE 'BUG: non-admin wrote flags';
EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'ok: flags admin-only'; END $$;
DO $$ BEGIN
  PERFORM complete_challenge('c1b','x','https://h/storage/v1/object/public/proofs/f9e8d7c6-2222-4bbb-9bbb-cba987654321/a.jpg',false);
  RAISE NOTICE 'BUG: private proof accepted a public URL';
EXCEPTION WHEN invalid_parameter_value THEN RAISE NOTICE 'ok: private proof refuses public url'; WHEN OTHERS THEN RAISE NOTICE 'ok: private proof refused (%)', SQLERRM; END $$;
SELECT 'feed has reward row:', count(*) FILTER (WHERE reward_xp IS NOT NULL) > 0 FROM get_feed(50);
RESET ROLE; SELECT set_config('request.jwt.claim.sub','',false);

SELECT 'avatar cap source allows 7:', prosrc LIKE '%v_current_badges < 7%' FROM pg_proc WHERE proname='complete_challenge';
SELECT 'no public listing policy:', count(*) FROM pg_policies WHERE schemaname='storage' AND policyname IN ('Allow public read access to proofs bucket','Allow public read access to avatars');

-- recurring referral reward: Beta was invited by Alfa
SELECT id AS alfa FROM profiles WHERE display_name='Alfa' \gset
SELECT referred_id AS buyer FROM referral_signups WHERE referrer_id=:'alfa' AND activated_at IS NOT NULL LIMIT 1 \gset
SELECT xp AS xp0, keys_balance AS keys0 FROM profiles WHERE id=:'alfa' \gset
SELECT 'first payment rewards inviter:', record_pass_payment(:'buyer','in_1',149,'subscription_create');
SELECT 'same invoice again is a no-op:', record_pass_payment(:'buyer','in_1',149,'subscription_create');
SELECT 'renewal rewards again:', record_pass_payment(:'buyer','in_2',149,'subscription_cycle');
SELECT 'inviter delta xp/keys (expect 20/2):', xp - :xp0, keys_balance - :keys0 FROM profiles WHERE id=:'alfa';
SELECT 'zero-amount invoice no reward:', record_pass_payment(:'buyer','in_3',0,'subscription_cycle');
SELECT 'inviter notified:', count(*) FROM player_notifications WHERE user_id=:'alfa' AND ref_id LIKE 'in_%';

SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','5a5a5a5a-3333-4ccc-accc-0f0f0f0f0f0f',false);
SELECT 'business kpi keys:', (SELECT string_agg(k, ',' ORDER BY k) FROM jsonb_object_keys(admin_kpi_business(30)) k);
SELECT 'business pass funnel:', admin_kpi_business(30)->'pass_funnel';
INSERT INTO player_admin_flags (user_id, contact_ok, segment) VALUES (:'alfa', true, 'core');
SELECT 'export has flags:', contact_ok, segment, quality_score > 0 FROM admin_players_export() WHERE id=:'alfa';
RESET ROLE; SELECT set_config('request.jwt.claim.sub','',false);

-- account deletion: refused with a live subscription, then removes everything
INSERT INTO subscriptions (stripe_subscription_id, user_id, status) VALUES ('sub_del', :'alfa', 'active');
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',:'alfa',false);
DO $$ BEGIN PERFORM delete_my_account(); RAISE NOTICE 'BUG: deleted with live sub'; EXCEPTION WHEN raise_exception THEN RAISE NOTICE 'ok: live subscription blocks deletion (%)', SQLERRM; END $$;
RESET ROLE; SELECT set_config('request.jwt.claim.sub','',false);
UPDATE subscriptions SET status='canceled' WHERE user_id=:'alfa';
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',:'alfa',false);
SELECT 'delete account:', delete_my_account();
RESET ROLE; SELECT set_config('request.jwt.claim.sub','',false);
SELECT 'profile/auth/posts left (expect 0 0 0):', (SELECT count(*) FROM profiles WHERE id=:'alfa'), (SELECT count(*) FROM auth.users WHERE id=:'alfa'), (SELECT count(*) FROM feed_posts WHERE user_id=:'alfa');

-- ================================================================
-- AI moderation
-- ================================================================
\echo '--- moderation'
SELECT 'mod' AS section;
INSERT INTO auth.users (id, email) VALUES ('6a6a6a6a-1111-4ccc-accc-0f0f0f0f0f0f','autor@example.com'), ('6b6b6b6b-2222-4ccc-accc-0f0f0f0f0f0f','divak@example.com') ON CONFLICT DO NOTHING;
INSERT INTO profiles (id, display_name) VALUES ('6a6a6a6a-1111-4ccc-accc-0f0f0f0f0f0f','Autor'), ('6b6b6b6b-2222-4ccc-accc-0f0f0f0f0f0f','Divak') ON CONFLICT (id) DO NOTHING;
\set autor '6a6a6a6a-1111-4ccc-accc-0f0f0f0f0f0f'
\set divak '6b6b6b6b-2222-4ccc-accc-0f0f0f0f0f0f'
\set modadmin '5a5a5a5a-3333-4ccc-accc-0f0f0f0f0f0f'
INSERT INTO feed_posts (id, user_id, user_name, content, is_public, moderation_status) VALUES
  ('7a7a7a7a-0001-4ccc-accc-0f0f0f0f0f0f', :'autor', 'Autor', 'forged approved', true, 'approved');
INSERT INTO feed_posts (id, user_id, user_name, content, is_public, media_type) VALUES
  ('7a7a7a7a-0002-4ccc-accc-0f0f0f0f0f0f', :'autor', 'Autor', 'video', true, 'video'),
  ('7a7a7a7a-0003-4ccc-accc-0f0f0f0f0f0f', :'autor', 'Autor', 'private', false, 'image');
INSERT INTO feed_posts (id, user_id, user_name, type, content, is_public) VALUES
  ('7a7a7a7a-0004-4ccc-accc-0f0f0f0f0f0f', :'autor', 'Hra Reality', 'WORLD', 'world', true);
SELECT 'insert status (expect pending/needs_review/not_required/approved):', string_agg(moderation_status, '/' ORDER BY id) FROM feed_posts WHERE id::text LIKE '7a7a7a7a%';

SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',:'divak',false);
SELECT 'viewer sees (expect only world):', string_agg(content, ',') FROM feed_posts WHERE id::text LIKE '7a7a7a7a%';
SELECT 'get_feed hides pending (expect 0):', count(*) FROM get_feed(100) WHERE id = '7a7a7a7a-0001-4ccc-accc-0f0f0f0f0f0f';
DO $$ BEGIN PERFORM claim_posts_for_moderation(NULL, 10); RAISE NOTICE 'BUG: player claimed'; EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'ok: claim denied'; END $$;
DO $$ BEGIN PERFORM apply_ai_moderation('7a7a7a7a-0001-4ccc-accc-0f0f0f0f0f0f','allow','{}','x','m'); RAISE NOTICE 'BUG: player applied'; EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'ok: apply denied'; END $$;
DO $$ BEGIN PERFORM admin_moderate_post('7a7a7a7a-0001-4ccc-accc-0f0f0f0f0f0f','approve'); RAISE NOTICE 'BUG: player approved'; EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'ok: admin rpc denied'; END $$;
SELECT set_config('request.jwt.claim.sub',:'autor',false);
SELECT 'author sees own (expect 4):', count(*) FROM feed_posts WHERE id::text LIKE '7a7a7a7a%' AND user_id = :'autor';
RESET ROLE; SELECT set_config('request.jwt.claim.sub','',false);

SET ROLE service_role;
SELECT 'claim (expect autor posts, pending only):', count(*) FROM claim_posts_for_moderation(:'autor', 10);
SELECT 'second claim is empty (expect 0):', count(*) FROM claim_posts_for_moderation(:'autor', 10);
SELECT 'ai reject:', apply_ai_moderation('7a7a7a7a-0001-4ccc-accc-0f0f0f0f0f0f','reject',ARRAY['sexual'],'Nahota.','claude-test');
SELECT 'ai cannot overwrite (expect null):', apply_ai_moderation('7a7a7a7a-0001-4ccc-accc-0f0f0f0f0f0f','allow','{}','x','claude-test');
RESET ROLE;
SELECT 'player notified (expect 1):', count(*) FROM player_notifications WHERE user_id = :'autor' AND ref_id = '7a7a7a7a-0001-4ccc-accc-0f0f0f0f0f0f';

SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',:'modadmin',false);
SELECT 'admin overrides ai:', admin_moderate_post('7a7a7a7a-0001-4ccc-accc-0f0f0f0f0f0f','approve');
DO $$ BEGIN PERFORM admin_moderate_post('7a7a7a7a-0003-4ccc-accc-0f0f0f0f0f0f','approve'); RAISE NOTICE 'BUG: private approved'; EXCEPTION WHEN invalid_parameter_value THEN RAISE NOTICE 'ok: private stays private'; END $$;
SELECT set_config('request.jwt.claim.sub',:'divak',false);
SELECT 'approved visible (expect 1):', count(*) FROM get_feed(100) WHERE id = '7a7a7a7a-0001-4ccc-accc-0f0f0f0f0f0f';
SELECT set_config('request.jwt.claim.sub',:'modadmin',false);
SELECT 'admin takes down:', admin_moderate_post('7a7a7a7a-0001-4ccc-accc-0f0f0f0f0f0f','reject','Nahlášeno.');
SELECT set_config('request.jwt.claim.sub',:'divak',false);
SELECT 'taken down hidden (expect 0):', count(*) FROM get_feed(100) WHERE id = '7a7a7a7a-0001-4ccc-accc-0f0f0f0f0f0f';
RESET ROLE; SELECT set_config('request.jwt.claim.sub','',false);

-- reports hide an approved post; admin approval restores it and clears them
UPDATE feed_posts SET moderation_status='approved', is_public=false, hidden_by_reports=true WHERE id='7a7a7a7a-0001-4ccc-accc-0f0f0f0f0f0f';
INSERT INTO feed_reports (post_id, reporter_id, reason) VALUES ('7a7a7a7a-0001-4ccc-accc-0f0f0f0f0f0f', :'divak', 'spam');
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',:'modadmin',false);
SELECT 'admin restores:', admin_moderate_post('7a7a7a7a-0001-4ccc-accc-0f0f0f0f0f0f','approve');
RESET ROLE; SELECT set_config('request.jwt.claim.sub','',false);
SELECT 'restored public + clean (expect t f 0):', is_public, hidden_by_reports, (SELECT count(*) FROM feed_reports r WHERE r.post_id=f.id) FROM feed_posts f WHERE id='7a7a7a7a-0001-4ccc-accc-0f0f0f0f0f0f';
SELECT 'log entries (expect 4):', count(*) FROM moderation_log WHERE post_id='7a7a7a7a-0001-4ccc-accc-0f0f0f0f0f0f';

-- attempts run out → admin queue, never stuck in pending
INSERT INTO feed_posts (id, user_id, user_name, content, is_public) VALUES ('7a7a7a7a-0005-4ccc-accc-0f0f0f0f0f0f', :'autor', 'Autor', 'stuck', true);
UPDATE feed_posts SET moderation_attempts=3, moderation_claimed_at=timezone('utc',now())-interval '6 minutes' WHERE id='7a7a7a7a-0005-4ccc-accc-0f0f0f0f0f0f';
SET ROLE service_role;
SELECT 'claim after 3 attempts (expect 0):', count(*) FROM claim_posts_for_moderation(:'autor', 10);
RESET ROLE;
SELECT 'stuck goes to review:', moderation_status FROM feed_posts WHERE id='7a7a7a7a-0005-4ccc-accc-0f0f0f0f0f0f';

-- ===== MVP1 complete: Pass bonus, integration phase, bridge, featured cards, privacy, extended KPI
\set bonus '6c1c6c1c-7777-4ccc-accc-0f0f0f0f0f0f'
\set hrac 'f9e8d7c6-2222-4bbb-9bbb-cba987654321'
INSERT INTO auth.users (id,email) VALUES (:'bonus','bonus@x.cz');
INSERT INTO profiles (id,email,display_name) VALUES (:'bonus','bonus@x.cz','Bonus');
SELECT set_config('app.bypass_profile_guard','true',false);
UPDATE profiles SET pass_holder=true, uzel=1 WHERE id=:'bonus';
SELECT set_config('app.bypass_profile_guard','',false);
SELECT 'founder aura from pass (expect aura-founder-pass):', string_agg(item_key, ',') FROM player_identity_items WHERE user_id=:'bonus';
SELECT xp FROM profiles WHERE id=:'bonus' \gset before_
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',:'bonus',false);
SELECT 'pass xp bonus (gain, then c1a reward * 1.2):', new_xp - :before_xp, (SELECT round(reward_xp*1.2)::int FROM challenges WHERE id='c1a') FROM complete_challenge('c1a','proof bonus',NULL,true);
SELECT 'pass holder before reflection (expect f):', (get_integration_state()->>'active')::boolean;
RESET ROLE; SELECT set_config('request.jwt.claim.sub','',false);

SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',:'hrac',false);
SELECT 'integration active, day, unlocked:', (s->>'active'), (s->>'day'), (SELECT count(*) FROM jsonb_array_elements(s->'signals') e WHERE (e->>'unlocked')::boolean) FROM get_integration_state() s;
SELECT 'no pass: xp, no fragment:', complete_integration_signal('int-1','Dnes jsem to udělal.');
SELECT 'repeat is safe (expect already_completed true):', complete_integration_signal('int-1','Znovu.')->>'already_completed';
DO $$ BEGIN PERFORM complete_integration_signal('bridge-5','Příliš brzy.'); RAISE NOTICE 'BUG: locked signal completed'; EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'ok locked signal refused'; END $$;
DO $$ BEGIN PERFORM complete_integration_signal('int-1','   '); RAISE NOTICE 'BUG: empty answer accepted'; EXCEPTION WHEN SQLSTATE '22023' THEN RAISE NOTICE 'ok empty answer refused'; END $$;
SELECT 'players cannot read signals table (expect 0):', count(*) FROM integration_signals;
RESET ROLE; SELECT set_config('request.jwt.claim.sub','',false);

-- Pass holder: fragments roll into a cycle that pays keys. Everything unlocked by moving the start back.
INSERT INTO season_reflections (user_id, transformation_percent, would_recommend, referral_intent, sentence_template, sentence_text)
VALUES (:'bonus', 80, true, 2, 1, 'Jsem jiný.');
UPDATE player_integration SET started_at = timezone('utc',now()) - interval '60 days' WHERE user_id=:'bonus';
SELECT keys_balance FROM profiles WHERE id=:'bonus' \gset before_
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',:'bonus',false);
SELECT 'signal '||id||':', complete_integration_signal(id,'Odpověď.') FROM unnest(ARRAY['int-1','int-2','int-3','int-4','int-5']) id;
SELECT 'fragments and cycles (expect 5+ and 1):', s->>'fragments', s->>'cycles' FROM get_integration_state() s;
RESET ROLE; SELECT set_config('request.jwt.claim.sub','',false);
SELECT 'cycle paid one key (expect 1):', keys_balance - :before_keys_balance FROM profiles WHERE id=:'bonus';

-- featured cards: admin only, in the feed
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',:'hrac',false);
DO $$ BEGIN PERFORM publish_featured_post('Hack'); RAISE NOTICE 'BUG: player published featured'; EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'ok player refused'; END $$;
SELECT set_config('request.jwt.claim.sub',:'modadmin',false);
SELECT 'featured published:', publish_featured_post('Skvělý moment.') IS NOT NULL;
SELECT 'featured in feed (expect 1):', count(*) FROM get_feed(100) WHERE type='FEATURED';
SELECT 'extended kpi keys:', string_agg(k, ',' ORDER BY k) FROM jsonb_object_keys(admin_kpi_extended(30)) k;
SELECT set_config('request.jwt.claim.sub',:'hrac',false);
DO $$ BEGIN PERFORM admin_kpi_extended(30); RAISE NOTICE 'BUG: player read kpi'; EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'ok kpi refused'; END $$;
-- privacy: own row only, readable by others
SELECT 'privacy saved:', set_my_privacy(false, true, false);
SELECT set_config('request.jwt.claim.sub',:'divak',false);
SELECT 'privacy readable (expect f t f):', show_progress, show_proofs, show_collection FROM player_privacy WHERE user_id=:'hrac';
UPDATE player_privacy SET show_progress=true WHERE user_id=:'hrac';
SELECT 'other player cannot change it (expect f):', show_progress FROM player_privacy WHERE user_id=:'hrac';
RESET ROLE; SELECT set_config('request.jwt.claim.sub','',false);

-- rank up: only configured levels reach the feed, as approved STATUS cards
SELECT set_config('app.bypass_profile_guard','true',false);
UPDATE game_config SET value='[50]' WHERE key='status_post_levels';
UPDATE profiles SET xp=10000000 WHERE id=:'bonus';
SELECT set_config('app.bypass_profile_guard','',false);
SELECT 'rank-up status card (type, status):', type, moderation_status FROM feed_posts WHERE user_id=:'bonus' AND type='STATUS' AND content LIKE '%Levelu%';

