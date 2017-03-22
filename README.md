configured-postgres-client
==========================
A small wrapper around pg/pg-promise to allow configuration from confit and
tracking of start/finish/queryError on all queries.

Supports the following methods from pg-promise: connect, none, one, oneOrNone, many, manyOrNone, result