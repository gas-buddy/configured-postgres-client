#!/usr/bin/env node

/* eslint-disable no-console */
import fs from 'fs';
import assert from 'assert';
import pgp from 'pg-promise';

const { PGHOST, PGUSER, PGPASSWORD } = process.env;

assert(PGHOST, 'Must have PGHOST environment variable');
assert(PGUSER, 'Must have PGUSER environment variable');
assert(PGPASSWORD, 'Must have PGPASSWORD environment variable');

const database: string = process.argv[2];
const sqlFile: string = process.argv[3];

if (!database) {
  console.error('Usage: run-pg-sql <database> <sql-file> [--quiet|-q]');
  process.exit(1);
}

if (!sqlFile) {
  console.error('Usage: run-pg-sql <database> <sql-file> [--quiet|-q]');
  process.exit(1);
}

const sql = fs.readFileSync(sqlFile, 'utf8');

const client = pgp();
const connection = client({
  host: PGHOST,
  database,
  user: PGUSER,
  password: PGPASSWORD,
});

if (!process.argv.find(s => s === '--quiet' || s === '-q')) {
  console.log(sql);
}

connection.none(sql)
  .then(() => {
    console.log('Query completed.');
    client.end();
    process.exitCode = 0;
  })
  .catch((e: Error) => {
    console.error(e);
    client.end();
    process.exitCode = -1;
  });