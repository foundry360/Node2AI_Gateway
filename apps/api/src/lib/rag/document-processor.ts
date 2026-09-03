import { DetectedEntity } from '../types/sanitization';

export interface DocumentMetadata {
  title?: string;
  department?: string;
  classification?: string;
  author?: string;
  created_at?: Date;
  tags?: string[];
  organization_id?: string;
}

export interface DocumentChunk {
  id: string;
  content: string;
  metadata: {
    source: string;
    page?: number;
    section?: string;
    chunk_index: number;
    total_chunks: number;
  };
  embedding?: number[];
}

export interface ProcessedDocument {
  id: string;
  original_filename: string;
  file_type: string;
  file_size: number;
  metadata: DocumentMetadata;
  chunks: DocumentChunk[];
  processing_status: 'pending' | 'processing' | 'completed' | 'failed';
  created_at: Date;
  updated_at: Date;
}

export class DocumentProcessor {
  private supportedTypes = ['pdf', 'docx', 'txt', 'csv', 'xlsx', 'md'];

  /**
   * Process uploaded document and extract text
   */
  async processDocument(
    file: Buffer,
    filename: string,
    metadata: DocumentMetadata
  ): Promise<ProcessedDocument> {
    const fileType = this.getFileType(filename);

    if (!this.supportedTypes.includes(fileType)) {
      throw new Error(`Unsupported file type: ${fileType}`);
    }

    // Extract text based on file type
    const extractedText = await this.extractText(file, fileType);

    // Chunk the text intelligently
    const chunks = this.chunkText(extractedText, filename);

    // Create document object
    const document: ProcessedDocument = {
      id: `doc_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`,
      original_filename: filename,
      file_type: fileType,
      file_size: file.length,
      metadata,
      chunks,
      processing_status: 'completed',
      created_at: new Date(),
      updated_at: new Date(),
    };

    return document;
  }

  /**
   * Extract text from different file types
   */
  private async extractText(file: Buffer, fileType: string): Promise<string> {
    switch (fileType) {
      case 'txt':
      case 'md':
        return file.toString('utf-8');

      case 'csv':
        return this.extractFromCSV(file);

      case 'pdf':
        return await this.extractFromPDF(file);

      case 'docx':
        return await this.extractFromDOCX(file);

      case 'xlsx':
        return await this.extractFromXLSX(file);

      default:
        throw new Error(`Unsupported file type: ${fileType}`);
    }
  }

  /**
   * Extract text from CSV files
   */
  private extractFromCSV(file: Buffer): string {
    const content = file.toString('utf-8');
    const lines = content.split('\n');
    const headers = lines[0]?.split(',') || [];

    let extractedText = `CSV Document with headers: ${headers.join(', ')}\n\n`;

    // Process each row
    for (let i = 1; i < lines.length; i++) {
      const row = lines[i].split(',');
      if (row.length === headers.length) {
        const rowData = headers
          .map((header, index) => `${header}: ${row[index]}`)
          .join(', ');
        extractedText += `Row ${i}: ${rowData}\n`;
      }
    }

    return extractedText;
  }

  /**
   * Extract text from PDF files (simplified - in production, use pdf-parse or similar)
   */
  private async extractFromPDF(file: Buffer): Promise<string> {
    // TODO: Implement proper PDF parsing
    // For now, return a placeholder
    return `PDF Document (${file.length} bytes) - Text extraction not implemented yet. Please use TXT or DOCX files for now.`;
  }

  /**
   * Extract text from DOCX files (simplified - in production, use mammoth or similar)
   */
  private async extractFromDOCX(file: Buffer): Promise<string> {
    // TODO: Implement proper DOCX parsing
    // For now, return a placeholder
    return `DOCX Document (${file.length} bytes) - Text extraction not implemented yet. Please use TXT files for now.`;
  }

  /**
   * Extract text from XLSX files (simplified - in production, use xlsx or similar)
   */
  private async extractFromXLSX(file: Buffer): Promise<string> {
    // TODO: Implement proper XLSX parsing
    // For now, return a placeholder
    return `XLSX Document (${file.length} bytes) - Text extraction not implemented yet. Please use CSV files for now.`;
  }

  /**
   * Intelligently chunk text into manageable pieces
   */
  private chunkText(text: string, filename: string): DocumentChunk[] {
    const chunks: DocumentChunk[] = [];
    const maxChunkSize = 1000; // characters
    const overlap = 100; // characters overlap between chunks

    let startIndex = 0;
    let chunkIndex = 0;

    while (startIndex < text.length) {
      let endIndex = Math.min(startIndex + maxChunkSize, text.length);

      // Try to break at sentence boundary
      if (endIndex < text.length) {
        const lastPeriod = text.lastIndexOf('.', endIndex);
        const lastNewline = text.lastIndexOf('\n', endIndex);
        const breakPoint = Math.max(lastPeriod, lastNewline);

        if (breakPoint > startIndex + maxChunkSize / 2) {
          endIndex = breakPoint + 1;
        }
      }

      const chunkContent = text.substring(startIndex, endIndex).trim();

      if (chunkContent.length > 0) {
        chunks.push({
          id: `chunk_${chunkIndex}_${Date.now()}`,
          content: chunkContent,
          metadata: {
            source: filename,
            chunk_index: chunkIndex,
            total_chunks: 0, // Will be updated after all chunks are created
          },
        });
        chunkIndex++;
      }

      startIndex = endIndex - overlap;
    }

    // Update total_chunks for all chunks
    chunks.forEach(chunk => {
      chunk.metadata.total_chunks = chunks.length;
    });

    return chunks;
  }

  /**
   * Get file type from filename
   */
  private getFileType(filename: string): string {
    const extension = filename.split('.').pop()?.toLowerCase();
    return extension || 'txt';
  }

  /**
   * Validate file size and type
   */
  validateFile(
    file: Buffer,
    filename: string
  ): { valid: boolean; error?: string } {
    const maxSize = 10 * 1024 * 1024; // 10MB
    const fileType = this.getFileType(filename);

    if (file.length > maxSize) {
      return { valid: false, error: 'File size exceeds 10MB limit' };
    }

    if (!this.supportedTypes.includes(fileType)) {
      return { valid: false, error: `Unsupported file type: ${fileType}` };
    }

    return { valid: true };
  }
}
