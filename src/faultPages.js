const { accessibleModules } = require('./moduleAccess');
const { appDestination } = require('./appAddresses');

const plannerPages = [
  ['cover', 'Planner cover'], ['year', 'Year overview'], ['term', 'Term plan'],
  ['week', 'Weekly planner'], ['goals', 'Goals and reflection'],
  ['setup', 'Setup My Planner'], ['assessmentSetup', 'Setup Assessment'], ['setup&setupTab=6', 'Two-Week Attendance'],
  ['attendance', 'Attendance'], ['moderation', 'Moderation'],
  ['standards', 'Teaching Standards'], ['learning', 'Professional learning']
];

async function faultModules(user, dbQuery) {
  const modules = await accessibleModules(user, dbQuery);
  const accountPages = [
    { name: 'Launchpad', url: '/launchpad' }, { name: 'Dashboard', url: '/dashboard' },
    { name: 'Profile', url: '/profile' }, { name: 'Report a fault', url: '/faults/new' },
    { name: 'My fault reports', url: '/faults' }
  ];
  if (user.roles?.includes('ADMIN')) accountPages.push({ name: 'Helpdesk', url: '/admin/helpdesk' });
  return [{ key: 'launchpad', name: 'Launchpad / school account', pages: accountPages },
    ...modules.map(module => {
      const destination = appDestination(module.path);
      const pages = [{ name: 'Module home', url: destination }];
      if (/^\/teacher-planner\/?$/.test(destination)) {
        pages.push(...plannerPages.map(([section, name]) => ({ name, url: '/teacher-planner/#section=' + section })));
      }
      if (module.module_key === 'core' && user.roles?.includes('ADMIN')) {
        pages.push(...[
          ['Administrator dashboard', '/admin'], ['Users', '/admin/users'],
          ['Teachers', '/admin/teachers'], ['Roles', '/admin/roles'],
          ['Hub access', '/admin/hub-access'], ['Modules', '/admin/modules'],
          ['Launchpad management', '/admin/launchpad'], ['Email Service', '/admin/emails'],
          ['Maintenance notifications', '/admin/maintenance-notifications'],
          ['School terms', '/admin/school-terms'], ['Infrastructure costs', '/admin/infrastructure-costs']
        ].map(([name, url]) => ({ name, url })));
      }
      if (/^\/module-builder\/?$/.test(destination)) pages.push({ name: 'New module', url: '/module-builder/new' });
      const mainPages = {
        '/dtech-hub': [
          ['This week', '/dtech-hub/#current-week'], ['Activity library', '/dtech-hub/#project-library'],
          ['Browse practicals', '/dtech-hub/browse-practicals.html'],
          ['Hapara submission', '/dtech-hub/hapara-submission.html']
        ],
        '/food-room': [
          ['Browse recipes', '/food-room/recipe_display.html'],
          ['Browse practicals', '/food-room/browse_practicals.html']
        ],
        '/sewing-hub': [['Browse activities', '/sewing-hub/index.html'], ['Suggest an activity', '/sewing-hub/suggest_activity.html']],
        '/workshop': [['Activity library', '/workshop/index.html'], ['Suggest an activity', '/workshop/suggest_activity.html']],
        '/admin/kamar-uploader': [
          ['Staff upload', '/admin/kamar-uploader/staff_upload.html'],
          ['Student upload', '/admin/kamar-uploader/student_upload.html'],
          ['Student details upload', '/admin/kamar-uploader/student_details_upload.html'],
          ['Timetable upload', '/admin/kamar-uploader/timetable_upload.html'],
          ['Departments', '/admin/kamar-uploader/departments.html']
        ]
      };
      pages.push(...(mainPages[destination.replace(/\/$/, '')] || []).map(([name, url]) => ({ name, url })));
      return { key: module.module_key, name: module.display_name, pages };
    })];
}

module.exports = { faultModules };
