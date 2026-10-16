-- Food Room (legacy recipeCalculator) tables, kept in their own schema so names like
-- classes, permissions and staff_upload never clash with the app or Kamar tables.
CREATE SCHEMA IF NOT EXISTS food_room;

CREATE TABLE IF NOT EXISTS food_room.aisle_category (
    id integer NOT NULL,
    name text NOT NULL,
    sort_order integer DEFAULT 0,
    master_category text
);

CREATE TABLE IF NOT EXISTS food_room.aisle_keywords (
    id integer NOT NULL,
    aisle_category_id integer,
    keyword text NOT NULL
);

CREATE TABLE IF NOT EXISTS food_room.aisle_master_keyword_categories (
    master_keyword_id integer NOT NULL,
    aisle_category_id integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS food_room.aisle_master_keyword_members (
    id integer NOT NULL,
    master_keyword_id integer NOT NULL,
    keyword text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS food_room.aisle_master_keywords (
    id integer NOT NULL,
    name text NOT NULL,
    aisle_category_id integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS food_room.booking_recipes (
    id integer NOT NULL,
    booking_id integer NOT NULL,
    recipe_id integer NOT NULL,
    linked_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS food_room.booking_slot_assignments (
    id integer NOT NULL,
    booking_id integer NOT NULL,
    slot_number integer NOT NULL,
    seat_index integer NOT NULL,
    student_id_number text NOT NULL,
    student_name text,
    form_class text,
    year_level text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS food_room.booking_slot_lists (
    id integer NOT NULL,
    booking_id integer NOT NULL,
    max_slots integer DEFAULT 24 NOT NULL,
    allow_pairs boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS food_room.bookings (
    id integer NOT NULL,
    staff_id text,
    staff_name text,
    class_name text,
    booking_date text,
    period text,
    recipe text,
    class_size integer,
    recipe_id text,
    recipe_url text DEFAULT ''::text,
    planner_stream text DEFAULT 'Middle'::text,
    cook_mode text,
    partner_student_name text,
    partner_student_id text,
    groups integer,
    source_document_id text,
    source_document_title text,
    source_document_revision_id text,
    source_document_synced_at timestamp with time zone
);

CREATE TABLE IF NOT EXISTS food_room.class_upload (
    id integer NOT NULL,
    code text,
    year text,
    class_name text,
    year_level text,
    department text,
    notes text,
    teacher_code text,
    extra1 text,
    extra2 text,
    status text DEFAULT 'Current'::text,
    upload_year integer,
    upload_term text,
    upload_date date
);

CREATE TABLE IF NOT EXISTS food_room.classes (
    id integer NOT NULL,
    ttcode text,
    level text,
    name text,
    qualification text,
    department text,
    sub_department text,
    teacher_in_charge text,
    description text,
    star text
);

CREATE TABLE IF NOT EXISTS food_room.department (
    id integer NOT NULL,
    staff_name text,
    staff_email text,
    department text,
    classes text,
    code text,
    last_name text,
    first_name text,
    title text,
    departments_comma text
);

CREATE TABLE IF NOT EXISTS food_room.desired_servings_ingredients (
    id integer NOT NULL,
    booking_id integer,
    teacher text,
    class_name text,
    class_date text,
    class_size integer,
    groups integer,
    desired_servings integer,
    ingredient_id integer,
    ingredient_name text,
    measure_qty text,
    measure_unit text,
    fooditem text,
    calculated_qty text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    recipe_id integer,
    staff_id integer,
    stripfooditem text,
    aisle_category_id integer
);

CREATE TABLE IF NOT EXISTS food_room.food_brands (
    id integer NOT NULL,
    brand_name text NOT NULL
);

CREATE TABLE IF NOT EXISTS food_room.google_oauth_tokens (
    id smallint NOT NULL,
    token_json text NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS food_room.google_planner_sync_history (
    id bigint NOT NULL,
    ran_at timestamp with time zone DEFAULT now() NOT NULL,
    trigger_source text DEFAULT 'manual'::text NOT NULL,
    document_id text,
    document_title text,
    parsed_rows integer DEFAULT 0 NOT NULL,
    inserted_rows integer DEFAULT 0 NOT NULL,
    skipped boolean DEFAULT false NOT NULL,
    success boolean DEFAULT true NOT NULL,
    error_message text
);

CREATE TABLE IF NOT EXISTS food_room.ingredients_inventory (
    id integer NOT NULL,
    ingredient_name text NOT NULL,
    recipe_id integer,
    quantity text,
    measure_qty real,
    measure_unit text,
    fooditem text,
    aisle_category_id integer,
    stripfooditem text
);

CREATE TABLE IF NOT EXISTS food_room.kamar_timetable (
    "Teacher" text,
    "Teacher_Name" text,
    "Form_Class" text,
    "D1_P1_1" text,
    "D1_P1_2" text,
    "D1_P2" text,
    "D1_I" text,
    "D1_P3" text,
    "D1_P4" text,
    "D1_L" text,
    "D1_P5" text,
    "D1_blank_1" text,
    "D1_blank_2" text,
    "D2_P1_1" text,
    "D2_P1_2" text,
    "D2_P2" text,
    "D2_I" text,
    "D2_P3" text,
    "D2_P4" text,
    "D2_L" text,
    "D2_P5" text,
    "D2_blank_1" text,
    "D2_blank_2" text,
    "D3_P1_1" text,
    "D3_P1_2" text,
    "D3_P2" text,
    "D3_I" text,
    "D3_P3" text,
    "D3_P4" text,
    "D3_L" text,
    "D3_P5" text,
    "D3_blank_1" text,
    "D3_blank_2" text,
    "D4_P1_1" text,
    "D4_P1_2" text,
    "D4_P2" text,
    "D4_I" text,
    "D4_P3" text,
    "D4_P4" text,
    "D4_L" text,
    "D4_P5" text,
    "D4_blank_1" text,
    "D4_blank_2" text,
    "D5_P1_1" text,
    "D5_P1_2" text,
    "D5_P2" text,
    "D5_I" text,
    "D5_P3" text,
    "D5_P4" text,
    "D5_L" text,
    "D5_P5" text,
    "D5_blank_1" text,
    "D5_blank_2" text,
    status text DEFAULT 'Current'::text
);

CREATE TABLE IF NOT EXISTS food_room.mfood_class_students (
    id integer NOT NULL,
    class_code text NOT NULL,
    student_id text NOT NULL,
    last_name text,
    first_name text,
    gender text,
    level text,
    tutor text,
    timetable_class text,
    upload_year integer,
    upload_term text,
    upload_date date,
    status text DEFAULT 'Current'::text,
    updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS food_room.planner_upload_history (
    id integer NOT NULL,
    file_name text,
    uploaded_by_email text,
    uploaded_by_name text,
    uploaded_by_staff_code text,
    planner_stream text,
    bookings_saved integer DEFAULT 0,
    uploaded_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS food_room.recipe_display (
    id integer NOT NULL,
    name text,
    description text,
    ingredients text,
    serving_size integer,
    url text,
    instructions text,
    recipeid integer,
    image_url text,
    ft_images text,
    ft_primary_slot integer
);

CREATE TABLE IF NOT EXISTS food_room.recipe_subscriptions (
    id integer NOT NULL,
    user_email character varying(255) NOT NULL,
    user_name character varying(255),
    user_type character varying(50),
    is_subscribed boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    calendar_change_subscribed boolean DEFAULT false
);

CREATE TABLE IF NOT EXISTS food_room.recipes (
    id integer NOT NULL,
    uploaded_recipe_id integer,
    name text,
    description text,
    ingredients text,
    serving_size integer,
    url text,
    instructions text,
    instructions_extracted text,
    ingredients_display text,
    extracted_ingredients text,
    extracted_serving_size text,
    extracted_instructions text,
    instructions_display text,
    adjusted_from_id integer,
    created_by_email text,
    created_by_name text,
    student_name text,
    submitted_channel text,
    moderation_status text,
    moderation_comment text,
    moderation_updated_at timestamp with time zone,
    moderated_by_email text,
    moderated_by_name text,
    moderation_email_sent_at timestamp with time zone,
    ft_images text,
    ft_primary_slot integer,
    uploaded_by_email text,
    uploaded_by_name text,
    used_in_terms text,
    used_in_years integer[],
    used_in_year_levels text[],
    uploaded_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    verified_date timestamp without time zone,
    ingredients_issue_flag boolean DEFAULT false NOT NULL,
    ingredients_issue_note text,
    ingredients_issue_updated_at timestamp with time zone
);

CREATE TABLE IF NOT EXISTS food_room.role_permissions (
    id integer NOT NULL,
    role_name character varying(50) NOT NULL,
    recipes boolean DEFAULT false,
    add_recipes boolean DEFAULT false,
    inventory boolean DEFAULT false,
    shopping boolean DEFAULT false,
    booking boolean DEFAULT false,
    admin boolean DEFAULT false,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    planning boolean DEFAULT false,
    food_truck boolean DEFAULT false,
    ft_teacher boolean DEFAULT false,
    role character varying(100),
    page character varying(100),
    allowed boolean DEFAULT true
);

CREATE TABLE IF NOT EXISTS food_room.saved_shopping_lists (
    id integer NOT NULL,
    title text DEFAULT 'Shopping List'::text NOT NULL,
    week_info text DEFAULT ''::text NOT NULL,
    source_filename text DEFAULT ''::text NOT NULL,
    parsed_state jsonb NOT NULL,
    created_by_email text DEFAULT ''::text NOT NULL,
    created_by_name text DEFAULT ''::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS food_room.session (
    sid character varying NOT NULL,
    sess json NOT NULL,
    expire timestamp(6) without time zone NOT NULL
);

CREATE TABLE IF NOT EXISTS food_room.shopping_extras (
    id integer NOT NULL,
    is_standing boolean DEFAULT false NOT NULL,
    week_date date,
    category text DEFAULT 'Other'::text NOT NULL,
    item_text text NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_by_email text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS food_room.shopping_lists (
    id integer NOT NULL,
    class_id integer,
    created_at text
);

CREATE TABLE IF NOT EXISTS food_room.shopping_plan (
    id integer NOT NULL,
    week_ending date NOT NULL,
    status text DEFAULT 'draft'::text NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    created_by text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    finalized_by text,
    finalized_at timestamp with time zone,
    notes text,
    CONSTRAINT shopping_plan_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'finalized'::text])))
);

CREATE TABLE IF NOT EXISTS food_room.shopping_plan_classes (
    id integer NOT NULL,
    plan_id integer NOT NULL,
    booking_id integer,
    class_name text NOT NULL,
    teacher_name text,
    recipe_id integer,
    planned_servings integer,
    included boolean DEFAULT true NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL
);

CREATE TABLE IF NOT EXISTS food_room.shopping_plan_item_audit (
    id integer NOT NULL,
    plan_item_id integer NOT NULL,
    field_name text NOT NULL,
    old_value text,
    new_value text,
    reason text,
    changed_by text NOT NULL,
    changed_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS food_room.shopping_plan_items (
    id integer NOT NULL,
    plan_id integer NOT NULL,
    category text DEFAULT 'Uncategorised'::text NOT NULL,
    item_name text NOT NULL,
    normalized_item_key text,
    base_unit text,
    calculated_qty numeric(10,4),
    teacher_qty numeric(10,4),
    final_qty numeric(10,4),
    source_type text,
    source_detail_json jsonb,
    notes text,
    sort_order integer DEFAULT 0 NOT NULL,
    edited_by text,
    edited_at timestamp with time zone,
    sub_aisle text
);

CREATE TABLE IF NOT EXISTS food_room.staff_upload (
    id integer NOT NULL,
    code text,
    last_name text,
    first_name text,
    title text,
    email_school text,
    status text DEFAULT 'Current'::text,
    primary_role text DEFAULT 'staff'::text,
    upload_year integer,
    upload_term text,
    upload_date date
);

CREATE TABLE IF NOT EXISTS food_room.staff_upload_history (
    id integer NOT NULL,
    email_school text NOT NULL,
    code text,
    first_name text,
    last_name text,
    title text,
    status_snapshot text DEFAULT 'Current'::text,
    upload_year integer,
    upload_term text,
    upload_date date,
    source text DEFAULT 'upload'::text,
    recorded_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS food_room.student_timetable (
    id integer NOT NULL,
    student_name text,
    id_number text,
    form_class text,
    year_level text,
    mon_p1_1 text,
    mon_p1_2 text,
    mon_p2 text,
    mon_i text,
    mon_p3 text,
    mon_p4 text,
    mon_l text,
    mon_p5 text,
    tue_p1_1 text,
    tue_p1_2 text,
    tue_p2 text,
    tue_i text,
    tue_p3 text,
    tue_p4 text,
    tue_l text,
    tue_p5 text,
    wed_p1_1 text,
    wed_p1_2 text,
    wed_p2 text,
    wed_i text,
    wed_p3 text,
    wed_p4 text,
    wed_l text,
    wed_p5 text,
    thu_p1_1 text,
    thu_p1_2 text,
    thu_p2 text,
    thu_i text,
    thu_p3 text,
    thu_p4 text,
    thu_l text,
    thu_p5 text,
    fri_p1_1 text,
    fri_p1_2 text,
    fri_p2 text,
    fri_i text,
    fri_p3 text,
    fri_p4 text,
    fri_l text,
    fri_p5 text,
    status text DEFAULT 'Current'::text,
    primary_role text DEFAULT 'student'::text,
    upload_year integer,
    upload_term text,
    upload_date date
);

CREATE TABLE IF NOT EXISTS food_room.subscription_notifications (
    id integer NOT NULL,
    recipe_id integer,
    recipe_name character varying(255),
    recipient_email character varying(255),
    sent_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    status character varying(50) DEFAULT 'pending'::character varying
);

CREATE TABLE IF NOT EXISTS food_room.suggestions (
    id integer NOT NULL,
    date text,
    recipe_name text,
    suggested_by text,
    email text,
    url text,
    reason text
);

CREATE TABLE IF NOT EXISTS food_room.uploads (
    id integer NOT NULL,
    recipe_title text NOT NULL,
    upload_type text,
    source_url text,
    uploaded_by text,
    upload_date text,
    raw_data text
);

CREATE TABLE IF NOT EXISTS food_room.user_additional_roles (
    id integer NOT NULL,
    email text NOT NULL,
    role_name character varying(50) NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    user_type text DEFAULT 'staff'::text
);

CREATE SEQUENCE IF NOT EXISTS food_room.aisle_category_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
CREATE SEQUENCE IF NOT EXISTS food_room.aisle_keywords_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
CREATE SEQUENCE IF NOT EXISTS food_room.aisle_master_keyword_members_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
CREATE SEQUENCE IF NOT EXISTS food_room.aisle_master_keywords_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
CREATE SEQUENCE IF NOT EXISTS food_room.booking_recipes_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
CREATE SEQUENCE IF NOT EXISTS food_room.booking_slot_assignments_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
CREATE SEQUENCE IF NOT EXISTS food_room.booking_slot_lists_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
CREATE SEQUENCE IF NOT EXISTS food_room.bookings_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
CREATE SEQUENCE IF NOT EXISTS food_room.class_upload_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
CREATE SEQUENCE IF NOT EXISTS food_room.classes_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
CREATE SEQUENCE IF NOT EXISTS food_room.department_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
CREATE SEQUENCE IF NOT EXISTS food_room.desired_servings_ingredients_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
CREATE SEQUENCE IF NOT EXISTS food_room.food_brands_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
CREATE SEQUENCE IF NOT EXISTS food_room.google_planner_sync_history_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
CREATE SEQUENCE IF NOT EXISTS food_room.ingredients_inventory_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
CREATE SEQUENCE IF NOT EXISTS food_room.mfood_class_students_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
CREATE SEQUENCE IF NOT EXISTS food_room.planner_upload_history_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
CREATE SEQUENCE IF NOT EXISTS food_room.recipe_display_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
CREATE SEQUENCE IF NOT EXISTS food_room.recipe_subscriptions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
CREATE SEQUENCE IF NOT EXISTS food_room.recipes_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
CREATE SEQUENCE IF NOT EXISTS food_room.role_permissions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
CREATE SEQUENCE IF NOT EXISTS food_room.saved_shopping_lists_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
CREATE SEQUENCE IF NOT EXISTS food_room.shopping_extras_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
CREATE SEQUENCE IF NOT EXISTS food_room.shopping_lists_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
CREATE SEQUENCE IF NOT EXISTS food_room.shopping_plan_classes_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
CREATE SEQUENCE IF NOT EXISTS food_room.shopping_plan_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
CREATE SEQUENCE IF NOT EXISTS food_room.shopping_plan_item_audit_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
CREATE SEQUENCE IF NOT EXISTS food_room.shopping_plan_items_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
CREATE SEQUENCE IF NOT EXISTS food_room.staff_upload_history_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
CREATE SEQUENCE IF NOT EXISTS food_room.staff_upload_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
CREATE SEQUENCE IF NOT EXISTS food_room.student_timetable_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
CREATE SEQUENCE IF NOT EXISTS food_room.subscription_notifications_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
CREATE SEQUENCE IF NOT EXISTS food_room.suggestions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
CREATE SEQUENCE IF NOT EXISTS food_room.uploads_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
CREATE SEQUENCE IF NOT EXISTS food_room.user_additional_roles_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE food_room.aisle_category_id_seq OWNED BY food_room.aisle_category.id;
ALTER SEQUENCE food_room.aisle_keywords_id_seq OWNED BY food_room.aisle_keywords.id;
ALTER SEQUENCE food_room.aisle_master_keyword_members_id_seq OWNED BY food_room.aisle_master_keyword_members.id;
ALTER SEQUENCE food_room.aisle_master_keywords_id_seq OWNED BY food_room.aisle_master_keywords.id;
ALTER SEQUENCE food_room.booking_recipes_id_seq OWNED BY food_room.booking_recipes.id;
ALTER SEQUENCE food_room.booking_slot_assignments_id_seq OWNED BY food_room.booking_slot_assignments.id;
ALTER SEQUENCE food_room.booking_slot_lists_id_seq OWNED BY food_room.booking_slot_lists.id;
ALTER SEQUENCE food_room.bookings_id_seq OWNED BY food_room.bookings.id;
ALTER SEQUENCE food_room.class_upload_id_seq OWNED BY food_room.class_upload.id;
ALTER SEQUENCE food_room.classes_id_seq OWNED BY food_room.classes.id;
ALTER SEQUENCE food_room.department_id_seq OWNED BY food_room.department.id;
ALTER SEQUENCE food_room.desired_servings_ingredients_id_seq OWNED BY food_room.desired_servings_ingredients.id;
ALTER SEQUENCE food_room.food_brands_id_seq OWNED BY food_room.food_brands.id;
ALTER SEQUENCE food_room.google_planner_sync_history_id_seq OWNED BY food_room.google_planner_sync_history.id;
ALTER SEQUENCE food_room.ingredients_inventory_id_seq OWNED BY food_room.ingredients_inventory.id;
ALTER SEQUENCE food_room.mfood_class_students_id_seq OWNED BY food_room.mfood_class_students.id;
ALTER SEQUENCE food_room.planner_upload_history_id_seq OWNED BY food_room.planner_upload_history.id;
ALTER SEQUENCE food_room.recipe_display_id_seq OWNED BY food_room.recipe_display.id;
ALTER SEQUENCE food_room.recipe_subscriptions_id_seq OWNED BY food_room.recipe_subscriptions.id;
ALTER SEQUENCE food_room.recipes_id_seq OWNED BY food_room.recipes.id;
ALTER SEQUENCE food_room.role_permissions_id_seq OWNED BY food_room.role_permissions.id;
ALTER SEQUENCE food_room.saved_shopping_lists_id_seq OWNED BY food_room.saved_shopping_lists.id;
ALTER SEQUENCE food_room.shopping_extras_id_seq OWNED BY food_room.shopping_extras.id;
ALTER SEQUENCE food_room.shopping_lists_id_seq OWNED BY food_room.shopping_lists.id;
ALTER SEQUENCE food_room.shopping_plan_classes_id_seq OWNED BY food_room.shopping_plan_classes.id;
ALTER SEQUENCE food_room.shopping_plan_id_seq OWNED BY food_room.shopping_plan.id;
ALTER SEQUENCE food_room.shopping_plan_item_audit_id_seq OWNED BY food_room.shopping_plan_item_audit.id;
ALTER SEQUENCE food_room.shopping_plan_items_id_seq OWNED BY food_room.shopping_plan_items.id;
ALTER SEQUENCE food_room.staff_upload_history_id_seq OWNED BY food_room.staff_upload_history.id;
ALTER SEQUENCE food_room.staff_upload_id_seq OWNED BY food_room.staff_upload.id;
ALTER SEQUENCE food_room.student_timetable_id_seq OWNED BY food_room.student_timetable.id;
ALTER SEQUENCE food_room.subscription_notifications_id_seq OWNED BY food_room.subscription_notifications.id;
ALTER SEQUENCE food_room.suggestions_id_seq OWNED BY food_room.suggestions.id;
ALTER SEQUENCE food_room.uploads_id_seq OWNED BY food_room.uploads.id;
ALTER SEQUENCE food_room.user_additional_roles_id_seq OWNED BY food_room.user_additional_roles.id;

ALTER TABLE ONLY food_room.aisle_category ALTER COLUMN id SET DEFAULT nextval('food_room.aisle_category_id_seq'::regclass);
ALTER TABLE ONLY food_room.aisle_keywords ALTER COLUMN id SET DEFAULT nextval('food_room.aisle_keywords_id_seq'::regclass);
ALTER TABLE ONLY food_room.aisle_master_keyword_members ALTER COLUMN id SET DEFAULT nextval('food_room.aisle_master_keyword_members_id_seq'::regclass);
ALTER TABLE ONLY food_room.aisle_master_keywords ALTER COLUMN id SET DEFAULT nextval('food_room.aisle_master_keywords_id_seq'::regclass);
ALTER TABLE ONLY food_room.booking_recipes ALTER COLUMN id SET DEFAULT nextval('food_room.booking_recipes_id_seq'::regclass);
ALTER TABLE ONLY food_room.booking_slot_assignments ALTER COLUMN id SET DEFAULT nextval('food_room.booking_slot_assignments_id_seq'::regclass);
ALTER TABLE ONLY food_room.booking_slot_lists ALTER COLUMN id SET DEFAULT nextval('food_room.booking_slot_lists_id_seq'::regclass);
ALTER TABLE ONLY food_room.bookings ALTER COLUMN id SET DEFAULT nextval('food_room.bookings_id_seq'::regclass);
ALTER TABLE ONLY food_room.class_upload ALTER COLUMN id SET DEFAULT nextval('food_room.class_upload_id_seq'::regclass);
ALTER TABLE ONLY food_room.classes ALTER COLUMN id SET DEFAULT nextval('food_room.classes_id_seq'::regclass);
ALTER TABLE ONLY food_room.department ALTER COLUMN id SET DEFAULT nextval('food_room.department_id_seq'::regclass);
ALTER TABLE ONLY food_room.desired_servings_ingredients ALTER COLUMN id SET DEFAULT nextval('food_room.desired_servings_ingredients_id_seq'::regclass);
ALTER TABLE ONLY food_room.food_brands ALTER COLUMN id SET DEFAULT nextval('food_room.food_brands_id_seq'::regclass);
ALTER TABLE ONLY food_room.google_planner_sync_history ALTER COLUMN id SET DEFAULT nextval('food_room.google_planner_sync_history_id_seq'::regclass);
ALTER TABLE ONLY food_room.ingredients_inventory ALTER COLUMN id SET DEFAULT nextval('food_room.ingredients_inventory_id_seq'::regclass);
ALTER TABLE ONLY food_room.mfood_class_students ALTER COLUMN id SET DEFAULT nextval('food_room.mfood_class_students_id_seq'::regclass);
ALTER TABLE ONLY food_room.planner_upload_history ALTER COLUMN id SET DEFAULT nextval('food_room.planner_upload_history_id_seq'::regclass);
ALTER TABLE ONLY food_room.recipe_display ALTER COLUMN id SET DEFAULT nextval('food_room.recipe_display_id_seq'::regclass);
ALTER TABLE ONLY food_room.recipe_subscriptions ALTER COLUMN id SET DEFAULT nextval('food_room.recipe_subscriptions_id_seq'::regclass);
ALTER TABLE ONLY food_room.recipes ALTER COLUMN id SET DEFAULT nextval('food_room.recipes_id_seq'::regclass);
ALTER TABLE ONLY food_room.role_permissions ALTER COLUMN id SET DEFAULT nextval('food_room.role_permissions_id_seq'::regclass);
ALTER TABLE ONLY food_room.saved_shopping_lists ALTER COLUMN id SET DEFAULT nextval('food_room.saved_shopping_lists_id_seq'::regclass);
ALTER TABLE ONLY food_room.shopping_extras ALTER COLUMN id SET DEFAULT nextval('food_room.shopping_extras_id_seq'::regclass);
ALTER TABLE ONLY food_room.shopping_lists ALTER COLUMN id SET DEFAULT nextval('food_room.shopping_lists_id_seq'::regclass);
ALTER TABLE ONLY food_room.shopping_plan ALTER COLUMN id SET DEFAULT nextval('food_room.shopping_plan_id_seq'::regclass);
ALTER TABLE ONLY food_room.shopping_plan_classes ALTER COLUMN id SET DEFAULT nextval('food_room.shopping_plan_classes_id_seq'::regclass);
ALTER TABLE ONLY food_room.shopping_plan_item_audit ALTER COLUMN id SET DEFAULT nextval('food_room.shopping_plan_item_audit_id_seq'::regclass);
ALTER TABLE ONLY food_room.shopping_plan_items ALTER COLUMN id SET DEFAULT nextval('food_room.shopping_plan_items_id_seq'::regclass);
ALTER TABLE ONLY food_room.staff_upload ALTER COLUMN id SET DEFAULT nextval('food_room.staff_upload_id_seq'::regclass);
ALTER TABLE ONLY food_room.staff_upload_history ALTER COLUMN id SET DEFAULT nextval('food_room.staff_upload_history_id_seq'::regclass);
ALTER TABLE ONLY food_room.student_timetable ALTER COLUMN id SET DEFAULT nextval('food_room.student_timetable_id_seq'::regclass);
ALTER TABLE ONLY food_room.subscription_notifications ALTER COLUMN id SET DEFAULT nextval('food_room.subscription_notifications_id_seq'::regclass);
ALTER TABLE ONLY food_room.suggestions ALTER COLUMN id SET DEFAULT nextval('food_room.suggestions_id_seq'::regclass);
ALTER TABLE ONLY food_room.uploads ALTER COLUMN id SET DEFAULT nextval('food_room.uploads_id_seq'::regclass);
ALTER TABLE ONLY food_room.user_additional_roles ALTER COLUMN id SET DEFAULT nextval('food_room.user_additional_roles_id_seq'::regclass);

ALTER TABLE ONLY food_room.aisle_category
    ADD CONSTRAINT aisle_category_name_key UNIQUE (name);
ALTER TABLE ONLY food_room.aisle_category
    ADD CONSTRAINT aisle_category_pkey PRIMARY KEY (id);
ALTER TABLE ONLY food_room.aisle_keywords
    ADD CONSTRAINT aisle_keywords_pkey PRIMARY KEY (id);
ALTER TABLE ONLY food_room.aisle_master_keyword_categories
    ADD CONSTRAINT aisle_master_keyword_categories_pkey PRIMARY KEY (master_keyword_id, aisle_category_id);
ALTER TABLE ONLY food_room.aisle_master_keyword_members
    ADD CONSTRAINT aisle_master_keyword_members_pkey PRIMARY KEY (id);
ALTER TABLE ONLY food_room.aisle_master_keywords
    ADD CONSTRAINT aisle_master_keywords_name_key UNIQUE (name);
ALTER TABLE ONLY food_room.aisle_master_keywords
    ADD CONSTRAINT aisle_master_keywords_pkey PRIMARY KEY (id);
ALTER TABLE ONLY food_room.booking_recipes
    ADD CONSTRAINT booking_recipes_booking_id_recipe_id_key UNIQUE (booking_id, recipe_id);
ALTER TABLE ONLY food_room.booking_recipes
    ADD CONSTRAINT booking_recipes_pkey PRIMARY KEY (id);
ALTER TABLE ONLY food_room.booking_slot_assignments
    ADD CONSTRAINT booking_slot_assignments_booking_id_slot_number_seat_index_key UNIQUE (booking_id, slot_number, seat_index);
ALTER TABLE ONLY food_room.booking_slot_assignments
    ADD CONSTRAINT booking_slot_assignments_pkey PRIMARY KEY (id);
ALTER TABLE ONLY food_room.booking_slot_lists
    ADD CONSTRAINT booking_slot_lists_booking_id_key UNIQUE (booking_id);
ALTER TABLE ONLY food_room.booking_slot_lists
    ADD CONSTRAINT booking_slot_lists_pkey PRIMARY KEY (id);
ALTER TABLE ONLY food_room.bookings
    ADD CONSTRAINT bookings_pkey PRIMARY KEY (id);
ALTER TABLE ONLY food_room.class_upload
    ADD CONSTRAINT class_upload_pkey PRIMARY KEY (id);
ALTER TABLE ONLY food_room.classes
    ADD CONSTRAINT classes_pkey PRIMARY KEY (id);
ALTER TABLE ONLY food_room.department
    ADD CONSTRAINT department_pkey PRIMARY KEY (id);
ALTER TABLE ONLY food_room.desired_servings_ingredients
    ADD CONSTRAINT desired_servings_ingredients_pkey PRIMARY KEY (id);
ALTER TABLE ONLY food_room.food_brands
    ADD CONSTRAINT food_brands_brand_name_key UNIQUE (brand_name);
ALTER TABLE ONLY food_room.food_brands
    ADD CONSTRAINT food_brands_pkey PRIMARY KEY (id);
ALTER TABLE ONLY food_room.google_oauth_tokens
    ADD CONSTRAINT google_oauth_tokens_pkey PRIMARY KEY (id);
ALTER TABLE ONLY food_room.google_planner_sync_history
    ADD CONSTRAINT google_planner_sync_history_pkey PRIMARY KEY (id);
ALTER TABLE ONLY food_room.ingredients_inventory
    ADD CONSTRAINT ingredients_inventory_pkey PRIMARY KEY (id);
ALTER TABLE ONLY food_room.mfood_class_students
    ADD CONSTRAINT mfood_class_students_pkey PRIMARY KEY (id);
ALTER TABLE ONLY food_room.mfood_class_students
    ADD CONSTRAINT mfood_class_students_unique UNIQUE (class_code, student_id);
ALTER TABLE ONLY food_room.planner_upload_history
    ADD CONSTRAINT planner_upload_history_pkey PRIMARY KEY (id);
ALTER TABLE ONLY food_room.recipe_display
    ADD CONSTRAINT recipe_display_pkey PRIMARY KEY (id);
ALTER TABLE ONLY food_room.recipe_display
    ADD CONSTRAINT recipe_display_recipeid_key UNIQUE (recipeid);
ALTER TABLE ONLY food_room.recipe_subscriptions
    ADD CONSTRAINT recipe_subscriptions_pkey PRIMARY KEY (id);
ALTER TABLE ONLY food_room.recipe_subscriptions
    ADD CONSTRAINT recipe_subscriptions_user_email_key UNIQUE (user_email);
ALTER TABLE ONLY food_room.recipes
    ADD CONSTRAINT recipes_pkey PRIMARY KEY (id);
ALTER TABLE ONLY food_room.role_permissions
    ADD CONSTRAINT role_permissions_pkey PRIMARY KEY (id);
ALTER TABLE ONLY food_room.role_permissions
    ADD CONSTRAINT role_permissions_role_name_key UNIQUE (role_name);
ALTER TABLE ONLY food_room.saved_shopping_lists
    ADD CONSTRAINT saved_shopping_lists_pkey PRIMARY KEY (id);
ALTER TABLE ONLY food_room.session
    ADD CONSTRAINT session_pkey PRIMARY KEY (sid);
ALTER TABLE ONLY food_room.shopping_extras
    ADD CONSTRAINT shopping_extras_pkey PRIMARY KEY (id);
ALTER TABLE ONLY food_room.shopping_lists
    ADD CONSTRAINT shopping_lists_pkey PRIMARY KEY (id);
ALTER TABLE ONLY food_room.shopping_plan_classes
    ADD CONSTRAINT shopping_plan_classes_pkey PRIMARY KEY (id);
ALTER TABLE ONLY food_room.shopping_plan_item_audit
    ADD CONSTRAINT shopping_plan_item_audit_pkey PRIMARY KEY (id);
ALTER TABLE ONLY food_room.shopping_plan_items
    ADD CONSTRAINT shopping_plan_items_pkey PRIMARY KEY (id);
ALTER TABLE ONLY food_room.shopping_plan
    ADD CONSTRAINT shopping_plan_pkey PRIMARY KEY (id);
ALTER TABLE ONLY food_room.shopping_plan
    ADD CONSTRAINT shopping_plan_week_ending_version_key UNIQUE (week_ending, version);
ALTER TABLE ONLY food_room.staff_upload_history
    ADD CONSTRAINT staff_upload_history_pkey PRIMARY KEY (id);
ALTER TABLE ONLY food_room.staff_upload
    ADD CONSTRAINT staff_upload_pkey PRIMARY KEY (id);
ALTER TABLE ONLY food_room.student_timetable
    ADD CONSTRAINT student_timetable_pkey PRIMARY KEY (id);
ALTER TABLE ONLY food_room.subscription_notifications
    ADD CONSTRAINT subscription_notifications_pkey PRIMARY KEY (id);
ALTER TABLE ONLY food_room.suggestions
    ADD CONSTRAINT suggestions_pkey PRIMARY KEY (id);
ALTER TABLE ONLY food_room.uploads
    ADD CONSTRAINT uploads_pkey PRIMARY KEY (id);
ALTER TABLE ONLY food_room.user_additional_roles
    ADD CONSTRAINT user_additional_roles_email_role_name_key UNIQUE (email, role_name);
ALTER TABLE ONLY food_room.user_additional_roles
    ADD CONSTRAINT user_additional_roles_pkey PRIMARY KEY (id);

CREATE UNIQUE INDEX aisle_master_keyword_members_unique_idx ON food_room.aisle_master_keyword_members USING btree (master_keyword_id, lower(keyword));
CREATE INDEX booking_slot_assignments_booking_idx ON food_room.booking_slot_assignments USING btree (booking_id, slot_number, seat_index);
CREATE INDEX booking_slot_assignments_student_idx ON food_room.booking_slot_assignments USING btree (booking_id, lower(TRIM(BOTH FROM student_id_number)));
CREATE UNIQUE INDEX class_upload_ttcode_unique_idx ON food_room.class_upload USING btree (upper(TRIM(BOTH FROM code))) WHERE ((code IS NOT NULL) AND (TRIM(BOTH FROM code) <> ''::text));
CREATE INDEX idx_spc_plan_sort ON food_room.shopping_plan_classes USING btree (plan_id, sort_order);
CREATE INDEX idx_spi_plan_cat_sort ON food_room.shopping_plan_items USING btree (plan_id, category, sort_order);
CREATE INDEX idx_spia_plan_item ON food_room.shopping_plan_item_audit USING btree (plan_item_id, changed_at);
CREATE UNIQUE INDEX kamar_timetable_teacher_unique_idx ON food_room.kamar_timetable USING btree (upper(TRIM(BOTH FROM "Teacher"))) WHERE (("Teacher" IS NOT NULL) AND (TRIM(BOTH FROM "Teacher") <> ''::text));
CREATE INDEX mfood_class_students_code_status_idx ON food_room.mfood_class_students USING btree (upper(TRIM(BOTH FROM class_code)), status);
CREATE INDEX saved_shopping_lists_created_by_email_idx ON food_room.saved_shopping_lists USING btree (lower(TRIM(BOTH FROM created_by_email)));
CREATE INDEX saved_shopping_lists_updated_idx ON food_room.saved_shopping_lists USING btree (updated_at DESC, id DESC);
CREATE UNIQUE INDEX staff_upload_email_school_unique_idx ON food_room.staff_upload USING btree (lower(TRIM(BOTH FROM email_school))) WHERE ((email_school IS NOT NULL) AND (TRIM(BOTH FROM email_school) <> ''::text));
CREATE UNIQUE INDEX staff_upload_history_unique_snapshot ON food_room.staff_upload_history USING btree (lower(TRIM(BOTH FROM email_school)), upload_year, lower(TRIM(BOTH FROM upload_term)), upload_date, status_snapshot);
CREATE UNIQUE INDEX student_timetable_id_number_unique_idx ON food_room.student_timetable USING btree (lower(TRIM(BOTH FROM id_number))) WHERE ((id_number IS NOT NULL) AND (TRIM(BOTH FROM id_number) <> ''::text));

ALTER TABLE ONLY food_room.aisle_keywords
    ADD CONSTRAINT aisle_keywords_aisle_category_id_fkey FOREIGN KEY (aisle_category_id) REFERENCES food_room.aisle_category(id);
ALTER TABLE ONLY food_room.aisle_master_keyword_categories
    ADD CONSTRAINT aisle_master_keyword_categories_aisle_category_id_fkey FOREIGN KEY (aisle_category_id) REFERENCES food_room.aisle_category(id) ON DELETE CASCADE;
ALTER TABLE ONLY food_room.aisle_master_keyword_categories
    ADD CONSTRAINT aisle_master_keyword_categories_master_keyword_id_fkey FOREIGN KEY (master_keyword_id) REFERENCES food_room.aisle_master_keywords(id) ON DELETE CASCADE;
ALTER TABLE ONLY food_room.aisle_master_keyword_members
    ADD CONSTRAINT aisle_master_keyword_members_master_keyword_id_fkey FOREIGN KEY (master_keyword_id) REFERENCES food_room.aisle_master_keywords(id) ON DELETE CASCADE;
ALTER TABLE ONLY food_room.aisle_master_keywords
    ADD CONSTRAINT aisle_master_keywords_aisle_category_id_fkey FOREIGN KEY (aisle_category_id) REFERENCES food_room.aisle_category(id) ON DELETE CASCADE;
ALTER TABLE ONLY food_room.booking_slot_assignments
    ADD CONSTRAINT booking_slot_assignments_booking_id_fkey FOREIGN KEY (booking_id) REFERENCES food_room.bookings(id) ON DELETE CASCADE;
ALTER TABLE ONLY food_room.booking_slot_lists
    ADD CONSTRAINT booking_slot_lists_booking_id_fkey FOREIGN KEY (booking_id) REFERENCES food_room.bookings(id) ON DELETE CASCADE;
ALTER TABLE ONLY food_room.ingredients_inventory
    ADD CONSTRAINT ingredients_inventory_recipe_id_fkey FOREIGN KEY (recipe_id) REFERENCES food_room.recipes(id);
ALTER TABLE ONLY food_room.shopping_plan_classes
    ADD CONSTRAINT shopping_plan_classes_booking_id_fkey FOREIGN KEY (booking_id) REFERENCES food_room.bookings(id) ON DELETE SET NULL;
ALTER TABLE ONLY food_room.shopping_plan_classes
    ADD CONSTRAINT shopping_plan_classes_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES food_room.shopping_plan(id) ON DELETE CASCADE;
ALTER TABLE ONLY food_room.shopping_plan_classes
    ADD CONSTRAINT shopping_plan_classes_recipe_id_fkey FOREIGN KEY (recipe_id) REFERENCES food_room.recipes(id) ON DELETE SET NULL;
ALTER TABLE ONLY food_room.shopping_plan_item_audit
    ADD CONSTRAINT shopping_plan_item_audit_plan_item_id_fkey FOREIGN KEY (plan_item_id) REFERENCES food_room.shopping_plan_items(id) ON DELETE CASCADE;
ALTER TABLE ONLY food_room.shopping_plan_items
    ADD CONSTRAINT shopping_plan_items_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES food_room.shopping_plan(id) ON DELETE CASCADE;

CREATE TABLE IF NOT EXISTS food_room.food_room_legacy_import (
  id SMALLINT PRIMARY KEY DEFAULT 1,
  imported_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  summary TEXT,
  CONSTRAINT food_room_legacy_import_single CHECK (id = 1)
);

INSERT INTO hub_roles (hub_key, role_key, display_name, description) VALUES
  ('food-room', 'lead-teacher', 'Food Room Lead Teacher', 'Manage Food Room recipes, bookings and shopping plans.'),
  ('food-room', 'technician', 'Food Room Technician', 'Food Room technician access.')
ON CONFLICT (hub_key, role_key) DO NOTHING;

ALTER TABLE food_room.user_additional_roles ADD COLUMN IF NOT EXISTS app_synced BOOLEAN NOT NULL DEFAULT FALSE;
