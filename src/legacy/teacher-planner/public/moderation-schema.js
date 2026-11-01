(function (root) {
  'use strict';
  const yesNo = ['', 'Yes', 'No', 'Not applicable'];
  const grades = ['', 'N', 'A', 'M', 'E', 'Not assessed'];
  const sourceOptions = ['Commercial', 'Own', 'TKI', 'NZQA', 'Subject Association', 'Other'];
  const common = [
    ['title', 'Assessment / record title'], ['department', 'Faculty / Department'], ['subject', 'Subject'], ['course', 'Course Code'],
    ['teacher', 'Teacher in charge'],
    ['assessors', 'Assessor'], ['standardNumber', 'Standard number'],
    ['standardTitle', 'Standard title'], ['version', 'Version'], ['level', 'Level'],
    ['credits', 'Credits'], ['studentName', 'Student name (individual documents)'],
    ['studentId', 'Student ID (optional)']
  ];
  const critique = [
    ['moderatorReport', 'Current moderator report and clarification checked'],
    ['conditions', 'Conditions of assessment checked'],
    ['externalFeedback', 'External moderation feedback checked'],
    ['previousCritique', 'Unchanged standard / task previously critiqued'],
    ['context', 'Consistent with explanatory notes, context and curriculum level'],
    ['allGrades', 'Allows all requirements and available grades'],
    ['scheduleConsistent', 'Schedule consistent with standard and clarification'],
    ['instructionsConsistent', 'Instructions consistent with explanatory notes / ranges'],
    ['judgements', 'Judgement / sufficiency statements describe each grade'],
    ['evidenceStatements', 'Evidence statements include acceptable answers and grade examples'],
    ['clearInstructions', 'Student instructions clear and appropriate'],
    ['standardDetails', 'Standard number, version, title, level and credits checked']
  ];
  const documents = {
    internal: {
      title: 'Internal Moderation Cover Sheet',
      description: 'Assessment setup, critique, verification, strategic samples and post-results review.',
      groups: [
        ['A. Assessment setup', [['consent', 'School has consent to assess', yesNo],
          ['sourceTypes', 'Source of materials', { checks: sourceOptions }], ['source', 'Source of assessment materials', 'area']]],
        ['B. Pre-assessment critique', [...critique.map(([key, label]) => [key, label, yesNo]),
          ['moderatorReportLink', 'Moderator report / clarification reference link', 'url', 'moderatorReport'],
          ['conditionsLink', 'Conditions / assessment specifications reference link', 'url', 'conditions'],
          ['externalFeedbackLink', 'External moderation feedback reference link', 'url', 'externalFeedback'],
          ['previousCritiqueLink', 'Previous critique reference link', 'url', 'previousCritique'],
          ['critiqueName', "Critiquer's name"], ['critiqueSchool', "Critiquer's school"], ['critiqueDate', 'Critique date', 'date']]],
        ['C. Verify teacher judgements', [['verifierName', 'Verifier name'], ['verifierSchool', 'Verifier school'],
          ['verifierPosition', 'Verifier position'], ['verificationDate', 'Verification date', 'date'],
          ['verificationEvidence', 'Location / evidence of verification', 'area'],
          ['signatory', 'Person sighting critique and verification (record only)'], ['signatoryPosition', 'Position'],
          ['signatoryDate', 'Date sighted', 'date']]],
        ['D. Results, retention and review', [['resultsLoaded', 'Results loaded into student management system', yesNo],
          ['resultsDate', 'Date loaded into KAMAR / SMS', 'date'], ['retained', 'Materials and student work retained', yesNo],
          ['retentionLocation', 'Location / file path', 'area'], ['randomSelection', 'Random selection procedure used (if required)', yesNo],
          ['reviewed', 'Materials reviewed following feedback', yesNo], ['benchmarks', 'Benchmarks / boundary decisions updated', yesNo]]]
      ],
      rows: {
        key: 'samples', title: 'Strategic selection of work for verification',
        metadata: [['markingScheduleRecord', 'Individual marking schedule record', 'uuid']],
        fields: [['student', 'Student name / identifier'], ['markerGrade', 'Marker grade', grades],
          ['verifierGrade', 'Verifier grade', grades], ['moderatedDate', 'Date moderated', 'date'],
          ['reportedGrade', 'Reported grade', grades], ['reportedDate', 'Date reported in KAMAR', 'date'],
          ['comments', 'Discussion / evidence location', 'area']]
      }
    },
    schedule: {
      title: 'Marking Schedule',
      description: 'Assessment instructions, grade criteria, evidence, judgements and marker comments.',
      groups: [
        ['Assessment instructions', [
          ['assessmentInstructionsLink', 'Assessment Instructions & Schedule', 'drive'],
          ['topicBriefLink', 'Topic Brief', 'drive'],
          ['documentationSubmissionLink', 'Documentation Submission', 'drive'],
          ['fileSubmissionLink', 'File Submission', 'drive'],
          ['tourReportLink', 'Task 2 - Tour Report', 'drive'],
          ['instructions', 'Instructions / topic brief', 'area'], ['submissions', 'Documentation / file submissions', 'area']]],
        ['Standard', [['achieved', 'Achieved Grade Criteria', 'area'], ['merit', 'Merit standard (if available)', 'area'],
          ['excellence', 'Excellence standard (if available)', 'area']]],
        ['Marking decision', [['grade', 'Overall grade', grades], ['markerComments', 'Marker comments', 'area']]]
      ],
      rows: {
        key: 'requirements', title: 'Key requirements, evidence and judgement',
        fields: [['requirement', 'Key requirement', 'area'], ['grade', 'Grade met', grades],
          ['evidence', 'Evidence considered / supporting links', 'area'], ['judgement', 'How the judgement was made', 'area']]
      }
    },
    feedback: {
      title: 'Marking Confirmation & Feedback',
      description: 'Confirm the student, standard details and assessed grade, with links to their marking schedule and coversheet.',
      groups: [['Result and feedback', [['grade', 'Assessed grade', grades], ['feedback', 'Feedback to student', 'area'],
        ['contactEmail', 'Teacher contact email'], ['instructions', 'Next steps / coversheet instructions', 'area'],
        ['markingScheduleLink', 'Marking Schedule', 'drive'], ['coversheetLink', 'Cover Sheet', 'drive']]]]
    },
    coversheet: {
      title: 'WHS Coversheet',
      description: 'Authenticity declaration, result acknowledgement and appeal details.',
      groups: [
        ['Authenticity declaration', [['signatureName', 'Name recorded for authenticity declaration (not a digital signature)'],
          ['signatureDate', 'Declaration date', 'date']]],
        ['Result acknowledgement', [['achieved', 'Achievement criteria', 'area'], ['higherGrades', 'Merit / Excellence availability or criteria', 'area'],
          ['grade', 'Overall level of performance', grades], ['acknowledgedDate', 'Date result received / acknowledged', 'date']]],
        ['Appeal', [['appeal', 'Student wishes to appeal', yesNo], ['feedbackReceived', 'Feedback and grade notification received', yesNo],
          ['headReview', 'Head of Learning Area review requested / process explained', yesNo], ['appealReasons', 'Reasons for appeal', 'area']]]
      ]
    }
  };
  function documentResource(value) {
    if (typeof value !== 'string' || value.length > 500 || /[\r\n]/.test(value)) return undefined;
    const separator = value.lastIndexOf(' | ');
    if (separator < 1) return undefined;
    try {
      const url = new URL(value.slice(separator + 3));
      if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) return undefined;
      return { name: value.slice(0, separator), url: url.href };
    } catch { return undefined; }
  }
  function sourceScheduleLinks(source) {
    const links = {};
    for (const line of String(source || '').split('\n')) {
      const value = line.trim();
      const resource = documentResource(value);
      if (!resource) continue;
      const key = /\btopic[\s_-]+brief\b/i.test(resource.name) ? 'topicBriefLink' : 'assessmentInstructionsLink';
      if (!links[key]) links[key] = value;
    }
    return links;
  }
  function documentResources(value) {
    if (typeof value !== 'string' || value.length > 8000) return undefined;
    if (!value) return [];
    const resources = value.split('\n').map(documentResource);
    return resources.every(Boolean) ? resources : undefined;
  }
  function internalFieldValue(key, value) {
    if (typeof value !== 'string') return value;
    const labels = {
      critiqueName: ["Critiquer's name", 'Critiquer name', "Critique's name", 'Critique name'],
      critiqueSchool: ['School', 'Critiquer school', "Critiquer's school", "Critique's school"],
      verifierName: ['Verifier name'], verifierSchool: ['School', 'Verifier school'],
      verifierPosition: ['Position', 'Verifier position'],
      verificationEvidence: ['Evidence / location of verification', 'Location / evidence of verification'],
      signatory: ['Sighted by (record only)', 'Signed'], signatoryPosition: ['Position'],
      retentionLocation: ['Location / file path', 'Location or file path'],
      source: ['Source of materials', 'Source of assessment materials']
    };
    const aliases = labels[key];
    if (!aliases) return value;
    let result = value;
    while (true) {
      const trimmed = result.trim();
      const normalized = trimmed.replace(/[\u2018\u2019]/g, "'").toLowerCase();
      const label = aliases.find(label => normalized.startsWith(label.toLowerCase() + ':'));
      if (!label) return result;
      result = trimmed.slice(label.length + 1).trim();
    }
  }
  function isSchedulePlaceholder(row) {
    const normalize = value => String(value || '').replace(/[\u200B-\u200D\uFEFF]/g, '').trim().toLowerCase()
      .replace(/\s+/g, ' ').replace(/[.:\s]+$/, '');
    return normalize(row.requirement) === 'key requirements (list)' &&
      !normalize(row.grade) &&
      ['', 'describe or attach the evidence considered'].includes(normalize(row.evidence)) &&
      ['', 'explain how the judgement was made'].includes(normalize(row.judgement)) &&
      Object.keys(row).every(key => ['requirement', 'grade', 'evidence', 'judgement'].includes(key));
  }
  const schema = { common, documents, critique, grades, yesNo, sourceOptions, documentResource, documentResources, sourceScheduleLinks, internalFieldValue, isSchedulePlaceholder };
  if (typeof module === 'object' && module.exports) module.exports = schema;
  else root.plannerModerationSchema = schema;
})(globalThis);
