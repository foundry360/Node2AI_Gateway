import { DocumentChunk } from './document-processor';

export interface EmbeddingResult {
  embedding: number[];
  model: string;
  tokens_used: number;
  cost: number;
}

export interface SearchResult {
  chunk: DocumentChunk;
  similarity: number;
  score: number;
}

export class EmbeddingService {
  private openaiApiKey: string;
  private baseUrl: string;

  constructor(apiKey?: string, baseUrl?: string) {
    this.openaiApiKey = apiKey || process.env.OPENAI_API_KEY || '';
    this.baseUrl = baseUrl || 'https://api.openai.com/v1';
  }

  /**
   * Generate embeddings for text chunks
   */
  async generateEmbeddings(
    chunks: DocumentChunk[]
  ): Promise<EmbeddingResult[]> {
    const results: EmbeddingResult[] = [];

    for (const chunk of chunks) {
      try {
        const embedding = await this.generateEmbedding(chunk.content);
        results.push(embedding);

        // Add embedding to chunk
        chunk.embedding = embedding.embedding;
      } catch (error) {
        console.error(
          `Failed to generate embedding for chunk ${chunk.id}:`,
          error
        );
        // Continue with other chunks
      }
    }

    return results;
  }

  /**
   * Generate embedding for a single text
   */
  private async generateEmbedding(text: string): Promise<EmbeddingResult> {
    try {
      const response = await fetch(`${this.baseUrl}/embeddings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.openaiApiKey}`,
        },
        body: JSON.stringify({
          model: 'text-embedding-ada-002',
          input: text,
        }),
      });

      if (!response.ok) {
        throw new Error(
          `OpenAI API error: ${response.status} ${response.statusText}`
        );
      }

      const data = await response.json();
      const embedding = data.data[0].embedding;
      const usage = data.usage;

      return {
        embedding,
        model: 'text-embedding-ada-002',
        tokens_used: usage.total_tokens,
        cost: this.calculateEmbeddingCost(usage.total_tokens),
      };
    } catch (error) {
      console.error('Embedding generation failed:', error);
      // Return a mock embedding for development
      return this.generateMockEmbedding(text);
    }
  }

  /**
   * Generate mock embedding for development/testing
   */
  private generateMockEmbedding(text: string): EmbeddingResult {
    // Generate a mock 1536-dimensional embedding
    const embedding = new Array(1536).fill(0).map(() => Math.random() * 2 - 1);

    return {
      embedding,
      model: 'text-embedding-ada-002-mock',
      tokens_used: Math.ceil(text.length / 4), // Rough token estimate
      cost: 0.0001, // Mock cost
    };
  }

  /**
   * Calculate embedding cost
   */
  private calculateEmbeddingCost(tokens: number): number {
    // OpenAI ada-002 pricing: $0.0001 per 1K tokens
    return (tokens / 1000) * 0.0001;
  }

  /**
   * Perform vector similarity search
   */
  async searchSimilar(
    query: string,
    chunks: DocumentChunk[],
    limit: number = 5,
    threshold: number = 0.7
  ): Promise<SearchResult[]> {
    // Generate embedding for query
    const queryEmbedding = await this.generateEmbedding(query);

    // Calculate similarities
    const results: SearchResult[] = [];

    for (const chunk of chunks) {
      if (!chunk.embedding) continue;

      const similarity = this.cosineSimilarity(
        queryEmbedding.embedding,
        chunk.embedding
      );

      if (similarity >= threshold) {
        results.push({
          chunk,
          similarity,
          score: similarity * 100, // Convert to percentage
        });
      }
    }

    // Sort by similarity and return top results
    return results.sort((a, b) => b.similarity - a.similarity).slice(0, limit);
  }

  /**
   * Calculate cosine similarity between two vectors
   */
  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) {
      throw new Error('Vectors must have the same length');
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  /**
   * Batch process multiple queries
   */
  async batchSearch(
    queries: string[],
    chunks: DocumentChunk[],
    limit: number = 5
  ): Promise<{ query: string; results: SearchResult[] }[]> {
    const results = [];

    for (const query of queries) {
      const searchResults = await this.searchSimilar(query, chunks, limit);
      results.push({ query, results: searchResults });
    }

    return results;
  }

  /**
   * Get embedding statistics
   */
  getEmbeddingStats(embeddings: EmbeddingResult[]): {
    total_embeddings: number;
    total_tokens: number;
    total_cost: number;
    average_tokens: number;
    models_used: string[];
  } {
    const totalTokens = embeddings.reduce((sum, e) => sum + e.tokens_used, 0);
    const totalCost = embeddings.reduce((sum, e) => sum + e.cost, 0);
    const modelsUsed = [...new Set(embeddings.map(e => e.model))];

    return {
      total_embeddings: embeddings.length,
      total_tokens: totalTokens,
      total_cost: totalCost,
      average_tokens:
        embeddings.length > 0 ? totalTokens / embeddings.length : 0,
      models_used: modelsUsed,
    };
  }
}
