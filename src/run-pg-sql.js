#!/usr/bin/env node

/* eslint-disable no-console */
import fs from 'fs';
import assert from 'assert';
import pgp from 'pg-promise';

const { PGHOST, PGUSER, PGPASSWORD } = process.env;

assert(PGHOST, 'Must have PGHOST environment variable');
assert(PGUSER, 'Must have PGUSER environment variable');
assert(PGPASSWORD, 'Must have PGPASSWORD environment variable');

const database = process.argv[2];
const sql = fs.readFileSync(process.argv[3], 'utf8');

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
  .catch((e) => {
    console.error(e);
    client.end();
    process.exitCode = -1;
  });
