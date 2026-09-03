import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { DataSanitizer } from '../../../../../lib/security/sanitizer';

// Request validation schema
const SanitizeRequestSchema = z.object({
  text: z.string().min(1, 'Text is required'),
  sessionId: z.string().optional(),
  organizationId: z.string().optional(),
  config: z
    .object({
      enablePII: z.boolean().optional(),
      enablePHI: z.boolean().optional(),
      enableFinancial: z.boolean().optional(),
      enableGovernment: z.boolean().optional(),
      auditLevel: z.enum(['BASIC', 'DETAILED', 'COMPREHENSIVE']).optional(),
    })
    .optional(),
});

export async function POST(request: NextRequest) {
  try {
    // Parse and validate request
    const body = await request.json();
    const validatedData = SanitizeRequestSchema.parse(body);

    // Generate session ID if not provided
    const sessionId =
      validatedData.sessionId ||
      `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const organizationId = validatedData.organizationId || 'default-org';

    // Create sanitizer with configuration
    const sanitizer = new DataSanitizer(validatedData.config);

    // Sanitize the text
    const result = await sanitizer.sanitizeText(
      validatedData.text,
      sessionId,
      organizationId
    );

    return NextResponse.json({
      success: true,
      data: {
        sanitizedText: result.sanitizedText,
        originalText: validatedData.text,
        sessionId,
        organizationId,
        detectedEntities: result.detectedEntities,
        riskLevel: result.riskLevel,
        complianceFlags: result.complianceFlags,
        tokenCount: result.tokenMappings.length,
        processingTime: Date.now() - Date.now(), // This would be calculated in real implementation
      },
      message: 'Text sanitized successfully',
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
        message: 'Sanitization failed',
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  return NextResponse.json({
    success: true,
    data: {
      message: 'Data Sanitization API',
      version: '1.0.0',
      features: [
        'PII Detection',
        'PHI Detection',
        'Financial Data Protection',
        'Government Data Protection',
        'Tokenization',
        'Encryption',
        'Compliance Logging',
      ],
      supportedPatterns: [
        'SSN',
        'Email',
        'Phone Numbers',
        'Credit Cards',
        'Medical Records',
        'Passport Numbers',
        'Driver License',
        'Addresses',
        'Custom Patterns',
      ],
    },
    message: 'Sanitization API ready',
  });
}
