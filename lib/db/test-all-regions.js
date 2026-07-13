const pg = require('pg');

const regions = [
  'sa-east-1',
  'us-east-1',
  'us-east-2',
  'us-west-1',
  'us-west-2',
  'ca-central-1',
  'eu-central-1',
  'eu-west-1',
  'eu-west-2',
  'eu-west-3',
  'ap-southeast-1',
  'ap-southeast-2',
  'ap-northeast-1',
  'ap-northeast-2'
];

async function testConnection(region) {
  const host = `aws-0-${region}.pooler.supabase.com`;
  const connectionString = `postgresql://postgres.agzxcfenqbylcnezscuc:qbevHn8E3UFpgbLc@${host}:6543/postgres`;
  console.log(`Connecting to ${region}...`);
  const pool = new pg.Pool({
    connectionString,
    connectionTimeoutMillis: 2000
  });
  try {
    const res = await pool.query('SELECT NOW()');
    console.log(`[SUCCESS] Region ${region} worked! Database time:`, res.rows[0]);
    return true;
  } catch (err) {
    if (err.message.includes('tenant/user') && err.message.includes('not found')) {
      // expected if wrong region
    } else {
      console.log(`Region ${region} failed with:`, err.message);
    }
    return false;
  } finally {
    await pool.end();
  }
}

async function run() {
  for (const region of regions) {
    const success = await testConnection(region);
    if (success) {
      console.log(`Found region: ${region}`);
      process.exit(0);
    }
  }
  console.log('All regions scanned. None succeeded.');
}

run();
