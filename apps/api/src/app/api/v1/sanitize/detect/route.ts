import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

// Request validation schema
const PiiDetectionSchema = z.object({
  text: z.string().min(1, 'Text is required'),
  detection_options: z
    .object({
      categories: z
        .array(z.string())
        .optional()
        .default(['pii', 'phi', 'financial', 'government']),
      severity: z
        .array(z.string())
        .optional()
        .default(['high', 'medium', 'low']),
      strict_mode: z.boolean().optional().default(false),
      include_context: z.boolean().optional().default(true),
      confidence_threshold: z.number().min(0).max(1).optional().default(0.7),
      custom_patterns: z.array(z.string()).optional().default([]),
    })
    .optional(),
});

/**
 * POST /api/v1/sanitize/detect
 * Detect PII/PHI in text without sanitizing it
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validatedData = PiiDetectionSchema.parse(body);

    const { text, detection_options = {} } = validatedData;
    const {
      categories = ['pii', 'phi', 'financial', 'government'],
      severity = ['high', 'medium', 'low'],
      strict_mode = false,
      include_context = true,
      confidence_threshold = 0.7,
      custom_patterns = [],
    } = detection_options;

    // Mock PII detection patterns
    const detectionPatterns = {
      ssn: {
        pattern: /\b\d{3}-\d{2}-\d{4}\b/g,
        category: 'government',
        severity: 'high',
        confidence: 0.95,
        description: 'Social Security Number',
        example: '123-45-6789',
      },
      phone: {
        pattern: /\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g,
        category: 'pii',
        severity: 'medium',
        confidence: 0.85,
        description: 'Phone Number',
        example: '(555) 123-4567',
      },
      email: {
        pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
        category: 'pii',
        severity: 'medium',
        confidence: 0.9,
        description: 'Email Address',
        example: 'john.doe@example.com',
      },
      credit_card: {
        pattern: /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g,
        category: 'financial',
        severity: 'high',
        confidence: 0.88,
        description: 'Credit Card Number',
        example: '4532 1234 5678 9012',
      },
      date_of_birth: {
        pattern: /\b\d{1,2}\/\d{1,2}\/\d{4}\b|\b\d{4}-\d{2}-\d{2}\b/g,
        category: 'pii',
        severity: 'medium',
        confidence: 0.75,
        description: 'Date of Birth',
        example: '01/15/1980',
      },
      name: {
        pattern: /\b[A-Z][a-z]+ [A-Z][a-z]+\b/g,
        category: 'pii',
        severity: 'low',
        confidence: 0.6,
        description: 'Full Name',
        example: 'John Smith',
      },
      address: {
        pattern:
          /\b\d+\s+[A-Za-z\s]+(?:Street|St|Avenue|Ave|Road|Rd|Drive|Dr|Lane|Ln|Boulevard|Blvd)\b/g,
        category: 'pii',
        severity: 'medium',
        confidence: 0.7,
        description: 'Street Address',
        example: '123 Main Street',
      },
      mrn: {
        pattern: /\bMRN:\s*\d+\b|\bMedical Record Number:\s*\d+\b/g,
        category: 'phi',
        severity: 'high',
        confidence: 0.92,
        description: 'Medical Record Number',
        example: 'MRN: 123456789',
      },
      patient_id: {
        pattern: /\bPatient ID:\s*\d+\b|\bPID:\s*\d+\b/g,
        category: 'phi',
        severity: 'high',
        confidence: 0.9,
        description: 'Patient ID',
        example: 'Patient ID: 987654321',
      },
      diagnosis_code: {
        pattern: /\b[A-Z]\d{2}(?:\.\d{1,3})?\b/g,
        category: 'phi',
        severity: 'medium',
        confidence: 0.8,
        description: 'ICD-10 Diagnosis Code',
        example: 'E11.9',
      },
      ip_address: {
        pattern: /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g,
        category: 'pii',
        severity: 'low',
        confidence: 0.85,
        description: 'IP Address',
        example: '192.168.1.1',
      },
    };

    const detectedItems: any[] = [];
    const detectionResults: any = {};

    // Run detection for each pattern
    Object.entries(detectionPatterns).forEach(([key, pattern]) => {
      const matches = text.match(pattern.pattern);
      if (matches && matches.length > 0) {
        // Filter by categories if specified
        if (categories.includes(pattern.category)) {
          // Filter by severity if specified
          if (severity.includes(pattern.severity)) {
            // Check confidence threshold
            if (pattern.confidence >= confidence_threshold) {
              matches.forEach((match, index) => {
                const context = include_context
                  ? text.substring(
                      Math.max(0, text.indexOf(match) - 50),
                      text.indexOf(match) + match.length + 50
                    )
                  : match;

                const detectedItem = {
                  id: `${key}-${index}`,
                  type: key,
                  category: pattern.category,
                  severity: pattern.severity,
                  confidence: pattern.confidence,
                  description: pattern.description,
                  detected_value: match,
                  context: context,
                  position: {
                    start: text.indexOf(match),
                    end: text.indexOf(match) + match.length,
                  },
                  suggested_action: getSuggestedAction(
                    pattern.category,
                    pattern.severity
                  ),
                  compliance_impact: getComplianceImpact(pattern.category),
                };

                detectedItems.push(detectedItem);
              });
            }
          }
        }
      }
    });

    // Check custom patterns if provided
    custom_patterns.forEach((customPattern, index) => {
      try {
        const regex = new RegExp(customPattern, 'g');
        const matches = text.match(regex);
        if (matches && matches.length > 0) {
          matches.forEach((match, matchIndex) => {
            const detectedItem = {
              id: `custom-${index}-${matchIndex}`,
              type: 'custom',
              category: 'custom',
              severity: 'medium',
              confidence: 0.8,
              description: 'Custom Pattern Match',
              detected_value: match,
              context: include_context
                ? text.substring(
                    Math.max(0, text.indexOf(match) - 50),
                    text.indexOf(match) + match.length + 50
                  )
                : match,
              position: {
                start: text.indexOf(match),
                end: text.indexOf(match) + match.length,
              },
              suggested_action: 'Review and sanitize if necessary',
              compliance_impact: 'Custom pattern - assess based on content',
            };
            detectedItems.push(detectedItem);
          });
        }
      } catch (error) {
        console.warn(`Invalid custom pattern: ${customPattern}`);
      }
    });

    // Generate detection summary
    const summary = {
      total_detections: detectedItems.length,
      categories_found: [...new Set(detectedItems.map(item => item.category))],
      severity_breakdown: {
        high: detectedItems.filter(item => item.severity === 'high').length,
        medium: detectedItems.filter(item => item.severity === 'medium').length,
        low: detectedItems.filter(item => item.severity === 'low').length,
      },
      confidence_average:
        detectedItems.length > 0
          ? detectedItems.reduce((sum, item) => sum + item.confidence, 0) /
            detectedItems.length
          : 0,
      risk_score: calculateRiskScore(detectedItems),
      compliance_status: getComplianceStatus(detectedItems),
    };

    // Generate recommendations
    const recommendations = generateRecommendations(detectedItems, summary);

    const detectionResult = {
      detection_id: `detect-${Date.now()}`,
      timestamp: new Date().toISOString(),
      input_text_length: text.length,
      detection_options: detection_options,
      detected_items: detectedItems,
      summary: summary,
      recommendations: recommendations,
      processing_time_ms: Math.floor(Math.random() * 50) + 10, // Mock processing time
      detection_engine_version: '1.0.0',
    };

    return NextResponse.json({
      success: true,
      data: detectionResult,
      message: `PII detection completed. Found ${detectedItems.length} potential matches.`,
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
        message: 'PII detection failed',
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/v1/sanitize/detect
 * Get information about PII detection capabilities
 */
