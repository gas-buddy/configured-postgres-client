configured-postgres-client
==========================

[![Greenkeeper badge](https://badges.greenkeeper.io/gas-buddy/configured-postgres-client.svg)](https://greenkeeper.io/)
[![wercker status](https://app.wercker.com/status/3bbed211529afb70894be073762d5552/s/master "wercker status")](https://app.wercker.com/project/byKey/3bbed211529afb70894be073762d5552)

A small wrapper around pg/pg-promise to allow configuration from confit and
tracking of start/finish/error on all queries.

Supports the following methods from pg-promise: connect, none, one, oneOrNone, many, manyOrNone, result, tx
