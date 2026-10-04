import { openStore } from '../server/store.mjs';

const databasePath = process.argv[2];
if (!databasePath || process.argv.length !== 3) throw new Error('Usage: node scripts/migrate-accounts.mjs DATABASE.sqlite');
const store = openStore(databasePath);
store.close();
console.log('Account schema migration completed.');
