/**
 * POST /api/v1/audit/compliance-review
 * Create a compliance review
 */

import { NextRequest, NextResponse } from 'next/server';
import { AuditService } from '../../../../../lib/audit/audit.service';
import { z } from 'zod';

const auditService = new AuditService();

const ComplianceReviewSchema = z.object({
  review_type: z.enum(['random_sample', 'flagged_content', 'periodic_audit']),
  review_period_start: z.string().optional(),
  review_period_end: z.string().optional(),
  reviewed_by: z.string(),
  organization_id: z.string().optional(),
  request_ids: z.array(z.string()),
  sample_size: z.number().optional(),
  findings: z.string().optional(),
  issues_found: z.number().optional(),
  compliance_status: z.enum(['compliant', 'non_compliant', 'needs_review']),
  actions_required: z.string().optional(),
  follow_up_required: z.boolean().optional(),
  follow_up_date: z.string().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validated = ComplianceReviewSchema.parse(body);

    // Convert dates
    const reviewData: any = { ...validated };
    if (validated.review_period_start) {
      reviewData.reviewPeriodStart = new Date(validated.review_period_start);
    }
    if (validated.review_period_end) {
      reviewData.reviewPeriodEnd = new Date(validated.review_period_end);
    }
    if (validated.follow_up_date) {
      reviewData.followUpDate = new Date(validated.follow_up_date);
    }

    // Create compliance review
    const reviewId = await auditService.createComplianceReview(reviewData);

    return NextResponse.json({
      success: true,
      data: { id: reviewId },
      message: 'Compliance review created successfully',
    });
  } catch (error: any) {
    console.error('Error creating compliance review:', error);
    return NextResponse.json(
      {
        success: false,
        data: null,
        message: 'Failed to create compliance review',
        error: error.message,
      },
      { status: 500 }
    );
  }
}
