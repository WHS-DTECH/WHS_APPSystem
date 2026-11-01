const { query } = require('./db');

let initPromise;

function init() {
  if (!initPromise) {
    // Validate the existing schema without creating, importing or replacing records.
    initPromise = Promise.resolve().then(() => Promise.all([
      query('SELECT id,code,first_name,last_name,email_school,status,upload_year,upload_term,upload_date FROM staff_upload LIMIT 0'),
      query('SELECT id,id_number,first_name,last_name,email_school,status,timetable_class,upload_year,upload_term,upload_date FROM student_details_upload LIMIT 0'),
      query('SELECT id,id_number,student_name,email_school,status,mon_p1_1,upload_year,upload_term,upload_date FROM student_upload LIMIT 0'),
      query('SELECT teacher,teacher_name,data,status,upload_year,upload_term,upload_date FROM timetable_upload LIMIT 0'),
      query('SELECT id,site_name,site_url,created_by,created_at,updated_at FROM app_project_links LIMIT 0')
    ])).catch(error => {
      initPromise = null;
      throw error;
    });
  }
  return initPromise;
}

module.exports = { init };
