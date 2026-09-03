import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  return NextResponse.json({
    success: true,
    data: {
      message: 'Node2AI API Gateway is working!',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      endpoints: {
        health: '/api/health',
        chat: '/api/v1/chat/completions',
        test: '/api/v1/test',
      },
      features: [
        'Multi-Provider AI Support',
        'Data Sanitization',
        'Smart Routing',
        'Cost Optimization',
        'Compliance Logging',
        'Rate Limiting',
        'Feature Flags',
      ],
      providers: {
        openai: 'OpenAI GPT models',
        local: 'Ollama local models',
      },
    },
    message: 'API Gateway test successful',
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    return NextResponse.json({
      success: true,
      data: {
        received: body,
        processed: true,
        timestamp: new Date().toISOString(),
        echo: body,
      },
      message: 'POST request processed successfully',
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        data: null,
        message: 'Invalid JSON in request body',
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 400 }
    );
  }
}
