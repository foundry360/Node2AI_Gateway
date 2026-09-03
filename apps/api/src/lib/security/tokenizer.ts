import { DetectedEntity, TokenMapping } from '../types/sanitization';
import * as crypto from 'crypto';

export class Tokenizer {
  private encryptionKey: string;
  private tokenCounter: Map<string, number> = new Map();

  constructor(encryptionKey?: string) {
    this.encryptionKey =
      encryptionKey ||
      process.env.SANITIZATION_KEY ||
      'default-key-change-in-production';
  }

  /**
   * Generate a secure token for an entity
   */
  generateToken(entityType: string, sessionId: string): string {
    const counter = this.tokenCounter.get(sessionId) || 0;
    this.tokenCounter.set(sessionId, counter + 1);

    const timestamp = Date.now().toString(36);
    const random = crypto.randomBytes(4).toString('hex');
    return `[${entityType}_${counter.toString().padStart(3, '0')}_${timestamp}_${random}]`;
  }

  /**
   * Encrypt sensitive data
   */
  encryptValue(value: string): string {
    try {
      const algorithm = 'aes-256-gcm';
      const key = crypto.scryptSync(this.encryptionKey, 'salt', 32);
      const iv = crypto.randomBytes(16);

      const cipher = crypto.createCipheriv(algorithm, key, iv);
      cipher.setAAD(Buffer.from('node2-sanitization', 'utf8'));

      let encrypted = cipher.update(value, 'utf8', 'hex');
      encrypted += cipher.final('hex');

      const authTag = cipher.getAuthTag();

      // Combine IV, authTag, and encrypted data
      return (
        iv.toString('hex') + ':' + authTag.toString('hex') + ':' + encrypted
      );
    } catch (error) {
      console.error('Encryption failed:', error);
      // Fallback to base64 encoding (not secure, but better than plain text)
      return Buffer.from(value).toString('base64');
    }
  }

  /**
   * Decrypt sensitive data
   */
  decryptValue(encryptedValue: string): string {
    try {
      const algorithm = 'aes-256-gcm';
      const key = crypto.scryptSync(this.encryptionKey, 'salt', 32);

      const parts = encryptedValue.split(':');
      if (parts.length !== 3) {
        // Fallback to base64 decoding
        return Buffer.from(encryptedValue, 'base64').toString('utf8');
      }

      const iv = Buffer.from(parts[0], 'hex');
      const authTag = Buffer.from(parts[1], 'hex');
      const encrypted = parts[2];

      const decipher = crypto.createDecipheriv(algorithm, key, iv);
      decipher.setAAD(Buffer.from('node2-sanitization', 'utf8'));
      decipher.setAuthTag(authTag);

      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');

      return decrypted;
    } catch (error) {
      console.error('Decryption failed:', error);
      // Fallback to base64 decoding
      return Buffer.from(encryptedValue, 'base64').toString('utf8');
    }
  }

  /**
   * Create token mappings for detected entities
   */
  createTokenMappings(
    entities: DetectedEntity[],
    sessionId: string,
    organizationId: string
  ): TokenMapping[] {
    const mappings: TokenMapping[] = [];
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24 hours

    for (const entity of entities) {
      const token = this.generateToken(entity.type, sessionId);
      const encryptedValue = this.encryptValue(entity.value);

      mappings.push({
        token,
        originalValue: entity.value,
        entityType: entity.type,
        sessionId,
        organizationId,
        encryptedValue,
        createdAt: now,
        expiresAt,
      });
    }

    return mappings;
  }

  /**
   * Sanitize text by replacing entities with tokens
   */
  sanitizeText(
    text: string,
    entities: DetectedEntity[],
    tokenMappings: TokenMapping[]
  ): string {
    let sanitizedText = text;

    // Sort entities by start index in descending order to avoid index shifting
    const sortedEntities = [...entities].sort(
      (a, b) => b.startIndex - a.startIndex
    );

    for (const entity of sortedEntities) {
      const mapping = tokenMappings.find(
        m => m.originalValue === entity.value && m.entityType === entity.type
      );

      if (mapping) {
        // Special handling for all date entities - only replace MM/DD, keep YYYY
        const isDateEntity = [
          'DOB_MMDDYYYY',
          'DOB_DDMMYYYY',
          'ADMISSION_DATE',
          'DISCHARGE_DATE',
          'DATE_OF_DEATH',
        ].includes(entity.type);

        if (isDateEntity) {
          // Extract year from the date value (last 4 digits)
          // Match patterns like: MM/DD/YYYY, MM-DD-YYYY, DD/MM/YYYY, DD-MM-YYYY
          // Also handles prefixes like "Admission: 01/15/2024"
          const yearMatch = entity.value.match(/(\d{4})\b/);
          const year = yearMatch ? yearMatch[1] : '';

          if (year) {
            // Determine the separator used (look for / or - before the year)
            const separator = entity.value.includes('/') ? '/' : '-';

            // Find where the year starts in the original text
            const yearStartInEntity = entity.value.lastIndexOf(year);
            const yearStartInText = entity.startIndex + yearStartInEntity;

            // Replace everything from entity start to year start with token, then add year
            const before = sanitizedText.substring(0, entity.startIndex);
            const yearAndAfter = sanitizedText.substring(yearStartInText);
            sanitizedText = before + mapping.token + separator + yearAndAfter;
          } else {
            // Fallback: if we can't find year, replace entire entity
            const before = sanitizedText.substring(0, entity.startIndex);
            const after = sanitizedText.substring(entity.endIndex);
            sanitizedText = before + mapping.token + after;
          }
        } else {
          // Normal replacement for non-date entities
          const before = sanitizedText.substring(0, entity.startIndex);
          const after = sanitizedText.substring(entity.endIndex);
          sanitizedText = before + mapping.token + after;
        }
      }
    }

    return sanitizedText;
  }

  /**
   * Desanitize text by replacing tokens with original values
   */
  desanitizeText(text: string, tokenMappings: TokenMapping[]): string {
    let desanitizedText = text;

    for (const mapping of tokenMappings) {
      if (mapping.expiresAt < new Date()) {
        console.warn(`Token ${mapping.token} has expired`);
        continue;
      }

      try {
        const originalValue = this.decryptValue(mapping.encryptedValue);
        desanitizedText = desanitizedText.replace(mapping.token, originalValue);
      } catch (error) {
        console.error(`Failed to desanitize token ${mapping.token}:`, error);
        // Keep the token if decryption fails
      }
    }

    return desanitizedText;
  }

  /**
   * Clean up expired token mappings
   */
  cleanupExpiredMappings(tokenMappings: TokenMapping[]): TokenMapping[] {
    const now = new Date();
    return tokenMappings.filter(mapping => mapping.expiresAt > now);
  }

  /**
   * Get token statistics
   */
  getTokenStats(tokenMappings: TokenMapping[]): {
    totalTokens: number;
    expiredTokens: number;
    entityTypeCounts: Record<string, number>;
    averageAge: number;
  } {
    const now = new Date();
    const expiredTokens = tokenMappings.filter(m => m.expiresAt <= now).length;

    const entityTypeCounts: Record<string, number> = {};
    let totalAge = 0;

    for (const mapping of tokenMappings) {
      entityTypeCounts[mapping.entityType] =
        (entityTypeCounts[mapping.entityType] || 0) + 1;
      totalAge += now.getTime() - mapping.createdAt.getTime();
    }

    return {
      totalTokens: tokenMappings.length,
      expiredTokens,
      entityTypeCounts,
      averageAge:
        tokenMappings.length > 0 ? totalAge / tokenMappings.length : 0,
    };
  }
}
