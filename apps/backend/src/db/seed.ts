import 'dotenv/config';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import bcrypt from 'bcryptjs';
import { config } from '../config';
import * as schema from './schema';

async function seed() {
  const pool = new Pool({ connectionString: config.databaseUrl });
  const db = drizzle(pool, { schema });

  console.log('Seeding database...');

  const existingAdmin = await db.query.users.findFirst({
    where: (users, { eq }) => eq(users.email, 'admin@servio.local'),
  });

  if (!existingAdmin) {
    const passwordHash = await bcrypt.hash('admin123', 12);
    await db.insert(schema.users).values({
      email: 'admin@servio.local',
      name: 'Administrator',
      passwordHash,
      role: 'admin',
      languagePreference: 'sl',
      isActive: true,
    });
    console.log('Created default admin: admin@servio.local / admin123');
  }

  const existingSettings = await db.query.settings.findFirst();
  if (!existingSettings) {
    await db.insert(schema.settings).values({
      id: 1,
      appName: 'Servio',
      defaultLanguage: 'sl',
      backupEnabled: false,
    });
    console.log('Created default settings.');
  }

  const existingTemplate = await db.query.emailTemplates.findFirst();
  if (!existingTemplate) {
    await db.insert(schema.emailTemplates).values([
      {
        name: 'Standardno poročilo (SL)',
        subject: 'Poročilo o vzdrževanju – {{facility_name}} – {{month}} {{year}}',
        body: `Spoštovani {{customer_name}},\n\nV prilogi posredujemo poročilo o rednem vzdrževanju za objekt {{facility_name}} za mesec {{month}} {{year}}.\n\nŠtevilka pogodbe: {{contract_number}}\n\nS spoštovanjem,\n{{app_name}}`,
        language: 'sl',
        isDefault: true,
      },
      {
        name: 'Standard Report (EN)',
        subject: 'Maintenance Report – {{facility_name}} – {{month}} {{year}}',
        body: `Dear {{customer_name}},\n\nPlease find attached the maintenance report for facility {{facility_name}} for {{month}} {{year}}.\n\nContract number: {{contract_number}}\n\nBest regards,\n{{app_name}}`,
        language: 'en',
        isDefault: false,
      },
    ]);
    console.log('Created default email templates.');
  }

  console.log('Seed complete.');
  await pool.end();
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
