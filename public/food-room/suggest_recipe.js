document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('userSuggestForm');
    const msg = document.getElementById('suggestMsg');
    if (!form || !msg) return;
    const nameInput = form.elements.suggested_by;
    const emailInput = form.elements.email;
    let authUser = null;

    function setMsg(type, text) {
        const palette = {
            info: { color: '#1f4f7c', bg: '#eaf4ff', border: '#9cc7ef' },
            success: { color: '#115b2b', bg: '#e8f7ee', border: '#98d7af' },
            warn: { color: '#6f4a00', bg: '#fff6df', border: '#f0cb7f' },
            error: { color: '#7b1d1d', bg: '#fdecec', border: '#e2a8a8' }
        };
        const choice = palette[type] || palette.info;
        msg.style.display = 'block';
        msg.style.padding = '0.7rem 0.8rem';
        msg.style.borderRadius = '8px';
        msg.style.border = `1px solid ${choice.border}`;
        msg.style.background = choice.bg;
        msg.style.color = choice.color;
        msg.style.fontWeight = '700';
        msg.textContent = text;
    }

    msg.setAttribute('role', 'status');
    msg.setAttribute('aria-live', 'polite');
    setMsg('info', 'Status: Ready to submit your suggestion.');

    function deriveNameFromEmail(email) {
        const local = String(email || '').split('@')[0] || '';
        return local
            .split(/[._-]+/)
            .filter(Boolean)
            .map(part => part.charAt(0).toUpperCase() + part.slice(1))
            .join(' ')
            .trim();
    }

    function isLikelyTrustedEmail(email) {
        const value = String(email || '').trim().toLowerCase();
        const match = value.match(/@([^@]+)$/);
        if (!match) return false;
        const domain = match[1];
        const allowList = [
            'westlandhigh.school.nz',
            'gmail.com',
            'googlemail.com',
            'outlook.com',
            'hotmail.com',
            'live.com',
            'msn.com'
        ];
        return allowList.includes(domain);
    }

    fetch('/api/auth/me', { credentials: 'include' })
        .then(res => res.json())
        .then(data => {
            if (data && data.authenticated && data.user) {
                authUser = data.user;
                if (nameInput) {
                    nameInput.value = (authUser.name || '').trim() || deriveNameFromEmail(authUser.email);
                    nameInput.readOnly = true;
                }
                if (emailInput) {
                    emailInput.value = authUser.email || '';
                    emailInput.readOnly = true;
                }
            }
        })
        .catch(() => {
            authUser = null;
        });

    form.onsubmit = async function(e) {
        e.preventDefault();

        const suggestedBy = String(nameInput && nameInput.value || '').trim();
        const email = String(emailInput && emailInput.value || '').trim();
        if (!suggestedBy) {
            setMsg('error', 'Please include your name.');
            return;
        }
        if (!email || !isLikelyTrustedEmail(email)) {
            setMsg('error', 'Please use a valid school/work email (Google or Microsoft).');
            return;
        }

        setMsg('info', 'Submitting suggestion and checking email delivery...');

        const data = {
            date: new Date().toISOString().slice(0,10),
            recipe_name: form.recipe_name.value,
            url: form.url.value,
            reason: form.reason.value,
            suggested_by: suggestedBy,
            email: email
        };
        try {
            const res = await fetch('/api/suggestions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify(data)
            });

            if (res.ok) {
                const result = await res.json().catch(() => ({}));
                if (authUser) {
                    form.recipe_name.value = '';
                    form.url.value = '';
                    form.reason.value = '';
                } else {
                    form.reset();
                }

                const notification = result.notification || {};
                if (notification.sent) {
                    setMsg('success', `Thank you for your suggestion. Email sent to Teachers/Admin (${notification.recipientCount || 0} recipients).`);
                } else {
                    const reasonTextMap = {
                        no_recipients: 'No Teacher/Admin recipients were found.',
                        smtp_not_configured: 'Email is not configured yet (SMTP settings missing).',
                        sender_not_configured: 'Email sender address is not configured.',
                        resend_not_configured: 'Email API is not configured (RESEND_API_KEY missing).',
                        resend_failed: 'Email API delivery failed.',
                        fetch_unavailable: 'Server fetch support unavailable for email API.',
                        not_accepted: 'Email server did not accept recipients.',
                        send_failed: 'Email sending failed. Please check server logs.',
                        send_timeout: 'Email delivery timed out while contacting SMTP. Suggestion was still saved.'
                    };
                    const reasonText = reasonTextMap[notification.reason] || 'Email status is unknown.';
                    setMsg('warn', `Suggestion saved to list. Email notification not sent: ${reasonText}`);
                }
            } else {
                const result = await res.json().catch(() => ({}));
                setMsg('error', result.error || 'Failed to send suggestion. Please try again later.');
            }
        } catch (err) {
            setMsg('error', 'Could not reach the server. Suggestion may not have been submitted. Please try again.');
        }
    };
});
