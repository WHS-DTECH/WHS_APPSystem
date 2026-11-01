const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';

function pickerConfiguration(env = process.env) {
  const values = [env.GOOGLE_DRIVE_CLIENT_ID, env.GOOGLE_DRIVE_API_KEY, env.GOOGLE_DRIVE_APP_ID];
  if (values.every(value => !value)) return { configured: false };
  if (values.some(value => !value) || !/^\d+$/.test(env.GOOGLE_DRIVE_APP_ID)) {
    throw new Error('Set GOOGLE_DRIVE_CLIENT_ID, GOOGLE_DRIVE_API_KEY and a numeric GOOGLE_DRIVE_APP_ID.');
  }
  return { configured: true, clientId: values[0], apiKey: values[1], appId: values[2], scope: DRIVE_SCOPE };
}

function pickerPolicy(imageOrigins) {
  return {
    crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' },
    contentSecurityPolicy: {
      directives: {
        imgSrc: ["'self'", 'data:', ...imageOrigins],
        scriptSrc: ["'self'", 'https://apis.google.com', 'https://accounts.google.com'],
        connectSrc: ["'self'", 'https://apis.google.com', 'https://accounts.google.com', 'https://www.googleapis.com'],
        frameSrc: ['https://docs.google.com', 'https://accounts.google.com']
      }
    }
  };
}

module.exports = { pickerConfiguration, pickerPolicy };
