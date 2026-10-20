import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';
import { env } from './env';
import { logger } from './logger';

// Create a connection pool so the application can reuse PostgreSQL
// connections instead of opening a new connection for every query.
export const pool = new Pool({
  // Read the database connection URL from environment configuration.
  connectionString: env.DATABASE_URL,

  // Keep a minimum number of connections available for database operations.
  min: env.DATABASE_POOL_MIN,

  // Limit the maximum number of connections to avoid overwhelming PostgreSQL.
  max: env.DATABASE_POOL_MAX,

  // Close idle connections after 30 seconds to avoid holding unused resources.
  idleTimeoutMillis: 30000,

  // Fail connection attempts that take longer than 5 seconds.
  // This prevents requests from waiting indefinitely for a database connection.
  connectionTimeoutMillis: 5000,
});

// Listen for unexpected errors on idle pooled connections.
// Logging these errors helps diagnose database connection problems.
pool.on('error', (err) => {
  logger.error({ err }, 'Unexpected error on idle PostgreSQL client');
});

// Execute a parameterized SQL query and return its result.
// The generic type T allows callers to specify the expected row shape.
export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[]
): Promise<QueryResult<T>> {
  // Record the start time so we can measure query execution duration.
  const start = Date.now();

  // Execute the query using the shared connection pool.
  // Parameters are passed separately to help prevent SQL injection.
  const res = await pool.query<T>(text, params);

  // Calculate how long the query took to execute.
  const duration = Date.now() - start;

  // Log query details at debug level to help identify slow database queries.
  logger.debug(
    { text, duration, rows: res.rowCount },
    'Executed PostgreSQL query'
  );

  // Return the query result so the caller can access rows and row count.
  return res;
}

// Execute multiple database operations inside a single transaction.
// Either commit all successful operations or roll back on failure.
export async function withTransaction<T>(
  callback: (client: PoolClient) => Promise<T>
): Promise<T> {
  // Acquire one dedicated connection because every transaction operation
  // must execute on the same PostgreSQL connection.
  const client = await pool.connect();

  try {
    // Start the transaction so subsequent operations can be committed
    // together or rolled back if something fails.
    await client.query('BEGIN');

    // Run the caller's database operations using the transaction client.
    const result = await callback(client);

    // Permanently commit the transaction if all operations succeed.
    await client.query('COMMIT');

    // Return the result produced by the callback.
    return result;
  } catch (error) {
    // Undo the transaction's changes if an operation fails.
    await client.query('ROLLBACK');

    // Re-throw the error so the calling code can handle the failure.
    throw error;
  } finally {
    // Always release the connection back to the pool,
    // whether the transaction succeeds or fails.
    client.release();
  }
}
