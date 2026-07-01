-- ============================================================
-- FILE: supabase/migrations/001_initial_schema.sql
-- ============================================================

-- ─── EXTENSIONS ─────────────────────────────────────────────
create extension if not exists "uuid-ossp";

-- ─── PROFILES ───────────────────────────────────────────────
create table public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  username    text unique not null,
  avatar_url  text,
  total_xp    integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles: public read"
  on public.profiles for select using (true);

create policy "profiles: owner update"
  on public.profiles for update using (auth.uid() = id);

create policy "profiles: owner insert"
  on public.profiles for insert with check (auth.uid() = id);

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, username)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1))
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ─── TEST SOURCES ────────────────────────────────────────────
create table public.test_sources (
  id          serial primary key,
  name        text unique not null,
  is_book     boolean not null default true,
  created_at  timestamptz not null default now()
);

alter table public.test_sources enable row level security;

create policy "test_sources: public read"
  on public.test_sources for select using (true);

-- ─── IELTS TESTS ─────────────────────────────────────────────
create table public.ielts_tests (
  id              uuid primary key default uuid_generate_v4(),
  source_id       integer not null references public.test_sources(id),
  section         text not null check (section in ('listening','reading')),
  test_number     integer,
  part_number     integer not null check (part_number between 1 and 4),
  title           text not null,
  audio_url       text,
  passage_text    text,
  created_at      timestamptz not null default now()
);

alter table public.ielts_tests enable row level security;

create policy "ielts_tests: public read"
  on public.ielts_tests for select using (true);

create index idx_ielts_tests_section   on public.ielts_tests(section);
create index idx_ielts_tests_source    on public.ielts_tests(source_id);
create index idx_ielts_tests_test_num  on public.ielts_tests(test_number);

-- ─── QUESTIONS ───────────────────────────────────────────────
create table public.questions (
  id                  uuid primary key default uuid_generate_v4(),
  test_id             uuid not null references public.ielts_tests(id) on delete cascade,
  question_number     integer not null,
  prompt              text not null,
  question_type       text not null check (question_type in (
                        'form_completion','note_completion','table_completion',
                        'multiple_choice','matching','map_labelling',
                        'sentence_completion','summary_completion',
                        'true_false_ng','yes_no_ng','short_answer'
                      )),
  correct_answer      text not null,
  grammar_hint        text not null,
  shorthand_variants  text[] not null default '{}',
  distractor_options  text[] not null default '{}',
  word_limit          integer not null default 3,
  created_at          timestamptz not null default now()
);

alter table public.questions enable row level security;

create policy "questions: public read"
  on public.questions for select using (true);

create index idx_questions_test_id on public.questions(test_id);
create index idx_questions_type    on public.questions(question_type);

-- ─── USER PROGRESS ───────────────────────────────────────────
create table public.user_progress (
  id              uuid primary key default uuid_generate_v4(),
  user_id         uuid not null references public.profiles(id) on delete cascade,
  test_id         uuid not null references public.ielts_tests(id),
  section         text not null check (section in ('listening','reading')),
  score           integer not null default 0,
  total_items     integer not null default 0,
  band_score      numeric(3,1) not null default 0,
  time_spent_secs integer not null default 0,
  completed_at    timestamptz not null default now()
);

alter table public.user_progress enable row level security;

create policy "user_progress: owner read"
  on public.user_progress for select using (auth.uid() = user_id);

create policy "user_progress: owner insert"
  on public.user_progress for insert with check (auth.uid() = user_id);

create policy "leaderboard: aggregated read"
  on public.user_progress for select using (true);

create index idx_user_progress_user    on public.user_progress(user_id);
create index idx_user_progress_test    on public.user_progress(test_id);
create index idx_user_progress_date    on public.user_progress(completed_at desc);

