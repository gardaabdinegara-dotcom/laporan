import fs from 'node:fs';
if (fs.existsSync('.env.local')) process.loadEnvFile('.env.local');
const env = process.env;
const status = {
  owner: env.INITIAL_OWNER_EMAIL || 'gardaabdinegara@gmail.com',
  appURL: env.APP_URL || '(belum diisi)',
  sessionSecret: (env.AUTH_SECRET || '').length >= 32,
  googleOAuth: Boolean(env.GOOGLE_OAUTH_CLIENT_ID && env.GOOGLE_OAUTH_CLIENT_SECRET),
  sheetsCredentials: Boolean(env.GOOGLE_SERVICE_ACCOUNT_JSON || fs.existsSync('credentials.json')),
  productionCredentials: Boolean(env.GOOGLE_SERVICE_ACCOUNT_JSON),
  spreadsheetId: Boolean(env.GOOGLE_SPREADSHEET_ID),
  redisCoordinator: Boolean(env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN),
  realWrites: env.APP_WRITE_ENABLED === 'true'
};
console.log(JSON.stringify(status, null, 2));
console.log('Nilai rahasia tidak ditampilkan. Mode contoh tidak memerlukan seluruh konfigurasi di atas.');
