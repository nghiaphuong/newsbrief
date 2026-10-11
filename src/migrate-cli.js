const { migrate, pool } = require('./db');
migrate().then(() => { console.log('Migrated'); return pool.end(); }).catch(e => { console.error(e); process.exit(1); });
