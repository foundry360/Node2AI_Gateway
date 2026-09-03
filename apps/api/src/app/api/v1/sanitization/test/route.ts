import { NextRequest, NextResponse } from 'next/server';
import { DataSanitizer } from '../../../../../lib/security/sanitizer';

export async function GET(request: NextRequest) {
  try {
    const sanitizer = new DataSanitizer();

    // Test data with various types of sensitive information
    const testText = `
      Patient Information:
      - Name: John Smith
      - SSN: 123-45-6789
      - Email: john.smith@hospital.com
      - Phone: (555) 123-4567
      - Credit Card: 4532-1234-5678-9012
      - Medical Record: MRN-123456789
      - Address: 123 Main St, Anytown, NY 12345
      - API Key: sk-1234567890abcdef1234567890abcdef1234567890abcdef
    `;

    const sessionId = `test_session_${Date.now()}`;
    const organizationId = 'test-org';

    // Step 1: Sanitize the text
    console.log('Step 1: Sanitizing text...');
    const sanitizationResult = await sanitizer.sanitizeText(
      testText,
      sessionId,
      organizationId
    );

    // Step 2: Simulate sending sanitized text to AI provider
    console.log('Step 2: Simulating AI provider call...');
    const aiResponse = `Based on the information provided, ${sanitizationResult.sanitizedText} should be monitored for any changes in their condition.`;

    // Step 3: Desanitize the AI response
    console.log('Step 3: Desanitizing AI response...');
    const desanitizedResponse = await sanitizer.desanitizeText(
      aiResponse,
      sessionId,
      organizationId
    );

    // Step 4: Generate comprehensive report
    const report = {
      originalText: testText.trim(),
      sanitizedText: sanitizationResult.sanitizedText,
      aiResponse,
      desanitizedResponse,
      detectedEntities: sanitizationResult.detectedEntities,
      riskLevel: sanitizationResult.riskLevel,
      complianceFlags: sanitizationResult.complianceFlags,
      tokenCount: sanitizationResult.tokenCount,
      processingTime: sanitizationResult.processingTime,
      sessionId,
      organizationId,
      timestamp: new Date().toISOString(),
    };

    return NextResponse.json({
      success: true,
      data: report,
      message: 'Sanitization test completed successfully',
    });
  } catch (error: any) {
    console.error('Sanitization test error:', error);
    return NextResponse.json(
      {
        success: false,
        data: null,
        message: 'Sanitization test failed',
        error: error.message,
      },
      { status: 500 }
    );
  }
}
