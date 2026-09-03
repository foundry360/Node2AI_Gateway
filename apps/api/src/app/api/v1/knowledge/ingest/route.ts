import { NextRequest, NextResponse } from 'next/server';
import { RAGService } from '../../../../../lib/rag/rag-service';
import { z } from 'zod';

// Initialize RAG service (in a real app, this would be a singleton)
const ragService = new RAGService();

// Request validation schema
const IngestRequestSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  department: z.string().optional(),
  classification: z
    .enum(['public', 'internal', 'confidential'])
    .optional()
    .default('internal'),
  author: z.string().optional(),
  tags: z.array(z.string()).optional().default([]),
});

export async function POST(request: NextRequest) {
  try {
    // Parse multipart form data
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const metadataJson = formData.get('metadata') as string;

    if (!file) {
      return NextResponse.json(
        {
          success: false,
          data: null,
          message: 'No file provided',
          error: 'File is required',
        },
        { status: 400 }
      );
    }

    if (!metadataJson) {
      return NextResponse.json(
        {
          success: false,
          data: null,
          message: 'No metadata provided',
          error: 'Metadata is required',
        },
        { status: 400 }
      );
    }

    // Parse and validate metadata
    const metadata = JSON.parse(metadataJson);
    const validatedMetadata = IngestRequestSchema.parse(metadata);

    // Get organization ID from auth context (mock for now)
    const organizationId = 'default-org'; // In real app, get from auth middleware

    // Convert file to buffer
    const fileBuffer = Buffer.from(await file.arrayBuffer());

    // Create document metadata
    const documentMetadata = {
      ...validatedMetadata,
      organization_id: organizationId,
      created_at: new Date(),
    };

    // Process document
    const processedDocument = await ragService.uploadDocument(
      fileBuffer,
      file.name,
      documentMetadata
    );

    return NextResponse.json({
      success: true,
      data: {
        document_id: processedDocument.id,
        filename: processedDocument.original_filename,
        file_type: processedDocument.file_type,
        file_size: processedDocument.file_size,
        chunks_created: processedDocument.chunks.length,
        processing_status: processedDocument.processing_status,
        metadata: processedDocument.metadata,
        created_at: processedDocument.created_at,
      },
      message: 'Document ingested successfully',
    });
  } catch (error: any) {
    console.error('Document ingestion error:', error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          success: false,
          data: null,
          message: 'Invalid metadata',
          error: error.errors
            .map(e => `${e.path.join('.')}: ${e.message}`)
            .join(', '),
        },
        { status: 400 }
      );
    }

    return NextResponse.json(
      {
        success: false,
        data: null,
        message: 'Document ingestion failed',
        error: error.message,
      },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    // Get organization ID from auth context (mock for now)
    const organizationId = 'default-org';

    // List documents for organization
    const documents = ragService.listDocuments(organizationId);

    // Get RAG statistics
    const stats = ragService.getRAGStats(organizationId);

    return NextResponse.json({
      success: true,
      data: {
        documents: documents.map(doc => ({
          id: doc.id,
          filename: doc.original_filename,
          file_type: doc.file_type,
          file_size: doc.file_size,
          chunks_count: doc.chunks.length,
          processing_status: doc.processing_status,
          metadata: doc.metadata,
          created_at: doc.created_at,
          updated_at: doc.updated_at,
        })),
        statistics: stats,
      },
      message: 'Documents retrieved successfully',
    });
  } catch (error: any) {
    console.error('Document listing error:', error);
    return NextResponse.json(
      {
        success: false,
        data: null,
        message: 'Failed to retrieve documents',
        error: error.message,
      },
      { status: 500 }
    );
  }
}
