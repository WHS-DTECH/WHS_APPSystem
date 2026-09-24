require('dotenv').config();

const required = ['DATABASE_URL', 'SESSION_SECRET', 'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'];

function getConfig() {
  const baseUrl = process.env.APP_BASE_URL || `http://localhost:${process.env.PORT || 3000}`;
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const gmailClientId = process.env.GOOGLE_GMAIL_CLIENT_ID;
  const gmailClientSecret = process.env.GOOGLE_GMAIL_CLIENT_SECRET;
  const gmailRefreshToken = process.env.GOOGLE_GMAIL_REFRESH_TOKEN;
  const gmailSenderEmail = process.env.GOOGLE_GMAIL_SENDER_EMAIL || process.env.GMAIL_SENDER_EMAIL;

  return {
    appBaseUrl: baseUrl.replace(/\/$/, ''),
    adminEmails: (process.env.ADMIN_EMAILS || '')
      .split(',')
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
    databaseUrl: process.env.DATABASE_URL,
    email: {
      gmail: {
        clientId: gmailClientId,
        clientSecret: gmailClientSecret,
        defaultRecipients: (process.env.GOOGLE_GMAIL_TO || process.env.GMAIL_TO || '')
          .split(',')
          .map((email) => email.trim())
          .filter(Boolean),
        isConfigured: Boolean(gmailClientId && gmailClientSecret && gmailRefreshToken && gmailSenderEmail),
        refreshToken: gmailRefreshToken,
        senderEmail: gmailSenderEmail
      }
    },
    google: {
      callbackUrl: process.env.GOOGLE_REDIRECT_URI || `${baseUrl.replace(/\/$/, '')}/auth/google/callback`,
      clientId,
      clientSecret,
      hostedDomain: process.env.GOOGLE_HOSTED_DOMAIN || undefined,
      isConfigured: Boolean(clientId && clientSecret)
    },
    isProduction: process.env.NODE_ENV === 'production',
    port: Number(process.env.PORT || 3000),
    required,
    sessionSecret: process.env.SESSION_SECRET || process.env.SECRET_KEY || 'development-session-secret-change-me'
  };
}

module.exports = getConfig();
