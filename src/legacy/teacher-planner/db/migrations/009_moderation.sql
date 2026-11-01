ALTER TABLE planner_sections DROP CONSTRAINT planner_sections_section_check;
ALTER TABLE planner_sections ADD CONSTRAINT planner_sections_section_check
  CHECK (section IN ('week','year','term','goals','standards','learning','period','assessmentSetup','moderation'));
