#!/usr/bin/env ts-node
/**
 * Cleanup Expired Token Mappings
 * Removes expired token mappings from sanitization_events table
 * Run hourly via cron or scheduled job
 */

import { AuditService } from '../../apps/api/src/lib/audit/audit.service';

const auditService = new AuditService();

async function cleanupExpiredTokens() {
  console.log('Starting cleanup of expired token mappings...');

  try {
    const deletedCount = await auditService.cleanupExpiredTokens();

    console.log(`Successfully deleted ${deletedCount} expired token mappings`);

    // Log system event
    await auditService.logSystemEvent({
      eventType: 'configuration_change',
      eventCategory: 'compliance',
      severity: 'info',
      actorType: 'system',
      action: 'cleanup_expired_tokens',
      description: `Cleaned up ${deletedCount} expired token mappings`,
      status: 'success',
    });

    console.log('Cleanup completed successfully');
  } catch (error: any) {
    console.error('Error during cleanup:', error);

    // Log error event
    await auditService.logSystemEvent({
      eventType: 'configuration_change',
      eventCategory: 'compliance',
      severity: 'error',
      actorType: 'system',
      action: 'cleanup_expired_tokens',
      description: `Cleanup failed: ${error.message}`,
      status: 'failure',
      errorMessage: error.message,
    });

    process.exit(1);
  } finally {
    // Supabase doesn't require explicit disconnect
  }
}

// Run cleanup
cleanupExpiredTokens().catch(console.error);
