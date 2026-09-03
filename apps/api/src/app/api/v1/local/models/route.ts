import { NextRequest, NextResponse } from 'next/server';
import { OllamaService } from '../../../../../lib/local/ollama-service';

// Initialize Ollama service (in a real app, this would be a singleton)
const ollamaService = new OllamaService();

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');

    if (action === 'list') {
      // List available models
      const models = await ollamaService.listModels();
      const isHealthy = await ollamaService.isHealthy();

      return NextResponse.json({
        success: true,
        data: {
          models: models.map(model => ({
            name: model.name,
            size: model.size,
            modified_at: model.modified_at,
            details: model.details,
          })),
          ollama_healthy: isHealthy,
          total_models: models.length,
        },
        message: 'Local models retrieved successfully',
      });
    }

    if (action === 'recommended') {
      // Get recommended models
      const recommended = ollamaService.getRecommendedModels();

      return NextResponse.json({
        success: true,
        data: {
          recommended_models: recommended,
          use_case_descriptions: {
            general: 'General purpose tasks and conversations',
            coding: 'Code generation, debugging, and analysis',
            high_quality: 'Complex reasoning and analysis tasks',
            fast: 'Quick responses for simple tasks',
            balanced: 'Good balance of speed and quality',
            research: 'Research and analysis tasks',
          },
        },
        message: 'Recommended models retrieved successfully',
      });
    }

    if (action === 'capabilities') {
      // Get model capabilities
      const modelName = searchParams.get('model');
      if (!modelName) {
        return NextResponse.json(
          {
            success: false,
            data: null,
            message: 'Model name is required',
            error: 'Missing model parameter',
          },
          { status: 400 }
        );
      }

      const capabilities = ollamaService.getModelCapabilities(modelName);

      return NextResponse.json({
        success: true,
        data: {
          model: modelName,
          capabilities,
        },
        message: 'Model capabilities retrieved successfully',
      });
    }

    // Default: get general info
    const isHealthy = await ollamaService.isHealthy();
    const recommended = ollamaService.getRecommendedModels();

    return NextResponse.json({
      success: true,
      data: {
        ollama_healthy: isHealthy,
        base_url: 'http://localhost:11434',
        recommended_models: recommended,
        supported_models: [
          'llama3.1:8b',
          'llama3.1:70b',
          'mistral:7b',
          'mixtral:8x7b',
          'codellama:7b',
          'codellama:13b',
          'codellama:34b',
          'gemma2:9b',
          'gemma2:27b',
        ],
        features: [
          'Local model execution',
          'No internet required',
          'Free to use',
          'Privacy-focused',
          'Custom model support',
        ],
      },
      message: 'Local LLM info retrieved successfully',
    });
  } catch (error: any) {
    console.error('Local models error:', error);
    return NextResponse.json(
      {
        success: false,
        data: null,
        message: 'Failed to retrieve local models info',
        error: error.message,
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, model_name } = body;

    if (action === 'pull') {
      if (!model_name) {
        return NextResponse.json(
          {
            success: false,
            data: null,
            message: 'Model name is required for pull action',
            error: 'Missing model_name parameter',
          },
          { status: 400 }
        );
      }

      // Pull model from Ollama registry
      const pullResult = await ollamaService.pullModel(model_name);

      return NextResponse.json({
        success: true,
        data: {
          model_name,
          pull_status: pullResult.status,
          digest: pullResult.digest,
          total: pullResult.total,
          completed: pullResult.completed,
        },
        message: `Model ${model_name} pull initiated successfully`,
      });
    }

    return NextResponse.json(
      {
        success: false,
        data: null,
        message: 'Invalid action',
        error: 'Supported actions: pull',
      },
      { status: 400 }
    );
  } catch (error: any) {
    console.error('Local models action error:', error);
    return NextResponse.json(
      {
        success: false,
        data: null,
        message: 'Local models action failed',
        error: error.message,
      },
      { status: 500 }
    );
  }
}
