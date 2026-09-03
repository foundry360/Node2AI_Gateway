import { NextRequest, NextResponse } from 'next/server';
import { RAGService } from '../../../../../lib/rag/rag-service';

export async function GET(request: NextRequest) {
  try {
    const ragService = new RAGService();

    // Create a test document with sample financial data
    const testDocument = {
      id: 'test_doc_001',
      original_filename: 'Q4_Financial_Report.txt',
      file_type: 'txt',
      file_size: 1024,
      metadata: {
        title: 'Q4 Financial Report',
        department: 'Finance',
        classification: 'internal',
        author: 'CFO',
        organization_id: 'default-org',
        created_at: new Date(),
      },
      chunks: [
        {
          id: 'chunk_001',
          content:
            'Q4 2024 was a strong quarter for Node2AI Corporation, with significant growth in both revenue and customer acquisition.',
          metadata: {
            source: 'Q4_Financial_Report.txt',
            chunk_index: 0,
            total_chunks: 3,
          },
          embedding: new Array(1536).fill(0).map(() => Math.random() * 2 - 1), // Mock embedding
        },
        {
          id: 'chunk_002',
          content:
            'Total Revenue: $45.2 million (up 23% from Q3). Net Profit: $12.8 million (up 31% from Q3). Customer Growth: 1,247 new enterprise customers.',
          metadata: {
            source: 'Q4_Financial_Report.txt',
            chunk_index: 1,
            total_chunks: 3,
          },
          embedding: new Array(1536).fill(0).map(() => Math.random() * 2 - 1), // Mock embedding
        },
        {
          id: 'chunk_003',
          content:
            'ARR (Annual Recurring Revenue): $180.5 million. Customer Acquisition Cost (CAC): $2,340 (down 15%). Customer Lifetime Value (LTV): $89,500 (up 8%).',
          metadata: {
            source: 'Q4_Financial_Report.txt',
            chunk_index: 2,
            total_chunks: 3,
          },
          embedding: new Array(1536).fill(0).map(() => Math.random() * 2 - 1), // Mock embedding
        },
      ],
      processing_status: 'completed' as const,
      created_at: new Date(),
      updated_at: new Date(),
    };

    // Manually add the test document to the RAG service
    (ragService as any).documents.set(testDocument.id, testDocument);
    (ragService as any).organizationDocuments.set('default-org', [
      testDocument.id,
    ]);

    // Test search functionality
    const searchResults = await ragService.searchDocuments({
      query: 'What are the Q4 revenue numbers?',
      organization_id: 'default-org',
      limit: 3,
    });

    // Test RAG context for chat
    const ragContext = await ragService.getContextForChat(
      'What are the Q4 revenue numbers?',
      'default-org',
      2
    );

    // Get RAG statistics
    const stats = ragService.getRAGStats('default-org');

    return NextResponse.json({
      success: true,
      data: {
        test_document: {
          id: testDocument.id,
          filename: testDocument.original_filename,
          chunks_count: testDocument.chunks.length,
          processing_status: testDocument.processing_status,
        },
        search_results: {
          query: searchResults.query,
          total_results: searchResults.total_results,
          processing_time: searchResults.processing_time,
          results: searchResults.results.map(r => ({
            content: r.chunk.content.substring(0, 100) + '...',
            source: r.chunk.metadata.source,
            similarity: r.similarity,
            score: r.score,
          })),
        },
        rag_context: {
          relevant_chunks: ragContext.relevant_chunks.length,
          sources: ragContext.sources,
          confidence_score: ragContext.confidence_score,
          context_preview: ragContext.context_text.substring(0, 200) + '...',
        },
        statistics: stats,
      },
      message: 'RAG test completed successfully',
    });
  } catch (error: any) {
    console.error('RAG test error:', error);
    return NextResponse.json(
      {
        success: false,
        data: null,
        message: 'RAG test failed',
        error: error.message,
      },
      { status: 500 }
    );
  }
}
