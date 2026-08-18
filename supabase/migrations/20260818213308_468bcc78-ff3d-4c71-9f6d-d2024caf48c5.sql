
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text,
  name text,
  headline text,
  target_role text,
  location text,
  linkedin_url text,
  github_url text,
  portfolio_url text,
  profile_visible boolean NOT NULL DEFAULT false,
  email_notifications boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own profile select" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "own profile insert" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
CREATE POLICY "own profile update" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
CREATE POLICY "own profile delete" ON public.profiles FOR DELETE TO authenticated USING (auth.uid() = id);

CREATE TABLE public.credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  issuer text NOT NULL,
  year integer,
  status text NOT NULL DEFAULT 'self_reported',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.credentials TO authenticated;
GRANT ALL ON public.credentials TO service_role;
ALTER TABLE public.credentials ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own credentials" ON public.credentials FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text NOT NULL,
  category text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.roles TO authenticated, anon;
GRANT ALL ON public.roles TO service_role;
ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "roles readable" ON public.roles FOR SELECT TO authenticated, anon USING (true);

CREATE TABLE public.simulations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role_id uuid NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text NOT NULL,
  estimated_minutes integer NOT NULL DEFAULT 30,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.simulations TO authenticated, anon;
GRANT ALL ON public.simulations TO service_role;
ALTER TABLE public.simulations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "simulations readable" ON public.simulations FOR SELECT TO authenticated, anon USING (true);

CREATE TABLE public.simulation_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  simulation_id uuid NOT NULL REFERENCES public.simulations(id) ON DELETE CASCADE,
  "order" integer NOT NULL,
  title text NOT NULL,
  brief text NOT NULL,
  task_type text NOT NULL,
  rubric_criteria jsonb NOT NULL DEFAULT '{}'::jsonb
);
GRANT SELECT ON public.simulation_tasks TO authenticated;
GRANT ALL ON public.simulation_tasks TO service_role;
ALTER TABLE public.simulation_tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tasks readable" ON public.simulation_tasks FOR SELECT TO authenticated USING (true);

CREATE TABLE public.simulation_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  simulation_id uuid NOT NULL REFERENCES public.simulations(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'in_progress',
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  overall_score integer
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.simulation_attempts TO authenticated;
GRANT ALL ON public.simulation_attempts TO service_role;
ALTER TABLE public.simulation_attempts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own attempts" ON public.simulation_attempts FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.attempt_task_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id uuid NOT NULL REFERENCES public.simulation_attempts(id) ON DELETE CASCADE,
  task_id uuid NOT NULL REFERENCES public.simulation_tasks(id) ON DELETE CASCADE,
  response jsonb NOT NULL DEFAULT '{}'::jsonb,
  score integer,
  max_score integer NOT NULL DEFAULT 10,
  feedback text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (attempt_id, task_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.attempt_task_results TO authenticated;
GRANT ALL ON public.attempt_task_results TO service_role;
ALTER TABLE public.attempt_task_results ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own results" ON public.attempt_task_results FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.simulation_attempts a WHERE a.id = attempt_id AND a.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.simulation_attempts a WHERE a.id = attempt_id AND a.user_id = auth.uid()));

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, name, headline, target_role, location)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data ->> 'name', ''),
    COALESCE(NEW.raw_user_meta_data ->> 'headline', ''),
    COALESCE(NEW.raw_user_meta_data ->> 'target_role', ''),
    COALESCE(NEW.raw_user_meta_data ->> 'location', '')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

INSERT INTO public.roles (id, name, description, category) VALUES
  ('11111111-1111-1111-1111-111111111101', 'Data Analyst', 'Clean messy data, write SQL, read charts and brief stakeholders with clear recommendations.', 'Data'),
  ('11111111-1111-1111-1111-111111111102', 'Customer Support Rep', 'Handle live tickets, de-escalate frustrated customers and write clear, empathetic replies.', 'Support'),
  ('11111111-1111-1111-1111-111111111103', 'Sales Development Rep', 'Research accounts, write cold outreach and qualify inbound leads against a framework.', 'Sales'),
  ('11111111-1111-1111-1111-111111111104', 'Junior Software Engineer', 'Fix bugs, review a pull request and ship a small feature against a spec.', 'Engineering'),
  ('11111111-1111-1111-1111-111111111105', 'Digital Marketing Coordinator', 'Plan a campaign, write ad copy and interpret channel performance data.', 'Marketing');