export async function GET(request: NextRequest) {
  try {
    const detectionCapabilities = {
      supported_categories: [
        {
          name: 'pii',
          description: 'Personally Identifiable Information',
          examples: ['names', 'emails', 'phones', 'addresses'],
        },
        {
          name: 'phi',
          description: 'Protected Health Information',
          examples: ['medical records', 'diagnosis codes', 'patient IDs'],
        },
        {
          name: 'financial',
          description: 'Financial Information',
          examples: ['credit cards', 'bank accounts', 'SSNs'],
        },
        {
          name: 'government',
          description: 'Government Identifiers',
          examples: ['SSNs', 'passport numbers', 'driver licenses'],
        },
      ],
      supported_severity_levels: [
        {
          level: 'high',
          description: 'High risk - immediate action required',
          color: 'red',
        },
        {
          level: 'medium',
          description: 'Medium risk - review and consider action',
          color: 'orange',
        },
        {
          level: 'low',
          description: 'Low risk - monitor and assess',
          color: 'yellow',
        },
      ],
      detection_patterns: [
        {
          type: 'ssn',
          pattern: 'XXX-XX-XXXX',
          category: 'government',
          severity: 'high',
        },
        {
          type: 'phone',
          pattern: '(XXX) XXX-XXXX',
          category: 'pii',
          severity: 'medium',
        },
        {
          type: 'email',
          pattern: 'user@domain.com',
          category: 'pii',
          severity: 'medium',
        },
        {
          type: 'credit_card',
          pattern: 'XXXX XXXX XXXX XXXX',
          category: 'financial',
          severity: 'high',
        },
        {
          type: 'mrn',
          pattern: 'MRN: XXXXXXX',
          category: 'phi',
          severity: 'high',
        },
        {
          type: 'name',
          pattern: 'First Last',
          category: 'pii',
          severity: 'low',
        },
        {
          type: 'address',
          pattern: '123 Street Name',
          category: 'pii',
          severity: 'medium',
        },
      ],
      compliance_frameworks: [
        {
          name: 'HIPAA',
          description: 'Health Insurance Portability and Accountability Act',
        },
        { name: 'GDPR', description: 'General Data Protection Regulation' },
        { name: 'CCPA', description: 'California Consumer Privacy Act' },
        { name: 'SOX', description: 'Sarbanes-Oxley Act' },
      ],
      detection_options: {
        categories:
          'Array of categories to detect (pii, phi, financial, government)',
        severity: 'Array of severity levels to include (high, medium, low)',
        strict_mode: 'Enable strict mode for more aggressive detection',
        include_context: 'Include surrounding text context in results',
        confidence_threshold: 'Minimum confidence score (0.0-1.0)',
        custom_patterns: 'Array of custom regex patterns to detect',
      },
      api_usage: {
        rate_limit: '1000 requests per hour',
        max_text_length: '1MB per request',
        response_format: 'JSON with detailed detection results',
        processing_time: 'Typically < 100ms for standard text',
      },
    };

    return NextResponse.json({
      success: true,
      data: detectionCapabilities,
      message: 'PII detection capabilities retrieved successfully',
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        data: null,
        message: 'Failed to retrieve detection capabilities',
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

// Helper functions
function getSuggestedAction(category: string, severity: string): string {
  const actions = {
    government: 'Immediately sanitize - high compliance risk',
    phi: 'Sanitize before processing - HIPAA compliance required',
    financial: 'Sanitize or encrypt - PCI compliance required',
    pii:
      severity === 'high'
        ? 'Sanitize immediately'
        : 'Review and consider sanitization',
  };
  return actions[category] || 'Review and assess risk';
}

function getComplianceImpact(category: string): string {
  const impacts = {
    government: 'High - SSN exposure violates multiple regulations',
    phi: 'High - HIPAA violation risk',
    financial: 'High - PCI DSS compliance required',
    pii: 'Medium - Privacy regulation compliance required',
  };
  return impacts[category] || 'Low - Assess based on context';
}

function calculateRiskScore(detectedItems: any[]): number {
  if (detectedItems.length === 0) return 0;

  const weights = { high: 3, medium: 2, low: 1 };
  const totalWeight = detectedItems.reduce(
    (sum, item) => sum + weights[item.severity],
    0
  );
  const maxPossibleWeight = detectedItems.length * 3;

  return Math.min(100, Math.round((totalWeight / maxPossibleWeight) * 100));
}

function getComplianceStatus(detectedItems: any[]): string {
  const highRiskItems = detectedItems.filter(item => item.severity === 'high');
  const phiItems = detectedItems.filter(item => item.category === 'phi');

  if (highRiskItems.length > 0 || phiItems.length > 0) {
    return 'NON_COMPLIANT - Immediate action required';
  } else if (detectedItems.length > 0) {
    return 'REVIEW_REQUIRED - Assess compliance impact';
  } else {
    return 'COMPLIANT - No sensitive data detected';
  }
}

function generateRecommendations(detectedItems: any[], summary: any): string[] {
  const recommendations = [];

  if (summary.total_detections === 0) {
    recommendations.push(
      'No sensitive data detected - text appears safe for processing'
    );
    return recommendations;
  }

  if (summary.severity_breakdown.high > 0) {
    recommendations.push(
      'HIGH PRIORITY: Immediately sanitize high-severity items before further processing'
    );
  }

  if (summary.severity_breakdown.medium > 0) {
    recommendations.push(
      'MEDIUM PRIORITY: Review and sanitize medium-severity items based on use case'
    );
  }

  if (summary.severity_breakdown.low > 0) {
    recommendations.push(
      'LOW PRIORITY: Consider sanitizing low-severity items for enhanced privacy'
    );
  }

  if (summary.risk_score > 70) {
    recommendations.push(
      'HIGH RISK: Consider using strict mode for more aggressive detection'
    );
  }

  if (summary.compliance_status.includes('NON_COMPLIANT')) {
    recommendations.push(
      'COMPLIANCE ALERT: Text contains data that violates privacy regulations'
    );
  }

  recommendations.push(
    'Consider using the sanitization endpoint to automatically remove detected sensitive data'
  );

  return recommendations;
}
