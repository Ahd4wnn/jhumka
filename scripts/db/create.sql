-- One-time local setup: creates the `jhumka` login role plus the app and test databases.
-- Run it (it asks for your postgres password, then a new password for jhumka):
--   D:\PostgreSQL\bin\psql -U postgres -f D:\f13s\jhumka\scripts\db\create.sql
\set ON_ERROR_STOP on
\prompt 'New password for the database user "jhumka" (letters and numbers only): ' jhumka_pw

SELECT format('CREATE ROLE jhumka LOGIN PASSWORD %L', :'jhumka_pw')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'jhumka') \gexec

SELECT 'CREATE DATABASE jhumka OWNER jhumka ENCODING ''UTF8'' TEMPLATE template0'
WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = 'jhumka') \gexec

SELECT 'CREATE DATABASE jhumka_test OWNER jhumka ENCODING ''UTF8'' TEMPLATE template0'
WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = 'jhumka_test') \gexec

\connect jhumka
CREATE EXTENSION IF NOT EXISTS citext;
\connect jhumka_test
CREATE EXTENSION IF NOT EXISTS citext;

\echo ''
\echo 'Done. Put these lines in the .env file in the project folder (replace YOUR_PASSWORD with the one you just chose):'
\echo 'DATABASE_URL=postgres://jhumka:YOUR_PASSWORD@localhost:5432/jhumka'
\echo 'TEST_DATABASE_URL=postgres://jhumka:YOUR_PASSWORD@localhost:5432/jhumka_test'
