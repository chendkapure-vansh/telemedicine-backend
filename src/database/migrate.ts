import fs from 'fs';
import path from 'path';
import { pool, withTransaction } from '../config/database';
import { logger } from '../config/logger';

export async function runMigrations(): Promise<void> {
  const migrationsDir = path.join(__dirname, 'migrations');

  if (!fs.existsSync(migrationsDir)) {
    logger.warn('No migrations directory found');
    return;
  }

  // 1. Ensure schema_migrations table exists
  await withTransaction(async (client) => {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) UNIQUE NOT NULL,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);
  });

  // 2. Fetch already applied migrations
  const { rows: appliedRows } = await pool.query<{ name: string }>(
    'SELECT name FROM schema_migrations'
  );
  const appliedSet = new Set(appliedRows.map((r) => r.name));

  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  for (const file of files) {
    if (appliedSet.has(file)) {
      logger.debug({ file }, 'Migration already applied, skipping');
      continue;
    }

    const filePath = path.join(migrationsDir, file);
    const sql = fs.readFileSync(filePath, 'utf8');

    logger.info({ file }, 'Applying database migration');

    await withTransaction(async (client) => {
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
    });

    logger.info({ file }, 'Migration applied successfully');
  }
}

// Allow standalone execution: npx ts-node src/database/migrate.ts
if (require.main === module) {
  runMigrations()
    .then(async () => {
      logger.info('All migrations completed successfully');
      await pool.end();
      process.exit(0);
    })
    .catch(async (err) => {
      logger.error({ err }, 'Migration failed');
      await pool.end();
      process.exit(1);
    });
}
