# DTECH teaching catalogue MCP

The DTECH Hub already publishes school-sign-in-protected Practical Skills and
Learning Pathways catalogue feeds. The MCP reuses their stored catalogue and
the Hub's existing visible-kit-activity builder. It reads only the two catalogue
stores and kit content, with SELECT queries; it does not read student records,
responses, completion or progress. It exposes no write tools.

The MCP lists and searches active Licence Kits, units and lessons. Each kit
includes its visible activity titles in catalogue order and direct activity
links. `sourceActivityIndex` is the original zero-based worksheet index; visible
sequence numbers are consecutive even when worksheets are hidden or merged.
The year/course is taken from the catalogue. An active unit or lesson with no
linked page points to its existing catalogue card and has `hasLinkedPage:
false`; that is not a full published lesson page. Planning and archived cards
are excluded.

For a local Learning Pathways lesson, a Unit Plan link is returned only when
the lesson page explicitly labels a link as a Unit Plan. The MCP does not infer
one from a unit association. If the page cannot be checked, a warning is
returned instead. Published catalogue data are read afresh; missing stores or
other source errors fail explicitly rather than returning an empty catalogue.

## Connection

- MCP URL: `https://whs-appsystem.onrender.com/integrations/dtech-catalogue/mcp`
- OAuth client ID: `dtech-catalogue-chatgpt`
- Client authentication: none (public client; no client secret)
- Scope: `dtech-catalogue:read`
- OAuth: authorisation code with PKCE S256; eight-hour grant, no refresh token
- Sign in using an active school Google account with current DTECH teaching
  access, then approve the read-only consent screen. Access is rechecked on
  every request.

In the ChatGPT app/connector configuration, use Streamable HTTP and the MCP
URL above. Set `DTECH_CATALOGUE_MCP_REDIRECT_URI` on the Core Render service to
**exactly** the callback ChatGPT supplies for this connector. Do not guess or
copy another connector's callback. Supported callback forms are
`https://chatgpt.com/connector/oauth/<connector-id>` and
`https://chatgpt.com/connector_platform_oauth_redirect`. The existing
`APP_BASE_URL` and `DTECH_DATABASE_URL` remain in use. Core startup applies
`061_dtech_catalogue_mcp.sql`; it creates only separate OAuth code and grant
tables. No DTECH catalogue migration is required.

Until the callback is configured, discovery is available but authorisation is
disabled. Reconnect after the grant expires. Only use a school-authorised
ChatGPT workspace: catalogue titles and links sent through this connection are
processed under that workspace's policies.

## Tool

`search_teaching_catalogue` accepts optional `query`, `type` (`all`, `kit`,
`unit`, or `lesson`), `offset` and `limit`. Search includes activity titles,
kit/unit/lesson names and year/course; it tolerates common singular/plural
variations. The response includes source, retrieval time, total and pagination.
The tool returns no free-form student input, activity responses, progress,
accounts, unfiltered lesson contents or arbitrary URLs supplied by a caller.
