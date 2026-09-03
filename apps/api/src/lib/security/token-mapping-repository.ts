import { query } from '../db/postgres-client';
import { TokenMapping } from '../types/sanitization';

export class TokenMappingRepository {
  async saveTokenMappings(
    tokenMappings: TokenMapping[],
    organizationId: string,
    sessionId: string
  ): Promise<void> {
    if (tokenMappings.length === 0) {
      return; // No mappings to save
    }

    // Batch insert token mappings to database
    for (const mapping of tokenMappings) {
      try {
        await query(
          `INSERT INTO token_mappings (
            organization_id, session_id, token_type, token, 
            encrypted_original_value, confidence, category, expires_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          ON CONFLICT (organization_id, session_id, token) DO UPDATE SET
            encrypted_original_value = EXCLUDED.encrypted_original_value,
            confidence = EXCLUDED.confidence`,
          [
            organizationId,
            sessionId,
            mapping.entityType,
            mapping.token,
            mapping.encryptedValue,
            this.getConfidenceFromType(mapping.entityType),
            this.getCategoryFromType(mapping.entityType),
            mapping.expiresAt,
          ]
        );
      } catch (error) {
        console.error(`Failed to save token mapping ${mapping.token}:`, error);
        // Continue with other mappings even if one fails
      }
    }
  }

  async getTokenMappings(
    organizationId: string,
    sessionId: string
  ): Promise<TokenMapping[]> {
    try {
      const result = await query(
        `SELECT * FROM token_mappings 
         WHERE organization_id = $1 AND session_id = $2 AND expires_at > NOW()
         ORDER BY created_at ASC`,
        [organizationId, sessionId]
      );

      return result.rows.map(row => ({
        token: row.token,
        originalValue: '', // Will be decrypted by Tokenizer
        entityType: row.token_type,
        sessionId: row.session_id,
        organizationId: row.organization_id,
        encryptedValue: row.encrypted_original_value,
        createdAt: row.created_at,
        expiresAt: row.expires_at,
      }));
    } catch (error) {
      console.error('Failed to fetch token mappings:', error);
      return [];
    }
  }

  private getCategoryFromType(entityType: string): string {
    const piiTypes = [
      'PERSON',
      'PERSON_NAME',
      'EMAIL',
      'PHONE',
      'PHONE_US',
      'ADDRESS',
      'STREET_ADDRESS',
      'CITY',
      'COUNTY',
      'PRECINCT',
      'ZIP_CODE',
      'DATE_OF_BIRTH',
    ];
    const phiTypes = [
      'MEDICAL_RECORD',
      'SSN',
      'HEALTH_PLAN_BENEFICIARY_NUMBER',
      'ADMISSION_DATE',
      'DISCHARGE_DATE',
      'DATE_OF_DEATH',
      'AGE_OVER_89',
      'FAX',
    ];
    const financialTypes = ['CREDIT_CARD', 'ACCOUNT_NUMBER'];
    const governmentTypes = [
      'PASSPORT',
      'DRIVER_LICENSE',
      'LICENSE_CERTIFICATE',
      'VEHICLE_ID',
      'LICENSE_PLATE',
    ];
    const biometricTypes = ['BIOMETRIC', 'PHOTO_IMAGE'];

    if (piiTypes.some(t => entityType.includes(t))) return 'PII';
    if (phiTypes.some(t => entityType.includes(t))) return 'PHI';
    if (financialTypes.some(t => entityType.includes(t))) return 'FINANCIAL';
    if (governmentTypes.some(t => entityType.includes(t))) return 'GOVERNMENT';
    if (biometricTypes.some(t => entityType.includes(t))) return 'BIOMETRIC';
    return 'OTHER';
  }

  private getConfidenceFromType(entityType: string): number {
    // Default confidence based on entity type
    // Critical identifiers get higher confidence
    if (['SSN', 'CREDIT_CARD', 'MEDICAL_RECORD'].includes(entityType)) {
      return 0.95;
    }
    if (
      ['EMAIL', 'PHONE_US', 'HEALTH_PLAN_BENEFICIARY_NUMBER'].includes(
        entityType
      )
    ) {
      return 0.9;
    }
    return 0.85; // Default confidence
  }
}
