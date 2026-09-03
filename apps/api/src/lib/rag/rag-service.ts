import {
  DocumentProcessor,
  ProcessedDocument,
  DocumentChunk,
  DocumentMetadata,
} from './document-processor';
import { EmbeddingService, SearchResult } from './embedding-service';
import {
  DocumentVersioningService,
  DocumentVersion,
  VersionHistory,
  VersionComparison,
} from './document-versioning';

export interface RAGSearchRequest {
  query: string;
  limit?: number;
  threshold?: number;
  organization_id: string;
  source_filters?: string[];
}

export interface RAGSearchResponse {
  results: SearchResult[];
  query: string;
  total_results: number;
  processing_time: number;
  metadata: {
    organization_id: string;
    search_timestamp: Date;
    filters_applied: string[];
  };
}

export interface RAGContext {
  relevant_chunks: DocumentChunk[];
  context_text: string;
  sources: string[];
  confidence_score: number;
}

export class RAGService {
  private documentProcessor: DocumentProcessor;
  private embeddingService: EmbeddingService;
  private versioningService: DocumentVersioningService;
  private documents: Map<string, ProcessedDocument> = new Map();
  private organizationDocuments: Map<string, string[]> = new Map();

  constructor() {
    this.documentProcessor = new DocumentProcessor();
    this.embeddingService = new EmbeddingService();
    this.versioningService = new DocumentVersioningService();
  }

  /**
   * Upload and process a document
   */
  async uploadDocument(
    file: Buffer,
    filename: string,
    metadata: DocumentMetadata,
    createdBy: string = 'system',
    changeDescription?: string
  ): Promise<ProcessedDocument> {
    // Validate file
    const validation = this.documentProcessor.validateFile(file, filename);
    if (!validation.valid) {
      throw new Error(validation.error);
    }

    // Process document
    const document = await this.documentProcessor.processDocument(
      file,
      filename,
      metadata
    );

    // Generate embeddings for chunks
    const embeddingResults = await this.embeddingService.generateEmbeddings(
      document.chunks
    );

    // Create version
    const version = await this.versioningService.createVersion(
      document,
      createdBy,
      changeDescription
    );

    // Store document
    this.documents.set(document.id, document);

    // Update organization documents index
    if (!this.organizationDocuments.has(metadata.organization_id)) {
      this.organizationDocuments.set(metadata.organization_id, []);
    }
    this.organizationDocuments.get(metadata.organization_id)!.push(document.id);

    console.log(`Document ${document.id} uploaded and processed successfully`);
    console.log(`Generated ${document.chunks.length} chunks with embeddings`);
    console.log(
      `Created version ${version.version_number} for document ${document.id}`
    );

    return document;
  }

  /**
   * Search for relevant documents
   */
  async searchDocuments(request: RAGSearchRequest): Promise<RAGSearchResponse> {
    const startTime = Date.now();

    // Get organization documents
    const orgDocumentIds =
      this.organizationDocuments.get(request.organization_id) || [];
    if (orgDocumentIds.length === 0) {
      return {
        results: [],
        query: request.query,
        total_results: 0,
        processing_time: Date.now() - startTime,
        metadata: {
          organization_id: request.organization_id,
          search_timestamp: new Date(),
          filters_applied: [],
        },
      };
    }

    // Get all chunks from organization documents
    const allChunks: DocumentChunk[] = [];
    for (const docId of orgDocumentIds) {
      const document = this.documents.get(docId);
      if (document && document.processing_status === 'completed') {
        allChunks.push(...document.chunks);
      }
    }

    // Apply source filters if provided
    let filteredChunks = allChunks;
    if (request.source_filters && request.source_filters.length > 0) {
      filteredChunks = allChunks.filter(chunk =>
        request.source_filters!.includes(chunk.metadata.source)
      );
    }

    // Perform similarity search
    const searchResults = await this.embeddingService.searchSimilar(
      request.query,
      filteredChunks,
      request.limit || 5,
      request.threshold || 0.7
    );

    return {
      results: searchResults,
      query: request.query,
      total_results: searchResults.length,
      processing_time: Date.now() - startTime,
      metadata: {
        organization_id: request.organization_id,
        search_timestamp: new Date(),
        filters_applied: request.source_filters || [],
      },
    };
  }

  /**
   * Get context for chat completion
   */
  async getContextForChat(
    query: string,
    organizationId: string,
    maxChunks: number = 3
  ): Promise<RAGContext> {
    const searchRequest: RAGSearchRequest = {
      query,
      organization_id: organizationId,
      limit: maxChunks,
      threshold: 0.6,
    };

    const searchResponse = await this.searchDocuments(searchRequest);

    if (searchResponse.results.length === 0) {
      return {
        relevant_chunks: [],
        context_text: '',
        sources: [],
        confidence_score: 0,
      };
    }

    // Build context text
    const contextText = searchResponse.results
      .map(result => result.chunk.content)
      .join('\n\n---\n\n');

    // Extract unique sources
    const sources = [
      ...new Set(searchResponse.results.map(r => r.chunk.metadata.source)),
    ];

    // Calculate confidence score
    const confidenceScore =
      searchResponse.results.length > 0
        ? searchResponse.results.reduce((sum, r) => sum + r.similarity, 0) /
          searchResponse.results.length
        : 0;

    return {
      relevant_chunks: searchResponse.results.map(r => r.chunk),
      context_text: contextText,
      sources,
      confidence_score: confidenceScore,
    };
  }

