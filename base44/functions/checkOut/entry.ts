/**
 * F-3002: DEPRECATED — Check-Out endpoint removed as part of the caregiver-led session completion update.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (_req) => {
  return Response.json(
    { error: 'This endpoint has been deprecated. The check-out flow has been removed.' },
    { status: 410 }
  );
});