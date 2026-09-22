require('dotenv').config();

const required = ['DATABASE_URL', 'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'];

function getConfig() {
  const baseUrl = process.env.APP_BASE_URL || `http://localhost:${process.env.PORT || 3000}`;

  return {
    appBaseUrl: baseUrl.replace(/\/$/, ''),
    adminEmails: (process.env.ADMIN_EMAILS || '')
      .split(',')
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
    databaseUrl: process.env.DATABASE_URL,
    google: {
      callbackUrl: process.env.GOOGLE_REDIRECT_URI || `${baseUrl.replace(/\/$/, '')}/auth/google/callback`,
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      hostedDomain: process.env.GOOGLE_HOSTED_DOMAIN || undefined
    },
    isProduction: process.env.NODE_ENV === 'production',
    port: Number(process.env.PORT || 3000),
    required,
    sessionSecret: process.env.SESSION_SECRET || process.env.SECRET_KEY
  };
}

module.exports = getConfig();
