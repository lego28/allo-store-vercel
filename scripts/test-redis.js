const Redis = require('ioredis');

const url = process.argv[2];
if (!url) {
  console.error('Usage: node scripts/test-redis.js <redis-url>');
  process.exit(2);
}

console.log('Testing Redis URL:', url.replace(/(:).*@/, ':***@'));
const redis = new Redis(url, { connectTimeout: 5000, maxRetriesPerRequest: 1 });

redis.on('error', (err) => {
  console.error('[Redis] connection error:', err && err.message ? err.message : err);
});

async function run() {
  try {
    const res = await redis.ping();
    console.log('PING ->', res);
    await redis.quit();
    process.exit(0);
  } catch (err) {
    console.error('Ping failed:', err && err.message ? err.message : err);
    try { await redis.quit(); } catch (e) {}
    process.exit(1);
  }
}

run();
