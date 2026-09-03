import { ProcessedDocument, DocumentMetadata } from './document-processor';

export interface DocumentVersion {
  id: string;
  document_id: string;
  version_number: number;
  filename: string;
  file_size: number;
  file_hash: string; // SHA-256 hash for change detection
  metadata: DocumentMetadata;
  chunks: any[]; // DocumentChunk[]
  processing_status: 'pending' | 'processing' | 'completed' | 'failed';
  created_at: Date;
  created_by: string;
  change_description?: string;
  is_current: boolean;
}

export interface VersionComparison {
  version_a: DocumentVersion;
  version_b: DocumentVersion;
  changes: {
    metadata_changes: Record<string, { old: any; new: any }>;
    content_changes: {
      chunks_added: number;
      chunks_removed: number;
      chunks_modified: number;
      total_changes: number;
    };
    file_changes: {
      size_change: number;
      hash_changed: boolean;
    };
  };
}

export interface VersionHistory {
  document_id: string;
  versions: DocumentVersion[];
  current_version: DocumentVersion | null;
  total_versions: number;
}

export class DocumentVersioningService {
  private versions: Map<string, DocumentVersion[]> = new Map();
  private currentVersions: Map<string, string> = new Map(); // document_id -> current_version_id

  /**
   * Create a new version of a document
   */
  async createVersion(
    document: ProcessedDocument,
    createdBy: string,
    changeDescription?: string
  ): Promise<DocumentVersion> {
    const documentId = document.id;
    const existingVersions = this.versions.get(documentId) || [];
    const nextVersionNumber = existingVersions.length + 1;

    // Calculate file hash for change detection
    const fileHash = await this.calculateFileHash(document);

    // Check if this is actually a new version (content changed)
    const lastVersion = existingVersions[existingVersions.length - 1];
    if (lastVersion && lastVersion.file_hash === fileHash) {
      // No changes detected, return existing version
      return lastVersion;
    }

    // Create new version
    const version: DocumentVersion = {
      id: `version_${documentId}_${nextVersionNumber}_${Date.now()}`,
      document_id: documentId,
      version_number: nextVersionNumber,
      filename: document.original_filename,
      file_size: document.file_size,
      file_hash: fileHash,
      metadata: { ...document.metadata },
      chunks: [...document.chunks], // Deep copy chunks
      processing_status: document.processing_status,
      created_at: new Date(),
      created_by: createdBy,
      change_description: changeDescription,
      is_current: true,
    };

    // Mark previous versions as not current
    existingVersions.forEach(v => (v.is_current = false));

    // Add new version
    existingVersions.push(version);
    this.versions.set(documentId, existingVersions);
    this.currentVersions.set(documentId, version.id);

    console.log(
      `Created version ${nextVersionNumber} for document ${documentId}`
    );
    return version;
  }

  /**
   * Get version history for a document
   */
  getVersionHistory(documentId: string): VersionHistory {
    const versions = this.versions.get(documentId) || [];
    const currentVersion = versions.find(v => v.is_current) || null;

    return {
      document_id: documentId,
      versions: versions.sort((a, b) => b.version_number - a.version_number), // Latest first
      current_version: currentVersion,
      total_versions: versions.length,
    };
  }

  /**
   * Get a specific version of a document
   */
  getVersion(
    documentId: string,
    versionNumber: number
  ): DocumentVersion | null {
    const versions = this.versions.get(documentId) || [];
    return versions.find(v => v.version_number === versionNumber) || null;
  }

  /**
   * Get the current version of a document
   */
  getCurrentVersion(documentId: string): DocumentVersion | null {
    const versions = this.versions.get(documentId) || [];
    return versions.find(v => v.is_current) || null;
  }

  /**
   * Restore a document to a specific version
   */
  async restoreToVersion(
    documentId: string,
    versionNumber: number,
    restoredBy: string
  ): Promise<DocumentVersion> {
    const targetVersion = this.getVersion(documentId, versionNumber);
    if (!targetVersion) {
      throw new Error(
        `Version ${versionNumber} not found for document ${documentId}`
      );
    }

    // Create a new version based on the restored version
    const restoredVersion: DocumentVersion = {
      ...targetVersion,
      id: `version_${documentId}_${Date.now()}_restored`,
      version_number: this.versions.get(documentId)!.length + 1,
      created_at: new Date(),
      created_by: restoredBy,
      change_description: `Restored to version ${versionNumber}`,
      is_current: true,
    };

    // Mark all other versions as not current
    const versions = this.versions.get(documentId) || [];
    versions.forEach(v => (v.is_current = false));

    // Add restored version
    versions.push(restoredVersion);
    this.versions.set(documentId, versions);
    this.currentVersions.set(documentId, restoredVersion.id);

    console.log(`Restored document ${documentId} to version ${versionNumber}`);
    return restoredVersion;
  }

