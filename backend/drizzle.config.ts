import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  // Ignore PostGIS-owned tables (spatial_ref_sys), otherwise push prompts about renames
  extensionsFilters: ['postgis'],
  dbCredentials: {
    url: process.env.DATABASE_URL || 'postgresql://gym_nexus:gym_nexus_dev@localhost:15432/gym_nexus',
  },
  verbose: true,
  strict: true,
});
