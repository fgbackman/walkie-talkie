-- Extensions live in their own schema so they never shadow public objects.
create schema if not exists extensions;

create extension if not exists "pgcrypto"  with schema extensions;
create extension if not exists "citext"    with schema extensions;

-- A private schema for things no API role may ever touch.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
