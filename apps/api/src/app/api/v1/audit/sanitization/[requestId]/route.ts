/**
 * GET /api/v1/audit/sanitization/:requestId
 * Get all sanitization events for a request
 */

import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db/postgres-client';

export async function GET(
  request: NextRequest,
  { params }: { params: { requestId: string } }
) {
  try {
    const { requestId } = params;

    const requestResult = await query(
      `
        SELECT id
        FROM ai_requests
        WHERE request_id = $1
        LIMIT 1
      `,
      [requestId]
    );

    const aiRequest = requestResult.rows[0];

    if (!aiRequest) {
      return NextResponse.json(
        {
          success: false,
          data: null,
          message: 'Request not found',
          error: 'NOT_FOUND',
        },
        { status: 404 }
      );
    }

    const eventsResult = await query(
      `
        SELECT *
        FROM sanitization_events
        WHERE request_id = $1
        ORDER BY created_at ASC
      `,
      [aiRequest.id]
    );

    const sanitizationEvents = eventsResult.rows;

    return NextResponse.json({
      success: true,
      data: {
        request: aiRequest,
        sanitizationEvents,
        totalDetections: sanitizationEvents.length,
      },
      message: 'Sanitization events retrieved successfully',
    });
  } catch (error: any) {
    console.error('Error getting sanitization events:', error);
    return NextResponse.json(
      {
        success: false,
        data: null,
        message: 'Failed to retrieve sanitization events',
        error: error.message,
      },
      { status: 500 }
    );
  }
}