-- ─── BAND SCORE FUNCTION ─────────────────────────────────────
create or replace function public.raw_to_band(section text, raw integer)
returns numeric language plpgsql immutable as $$
declare band numeric;
begin
  if section = 'listening' then
    band := case
      when raw >= 39 then 9.0 when raw >= 37 then 8.5 when raw >= 35 then 8.0
      when raw >= 32 then 7.5 when raw >= 30 then 7.0 when raw >= 26 then 6.5
      when raw >= 23 then 6.0 when raw >= 18 then 5.5 when raw >= 16 then 5.0
      when raw >= 13 then 4.5 when raw >= 10 then 4.0 else 3.5
    end;
  else
    band := case
      when raw >= 39 then 9.0 when raw >= 37 then 8.5 when raw >= 35 then 8.0
      when raw >= 33 then 7.5 when raw >= 30 then 7.0 when raw >= 27 then 6.5
      when raw >= 23 then 6.0 when raw >= 19 then 5.5 when raw >= 15 then 5.0
      when raw >= 13 then 4.5 when raw >= 10 then 4.0 else 3.5
    end;
  end if;
  return band;
end;
$$;

-- ─── XP AWARD TRIGGER ────────────────────────────────────────
create or replace function public.award_xp_on_completion()
returns trigger language plpgsql security definer set search_path = public as $$
declare xp_earned integer;
begin
  xp_earned := floor(new.band_score * 10)::integer;
  update public.profiles
    set total_xp = total_xp + xp_earned,
        updated_at = now()
  where id = new.user_id;
  return new;
end;
$$;

create trigger on_progress_insert
  after insert on public.user_progress
  for each row execute procedure public.award_xp_on_completion();

-- ============================================================
-- SEED DATA
-- ============================================================

-- Sources
insert into public.test_sources (name, is_book) values
  ('Cambridge IELTS 10-18', true),
  ('Engnovate',             false),
  ('IELTSOnlineTests',      false);

-- ─── TEST 1: Cambridge Listening Section 1 ───────────────────
with src as (select id from public.test_sources where name = 'Cambridge IELTS 10-18')
insert into public.ielts_tests (source_id, section, test_number, part_number, title, audio_url, passage_text)
select src.id, 'listening', 10, 1,
  'Cambridge 10 Test 1 Section 1 — Lost Property Enquiry',
  'https://mock-cdn.example.com/audio/cam10_t1_s1.mp3',
  null
from src
returning id;

-- We use a DO block to capture IDs cleanly
do $$
declare
  t1_id uuid;
  t2_id uuid;
  t3_id uuid;
  t4_id uuid;
  t5_id uuid;
  t6_id uuid;
