const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const config = require('./config');
const { query } = require('./db');
const { syncKamarRoles } = require('./roleSync');

passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
  try {
    const result = await query(
      `SELECT users.*, COALESCE(array_agg(roles.name) FILTER (WHERE roles.name IS NOT NULL), '{}') AS roles
       FROM users
       LEFT JOIN user_roles ON user_roles.user_id = users.id
       LEFT JOIN roles ON roles.id = user_roles.role_id
       WHERE users.id = $1
       GROUP BY users.id`,
      [id]
    );

    done(null, result.rows[0] || false);
  } catch (error) {
    done(error);
  }
});

if (config.google.isConfigured) {
  passport.use(new GoogleStrategy({
    callbackURL: config.google.callbackUrl,
    clientID: config.google.clientId,
    clientSecret: config.google.clientSecret,
    passReqToCallback: false
  }, async (accessToken, refreshToken, profile, done) => {
    try {
      const email = profile.emails?.[0]?.value?.toLowerCase();

      if (!email) {
        return done(null, false, { message: 'Google account did not provide an email address.' });
      }

      if (config.google.hostedDomain && profile._json?.hd !== config.google.hostedDomain) {
        return done(null, false, { message: 'This Google account is not in the allowed school domain.' });
      }

      const userResult = await query(
        `INSERT INTO users (google_id, email, display_name, avatar_url, last_login_at)
         VALUES ($1, $2, $3, $4, NOW())
         ON CONFLICT (email)
         DO UPDATE SET
           google_id = EXCLUDED.google_id,
           display_name = EXCLUDED.display_name,
           avatar_url = EXCLUDED.avatar_url,
           last_login_at = NOW(),
           updated_at = NOW()
         RETURNING *`,
        [profile.id, email, profile.displayName, profile.photos?.[0]?.value || null]
      );

      const user = userResult.rows[0];

      await syncKamarRoles({ query }, user.id, email);

      if (config.adminEmails.includes(email)) {
        await query(
          `INSERT INTO user_roles (user_id, role_id, assignment_source)
           SELECT $1, id, 'system' FROM roles WHERE name = 'ADMIN'
           ON CONFLICT DO NOTHING`,
          [user.id]
        );
      }

      return done(null, user);
    } catch (error) {
      return done(error);
    }
  }));
}

module.exports = passport;
