import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { DataSanitizer } from '../../../../../lib/security/sanitizer';

// Request validation schema
const DesanitizeRequestSchema = z.object({
  text: z.string().min(1, 'Text is required'),
  sessionId: z.string().min(1, 'Session ID is required'),
  organizationId: z.string().optional(),
});

export async function POST(request: NextRequest) {
  try {
    // Parse and validate request
    const body = await request.json();
    const validatedData = DesanitizeRequestSchema.parse(body);

    const organizationId = validatedData.organizationId || 'default-org';

    // Create sanitizer
    const sanitizer = new DataSanitizer();

    // Desanitize the text
    const desanitizedText = await sanitizer.desanitizeText(
      validatedData.text,
      validatedData.sessionId,
      organizationId
    );

    return NextResponse.json({
      success: true,
      data: {
        desanitizedText,
        originalText: validatedData.text,
        sessionId: validatedData.sessionId,
        organizationId,
        tokensReplaced: validatedData.text !== desanitizedText,
      },
      message: 'Text desanitized successfully',
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          success: false,
          data: null,
          message: 'Invalid request data',
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
        message: 'Desanitization failed',
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
