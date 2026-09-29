-- Run against a disposable database after marketplace migrations. Rolls back fixtures.
BEGIN;
CREATE FUNCTION pg_temp.assert_true(value boolean, message text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN IF value IS DISTINCT FROM true THEN RAISE EXCEPTION 'Assertion failed: %',message; END IF; END $$;
INSERT INTO profiles(user_id,display_name,username) VALUES
('10000000-0000-0000-0000-000000000001','Seller','seller'),('10000000-0000-0000-0000-000000000002','Customer','customer'),('10000000-0000-0000-0000-000000000003','Other','other');
INSERT INTO advertiser_accounts(id,user_id,name,username,status) VALUES
('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','First store','first-store','active'),
('20000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001','Second store','second-store','active');
INSERT INTO business_stripe_accounts(business_id,stripe_account_id,charges_enabled,payouts_enabled) SELECT id,'acct_test_'||id,true,true FROM advertiser_accounts;
INSERT INTO products(id,business_id,created_by,name,price_cents,shipping_price_cents,fulfillment,inventory_tracking) VALUES
('30000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','Shirt',2000,500,'both',true),
('30000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001','Mug',1000,300,'both',false);
INSERT INTO product_images(product_id,url,storage_path) SELECT id,'https://example.test/photo.jpg',business_id||'/photo.jpg' FROM products;
INSERT INTO product_variants(id,product_id,name,value,inventory_count) VALUES('40000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','Option','Black / M',2);
SET LOCAL ROLE service_role;
UPDATE products SET status='approved';
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000002',true);
INSERT INTO cart_items(user_id,product_id,variant_id,quantity) VALUES('10000000-0000-0000-0000-000000000002','30000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001',1),('10000000-0000-0000-0000-000000000002','30000000-0000-0000-0000-000000000002',NULL,1);
SELECT pg_temp.assert_true((get_business_checkout_quote('20000000-0000-0000-0000-000000000001','pickup')->>'total')::bigint=2000,'pickup excludes shipping');
SELECT * FROM prepare_business_order('20000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000001','pickup');
SELECT pg_temp.assert_true((SELECT count(*) FROM orders)=1,'one seller order');
SELECT pg_temp.assert_true((SELECT count(*) FROM cart_items)=1,'other seller cart preserved');
SELECT pg_temp.assert_true((SELECT inventory_count FROM product_variants WHERE id='40000000-0000-0000-0000-000000000001')=1,'stock reserved once');
SELECT * FROM prepare_business_order('20000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000001','pickup');
SELECT pg_temp.assert_true((SELECT count(*) FROM orders)=1,'retry is idempotent');
SELECT pg_temp.assert_true((SELECT inventory_count FROM product_variants WHERE id='40000000-0000-0000-0000-000000000001')=1,'retry does not reserve again');
DO $$ BEGIN
 BEGIN UPDATE orders SET payment_status='paid'; RAISE EXCEPTION 'Payment write incorrectly permitted'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
SELECT open_commerce_conversation('20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001',(SELECT id FROM orders LIMIT 1),false);
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000003',true);
SELECT pg_temp.assert_true((SELECT count(*) FROM orders)=0,'other customer cannot read order');
SELECT pg_temp.assert_true((SELECT count(*) FROM order_items)=0,'other customer cannot read order items');
INSERT INTO cart_items(user_id,product_id,variant_id,quantity) VALUES('10000000-0000-0000-0000-000000000003','30000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001',2);
DO $$ BEGIN
 BEGIN PERFORM prepare_business_order('20000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000002','pickup'); RAISE EXCEPTION 'Oversell incorrectly permitted'; EXCEPTION WHEN serialization_failure THEN NULL; END;
END $$;
RESET ROLE;
SET LOCAL ROLE service_role;
UPDATE orders SET status='cancelled';
UPDATE orders SET status='cancelled';
RESET ROLE;
SELECT pg_temp.assert_true((SELECT inventory_count FROM product_variants WHERE id='40000000-0000-0000-0000-000000000001')=2,'cancellation restocks exactly once');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',true);
DO $$ DECLARE n integer; BEGIN
 FOR n IN 2..product_media_limit() LOOP INSERT INTO product_images(product_id,url,storage_path) VALUES('30000000-0000-0000-0000-000000000001','https://example.test/'||n,n::text); END LOOP;
 BEGIN INSERT INTO product_images(product_id,url,storage_path) VALUES('30000000-0000-0000-0000-000000000001','https://example.test/excess','excess'); RAISE EXCEPTION 'Image limit not enforced'; EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'Maximum product image count reached' THEN RAISE; END IF; END;
END $$;
SELECT reorder_product_images('30000000-0000-0000-0000-000000000001',ARRAY(SELECT id FROM product_images WHERE product_id='30000000-0000-0000-0000-000000000001' ORDER BY id));

DO $$ BEGIN
 BEGIN PERFORM reorder_product_images('30000000-0000-0000-0000-000000000001',ARRAY(SELECT gen_random_uuid() FROM generate_series(1,product_media_limit()))); RAISE EXCEPTION 'Invalid image IDs accepted'; EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'Reload the images before reordering' THEN RAISE; END IF; END;
END $$;
-- Staff cannot accidentally send under their personal identity in a business thread.
DO $$ DECLARE thread uuid; BEGIN
 SELECT id INTO thread FROM conversations WHERE business_id='20000000-0000-0000-0000-000000000001' LIMIT 1;
 BEGIN INSERT INTO messages(conversation_id,sender_id,content) VALUES(thread,auth.uid(),'Personal leak'); RAISE EXCEPTION 'Personal staff sender accepted'; EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'Reply using an authorized business identity' THEN RAISE; END IF; END;
 INSERT INTO messages(conversation_id,sender_id,sender_business_id,content) VALUES(thread,auth.uid(),'20000000-0000-0000-0000-000000000001','Business reply');
 BEGIN UPDATE messages SET sender_business_id=NULL WHERE conversation_id=thread; RAISE EXCEPTION 'Authorship changed'; EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'Message authorship is immutable' THEN RAISE; END IF; END;
END $$;
ROLLBACK;