  /**
   * Get document by ID
   */
  getDocument(documentId: string): ProcessedDocument | undefined {
    return this.documents.get(documentId);
  }

  /**
   * List documents for organization
   */
  listDocuments(organizationId: string): ProcessedDocument[] {
    const documentIds = this.organizationDocuments.get(organizationId) || [];
    return documentIds
      .map(id => this.documents.get(id))
      .filter(Boolean) as ProcessedDocument[];
  }

  /**
   * Delete document
   */
  deleteDocument(documentId: string, organizationId: string): boolean {
    const document = this.documents.get(documentId);
    if (!document || document.metadata.organization_id !== organizationId) {
      return false;
    }

    // Remove from organization index
    const orgDocs = this.organizationDocuments.get(organizationId) || [];
    const index = orgDocs.indexOf(documentId);
    if (index > -1) {
      orgDocs.splice(index, 1);
    }

    // Remove document
    this.documents.delete(documentId);

    console.log(`Document ${documentId} deleted successfully`);
    return true;
  }

  /**
   * Get RAG statistics
   */
  getRAGStats(organizationId: string): {
    total_documents: number;
    total_chunks: number;
    total_embeddings: number;
    documents_by_type: Record<string, number>;
    average_chunks_per_document: number;
  } {
    const documents = this.listDocuments(organizationId);
    const totalChunks = documents.reduce(
      (sum, doc) => sum + doc.chunks.length,
      0
    );
    const totalEmbeddings = documents.reduce(
      (sum, doc) => sum + doc.chunks.filter(chunk => chunk.embedding).length,
      0
    );

    const documentsByType: Record<string, number> = {};
    documents.forEach(doc => {
      documentsByType[doc.file_type] =
        (documentsByType[doc.file_type] || 0) + 1;
    });

    return {
      total_documents: documents.length,
      total_chunks: totalChunks,
      total_embeddings: totalEmbeddings,
      documents_by_type: documentsByType,
      average_chunks_per_document:
        documents.length > 0 ? totalChunks / documents.length : 0,
    };
  }

  /**
   * Update document metadata
   */
  updateDocumentMetadata(
    documentId: string,
    organizationId: string,
    metadata: Partial<DocumentMetadata>
  ): boolean {
    const document = this.documents.get(documentId);
    if (!document || document.metadata.organization_id !== organizationId) {
      return false;
    }

    // Update metadata
    document.metadata = { ...document.metadata, ...metadata };
    document.updated_at = new Date();

    console.log(`Document ${documentId} metadata updated`);
    return true;
  }

  /**
   * Get version history for a document
   */
  getDocumentVersionHistory(documentId: string): VersionHistory {
    return this.versioningService.getVersionHistory(documentId);
  }

  /**
   * Get a specific version of a document
   */
  getDocumentVersion(
    documentId: string,
    versionNumber: number
  ): DocumentVersion | null {
    return this.versioningService.getVersion(documentId, versionNumber);
  }

  /**
   * Get the current version of a document
   */
  getCurrentDocumentVersion(documentId: string): DocumentVersion | null {
    return this.versioningService.getCurrentVersion(documentId);
  }

  /**
   * Restore a document to a specific version
   */
  async restoreDocumentToVersion(
    documentId: string,
    versionNumber: number,
    restoredBy: string
  ): Promise<DocumentVersion> {
    return await this.versioningService.restoreToVersion(
      documentId,
      versionNumber,
      restoredBy
    );
  }

  /**
   * Compare two versions of a document
   */
  compareDocumentVersions(
    documentId: string,
    versionA: number,
    versionB: number
  ): VersionComparison | null {
    return this.versioningService.compareVersions(
      documentId,
      versionA,
      versionB
    );
  }

  /**
   * Delete a specific version of a document
   */
  deleteDocumentVersion(documentId: string, versionNumber: number): boolean {
    return this.versioningService.deleteVersion(documentId, versionNumber);
  }

  /**
   * Get version statistics for a document
   */
  getDocumentVersionStats(documentId: string): {
    total_versions: number;
    current_version: number;
    oldest_version: number;
    version_creators: Record<string, number>;
    average_versions_per_month: number;
  } {
    return this.versioningService.getVersionStats(documentId);
  }

  /**
   * Clean up old versions of a document
   */
  cleanupDocumentVersions(
    documentId: string,
    keepVersions: number = 10
  ): number {
    return this.versioningService.cleanupOldVersions(documentId, keepVersions);
  }
}
