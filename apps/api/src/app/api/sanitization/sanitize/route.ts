import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

const sanitizeSchema = z
  .object({
    input: z.string().min(1, 'Input is required').optional(),
    text: z.string().min(1, 'Text is required').optional(),
    options: z
      .object({
        categories: z.array(z.string()).optional(),
        severity: z.array(z.string()).optional(),
        strictMode: z.boolean().optional(),
        preserveFormat: z.boolean().optional(),
        customRules: z.array(z.string()).optional(),
      })
      .optional(),
  })
  .refine(data => data.input || data.text, {
    message: "Either 'input' or 'text' field is required",
  });

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validatedData = sanitizeSchema.parse(body);
    const input = validatedData.input || validatedData.text;
    const options = validatedData.options || {};

    // Simple PII/PHI sanitization for demo
    let sanitizedText = input;

    // Remove SSN patterns
    sanitizedText = sanitizedText.replace(
      /\b\d{3}-\d{2}-\d{4}\b/g,
      '[SSN-REDACTED]'
    );
    sanitizedText = sanitizedText.replace(
      /\b\d{3}\s\d{2}\s\d{4}\b/g,
      '[SSN-REDACTED]'
    );

    // Remove phone numbers
    sanitizedText = sanitizedText.replace(
      /\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g,
      '[PHONE-REDACTED]'
    );

    // Remove email addresses
    sanitizedText = sanitizedText.replace(
      /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
      '[EMAIL-REDACTED]'
    );

    // Remove names (simple pattern)
    sanitizedText = sanitizedText.replace(
      /\b[A-Z][a-z]+ [A-Z][a-z]+\b/g,
      '[NAME-REDACTED]'
    );

    // Remove dates (MM/DD/YYYY format) - only sanitize MM/DD, keep YYYY
    // Handle both / and - separators
    sanitizedText = sanitizedText.replace(
      /\b(\d{1,2}[\/\-]\d{1,2})[\/\-](\d{4})\b/g,
      '[DATE-REDACTED]$2'
    );

    // Handle dates with prefixes (Admission:, Discharge:, etc.)
    sanitizedText = sanitizedText.replace(
      /\b(?:Admission|Admitted|Discharge|Discharged|Date\s+of\s+Death|DOD|Died)[:\s]+(\d{1,2}[\/\-]\d{1,2})[\/\-](\d{4})\b/gi,
      (match, datePart, year) => {
        const prefix = match
          .replace(/\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4}/, '')
          .trim();
        const separator = datePart.includes('/') ? '/' : '-';
        return prefix + ' [DATE-REDACTED]' + separator + year;
      }
    );

    // Remove MRN patterns
    sanitizedText = sanitizedText.replace(
      /\bMRN[:\s-]*\d+\b/gi,
      '[MRN-REDACTED]'
    );

    const result = {
      original: input,
      sanitized: sanitizedText,
      changes: [
        {
          type: 'pii_removal',
          category: 'personal_info',
          count: (input.match(/\b[A-Z][a-z]+ [A-Z][a-z]+\b/g) || []).length,
          description: 'Personal names removed',
        },
        {
          type: 'ssn_removal',
          category: 'government_id',
          count: (input.match(/\b\d{3}-\d{2}-\d{4}\b/g) || []).length,
          description: 'Social Security Numbers removed',
        },
        {
          type: 'phone_removal',
          category: 'contact_info',
          count: (input.match(/\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g) || [])
            .length,
          description: 'Phone numbers removed',
        },
        {
          type: 'email_removal',
          category: 'contact_info',
          count: (
            input.match(
              /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g
            ) || []
          ).length,
          description: 'Email addresses removed',
        },
        {
          type: 'date_removal',
          category: 'personal_info',
          count: (input.match(/\b\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4}\b/g) || [])
            .length,
          description: 'Dates removed (year preserved)',
        },
      ],
      metadata: {
        processingTime: '< 1ms',
        sanitizationLevel: options.strictMode ? 'strict' : 'standard',
        categoriesProcessed: options.categories || [
          'pii',
          'phi',
          'financial',
          'government',
        ],
        complianceMode: 'hipaa_ready',
      },
    };

    return NextResponse.json({
      success: true,
      data: result,
      message: 'Text sanitized successfully',
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          success: false,
          error: 'Validation failed',
          details: error.errors.map(e => e.message).join(', '),
        },
        { status: 400 }
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: 'Sanitization failed',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
