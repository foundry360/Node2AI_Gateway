import { NextRequest, NextResponse } from 'next/server';
import { RAGService } from '../../../../../lib/rag/rag-service';
import { z } from 'zod';

// Initialize RAG service (in a real app, this would be a singleton)
const ragService = new RAGService();

// Request validation schema
const SearchRequestSchema = z.object({
  query: z.string().min(1, 'Query is required'),
  limit: z.number().min(1).max(20).optional().default(5),
  threshold: z.number().min(0).max(1).optional().default(0.7),
  source_filters: z.array(z.string()).optional(),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validatedData = SearchRequestSchema.parse(body);

    // Get organization ID from auth context (mock for now)
    const organizationId = 'default-org'; // In real app, get from auth middleware

    // Perform search
    const searchResponse = await ragService.searchDocuments({
      query: validatedData.query,
      limit: validatedData.limit,
      threshold: validatedData.threshold,
      organization_id: organizationId,
      source_filters: validatedData.source_filters,
    });

    // Format results for response
    const formattedResults = searchResponse.results.map(result => ({
      content: result.chunk.content,
      source: result.chunk.metadata.source,
      similarity: result.similarity,
      score: result.score,
      metadata: {
        chunk_id: result.chunk.id,
        chunk_index: result.chunk.metadata.chunk_index,
        total_chunks: result.chunk.metadata.total_chunks,
        page: result.chunk.metadata.page,
        section: result.chunk.metadata.section,
      },
    }));

    return NextResponse.json({
      success: true,
      data: {
        results: formattedResults,
        query: searchResponse.query,
        total_results: searchResponse.total_results,
        processing_time: searchResponse.processing_time,
        metadata: searchResponse.metadata,
      },
      message: 'Search completed successfully',
    });
  } catch (error: any) {
    console.error('Knowledge search error:', error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          success: false,
          data: null,
          message: 'Invalid search parameters',
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
        message: 'Search failed',
        error: error.message,
      },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q');
    const limit = parseInt(searchParams.get('limit') || '5');
    const threshold = parseFloat(searchParams.get('threshold') || '0.7');

    if (!query) {
      return NextResponse.json(
        {
          success: false,
          data: null,
          message: 'Query parameter is required',
          error: 'Missing query parameter',
        },
        { status: 400 }
      );
    }

    // Get organization ID from auth context (mock for now)
    const organizationId = 'default-org';

    // Perform search
    const searchResponse = await ragService.searchDocuments({
      query,
      limit,
      threshold,
      organization_id: organizationId,
    });

    // Format results for response
    const formattedResults = searchResponse.results.map(result => ({
      content: result.chunk.content,
      source: result.chunk.metadata.source,
      similarity: result.similarity,
      score: result.score,
      metadata: {
        chunk_id: result.chunk.id,
        chunk_index: result.chunk.metadata.chunk_index,
        total_chunks: result.chunk.metadata.total_chunks,
      },
    }));

    return NextResponse.json({
      success: true,
      data: {
        results: formattedResults,
        query: searchResponse.query,
        total_results: searchResponse.total_results,
        processing_time: searchResponse.processing_time,
        metadata: searchResponse.metadata,
      },
      message: 'Search completed successfully',
    });
  } catch (error: any) {
    console.error('Knowledge search error:', error);
    return NextResponse.json(
      {
        success: false,
        data: null,
        message: 'Search failed',
        error: error.message,
      },
      { status: 500 }
    );
  }
}
