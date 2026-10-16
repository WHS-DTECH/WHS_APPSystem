const { sendEmail, getGmailClient } = require('../../email');
const config = require('../../config');

// The legacy Food Room code sends mail through nodemailer/SMTP. This stand-in keeps that code
// unchanged while delivering through the framework's Google Gmail API instead.
const sender = config.email.gmail.senderEmail || 'gmail-api@localhost.invalid';
process.env.SMTP_HOST = process.env.SMTP_HOST || 'gmail-api';
process.env.SMTP_USER = process.env.SMTP_USER || sender;
process.env.SMTP_PASS = process.env.SMTP_PASS || 'gmail-api';

const SUBJECT_PREFIX = '[Food Room Hub] ';
const asList = (value) => (Array.isArray(value) ? value : String(value || '').split(',')).map((entry) => String(entry).trim()).filter(Boolean);

function createTransport() {
  return {
    async verify() {
      if (!getGmailClient()) throw new Error('Google Gmail API is not configured.');
      return true;
    },
    async sendMail(options = {}) {
      const to = asList(options.to);
      const bcc = asList(options.bcc);
      const subject = String(options.subject || '');
      const result = await sendEmail({
        to,
        bcc,
        replyTo: options.replyTo,
        subject: subject.startsWith(SUBJECT_PREFIX) ? subject : `${SUBJECT_PREFIX}${subject}`,
        text: options.text,
        html: options.html
      });
      if (!result.ok) throw new Error(result.error || result.message || 'Email could not be sent.');
      return {
        messageId: result.messageId,
        accepted: [...to, ...bcc],
        rejected: [],
        response: 'Sent via Gmail API'
      };
    }
  };
}

module.exports = { createTransport };