  /**
   * Compare two versions of a document
   */
  compareVersions(
    documentId: string,
    versionA: number,
    versionB: number
  ): VersionComparison | null {
    const versionAObj = this.getVersion(documentId, versionA);
    const versionBObj = this.getVersion(documentId, versionB);

    if (!versionAObj || !versionBObj) {
      return null;
    }

    // Compare metadata
    const metadataChanges: Record<string, { old: any; new: any }> = {};
    const keys = new Set([
      ...Object.keys(versionAObj.metadata),
      ...Object.keys(versionBObj.metadata),
    ]);

    for (const key of keys) {
      const oldValue = versionAObj.metadata[key as keyof DocumentMetadata];
      const newValue = versionBObj.metadata[key as keyof DocumentMetadata];

      if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
        metadataChanges[key] = { old: oldValue, new: newValue };
      }
    }

    // Compare content (chunks)
    const chunksA = versionAObj.chunks;
    const chunksB = versionBObj.chunks;

    const chunksAdded = chunksB.length - chunksA.length;
    const chunksRemoved = Math.max(0, chunksA.length - chunksB.length);

    // Count modified chunks (simplified comparison)
    let chunksModified = 0;
    const minLength = Math.min(chunksA.length, chunksB.length);

    for (let i = 0; i < minLength; i++) {
      if (JSON.stringify(chunksA[i]) !== JSON.stringify(chunksB[i])) {
        chunksModified++;
      }
    }

    return {
      version_a: versionAObj,
      version_b: versionBObj,
      changes: {
        metadata_changes: metadataChanges,
        content_changes: {
          chunks_added: Math.max(0, chunksAdded),
          chunks_removed: chunksRemoved,
          chunks_modified: chunksModified,
          total_changes: Math.abs(chunksAdded) + chunksRemoved + chunksModified,
        },
        file_changes: {
          size_change: versionBObj.file_size - versionAObj.file_size,
          hash_changed: versionAObj.file_hash !== versionBObj.file_hash,
        },
      },
    };
  }

  /**
   * Delete a specific version (but not the current one)
   */
  deleteVersion(documentId: string, versionNumber: number): boolean {
    const versions = this.versions.get(documentId) || [];
    const versionIndex = versions.findIndex(
      v => v.version_number === versionNumber
    );

    if (versionIndex === -1) {
      return false;
    }

    const version = versions[versionIndex];
    if (version.is_current) {
      throw new Error('Cannot delete the current version');
    }

    versions.splice(versionIndex, 1);
    this.versions.set(documentId, versions);

    console.log(`Deleted version ${versionNumber} of document ${documentId}`);
    return true;
  }

  /**
   * Get version statistics
   */
  getVersionStats(documentId: string): {
    total_versions: number;
    current_version: number;
    oldest_version: number;
    version_creators: Record<string, number>;
    average_versions_per_month: number;
  } {
    const versions = this.versions.get(documentId) || [];
    const currentVersion = versions.find(v => v.is_current);

    const versionCreators: Record<string, number> = {};
    versions.forEach(v => {
      versionCreators[v.created_by] = (versionCreators[v.created_by] || 0) + 1;
    });

    // Calculate average versions per month
    if (versions.length > 1) {
      const oldest = versions[0].created_at;
      const newest = versions[versions.length - 1].created_at;
      const monthsDiff =
        (newest.getTime() - oldest.getTime()) / (1000 * 60 * 60 * 24 * 30);
      const averageVersionsPerMonth =
        monthsDiff > 0 ? versions.length / monthsDiff : 0;
    }

    return {
      total_versions: versions.length,
      current_version: currentVersion?.version_number || 0,
      oldest_version: versions.length > 0 ? versions[0].version_number : 0,
      version_creators: versionCreators,
      average_versions_per_month: 0, // Simplified for now
    };
  }

  /**
   * Calculate file hash for change detection
   */
  private async calculateFileHash(
    document: ProcessedDocument
  ): Promise<string> {
    // Create a hash based on document content and metadata
    const content = JSON.stringify({
      filename: document.original_filename,
      file_size: document.file_size,
      metadata: document.metadata,
      chunks: document.chunks.map(chunk => chunk.content),
    });

    // Simple hash function (in production, use crypto.createHash)
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32-bit integer
    }

    return Math.abs(hash).toString(16);
  }

  /**
   * Clean up old versions (keep only last N versions)
   */
  cleanupOldVersions(documentId: string, keepVersions: number = 10): number {
    const versions = this.versions.get(documentId) || [];
    if (versions.length <= keepVersions) {
      return 0;
    }

    // Sort by version number (oldest first)
    const sortedVersions = versions.sort(
      (a, b) => a.version_number - b.version_number
    );
    const versionsToDelete = sortedVersions.slice(
      0,
      versions.length - keepVersions
    );

    // Don't delete current version
    const versionsToKeep = sortedVersions.slice(versions.length - keepVersions);
    const currentVersion = versions.find(v => v.is_current);

    if (currentVersion && !versionsToKeep.includes(currentVersion)) {
      // Keep current version even if it's old
      versionsToKeep.push(currentVersion);
    }

    this.versions.set(documentId, versionsToKeep);

    console.log(
      `Cleaned up ${versionsToDelete.length} old versions for document ${documentId}`
    );
    return versionsToDelete.length;
  }
}
