const fs = require('node:fs');
const { createClient } = require('@supabase/supabase-js');

for (const line of fs.readFileSync('.env', 'utf8').split(/\r?\n/)) {
  const match = line.match(/^([^#=]+)=(.*)$/);
  if (match) process.env[match[1].trim()] = match[2].trim().replace(/^['"]|['"]$/g, '');
}

const client = createClient(process.env.EXPO_PUBLIC_SUPABASE_URL,
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY);

Promise.all([
  client.from('product_cache').select('barcode').limit(1),
  client.from('user_products').select('barcode').limit(1),
]).then(results => {
  const summary = results.map(result => ({ ok: !result.error, code: result.error?.code, message: result.error?.message }));
  console.log(JSON.stringify(summary));
  // Anonymous clients may read the shared cache, but private corrections require
  // an authenticated owner. A permission error for user_products is expected.
  const sharedCacheReady = !results[0].error;
  const privateTableProtected = !results[1].error || results[1].error.code === '42501';
  process.exit(sharedCacheReady && privateTableProtected ? 0 : 1);
});
