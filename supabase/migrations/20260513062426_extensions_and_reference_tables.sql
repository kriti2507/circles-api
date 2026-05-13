-- Extensions
create extension if not exists postgis with schema extensions;
create extension if not exists citext  with schema extensions;

-- Reference: languages (ISO 639-1)
create table public.languages (
    code text primary key check (char_length(code) = 2),
    name text not null
);

-- Reference: interests
create table public.interests (
    id       bigint generated always as identity primary key,
    slug     text not null unique,
    name     text not null,
    category text
);

create index interests_category_idx on public.interests (category);

-- RLS: reference tables are readable to authenticated users, writes blocked.
alter table public.languages enable row level security;
alter table public.interests enable row level security;

create policy "languages readable by authenticated"
    on public.languages for select
    to authenticated
    using (true);

create policy "interests readable by authenticated"
    on public.interests for select
    to authenticated
    using (true);

-- Seed: languages (common subset; extend later as needed)
insert into public.languages (code, name) values
    ('en', 'English'),
    ('hi', 'Hindi'),
    ('es', 'Spanish'),
    ('fr', 'French'),
    ('de', 'German'),
    ('it', 'Italian'),
    ('pt', 'Portuguese'),
    ('ru', 'Russian'),
    ('zh', 'Chinese'),
    ('ja', 'Japanese'),
    ('ko', 'Korean'),
    ('ar', 'Arabic'),
    ('bn', 'Bengali'),
    ('pa', 'Punjabi'),
    ('ta', 'Tamil'),
    ('te', 'Telugu'),
    ('mr', 'Marathi'),
    ('gu', 'Gujarati'),
    ('kn', 'Kannada'),
    ('ml', 'Malayalam'),
    ('ur', 'Urdu'),
    ('tr', 'Turkish'),
    ('vi', 'Vietnamese'),
    ('th', 'Thai'),
    ('id', 'Indonesian'),
    ('nl', 'Dutch'),
    ('pl', 'Polish'),
    ('sv', 'Swedish'),
    ('he', 'Hebrew'),
    ('fa', 'Persian');

-- Seed: interests (starter set; categories help future UI grouping)
insert into public.interests (slug, name, category) values
    -- sports & fitness
    ('running',         'Running',           'sports'),
    ('cycling',         'Cycling',           'sports'),
    ('hiking',          'Hiking',            'sports'),
    ('yoga',            'Yoga',              'sports'),
    ('gym',             'Gym',               'sports'),
    ('football',        'Football',          'sports'),
    ('cricket',         'Cricket',           'sports'),
    ('basketball',      'Basketball',        'sports'),
    ('tennis',          'Tennis',            'sports'),
    ('swimming',        'Swimming',          'sports'),
    ('climbing',        'Climbing',          'sports'),
    ('martial-arts',    'Martial arts',      'sports'),
    -- arts & creativity
    ('photography',     'Photography',       'arts'),
    ('painting',        'Painting',          'arts'),
    ('drawing',         'Drawing',           'arts'),
    ('writing',         'Writing',           'arts'),
    ('poetry',          'Poetry',            'arts'),
    ('music-listening', 'Music',             'arts'),
    ('music-playing',   'Playing music',     'arts'),
    ('singing',         'Singing',           'arts'),
    ('dancing',         'Dancing',           'arts'),
    ('film',            'Film',              'arts'),
    ('theatre',         'Theatre',           'arts'),
    -- food & drink
    ('cooking',         'Cooking',           'food'),
    ('baking',          'Baking',            'food'),
    ('coffee',          'Coffee',            'food'),
    ('tea',             'Tea',               'food'),
    ('wine',            'Wine',              'food'),
    ('craft-beer',      'Craft beer',        'food'),
    ('foodie',          'Trying new food',   'food'),
    -- tech & learning
    ('coding',          'Coding',            'tech'),
    ('ai',              'AI',                'tech'),
    ('startups',        'Startups',          'tech'),
    ('design',          'Design',            'tech'),
    ('gaming',          'Gaming',            'tech'),
    ('reading',         'Reading',           'learning'),
    ('podcasts',        'Podcasts',          'learning'),
    ('learning-langs',  'Learning languages','learning'),
    ('science',         'Science',           'learning'),
    ('history',         'History',           'learning'),
    -- outdoors & travel
    ('travel',          'Travel',            'outdoors'),
    ('camping',         'Camping',           'outdoors'),
    ('beach',           'Beach',             'outdoors'),
    ('nature',          'Nature',            'outdoors'),
    ('gardening',       'Gardening',         'outdoors'),
    -- social & lifestyle
    ('board-games',     'Board games',       'social'),
    ('trivia',          'Trivia',            'social'),
    ('volunteering',    'Volunteering',      'social'),
    ('meditation',      'Meditation',        'wellness'),
    ('journaling',      'Journaling',        'wellness'),
    ('pets',            'Pets',              'lifestyle'),
    ('fashion',         'Fashion',           'lifestyle');
