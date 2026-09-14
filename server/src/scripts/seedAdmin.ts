import { connectDatabase, disconnectDatabase } from '../config/db';
import { Admin } from '../models/Admin';
import { ROLES } from '../config/constants';
import { env } from '../config/env';
import { logger } from '../utils/logger';

/**
 * Creates (or updates) the initial super admin using SUPER_ADMIN_USERNAME /
 * SUPER_ADMIN_PASSWORD. The password is hashed by the model's pre-save hook.
 * Safe to run repeatedly — it will not create duplicates.
 */
async function seedAdmin(): Promise<void> {
  await connectDatabase();

  const username = (env.SUPER_ADMIN_USERNAME || 'amriec_admin').toLowerCase().trim();
  const password = env.SUPER_ADMIN_PASSWORD || 'amriec2026';
  const existing = await Admin.findOne({ username });

  if (existing) {
    logger.info(`Super admin "${username}" already exists. Ensuring role + active status.`);
    existing.role = ROLES.SUPER_ADMIN;
    existing.isActive = true;
    // Reset the password to the env value so it stays in sync with .env.
    existing.password = password;
    await existing.save();
    logger.info('Super admin updated.');
  } else {
    await Admin.create({
      username,
      fullName: 'AMR IEC Super Admin',
      password,
      role: ROLES.SUPER_ADMIN,
      isActive: true,
    });
    logger.info(`Super admin "${username}" created.`);
  }

  logger.warn('Remember to change the default password after first login in production.');
  await disconnectDatabase();
}

seedAdmin().catch((err) => {
  logger.error('Seed failed', err);
  process.exit(1);
});
