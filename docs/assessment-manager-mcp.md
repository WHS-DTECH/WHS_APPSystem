# Assessment Manager MCP

The read-only connector uses the existing Assessment Manager database and current
school permissions. It exposes no writes, student-level records, individual
documents, grades, marking details or free-text moderation notes.

## Connection

- MCP URL: `https://whs-appsystem.onrender.com/integrations/assessment-manager/mcp`
- OAuth client ID: `assessment-manager-chatgpt`
- Scope: `assessment:read`
- Public client; authorisation code with PKCE S256, no client secret or refresh token.
- Sign in with an active school Google account assigned Assessment Manager access
  and approve the consent screen. Access is checked on every request.
- Grants expire after eight hours and can be revoked using the OAuth revocation
  endpoint. Reconnect after expiry.

Use the URL as a Streamable HTTP connector in a school-authorised ChatGPT
workspace. Set `ASSESSMENT_MANAGER_MCP_REDIRECT_URI` on the Core Render service
to **exactly** the callback supplied by ChatGPT for this connector; do not
reuse another connector's callback. Discovery works without the callback, but
authorisation is disabled until it is configured. Core migration
`063_assessment_manager_mcp.sql` creates separate OAuth tables; it does not
change or move Assessment Manager data.

## Tools and limitations

- `search_assessment_resources` searches saved shared resource metadata and
  standards. Deleted entries, drafts, files and purchasing details are excluded.
- `list_my_assessments` returns only the signed-in owner's assessment-level
  standard metadata and structured moderation checks for the selected year.
- `list_audit_departments` lists departments currently authorised for Students
  Audit. `get_enrolment_summary` returns saved PDF counts only for currently
  linked courses in a selected authorised department. External standards are
  excluded; unknown classifications and unavailable class links are flagged.
  Blank counts remain blank. These counts do not verify individual enrolments or
  grades, and duplicate or missing standards require review in the app.
- `get_senior_audit_summary` returns aggregate reconciliation and source counts
  only for staff currently authorised for the Technology Senior Audit.
  Incomplete or missing sources are reported, not treated as a completed audit.

Queries are read-only and use the existing roster and reconciliation logic.
Missing or revoked access and unavailable sources fail explicitly. Information
returned to ChatGPT is processed under the workspace's policies.
