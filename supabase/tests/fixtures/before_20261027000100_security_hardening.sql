-- Accounts created under the old trigger, before the hardening migration.
-- Their handles are derived from the email address, which the migration
-- must replace.
insert into auth.users (id, email, raw_user_meta_data) values
  ('0000000a-0000-4000-8000-000000000001', 'jane.doe.1985@example.com', '{}'),
  ('0000000a-0000-4000-8000-000000000002', 'sam@example.com', '{"full_name":"Sam Rivers"}');