begin

  -- ── Listening Test 1 – Part 1 ──────────────────────────────
  insert into public.ielts_tests (source_id, section, test_number, part_number, title, audio_url)
  values (
    (select id from public.test_sources where name = 'Cambridge IELTS 10-18'),
    'listening', 10, 1,
    'Cambridge 10 T1 S1 — Lost Property',
    'https://mock-cdn.example.com/audio/cam10_t1_s1.mp3'
  ) returning id into t1_id;

  insert into public.questions
    (test_id, question_number, prompt, question_type, correct_answer, grammar_hint, shorthand_variants, distractor_options, word_limit)
  values
    (t1_id, 1,
     'What is the colour of the lost bag?',
     'form_completion', 'dark blue',
     'adjective + noun: colour descriptor precedes a material noun',
     array['dark blue','navy bag','blue item'],
     array['light brown','bright red','dark green'],
     2),
    (t1_id, 2,
     'Where exactly was the bag left?',
     'form_completion', 'sports centre',
     'noun phrase: location type, likely a compound noun',
     array['sports centre','gym venue','leisure place'],
     array['train station','shopping mall','bus depot'],
     2),
    (t1_id, 3,
     'What is the owner''s surname?',
     'form_completion', 'Forster',
     'proper noun: family name, expect unusual spelling',
     array['Forster','Foster name','owner surname'],
     array['Foster','Forrester','Fawster'],
     1),
    (t1_id, 4,
     'What is the phone number of the owner?',
     'form_completion', '07911 346 227',
     'number string: listen for digit sequence',
     array['07911 346 227','mobile number','contact digits'],
     array['07911 364 227','07191 346 227','07911 346 272'],
     3),
    (t1_id, 5,
     'What item was inside the bag that is most valuable?',
     'form_completion', 'laptop',
     'noun: single countable object, technology domain',
     array['laptop','computing device','portable computer'],
     array['tablet','camera','phone'],
     1);

  -- ── Listening Test 1 – Part 2 ──────────────────────────────
  insert into public.ielts_tests (source_id, section, test_number, part_number, title, audio_url)
  values (
    (select id from public.test_sources where name = 'Cambridge IELTS 10-18'),
    'listening', 10, 2,
    'Cambridge 10 T1 S2 — Newtown Leisure Centre',
    'https://mock-cdn.example.com/audio/cam10_t1_s2.mp3'
  ) returning id into t2_id;

  insert into public.questions
    (test_id, question_number, prompt, question_type, correct_answer, grammar_hint, shorthand_variants, distractor_options, word_limit)
  values
    (t2_id, 6,
     'The leisure centre first opened in',
     'sentence_completion', '1985',
     'number: year, four digits',
     array['1985','year opened','founding year'],
     array['1975','1995','1980'],
     1),
    (t2_id, 7,
     'The centre was refurbished at a cost of',
     'sentence_completion', 'two million pounds',
     'number phrase: currency amount',
     array['two million pounds','£2 million','2m cost'],
     array['one million pounds','three million pounds','two billion pounds'],
     3),
    (t2_id, 8,
     'The pool temperature is kept at',
     'sentence_completion', '29 degrees',
     'number + noun: temperature measurement',
     array['29 degrees','29°C pool','warm temperature'],
     array['27 degrees','31 degrees','25 degrees'],
     2),
    (t2_id, 9,
     'Children under 5 can use the pool',
     'sentence_completion', 'free of charge',
     'adverbial phrase: no cost, idiomatic',
     array['free of charge','no cost','complimentary access'],
     array['at half price','with a parent','on weekends only'],
     3),
    (t2_id, 10,
     'The car park closes at',
     'sentence_completion', '10 pm',
     'time expression: hour + period',
     array['10 pm','10 oclock','closing time'],
     array['9 pm','11 pm','10:30 pm'],
     2);

  -- ── Reading Test 1 – Academic Passage 1 ───────────────────
  insert into public.ielts_tests (source_id, section, test_number, part_number, title, passage_text)
  values (
    (select id from public.test_sources where name = 'Cambridge IELTS 10-18'),
    'reading', 10, 1,
    'Cambridge 10 T1 P1 — The Falkirk Wheel',
    'The Falkirk Wheel is a rotating boat lift in Scotland, connecting the Forth and Clyde Canal with the Union Canal. Opened in 2002, it was the first rotating boat lift in the world to be built in over 100 years. The wheel takes the form of two opposing curved arms, each holding a water-filled gondola capable of carrying several canal boats simultaneously. Each gondola always contains the same weight of water, regardless of whether boats are present — a direct application of Archimedes'' Principle. This means the wheel uses remarkably little energy, approximately that of boiling eight kettles of water, to complete a full rotation. The structure stands 35 metres tall and lifts boats 24 metres. The design, chosen from 40 submitted entries, was selected for its combination of engineering precision and aesthetic elegance.'
  ) returning id into t3_id;

  insert into public.questions
    (test_id, question_number, prompt, question_type, correct_answer, grammar_hint, shorthand_variants, distractor_options, word_limit)
  values
    (t3_id, 1,
     'The Falkirk Wheel connects the Forth and Clyde Canal with the',
     'sentence_completion', 'Union Canal',
     'proper noun phrase: official name of waterway',
     array['Union Canal','second canal','Scottish waterway'],
     array['Grand Canal','Edinburgh Canal','Highland Canal'],
     2),
    (t3_id, 2,
     'The wheel was the first rotating boat lift built in over',
     'sentence_completion', '100 years',
     'number + noun: duration of time',
     array['100 years','a century','long interval'],
     array['50 years','150 years','200 years'],
     2),
    (t3_id, 3,
     'The energy used equals approximately that of boiling',
     'sentence_completion', 'eight kettles',
     'number + noun: countable household objects',
     array['eight kettles','8 kettles','small energy'],
     array['four kettles','twelve kettles','ten kettles'],
     2),
    (t3_id, 4,
     'The wheel stands',
     'sentence_completion', '35 metres',
     'number + unit: height measurement',
     array['35 metres','35m tall','wheel height'],
     array['24 metres','40 metres','30 metres'],
     2),
    (t3_id, 5,
     'The design was chosen from how many submitted entries?',
     'short_answer', '40',
     'number: integer, competition context',
     array['40','forty entries','design count'],
     array['20','35','50'],
     1);

  -- ── Reading Test 1 – Academic Passage 2 ───────────────────
  insert into public.ielts_tests (source_id, section, test_number, part_number, title, passage_text)
  values (
    (select id from public.test_sources where name = 'Cambridge IELTS 10-18'),
    'reading', 10, 2,
    'Cambridge 10 T1 P2 — The Risks of Climate Intervention',
    'Geoengineering refers to deliberate, large-scale technological interventions in the Earth''s climate system to counteract climate change. Two leading proposals are Solar Radiation Management (SRM) and Carbon Dioxide Removal (CDR). SRM techniques, such as stratospheric aerosol injection, aim to reflect sunlight back into space. CDR methods, including direct air capture and ocean iron fertilisation, aim to extract CO₂ directly from the atmosphere. Critics warn that SRM does nothing to address ocean acidification — a direct consequence of elevated CO₂ — and could alter precipitation patterns globally, causing severe drought in some regions. Furthermore, the termination shock problem suggests that abrupt cessation of SRM could cause rapid temperature rebound, potentially worse than the original trajectory. Governance remains the most intractable obstacle: no single international framework currently exists to regulate unilateral geoengineering experiments.'
  ) returning id into t4_id;

  insert into public.questions
    (test_id, question_number, prompt, question_type, correct_answer, grammar_hint, shorthand_variants, distractor_options, word_limit)
  values
    (t4_id, 6,
     'SRM stands for',
     'sentence_completion', 'Solar Radiation Management',
     'proper noun phrase: acronym expansion, three words',
     array['Solar Radiation Management','SRM meaning','sunlight management'],
     array['Stratospheric Resource Management','Solar Risk Mitigation','Surface Radiation Monitoring'],
     3),
    (t4_id, 7,
     'Ocean iron fertilisation is categorised as a method of',
     'sentence_completion', 'Carbon Dioxide Removal',
     'proper noun phrase: CDR acronym expansion',
     array['Carbon Dioxide Removal','CDR method','CO2 removal'],
     array['Solar Radiation Management','ocean acidification','climate modelling'],
     3),
    (t4_id, 8,
     'SRM does NOT address the problem of ocean',
     'sentence_completion', 'acidification',
     'noun: chemical process, single word',
     array['acidification','acid problem','ocean chemistry'],
     array['temperature','salinity','pollution'],
     1),
    (t4_id, 9,
     'Abrupt ending of SRM could cause what is called the _____ shock problem',
     'sentence_completion', 'termination',
     'noun (adjective slot): single adjective modifying shock',
     array['termination','sudden stop','SRM end'],
     array['acceleration','thermal','rebound'],
     1),
    (t4_id, 10,
     'The most intractable obstacle to geoengineering is',
     'sentence_completion', 'governance',
     'noun: abstract concept, political domain',
     array['governance','political issue','regulatory gap'],
     array['technology','funding','public opinion'],
     1);

  -- ── Listening Test 2 – Part 3 (Engnovate) ─────────────────
  insert into public.ielts_tests (source_id, section, test_number, part_number, title, audio_url)
  values (
    (select id from public.test_sources where name = 'Engnovate'),
    'listening', null, 3,
    'Engnovate — Student Research Discussion',
    'https://mock-cdn.example.com/audio/engnovate_s3_discussion.mp3'
  ) returning id into t5_id;

  insert into public.questions
    (test_id, question_number, prompt, question_type, correct_answer, grammar_hint, shorthand_variants, distractor_options, word_limit)
  values
    (t5_id, 21,
     'The students agree the main weakness of the survey was its',
     'multiple_choice', 'small sample size',
     'noun phrase: research limitation, methodology domain',
     array['small sample size','few participants','sample weakness'],
     array['poor question design','limited time frame','biased respondents'],
     3),
    (t5_id, 22,
     'Maria suggests they should add a section on',
     'sentence_completion', 'ethical considerations',
     'noun phrase: academic writing section, two words',
     array['ethical considerations','ethics section','moral concerns'],
     array['literature review','data analysis','conclusion'],
     2),
    (t5_id, 23,
     'The tutor recommended using which statistical method?',
     'short_answer', 'regression analysis',
     'noun phrase: statistical technique, two words',
     array['regression analysis','regression model','statistical regression'],
     array['factor analysis','cluster analysis','chi-square test'],
     2),
    (t5_id, 24,
     'The deadline for submission is',
     'sentence_completion', 'the 15th of March',
     'date expression: ordinal day + month',
     array['15th March','mid March','March deadline'],
     array['the 5th of March','the 25th of March','the 15th of April'],
     3),
    (t5_id, 25,
     'Both students agree the most time-consuming part was',
     'sentence_completion', 'data collection',
     'noun phrase: research stage, two words',
     array['data collection','collecting data','gathering information'],
     array['data analysis','writing the report','literature review'],
     2);

  -- ── Reading Test 2 – IELTSOnlineTests Passage ─────────────
  insert into public.ielts_tests (source_id, section, test_number, part_number, title, passage_text)
  values (
    (select id from public.test_sources where name = 'IELTSOnlineTests'),
    'reading', null, 1,
    'IELTSOnlineTests — The Psychology of Habit Formation',
    'Habits are automatic behavioural routines triggered by contextual cues. According to the habit-loop model proposed by Charles Duhigg, every habit consists of three components: a cue, a routine, and a reward. The cue is an environmental or internal signal that activates the behaviour; the routine is the behaviour itself; and the reward reinforces the neural pathway, making the habit more automatic over time. Neuroscientists have identified the basal ganglia — a cluster of nuclei deep in the brain — as the primary structure governing habitual behaviour. Crucially, forming a new habit does not erase an old one; old habits remain encoded in the basal ganglia, which explains why people often relapse under stress. The 21-day habit-formation claim, frequently cited in popular psychology, is contradicted by empirical research: a 2010 study by Phillippa Lally found that on average it takes 66 days for a new behaviour to become automatic, with a range of 18 to 254 days depending on the individual and complexity of the behaviour.'
  ) returning id into t6_id;

  insert into public.questions
    (test_id, question_number, prompt, question_type, correct_answer, grammar_hint, shorthand_variants, distractor_options, word_limit)
  values
    (t6_id, 1,
     'The three components of the habit loop are: cue, routine, and',
     'sentence_completion', 'reward',
     'noun: third element of a triad, positive reinforcement domain',
     array['reward','reinforcement','third element'],
     array['repetition','reflection','response'],
     1),
    (t6_id, 2,
     'The brain structure primarily governing habitual behaviour is the',
     'sentence_completion', 'basal ganglia',
     'proper noun: anatomical structure, two words',
     array['basal ganglia','deep brain structure','neural cluster'],
     array['prefrontal cortex','hippocampus','amygdala'],
     2),
    (t6_id, 3,
     'Old habits remain stored in the basal ganglia, which explains why people relapse under',
     'sentence_completion', 'stress',
     'noun: single word, psychological trigger',
     array['stress','pressure','difficult conditions'],
     array['fatigue','boredom','illness'],
     1),
    (t6_id, 4,
     'The popular claim that habits form in 21 days is described as',
     'true_false_ng', 'FALSE',
     'T/F/NG: contradicted explicitly in the passage',
     array['FALSE','contradicted claim','wrong claim'],
     array['TRUE','NOT GIVEN'],
     1),
    (t6_id, 5,
     'On average, according to Lally''s 2010 study, habits take how many days to form?',
     'short_answer', '66 days',
     'number + noun: specific empirical finding',
     array['66 days','sixty-six days','Lally finding'],
     array['21 days','100 days','18 days'],
     2);

end;
$$;