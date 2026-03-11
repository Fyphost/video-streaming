// Centralised configuration — loaded once at startup

const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  if (process.env.NODE_ENV === 'production') {
    console.error('FATAL: JWT_SECRET environment variable is not set in production.');
    process.exit(1);
  } else {
    console.warn('WARNING: JWT_SECRET is not set. Using an insecure default for development only.');
  }
}

module.exports = {
  JWT_SECRET: JWT_SECRET || 'insecure_dev_only_secret_do_not_use_in_production',
  JWT_EXPIRES_IN: '7d',
  PORT: parseInt(process.env.PORT, 10) || 3000,
  NODE_ENV: process.env.NODE_ENV || 'development'
};
