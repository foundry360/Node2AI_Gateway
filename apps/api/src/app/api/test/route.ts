import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  return NextResponse.json({
    success: true,
    data: {
      message: 'Node2AI API is working!',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      features: [
        'Data Sanitization',
        'Multi-Provider AI',
        'Smart Routing',
        'Cost Optimization',
        'Compliance Logging',
      ],
    },
    message: 'Test endpoint successful',
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
