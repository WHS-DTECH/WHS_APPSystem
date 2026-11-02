const DEVELOPMENT_POLICY = Object.freeze({ region: 'oregon', servicePlan: '0.5c-512mb', databasePlan: '0.1c-256mb' });

function developmentPolicyError(settings) {
  if (settings.region !== DEVELOPMENT_POLICY.region ||
      !['starter', DEVELOPMENT_POLICY.servicePlan].includes(settings.servicePlan) ||
      !['basic_256mb', DEVELOPMENT_POLICY.databasePlan].includes(settings.databasePlan)) {
    return 'New development resources require Oregon, the lowest paid Web Service plan (0.5c-512mb) and database plan (0.1c-256mb). Save those settings before provisioning. Existing live resources will not be changed.';
  }
  return '';
}

module.exports = { DEVELOPMENT_POLICY, developmentPolicyError };
