const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const runtimeExtensions = new Set(['.html', '.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx']);
const catalogPattern = /\b(?:pg_catalog|pg_proc|pg_type|pg_namespace|information_schema|pg_get_functiondef|to_regprocedure|regprocedure)\b/i;

function filesBelow(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === '.git' || entry.name === 'node_modules') return [];
    const fullPath = path.join(directory, entry.name);
    return entry.isDirectory() ? filesBelow(fullPath) : [fullPath];
  });
}

const files = filesBelow(root);
const applicationFiles = files.filter((file) => {
  const relative = path.relative(root, file);
  return runtimeExtensions.has(path.extname(file)) &&
    !relative.startsWith(`tests${path.sep}`) &&
    !relative.startsWith(`archive${path.sep}`) &&
    !relative.startsWith(`scripts${path.sep}`) &&
    !relative.startsWith(`supabase${path.sep}`) &&
    !relative.startsWith(`.github${path.sep}`);
});

test('browser and application runtime contain no PostgreSQL catalog introspection', () => {
  const offenders = applicationFiles.filter((file) => catalogPattern.test(fs.readFileSync(file, 'utf8')));
  assert.deepEqual(offenders.map((file) => path.relative(root, file)), []);
});

test('application runtime does not import verification or migration SQL', () => {
  const forbiddenImport = /(?:supabase[\\/]verification|supabase[\\/]migrations|run-db-introspection)/i;
  const offenders = applicationFiles.filter((file) => forbiddenImport.test(fs.readFileSync(file, 'utf8')));
  assert.deepEqual(offenders.map((file) => path.relative(root, file)), []);
});

test('scheduled workflows do not run schema generation, migrations, or introspection', () => {
  const workflowFiles = files.filter((file) => path.relative(root, file).startsWith(`.github${path.sep}workflows${path.sep}`));
  const forbidden = /(?:supabase\s+(?:gen\s+types|db\s+(?:pull|dump|diff|push)|migration\s+(?:list|up))|pg_catalog|pg_proc|information_schema|run-db-introspection)/i;
  const offenders = workflowFiles.filter((file) => forbidden.test(fs.readFileSync(file, 'utf8')));
  assert.deepEqual(offenders.map((file) => path.relative(root, file)), []);
});

test('introspection runner is fail-closed and production has no enabling default', () => {
  const runner = fs.readFileSync(path.join(root, 'scripts/run-db-introspection.sh'), 'utf8');
  assert.match(runner, /RUN_DB_INTROSPECTION:-.*!= "true"/);
  assert.match(runner, /DATABASE_URL:\?/);

  const enablingDefaults = files.filter((file) => {
    const relative = path.relative(root, file);
    if (relative === 'tests/db-introspection-runtime-boundary.test.js') return false;
    if (relative === 'supabase/verification/README.md') return false;
    if (relative === 'scripts/run-db-introspection.sh') return false;
    if (!/\.(?:html|js|mjs|cjs|ts|tsx|jsx|ya?ml|json|toml|env|sh)$/.test(file)) return false;
    return /RUN_DB_INTROSPECTION\s*[=:]\s*["']?true\b/i.test(fs.readFileSync(file, 'utf8'));
  });
  assert.deepEqual(enablingDefaults.map((file) => path.relative(root, file)), []);
});

test('no periodic application timer invokes metadata scans', () => {
  const offenders = applicationFiles.filter((file) => {
    const source = fs.readFileSync(file, 'utf8');
    return /setInterval\s*\([\s\S]{0,1200}(?:pg_catalog|pg_proc|information_schema|function metadata|schema metadata)/i.test(source);
  });
  assert.deepEqual(offenders.map((file) => path.relative(root, file)), []);
});
