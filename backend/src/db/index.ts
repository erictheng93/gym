import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema.js';

const connectionString = process.env.DATABASE_URL || 'postgresql://gym_nexus:gym_nexus_dev@localhost:15432/gym_nexus';

const client = postgres(connectionString, {
  max: Number(process.env.DB_MAX_CONNECTIONS) || 20,
  idle_timeout: Number(process.env.DB_IDLE_TIMEOUT) || 30,
  connect_timeout: Number(process.env.DB_CONNECT_TIMEOUT) || 10,
});

export const db = drizzle(client, { schema });

export type Database = typeof db;

export * from './schema.js';
