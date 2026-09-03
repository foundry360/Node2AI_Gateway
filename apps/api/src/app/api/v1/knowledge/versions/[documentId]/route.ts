import { NextRequest, NextResponse } from 'next/server';
import { RAGService } from '../../../../../../lib/rag/rag-service';
import { z } from 'zod';

// Initialize RAG service (in a real app, this would be a singleton)
const ragService = new RAGService();

// Request validation schema
const VersionRequestSchema = z.object({
  version_number: z.number().min(1),
  restored_by: z.string().optional().default('system'),
  change_description: z.string().optional(),
});

export async function GET(
  request: NextRequest,
  { params }: { params: { documentId: string } }
) {
  try {
    const { documentId } = params;
    const { searchParams } = new URL(request.url);
    const versionNumber = searchParams.get('version');

    if (versionNumber) {
      // Get specific version
      const version = ragService.getDocumentVersion(
        documentId,
        parseInt(versionNumber)
      );

      if (!version) {
        return NextResponse.json(
          {
            success: false,
            data: null,
            message: `Version ${versionNumber} not found for document ${documentId}`,
            error: 'Version not found',
          },
          { status: 404 }
        );
      }

      return NextResponse.json({
        success: true,
        data: {
          version: {
            id: version.id,
            document_id: version.document_id,
            version_number: version.version_number,
            filename: version.filename,
            file_size: version.file_size,
            file_hash: version.file_hash,
            metadata: version.metadata,
            chunks_count: version.chunks.length,
            processing_status: version.processing_status,
            created_at: version.created_at,
            created_by: version.created_by,
            change_description: version.change_description,
            is_current: version.is_current,
          },
        },
        message: 'Version retrieved successfully',
      });
    } else {
      // Get version history
      const versionHistory = ragService.getDocumentVersionHistory(documentId);

      return NextResponse.json({
        success: true,
        data: {
          document_id: versionHistory.document_id,
          total_versions: versionHistory.total_versions,
          current_version: versionHistory.current_version
            ? {
                version_number: versionHistory.current_version.version_number,
                created_at: versionHistory.current_version.created_at,
                created_by: versionHistory.current_version.created_by,
                change_description:
                  versionHistory.current_version.change_description,
              }
            : null,
          versions: versionHistory.versions.map(v => ({
            id: v.id,
            version_number: v.version_number,
            filename: v.filename,
            file_size: v.file_size,
            file_hash: v.file_hash,
            metadata: v.metadata,
            chunks_count: v.chunks.length,
            processing_status: v.processing_status,
            created_at: v.created_at,
            created_by: v.created_by,
            change_description: v.change_description,
            is_current: v.is_current,
          })),
        },
        message: 'Version history retrieved successfully',
      });
    }
  } catch (error: any) {
    console.error('Version retrieval error:', error);
    return NextResponse.json(
      {
        success: false,
        data: null,
        message: 'Failed to retrieve version information',
        error: error.message,
      },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { documentId: string } }
) {
  try {
    const { documentId } = params;
    const body = await request.json();
    const validatedData = VersionRequestSchema.parse(body);

    const { version_number, restored_by } = validatedData;

    // Restore document to specific version
    const restoredVersion = await ragService.restoreDocumentToVersion(
      documentId,
      version_number,
      restored_by
    );

    return NextResponse.json({
      success: true,
      data: {
        restored_version: {
          id: restoredVersion.id,
          document_id: restoredVersion.document_id,
          version_number: restoredVersion.version_number,
          filename: restoredVersion.filename,
          file_size: restoredVersion.file_size,
          metadata: restoredVersion.metadata,
          chunks_count: restoredVersion.chunks.length,
          created_at: restoredVersion.created_at,
          created_by: restoredVersion.created_by,
          change_description: restoredVersion.change_description,
          is_current: restoredVersion.is_current,
        },
      },
      message: `Document restored to version ${version_number} successfully`,
    });
  } catch (error: any) {
    console.error('Version restoration error:', error);

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
        message: 'Version restoration failed',
        error: error.message,
      },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { documentId: string } }
) {
  try {
    const { documentId } = params;
    const { searchParams } = new URL(request.url);
    const versionNumber = searchParams.get('version');

    if (!versionNumber) {
      return NextResponse.json(
        {
          success: false,
          data: null,
          message: 'Version number is required',
          error: 'Missing version parameter',
        },
        { status: 400 }
      );
    }

    const deleted = ragService.deleteDocumentVersion(
      documentId,
      parseInt(versionNumber)
    );

    if (!deleted) {
      return NextResponse.json(
        {
          success: false,
          data: null,
          message: `Version ${versionNumber} not found or cannot be deleted`,
          error: 'Version not found or is current version',
        },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        deleted_version: versionNumber,
        document_id: documentId,
      },
      message: `Version ${versionNumber} deleted successfully`,
    });
  } catch (error: any) {
    console.error('Version deletion error:', error);
    return NextResponse.json(
      {
        success: false,
        data: null,
        message: 'Version deletion failed',
        error: error.message,
      },
      { status: 500 }
    );
  }
}
