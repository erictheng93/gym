import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema.js';

const connectionString = process.env.DATABASE_URL || 'postgresql://directus:directus@localhost:15432/gym_nexus';

const client = postgres(connectionString);

export const db = drizzle(client, { schema });

export type Database = typeof db;

export * from './schema.js';
