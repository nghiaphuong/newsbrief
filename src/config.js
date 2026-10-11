require('dotenv').config();
process.env.TZ = process.env.TZ || 'Europe/Oslo';

const env = (k, d = '') => (process.env[k] !== undefined && process.env[k] !== '' ? process.env[k] : d);

module.exports = {
  port: parseInt(env('PORT', '3000'), 10),
  tz: env('TZ', 'Europe/Oslo'),
  publicUrl: env('PUBLIC_URL', ''),
  db: {
    host: env('DB_HOST', 'localhost'),
    port: parseInt(env('DB_PORT', '3306'), 10),
    database: env('DB_NAME', 'newsbrief'),
    user: env('DB_USER', 'root'),
    password: env('DB_PASSWORD', ''),
  },
  appPassword: env('APP_PASSWORD', ''),
  sessionSecret: env('SESSION_SECRET', 'dev-secret-change-me'),
  anthropic: {
    key: env('ANTHROPIC_API_KEY'),
    model: env('ANTHROPIC_MODEL', 'claude-sonnet-4-6'),
    modelFast: env('ANTHROPIC_MODEL_FAST', env('ANTHROPIC_MODEL', 'claude-sonnet-4-6')),
  },
  smtp: {
    host: env('SMTP_HOST', 'smtp.gmail.com'),
    port: parseInt(env('SMTP_PORT', '465'), 10),
    user: env('SMTP_USER'),
    pass: env('SMTP_PASSWORD'),
    from: env('MAIL_FROM', env('SMTP_USER')),
  },
  weeklyTo: env('WEEKLY_TO', 'tratran.norway@gmail.com'),
  cronKey: env('CRON_KEY'),
  readonlyToken: env('READONLY_API_TOKEN'),
};
