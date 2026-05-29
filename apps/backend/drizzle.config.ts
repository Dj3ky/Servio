import { config } from 'dotenv';
import { resolve } from 'path';
// look for .env in apps/backend first, fall back to monorepo root
config({ path: resolve(__dirname, '.env') });
config({ path: resolve(__dirname, '../../.env') });
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/db/schema/index.ts',
  out: './src/db/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
  verbose: true,
  strict: true,
});
