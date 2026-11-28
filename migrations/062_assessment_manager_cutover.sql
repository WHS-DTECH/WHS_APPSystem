-- Move only the verified standalone destination; retain customised destinations and assignments.
UPDATE modules SET path = '/whs-assessment-manager/'
WHERE module_key = 'whs-assessment-manager'
  AND rtrim(path, '/') = 'https://whs-assessment-manager-development.onrender.com';
