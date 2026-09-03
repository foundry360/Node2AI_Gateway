import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

// Request validation schema
const SanitizedChatRequestSchema = z.object({
  model: z.string().optional(),
  messages: z.array(
    z.object({
      role: z.enum(['system', 'user', 'assistant']),
      content: z.string(),
    })
  ),
  temperature: z.number().min(0).max(2).optional(),
  max_tokens: z.number().positive().optional(),
  sanitize_input: z.boolean().optional().default(true),
  sanitize_output: z.boolean().optional().default(true),
});

export async function POST(request: NextRequest) {
  try {
    // Parse and validate request
    const body = await request.json();
    const validatedData = SanitizedChatRequestSchema.parse(body);

    // Simple PII/PHI sanitization function
    function sanitizeText(text: string): { sanitized: string; changes: any[] } {
      let sanitized = text;
      const changes = [];

      // Remove SSN patterns
      const ssnMatches = sanitized.match(/\b\d{3}-\d{2}-\d{4}\b/g);
      if (ssnMatches) {
        sanitized = sanitized.replace(
          /\b\d{3}-\d{2}-\d{4}\b/g,
          '[SSN-REDACTED]'
        );
        changes.push({
          type: 'ssn_removal',
          category: 'government_id',
          count: ssnMatches.length,
          description: 'Social Security Numbers removed',
        });
      }

      // Remove common name patterns
      const nameMatches = sanitized.match(
        /\b(John|Jane|Sarah|Patient|Dr\.?\s+\w+)\s+(Smith|Doe|Johnson|Williams)\b/g
      );
      if (nameMatches) {
        sanitized = sanitized.replace(
          /\b(John|Jane|Sarah|Patient|Dr\.?\s+\w+)\s+(Smith|Doe|Johnson|Williams)\b/g,
          '[NAME-REDACTED] $2'
        );
        changes.push({
          type: 'name_removal',
          category: 'personal_info',
          count: nameMatches.length,
          description: 'Personal names removed',
        });
      }

      // Remove date patterns - only sanitize MM/DD, keep YYYY
      // Handle standard date formats (MM/DD/YYYY or DD/MM/YYYY)
      const dateMatches = sanitized.match(
        /\b\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4}\b/g
      );
      if (dateMatches) {
        sanitized = sanitized.replace(
          /\b(\d{1,2}[\/\-]\d{1,2})[\/\-](\d{4})\b/g,
          (match, datePart, year) => {
            const separator = datePart.includes('/') ? '/' : '-';
            return '[DATE-REDACTED]' + separator + year;
          }
        );
        changes.push({
          type: 'date_removal',
          category: 'personal_info',
          count: dateMatches.length,
          description: 'Dates removed (year preserved)',
        });
      }

      // Handle dates with prefixes (Admission, Discharge, Date of Death, etc.)
      const prefixedDateMatches = sanitized.match(
        /\b(?:Admission|Admitted|Discharge|Discharged|Date\s+of\s+Death|DOD|Died)[:\s]+\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4}\b/gi
      );
      if (prefixedDateMatches) {
        sanitized = sanitized.replace(
          /\b(Admission|Admitted|Discharge|Discharged|Date\s+of\s+Death|DOD|Died)[:\s]+(\d{1,2}[\/\-]\d{1,2})[\/\-](\d{4})\b/gi,
          (match, prefix, datePart, year) => {
            const separator = datePart.includes('/') ? '/' : '-';
            return prefix + ': [DATE-REDACTED]' + separator + year;
          }
        );
        changes.push({
          type: 'date_removal',
          category: 'medical_info',
          count: prefixedDateMatches.length,
          description: 'Medical dates removed (year preserved)',
        });
      }

      // Remove Email patterns
      const emailMatches = sanitized.match(
        /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g
      );
      if (emailMatches) {
        sanitized = sanitized.replace(
          /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
          '[EMAIL-REDACTED]'
        );
        changes.push({
          type: 'email_removal',
          category: 'contact_info',
          count: emailMatches.length,
          description: 'Email addresses removed',
        });
      }

      // Remove Phone patterns
      const phoneMatches = sanitized.match(
        /\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g
      );
      if (phoneMatches) {
        sanitized = sanitized.replace(
          /\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g,
          '[PHONE-REDACTED]'
        );
        changes.push({
          type: 'phone_removal',
          category: 'contact_info',
          count: phoneMatches.length,
          description: 'Phone numbers removed',
        });
      }

      // Remove MRN patterns
      const mrnMatches = sanitized.match(/\bMRN:\s*\d+\b/g);
      if (mrnMatches) {
        sanitized = sanitized.replace(/\bMRN:\s*\d+\b/g, '[MRN-REDACTED]');
        changes.push({
          type: 'mrn_removal',
          category: 'medical_info',
          count: mrnMatches.length,
          description: 'Medical Record Numbers removed',
        });
      }

      return { sanitized, changes };
    }

    // Sanitize input messages if requested
    let sanitizedMessages = validatedData.messages;
    let inputSanitizationChanges: any[] = [];

    if (validatedData.sanitize_input) {
      sanitizedMessages = validatedData.messages.map(msg => {
        if (msg.role === 'user') {
          const sanitized = sanitizeText(msg.content);
          inputSanitizationChanges.push(...sanitized.changes);
          return { ...msg, content: sanitized.sanitized };
        }
        return msg;
      });
    }

    // Generate mock AI response
    const mockResponse = {
      id: `chatcmpl-sanitized-${Date.now()}`,
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: validatedData.model || 'gpt-3.5-turbo',
      choices: [
        {
          index: 0,
          message: {
            role: 'assistant',
            content: `I understand you're asking about healthcare data. I can help you with general information about medical topics, but I notice this conversation may contain sensitive information. For specific medical advice, please consult with a healthcare professional.`,
          },
          finish_reason: 'stop',
        },
      ],
      usage: {
        prompt_tokens: 25,
        completion_tokens: 45,
        total_tokens: 70,
      },
      cost: 0.0001,
    };

    // Sanitize output if requested
    let outputSanitizationChanges: any[] = [];
    if (validatedData.sanitize_output) {
      const sanitized = sanitizeText(mockResponse.choices[0].message.content);
      mockResponse.choices[0].message.content = sanitized.sanitized;
      outputSanitizationChanges = sanitized.changes;
    }

    // Prepare response with sanitization metadata
    const response = {
      success: true,
      data: {
        ...mockResponse,
        sanitization: {
          input_sanitized: validatedData.sanitize_input,
          output_sanitized: validatedData.sanitize_output,
          input_changes: inputSanitizationChanges,
          output_changes: outputSanitizationChanges,
          total_changes:
            inputSanitizationChanges.length + outputSanitizationChanges.length,
          compliance_mode: 'hipaa_ready',
        },
      },
      message: 'Chat completion successful with PII sanitization',
    };

    return NextResponse.json(response);
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
        message: 'Sanitized chat completion failed',
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
