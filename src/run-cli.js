const { migrate, pool } = require('./db');
const { runDaily } = require('./pipeline');
migrate().then(() => runDaily('cli')).then(s => { console.log(s); return pool.end(); }).catch(e => { console.error(e); process.exit(1); });
