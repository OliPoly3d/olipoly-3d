# Operator-only database verification

The SQL in this directory inspects live PostgreSQL metadata and is **not an
application, startup, build, deploy, migration, CI, or background-job entry
point**. Some files intentionally scan `pg_proc`, call
`pg_get_functiondef`, or inspect `pg_stat_activity` and `pg_locks`.

## Terminal execution (recommended)

The launcher is a **Bash program, not a SQL query**. Run it in a terminal from
the repository checkout:

```sh
RUN_DB_INTROSPECTION=true \
DATABASE_URL='postgresql://…' \
./scripts/run-db-introspection.sh production_workflow_execution_graph
```

Do **not** paste `scripts/run-db-introspection.sh` into the Supabase SQL editor.
Its first line is the shell directive `#!/usr/bin/env bash`; PostgreSQL will
correctly reject that text with SQLSTATE `42601` because it is not SQL.

## Supabase SQL editor execution

The SQL editor cannot read terminal environment variables, so the
`RUN_DB_INTROSPECTION` shell gate is not available there. For an intentional
operator run, open the specific `.sql` file under this directory, review it,
and paste **only that SQL file's contents** into the editor. For example, use
`production_workflow_execution_graph.sql` itself—not the Bash launcher.

This direct SQL-editor path is necessarily an explicit, ungated operator
action. Do not save it as a scheduled query or connect it to application or
deployment automation.

The runner fails closed unless `RUN_DB_INTROSPECTION` is exactly `true`. Do
not add this variable to production application configuration. Do not invoke
these files from browser code, application initialization, timers, deployment
hooks, or scheduled workflows. Record and review each production execution.

Running a `.sql` file directly bypasses the terminal gate and is therefore an
explicit operator action, not a supported automated entry point.
