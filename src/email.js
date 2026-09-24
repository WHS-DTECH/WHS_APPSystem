const { google } = require('googleapis');
const config = require('./config');

function getGmailClient() {
  const { clientId, clientSecret, refreshToken, senderEmail } = config.email.gmail;

  if (!config.email.gmail.isConfigured || !clientId || !clientSecret || !refreshToken || !senderEmail) {
    return null;
  }

  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret);
  oauth2Client.setCredentials({ refresh_token: refreshToken });

  return {
    gmail: google.gmail({ version: 'v1', auth: oauth2Client }),
    senderEmail
  };
}

function encodeBase64Url(value) {
  return Buffer.from(value)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function buildMessage({ to, subject, text, html, from }) {
  const toAddresses = Array.isArray(to) ? to : [to].filter(Boolean);
  const headers = [
    `From: ${from || 'WHS APPSystem <noreply@localhost>'}`,
    `To: ${toAddresses.join(', ')}`,
    `Subject: ${subject}`,
    'MIME-Version: 1.0',
    'Content-Type: multipart/alternative; boundary="boundary123"'
  ];

  const body = [
    '--boundary123',
    'Content-Type: text/plain; charset="UTF-8"',
    '',
    text || '',
    '--boundary123',
    'Content-Type: text/html; charset="UTF-8"',
    '',
    html || text || '',
    '--boundary123--'
  ].join('\r\n');

  return headers.concat(['', body]).join('\r\n');
}

async function sendEmail({ to, subject, text, html, from } = {}) {
  const recipients = (Array.isArray(to) ? to : [to]).filter(Boolean);
  const defaultRecipients = config.email.gmail.defaultRecipients;
  const targetRecipients = recipients.length ? recipients : defaultRecipients;

  if (!targetRecipients.length || !config.email.gmail.isConfigured) {
    return {
      ok: false,
      skipped: true,
      message: 'Google Gmail API is not configured. Email sending is disabled.'
    };
  }

  const gmailClient = getGmailClient();
  if (!gmailClient) {
    return {
      ok: false,
      skipped: true,
      message: 'Google Gmail API credentials are missing.'
    };
  }

  try {
    const message = buildMessage({
      to: targetRecipients,
      subject,
      text,
      html,
      from: from || gmailClient.senderEmail
    });

    const response = await gmailClient.gmail.users.messages.send({
      userId: 'me',
      requestBody: {
        raw: encodeBase64Url(message)
      }
    });

    return {
      ok: true,
      messageId: response.data.id,
      status: response.status
    };
  } catch (error) {
    console.error('Failed to send Gmail message:', error);

    return {
      ok: false,
      error: error.message || 'Unknown Gmail API error'
    };
  }
}

async function sendSuggestionNotification({
  activityName,
  suggestedBy,
  senderEmail,
  activityUrl,
  reason,
  suggestionUrl
}) {
  const subject = `New sewing hub suggestion: ${activityName || 'Activity suggestion'}`;
  const text = [
    'A new Sewing Hub suggestion has been submitted.',
    '',
    `Activity: ${activityName || 'Not provided'}`,
    `Suggested by: ${suggestedBy || 'Not provided'}`,
    `Email: ${senderEmail || 'Not provided'}`,
    `URL: ${activityUrl || 'Not provided'}`,
    '',
    'Reason:',
    reason || 'No reason supplied',
    '',
    `Review link: ${suggestionUrl || 'Not provided'}`
  ].join('\n');

  return sendEmail({
    subject,
    text,
    html: `<p><strong>New Sewing Hub suggestion</strong></p><p><strong>Activity:</strong> ${activityName || 'Not provided'}</p><p><strong>Suggested by:</strong> ${suggestedBy || 'Not provided'}</p><p><strong>Email:</strong> ${senderEmail || 'Not provided'}</p><p><strong>URL:</strong> ${activityUrl || 'Not provided'}</p><p><strong>Reason:</strong><br>${(reason || 'No reason supplied').replace(/\n/g, '<br>')}</p><p><strong>Review:</strong> ${suggestionUrl || 'Not provided'}</p>`
  });
}

module.exports = {
  getGmailClient,
  sendEmail,
  sendSuggestionNotification
};
