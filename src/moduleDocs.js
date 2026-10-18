// Setup notes shown on the App Module Management page. Only variable names are listed, never their values.
const GMAIL = [
  { name: 'GOOGLE_GMAIL_CLIENT_ID', note: 'Gmail API client used to send emails.' },
  { name: 'GOOGLE_GMAIL_CLIENT_SECRET', note: 'Gmail API client secret.' },
  { name: 'GOOGLE_GMAIL_REFRESH_TOKEN', note: 'Gmail API refresh token.' },
  { name: 'GOOGLE_GMAIL_SENDER_EMAIL', note: 'Mailbox the emails are sent from.' }
];
const GMAIL_TO = { name: 'GOOGLE_GMAIL_TO', note: 'Default recipients for notification emails (comma separated).', optional: true };

const moduleDocs = {
  'module-builder': {
    summary: 'Global ADMIN-only development registry, infrastructure records and individually confirmed GitHub/Render provisioning. Development applications never execute in Core.',
    legacyDatabase: { used: false, how: 'Registry metadata and operation history use Core. Each automatically provisioned development module gets its own Render PostgreSQL database.' },
    env: [
      { name: 'MODULE_BUILDER_GITHUB_OWNER', note: 'GitHub personal account or organisation for new private repositories; defaults to WHS-DTECH.', optional: true },
      { name: 'MODULE_BUILDER_GITHUB_TOKEN', note: 'Dedicated server-side token with repository creation and Contents/Workflows write permission. For personal repositories it must belong to the configured owner.', optional: true },
      { name: 'MODULE_BUILDER_RENDER_API_KEY', note: 'Dedicated Render API credential; never passed to development services.', optional: true },
      { name: 'MODULE_BUILDER_RENDER_OWNER_ID', note: 'Render workspace ID for development resources.', optional: true }
    ]
  },
  core: {
    summary: 'Google login, users, roles, permissions, modules and the shared Gmail sender. This is the framework itself, not a legacy site.',
    legacyDatabase: { used: false, how: 'No legacy database.' },
    env: [
      { name: 'DATABASE_URL', note: 'The unified WHS APPSystem Postgres database. All new data is saved here.' },
      { name: 'SESSION_SECRET', note: 'Signs login sessions.' },
      { name: 'GOOGLE_CLIENT_ID', note: 'Google sign-in client.' },
      { name: 'GOOGLE_CLIENT_SECRET', note: 'Google sign-in client secret.' },
      { name: 'APP_BASE_URL', note: 'Public address of this service.', optional: true },
      { name: 'GOOGLE_REDIRECT_URI', note: 'Overrides the Google sign-in callback address.', optional: true },
      { name: 'GOOGLE_HOSTED_DOMAIN', note: 'Limits sign-in to the school Google domain.', optional: true },
      { name: 'ADMIN_EMAILS', note: 'Emails given the ADMIN role.', optional: true },
      ...GMAIL.map((item) => ({ ...item, optional: true })),
      GMAIL_TO
    ]
  },
  'learning-sites': {
    summary: 'Legacy Learning Sites pages, Relief Planning and Learning Sites administration, using the legacy page files with Google login.',
    legacyDatabase: {
      used: true,
      how: 'One-time import. On start-up the legacy admin_term_requirements, admin_course_content and admin_course_content_activity tables are copied into the unified database (guard table learning_sites_legacy_import). After a successful copy the unified database is the only source; new data is never written to the legacy database. If the copy fails it retries on the next start.'
    },
    env: [
      { name: 'INTEGRATION_LEARNING_SITES_DATABASE_URL', note: 'Connection string of the legacy Learning Sites database. Needed for the import only.', legacy: true },
      { name: 'DATABASE_SSL', note: 'Set to false if the legacy database does not use SSL.', optional: true },
      { name: 'GOOGLE_DRIVE_SYNC_FOLDER_URL', note: 'Google Drive folder used by the content sync.', optional: true }
    ]
  },
  'kamar-uploader': {
    summary: 'Legacy Kamar Uploader site for Staff, Student and Timetable refreshes.',
    legacyDatabase: {
      used: true,
      how: 'One-time import of the Term 1-3 Kamar data (guard table kamar_legacy_import). New uploads are saved only in the unified database. If no Kamar-specific URL is set it falls back to the Learning Sites legacy URL. If the copy fails it retries on the next start.'
    },
    env: [
      { name: 'INTEGRATION_KAMAR_DATABASE_URL', note: 'Connection string of the legacy Kamar database. Falls back to INTEGRATION_LEARNING_SITES_DATABASE_URL.', legacy: true },
      { name: 'DATABASE_SSL', note: 'Set to false if the legacy database does not use SSL.', optional: true }
    ]
  },
  'technology-hub': {
    summary: 'Technology Hub homepage with assigned student and teacher discipline access.',
    legacyDatabase: { used: false, how: 'No legacy database. It uses the unified database only.' },
    env: []
  },
  'dtech-hub': {
    summary: 'Original DTECH-HUB pages, activities, practical licences, learning pathways, uploads and integrations; shared Google sessions and Core Administration roles.',
    legacyDatabase: {
      used: true,
      how: 'Live connection to the existing DTECH-DB: existing and new DTECH application data stay there. TeacherFiles are restored from the private WHS-TECHArchive repository; new lesson resource uploads are stored in DTECH-DB and restored into a disposable working cache after redeployment. The private CSV is never served as a web asset. No persistent Render disk is needed. Database backups are separate from GitHub.'
    },
    env: [
      { name: 'DTECH_DATABASE_URL', note: 'Existing DTECH-DB internal Render connection string. Must differ from DATABASE_URL.', legacy: true },
      { name: 'DTECH_DATABASE_SSL', note: 'Defaults to true; false only for a local database without TLS.', optional: true },
      { name: 'CLASS_TRAINING_DATABASE_URL', note: 'Required only for Commenting and Debugging Training: existing DTECH-CLASSWORK-DB2 internal connection string, separate from both Core and DTECH-DB. Original Flask pages inherit DTECH roles.', legacy: true, optional: true },
      { name: 'CLASS_TRAINING_CONTACT_EMAIL', note: 'Optional Contact Teacher recipient: school email of an existing teacher account in the training database. Messages use shared school Gmail.', optional: true },
      { name: 'GITHUB_ARCHIVE_REPOSITORY', note: 'Private WHS-DTECH/WHS-TECHArchive repository.' },
      { name: 'GITHUB_WRITER_APP_ID', note: 'Existing archive Writer App ID.' },
      { name: 'GITHUB_WRITER_PRIVATE_KEY_FILE', note: 'Existing Writer PEM secret-file path.' },
      { name: 'DTECH_ARCHIVE_COMMIT', note: 'Optional immutable commit of the TeacherFiles archive. Defaults to the archive default branch at initialization.', optional: true },
      ...GMAIL,
      { name: 'GITHUB_TOKEN', note: 'Existing DTECH GitHub analysis token, if private student repositories need it. Separate from the archive Writer App.', optional: true },
      { name: 'TRELLO_API_KEY', note: 'Existing DTECH Trello integration key.', optional: true },
      { name: 'EXTERNAL_EXAM_FORM_WEBHOOK_SECRET', note: 'Existing external exam form webhook secret.', optional: true }
    ]
  },
  'sewing-hub': {
    summary: 'Legacy Sewing and Textiles Hub with the activity library and activity suggestions.',
    legacyDatabase: {
      used: true,
      how: 'One-time import of the legacy Sewing Hub activities on start-up. Legacy suggestions missing required fields (activity name) are skipped. New activities and suggestions are saved only in the unified database.'
    },
    env: [
      { name: 'INTEGRATION_SEWING_HUB_DATABASE_URL', note: 'Connection string of the legacy Sewing Hub database. Needed for the import only.', legacy: true },
      ...GMAIL,
      GMAIL_TO,
      { name: 'SITE_URL', note: 'Public address used in email links.', optional: true }
    ]
  },
  workshop: {
    summary: 'Legacy Workshop Hub (Woodwork and Furniture activities) and its activity suggestions.',
    legacyDatabase: {
      used: true,
      how: 'One-time import of the legacy Workshop data on start-up. New data is saved only in the unified database. Suggestion emails are sent through the Gmail API with a [Workshop Hub] subject prefix.'
    },
    env: [
      { name: 'INTEGRATION_WORKSHOP_DATABASE_URL', note: 'Connection string of the legacy Workshop database. Needed for the import only.', legacy: true },
      ...GMAIL,
      GMAIL_TO,
      { name: 'SITE_URL', note: 'Public address used in email links.', optional: true }
    ]
  },
  'food-room': {
    summary: 'Legacy Food Room recipe calculator (recipes, bookings, shopping plans, orders, uploads and Google planner sync).',
    legacyDatabase: {
      used: true,
      how: 'One-time import of about 38 legacy tables, with their ids kept, into the food_room schema of the unified database (guard table food_room.food_room_legacy_import). The legacy planner sync history is limited to the latest 1,000 rows. After the import all reads and writes use the unified database. Emails go through the Gmail API with a [Food Room Hub] subject prefix.'
    },
    env: [
      { name: 'INTEGRATION_FOOD_ROOM_DATABASE_URL', note: 'Connection string of the legacy Food Room database. Needed for the import only.', legacy: true },
      ...GMAIL,
      { name: 'SUGGESTION_NOTIFY_TO', note: 'Who receives recipe suggestion emails.', optional: true },
      { name: 'GOOGLE_CREDENTIALS', note: 'Google service/OAuth credentials JSON for the planner sync.', optional: true },
      { name: 'GOOGLE_OAUTH_REDIRECT_URI', note: 'Must be https://whs-appsystem.onrender.com/food-room/google/oauth2callback (also set in Google Cloud).', optional: true },
      { name: 'GOOGLE_PLANNER_DOC_IDS', note: 'Google Docs planners that are synced.', optional: true },
      { name: 'GOOGLE_PLANNER_SYNC_CRON', note: 'Schedule for the planner sync.', optional: true },
      { name: 'GOOGLE_TOKEN_JSON', note: 'Saved Google authorisation token.', optional: true },
      { name: 'PLACE_ORDER_GOOGLE_FORM_URL', note: 'Place Order Google Form link.', optional: true },
      { name: 'PLACE_ORDER_GOOGLE_FORM_RESPONSES_CSV_URL', note: 'Place Order form responses (CSV).', optional: true },
      { name: 'PLACE_ORDER_GOOGLE_SHEET_CSV_URL', note: 'Place Order sheet (CSV).', optional: true },
      { name: 'PLACE_ORDER_PILOT_RECIPIENT', note: 'Recipient of the Tuesday order pilot email.', optional: true },
      { name: 'PLACE_ORDER_TUESDAY_CRON', note: 'Schedule for the Tuesday order email.', optional: true },
      { name: 'WEEKLY_DIGEST_CRON', note: 'Schedule for the weekly digest email.', optional: true },
      { name: 'SITE_URL', note: 'Public address used in email links.', optional: true }
    ]
  }
};

function describeModules(env = process.env) {
  const docs = {};
  for (const [key, doc] of Object.entries(moduleDocs)) {
    docs[key] = {
      ...doc,
      env: doc.env.map((item) => ({ ...item, isSet: Boolean(env[item.name]) }))
    };
  }
  return docs;
}

module.exports = { describeModules, moduleDocs };
