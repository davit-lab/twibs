"""Disposable PostgreSQL integration tests; never connects to a configured/live database."""
import os
from pathlib import Path
import subprocess
import tempfile
import time

root = Path(__file__).resolve().parents[1]
bindir = Path(subprocess.check_output(['pg_config', '--bindir'], text=True).strip())
with tempfile.TemporaryDirectory(prefix='twibs-commerce-test-') as temp:
    temp = Path(temp)
    env = {**os.environ, 'PGHOST': str(temp), 'PGPORT': '55439', 'PGDATABASE': 'postgres', 'PGUSER': os.environ.get('USER', 'davit')}
    def run(args, **kwargs):
        return subprocess.run([str(arg) for arg in args], env=env, cwd=root, text=True, capture_output=True, check=True, **kwargs)
    def sql(statement):
        return run([bindir/'psql', '-X', '-v', 'ON_ERROR_STOP=1', '-At'], input=statement).stdout.strip()
    try:
        run([bindir/'initdb', '-D', temp/'data', '-A', 'trust'])
        run([bindir/'pg_ctl', '-D', temp/'data', '-l', temp/'server.log', '-o', f'-p 55439 -k {temp} -c listen_addresses=', 'start'])
        for file in ['supabase/tests/fixtures/commerce_dependencies.sql', 'supabase/migrations/20260928090000_marketplace_schema.sql', 'supabase/migrations/20260928091000_marketplace_rls.sql', 'supabase/migrations/20260928092000_marketplace_commerce_fns.sql', 'supabase/migrations/20260928130000_commerce_workflow.sql']:
            run([bindir/'psql','-X','-v','ON_ERROR_STOP=1','-f',file])
        # Applying the additive migration twice must preserve existing objects safely.
        run([bindir/'psql','-X','-v','ON_ERROR_STOP=1','-f','supabase/migrations/20260928130000_commerce_workflow.sql'])
        tests = (root/'supabase/tests/commerce_workflow.sql').read_text()
        sql(tests.replace('ROLLBACK;', 'COMMIT;'))
        print('PASS: migrations, idempotency, RLS, seller separation, stock release, image limits and ordering')
        sql("""INSERT INTO cart_items(user_id,product_id,variant_id,quantity) VALUES('10000000-0000-0000-0000-000000000002','30000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001',2);""")
        def checkout(customer, request, wait):
            return f"""BEGIN; SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-{customer:012d}',true); SELECT * FROM prepare_business_order('20000000-0000-0000-0000-000000000001','60000000-0000-0000-0000-{request:012d}','pickup'); SELECT pg_sleep({wait}); COMMIT;"""
        first = subprocess.Popen([str(bindir/'psql'),'-X','-v','ON_ERROR_STOP=1','-At'], env=env, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        first.stdin.write(checkout(2,1,1)); first.stdin.close(); first.stdin = None
        time.sleep(.15)
        second = subprocess.run([str(bindir/'psql'),'-X','-v','ON_ERROR_STOP=1','-At'],env=env,input=checkout(3,2,0),capture_output=True,text=True)
        first_out, first_err = first.communicate(timeout=10)
        assert first.returncode == 0, first_err
        assert second.returncode != 0 and 'Not enough stock' in second.stderr, second.stderr
        assert sql("SELECT inventory_count FROM product_variants WHERE id='40000000-0000-0000-0000-000000000001'") == '0'
        assert sql("SELECT count(*) FROM orders WHERE status='pending'") == '1'
        print('PASS: simultaneous buyers cannot oversell the last units')
    except subprocess.CalledProcessError as error:
        print(error.stdout or '')
        print(error.stderr or '')
        raise
    finally:
        subprocess.run([str(bindir/'pg_ctl'),'-D',str(temp/'data'),'-m','immediate','stop'],capture_output=True)
