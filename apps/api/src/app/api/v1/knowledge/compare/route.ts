import { NextRequest, NextResponse } from 'next/server';
import { RAGService } from '../../../../../lib/rag/rag-service';
import { z } from 'zod';

// Initialize RAG service (in a real app, this would be a singleton)
const ragService = new RAGService();

// Request validation schema
const CompareRequestSchema = z.object({
  document_id: z.string().min(1, 'Document ID is required'),
  version_a: z.number().min(1, 'Version A is required'),
  version_b: z.number().min(1, 'Version B is required'),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validatedData = CompareRequestSchema.parse(body);

    const { document_id, version_a, version_b } = validatedData;

    // Compare versions
    const comparison = ragService.compareDocumentVersions(
      document_id,
      version_a,
      version_b
    );

    if (!comparison) {
      return NextResponse.json(
        {
          success: false,
          data: null,
          message: 'One or both versions not found',
          error: 'Version comparison failed',
        },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        comparison: {
          version_a: {
            id: comparison.version_a.id,
            version_number: comparison.version_a.version_number,
            filename: comparison.version_a.filename,
            file_size: comparison.version_a.file_size,
            file_hash: comparison.version_a.file_hash,
            created_at: comparison.version_a.created_at,
            created_by: comparison.version_a.created_by,
            change_description: comparison.version_a.change_description,
          },
          version_b: {
            id: comparison.version_b.id,
            version_number: comparison.version_b.version_number,
            filename: comparison.version_b.filename,
            file_size: comparison.version_b.file_size,
            file_hash: comparison.version_b.file_hash,
            created_at: comparison.version_b.created_at,
            created_by: comparison.version_b.created_by,
            change_description: comparison.version_b.change_description,
          },
          changes: {
            metadata_changes: comparison.changes.metadata_changes,
            content_changes: {
              chunks_added: comparison.changes.content_changes.chunks_added,
              chunks_removed: comparison.changes.content_changes.chunks_removed,
              chunks_modified:
                comparison.changes.content_changes.chunks_modified,
              total_changes: comparison.changes.content_changes.total_changes,
            },
            file_changes: {
              size_change: comparison.changes.file_changes.size_change,
              size_change_percentage:
                comparison.version_a.file_size > 0
                  ? (
                      (comparison.changes.file_changes.size_change /
                        comparison.version_a.file_size) *
                      100
                    ).toFixed(2)
                  : '0.00',
              hash_changed: comparison.changes.file_changes.hash_changed,
            },
          },
        },
      },
      message: 'Version comparison completed successfully',
    });
  } catch (error: any) {
    console.error('Version comparison error:', error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          success: false,
          data: null,
          message: 'Invalid request parameters',
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
        message: 'Version comparison failed',
        error: error.message,
      },
      { status: 500 }
    );
  }
}
