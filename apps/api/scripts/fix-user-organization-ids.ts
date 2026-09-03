/**
 * Script to fix users with all-zero organization_id
 * Sets them to the default organization ID
 */

import { query } from '../src/lib/db/postgres-client';

const DEFAULT_ORG_ID = '00000000-0000-0000-0000-000000000001';
const ZERO_UUID = '00000000-0000-0000-0000-000000000000';

async function fixUserOrganizationIds() {
  try {
    console.log('Starting user organization_id fix...');

    // First, check if default organization exists
    const orgCheck = await query(`SELECT id FROM organizations WHERE id = $1`, [
      DEFAULT_ORG_ID,
    ]);

    if (orgCheck.rows.length === 0) {
      console.log('Creating default organization...');
      await query(
        `INSERT INTO organizations (id, name, deployment_mode, license_tier, max_instances)
         VALUES ($1, 'Default Organization', 'self-hosted', 'enterprise', 1)
         ON CONFLICT (id) DO NOTHING`,
        [DEFAULT_ORG_ID]
      );
    }

    // Find users with all-zero or NULL organization_id
    const usersToFix = await query(
      `SELECT id, email, name, organization_id 
       FROM users 
       WHERE organization_id = $1 OR organization_id IS NULL`,
      [ZERO_UUID]
    );

    console.log(`Found ${usersToFix.rows.length} users to fix:`);
    usersToFix.rows.forEach((user: any) => {
      console.log(
        `  - ${user.email} (${user.name}): ${user.organization_id || 'NULL'}`
      );
    });

    if (usersToFix.rows.length === 0) {
      console.log('No users need to be fixed.');
      return;
    }

    // Update all users with the default organization ID
    const updateResult = await query(
      `UPDATE users 
       SET organization_id = $1, updated_at = NOW()
       WHERE organization_id = $2 OR organization_id IS NULL
       RETURNING id, email, name`,
      [DEFAULT_ORG_ID, ZERO_UUID]
    );

    console.log(
      `✅ Updated ${updateResult.rows.length} users to use default organization:`
    );
    updateResult.rows.forEach((user: any) => {
      console.log(`  ✓ ${user.email} (${user.name})`);
    });

    console.log('✅ User organization_id fix completed successfully!');
  } catch (error) {
    console.error('❌ Error fixing user organization_ids:', error);
    throw error;
  }
}

// Run if called directly
if (require.main === module) {
  fixUserOrganizationIds()
    .then(() => {
      console.log('Done!');
      process.exit(0);
    })
    .catch(error => {
      console.error('Script failed:', error);
      process.exit(1);
    });
}

export { fixUserOrganizationIds };
