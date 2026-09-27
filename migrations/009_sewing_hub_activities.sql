CREATE TABLE IF NOT EXISTS activities (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL UNIQUE,
  year_level VARCHAR(20) NOT NULL,
  type VARCHAR(50) NOT NULL,
  activity_category VARCHAR(20) NOT NULL DEFAULT 'Practice'
    CHECK (activity_category IN ('Practice', 'Assessment', 'Skill', 'URL Idea')),
  duration_hours NUMERIC(4,1) NOT NULL,
  difficulty VARCHAR(20) NOT NULL
    CHECK (difficulty IN ('Beginner', 'Intermediate', 'Advanced')),
  description TEXT,
  outcome_image_url TEXT,
  idea_url TEXT,
  resources TEXT,
  equipment TEXT,
  instructions TEXT,
  class_management_notes TEXT,
  class_preparation TEXT,
  assessment_focus TEXT,
  hub_site VARCHAR(100) NOT NULL DEFAULT 'UNSCOPED',
  color VARCHAR(30) NOT NULL DEFAULT 'color-rose',
  is_this_week BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_activities_hub_site ON activities (hub_site);

INSERT INTO activities
  (name, year_level, type, activity_category, duration_hours, difficulty, description, color, is_this_week, hub_site)
VALUES
  ('Hand Stitching Sampler', 'Year 9', 'Hand Sewing', 'Skill', 2, 'Beginner', 'Practice running stitch, backstitch, and whip stitch on a fabric sampler card to build core hand sewing skills.', 'color-rose', FALSE, 'SEWING-HUB'),
  ('Zippered Pouch', 'Year 10', 'Machine Sewing', 'Skill', 3, 'Intermediate', 'Cut, pin, and machine sew a lined zippered pouch using a metal zip and coordinating fabric.', 'color-teal', FALSE, 'SEWING-HUB'),
  ('Embroidery Hoop Art', 'Year 11', 'Embroidery', 'Skill', 2, 'Beginner', 'Transfer a design onto fabric and complete it using satin stitch, stem stitch, and French knots.', 'color-sage', FALSE, 'SEWING-HUB'),
  ('Drawstring Bag', 'Year 9', 'Machine Sewing', 'Skill', 2, 'Beginner', 'Sew a simple drawstring bag with a casing channel and learn to thread and tie off cord ends neatly.', 'color-lavender', FALSE, 'SEWING-HUB'),
  ('French Seam Cushion', 'Year 11', 'Construction', 'Skill', 4, 'Advanced', 'Construct a cushion cover using French seams for a clean finish, including an envelope back opening.', 'color-coral', FALSE, 'SEWING-HUB'),
  ('Bias Binding Apron', 'Year 12', 'Finishing', 'Skill', 3, 'Advanced', 'Cut and apply bias binding to finish all raw edges of a half apron and attach neatly mitered corners.', 'color-gold', FALSE, 'SEWING-HUB'),
  ('Tote Bag', 'Year 9', 'Machine Sewing', 'Skill', 2, 'Beginner', 'Sew a sturdy canvas tote bag with reinforced handles and a boxed base corner.', 'color-teal', FALSE, 'SEWING-HUB'),
  ('Patch Pocket Attachment', 'Year 10', 'Construction', 'Skill', 1, 'Beginner', 'Cut, press, and topstitch a neat patch pocket onto a garment piece with even seam allowances.', 'color-rose', FALSE, 'SEWING-HUB'),
  ('Elasticated Waistband', 'Year 10', 'Construction', 'Skill', 2, 'Intermediate', 'Fold, stitch, and thread elastic through a casing to create a comfortable fitted waistband.', 'color-lavender', FALSE, 'SEWING-HUB'),
  ('Cross Stitch Bookmark', 'Year 9', 'Embroidery', 'Skill', 1, 'Beginner', 'Complete a simple counted cross stitch pattern on Aida cloth and finish with a tassel.', 'color-sage', FALSE, 'SEWING-HUB'),
  ('Simple Skirt from Pattern', 'Year 11', 'Pattern Making', 'Skill', 5, 'Intermediate', 'Read and cut a commercial pattern, adjust for fit, and sew a basic A-line skirt.', 'color-coral', FALSE, 'SEWING-HUB'),
  ('Flat-Felled Seam Practice', 'Year 12', 'Finishing', 'Skill', 1, 'Advanced', 'Create strong, decorative flat-felled seams used in jeans and workwear construction.', 'color-gold', FALSE, 'SEWING-HUB'),
  ('Button & Buttonhole', 'Year 10', 'Hand Sewing', 'Skill', 1, 'Intermediate', 'Sew on buttons with a shank and use the machine buttonhole foot to create neat, even buttonholes.', 'color-rose', FALSE, 'SEWING-HUB'),
  ('Invisible Zip Insertion', 'Year 12', 'Construction', 'Skill', 2, 'Advanced', 'Install an invisible zip into a seam using a specialist foot for a professional, hidden closure.', 'color-lavender', FALSE, 'SEWING-HUB')
ON CONFLICT (name) DO NOTHING;
