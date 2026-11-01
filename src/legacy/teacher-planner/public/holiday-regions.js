(function (root) {
  'use strict';
  const regions = [
    'Auckland (includes Waikato, Bay of Plenty, Northland and Gisborne regions)',
    'Canterbury (South)', 'Canterbury', 'Chatham Islands', 'Hawke\u2019s Bay', 'Marlborough',
    'Nelson (includes Tasman and Buller regions)', 'Otago', 'Southland', 'Taranaki',
    'Wellington (includes Manawatu and Whanganui regions)', 'Westland'
  ];
  if (typeof module === 'object' && module.exports) module.exports = regions;
  else root.plannerHolidayRegions = regions;
})(globalThis);
