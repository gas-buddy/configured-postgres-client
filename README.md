configured-postgres-client
==========================

[![Greenkeeper badge](https://badges.greenkeeper.io/gas-buddy/configured-postgres-client.svg)](https://greenkeeper.io/)
A small wrapper around pg/pg-promise to allow configuration from confit and
tracking of start/finish/queryError on all queries.

Supports the following methods from pg-promise: connect, none, one, oneOrNone, many, manyOrNone, result