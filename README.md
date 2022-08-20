configured-postgres-client
==========================

A small wrapper around pg/pg-promise to allow configuration from confit and
tracking of start/finish/error on all queries.

Supports the following methods from pg-promise: connect, any, none, one, oneOrNone, many, manyOrNone, result, tx, task

## SQL Files

This module also supports Query files from PGPromise.  In your config, pass in the directory of your query files.  You will then get an object that has the same structure as the folders you defined.

If your folder structure looks like this:
```
 - feature
    - create.sql
    - getById.sql
```

You could make a DB call like this:
```javascript
async getById(featureId, locale) {
    let returnFeature = null;
    const sqlFiles = this.dbClient.sqlFiles;
    const dbFeature = await this.dbClient.oneOrNone(sqlFiles.feature.getById, [featureId, locale]);
    if (dbFeature) {
      returnFeature = dbFeature.metadata;
    }
   return returnFeature;
 }
 ```

