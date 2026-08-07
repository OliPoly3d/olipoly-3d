# Operator-only database verification

The SQL in this directory inspects live PostgreSQL metadata and is **not an
application, startup, build, deploy, migration, CI, or background-job entry
point**. Some files intentionally scan `pg_proc`, call
`pg_get_functiondef`, or inspect `pg_stat_activity` and `pg_locks`.

Run a verification only for a deliberate, one-off operator investigation:

```sh
RUN_DB_INTROSPECTION=true \
DATABASE_URL='postgresql://…' \
./scripts/run-db-introspection.sh production_workflow_execution_graph
```

The runner fails closed unless `RUN_DB_INTROSPECTION` is exactly `true`. Do
not add this variable to production application configuration. Do not invoke
these files from browser code, application initialization, timers, deployment
hooks, or scheduled workflows. Record and review each production execution.

Running a `.sql` file directly bypasses this repository gate and is therefore
an explicit operator action, not a supported automated entry point.
