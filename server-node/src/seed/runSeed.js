import { connectDB, disconnectDB } from '../config/db.js';
import { seedDatabase } from './seeder.js';

async function run() {
  try {
    await connectDB();
    const stats = await seedDatabase();
    console.log('[seeder] Database successfully populated or verified:', stats);
  } catch (err) {
    console.error('[seeder] Error during seeding:', err);
    process.exitCode = 1;
  } finally {
    await disconnectDB();
  }
}

run();