INSERT INTO public.simulations (id, role_id, title, description, estimated_minutes) VALUES
  ('22222222-2222-2222-2222-222222222201', '11111111-1111-1111-1111-111111111101',
   'Q3 Subscription Revenue Review',
   'You have joined Northwind Media as a data analyst. The finance lead needs a clean read on Q3 subscription revenue before the board meeting. Work through four real tasks: clean the export, query the database, interpret a chart and brief the stakeholder.',
   35);

INSERT INTO public.simulation_tasks (simulation_id, "order", title, brief, task_type, rubric_criteria) VALUES
('22222222-2222-2222-2222-222222222201', 1, 'Data cleaning',
'The Q3 export below has issues. Review it and answer the fields underneath.

order_id | customer      | plan   | amount   | signup_date
1001     | Acme Ltd      | Pro    | 240.00   | 2024-07-02
1002     | Beta Corp     | Basic  | 60.00    | 2024-07-05
1002     | Beta Corp     | Basic  | 60.00    | 2024-07-05
1003     | Corex         | Pro    | -240.00  | 2024-07-11
1004     | Delta Group   | Team   | 480.00   | 07/14/2024
1005     | Echo Studio   | Basic  | 60        | 2024-08-01
1006     | (blank)       | Pro    | 240.00   | 2024-08-09
1007     | Foxtrot LLC   | Team   | 480.00   | 2024-09-21

Count the duplicate rows that must be removed, the rows with an invalid or negative amount, and the rows with a date not in YYYY-MM-DD format. Then give the total valid revenue after cleaning (exclude duplicates, the negative row, and the row with a missing customer).',
'structured',
'{"max_score":10,"fields":[{"key":"duplicates","label":"Duplicate rows to remove","answer":1,"points":2},{"key":"invalid_amounts","label":"Rows with an invalid/negative amount","answer":1,"points":2},{"key":"bad_dates","label":"Rows with a non-ISO date format","answer":1,"points":2},{"key":"total_revenue","label":"Total valid revenue (GBP)","answer":1320,"tolerance":1,"points":4}]}'),

('22222222-2222-2222-2222-222222222201', 2, 'SQL query',
'The cleaned data lives in a table `subscriptions(order_id, customer, plan, amount, signup_date)`.

Finance wants total revenue and number of customers per plan for Q3 2024 (1 July to 30 September inclusive), highest revenue first, and only plans with more than one customer.

Write the SQL query.',
'text',
'{"max_score":10,"criteria":["Aggregates SUM(amount) and a COUNT of customers grouped by plan","Filters signup_date to the Q3 2024 range correctly","Uses HAVING (not WHERE) to keep plans with more than one customer","Orders by total revenue descending","Query is syntactically valid and readable"]}'),

('22222222-2222-2222-2222-222222222201', 3, 'Chart interpretation',
'A line chart of monthly recurring revenue shows: July GBP 42k, August GBP 44k, September GBP 39k. Over the same period new signups rose steadily each month, and the September churn rate jumped from 2.1% to 6.4%.

Which conclusion is best supported by the data?',
'multiple_choice',
'{"max_score":10,"options":["Revenue fell in September because acquisition slowed down.","Revenue fell in September despite growing signups, driven by a sharp rise in churn.","The chart shows normal seasonal noise and needs no further investigation.","Revenue growth stalled because prices were too low across all plans."],"answer":1,"points":10}'),

('22222222-2222-2222-2222-222222222201', 4, 'Stakeholder summary',
'Write a short summary (roughly 120-180 words) for the finance lead, who is not technical. Cover what happened to Q3 revenue, the most likely driver, one caveat about the data quality you found, and one concrete recommended next step.',
'text',
'{"max_score":10,"criteria":["States the Q3 revenue trend clearly and accurately","Identifies rising churn as the likely driver rather than acquisition","Notes a data-quality caveat from the cleaning task","Gives one specific, actionable next step","Written in plain, non-technical language a finance lead can act on"]}');
