CREATE TABLE launchpad_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 100),
  url TEXT NOT NULL,
  description TEXT NOT NULL CHECK (length(description) BETWEEN 1 AND 500),
  icon TEXT NOT NULL DEFAULT 'hub'
    CHECK (icon IN ('learning','hub','planner','guidance','international','bus')),
  sort_order INTEGER NOT NULL DEFAULT 0 CHECK (sort_order BETWEEN 0 AND 9999),
  is_visible BOOLEAN NOT NULL DEFAULT true,
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO launchpad_links (title,url,description,icon,sort_order) VALUES
  ('WHS Learning Sites','https://whs-appsystem.onrender.com/learning-sites',
   'Explore course information, learning resources and assessment information.','learning',10),
  ('Hub Dashboard','https://whs-appsystem.onrender.com/technology-hub/',
   'Find the school''s technology hubs and access your subject tools and activities.','hub',20),
  ('Teacher Planner','https://teacher-planner-development.onrender.com',
   'Open your teacher planning workspace and organise your teaching schedule.','planner',30),
  ('Guidance Counsellor App','https://whs-appsystem.onrender.com/apps/guidance-counsellor-app/',
   'Open the guidance counselling workspace. Access is restricted to authorised users.','guidance',40),
  ('International App','https://whs-international.onrender.com',
   'Access the school''s international programme app and its services.','international',50),
  ('Bus Controller App','https://whs-buscontroller.onrender.com',
   'Open the school''s bus management and transport tools.','bus',60);
