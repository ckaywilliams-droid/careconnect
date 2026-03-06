import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.app_role !== 'parent') return Response.json({ error: 'Only parents can submit reviews.' }, { status: 403 });

    const { booking_request_id, rating, comment } = await req.json();

    if (!booking_request_id) return Response.json({ error: 'booking_request_id is required.' }, { status: 400 });
    if (!rating || rating < 1 || rating > 5 || !Number.isInteger(Number(rating))) {
      return Response.json({ error: 'Rating must be an integer between 1 and 5.' }, { status: 400 });
    }
    if (comment && comment.length > 1000) {
      return Response.json({ error: 'Comment must be 1000 characters or less.' }, { status: 400 });
    }

    // Sanitize comment
    const sanitizedComment = comment
      ? comment.replace(/<[^>]*>/g, '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').trim()
      : '';

    // Fetch booking
    const bookings = await base44.asServiceRole.entities.BookingRequest.filter({ id: booking_request_id });
    if (!bookings.length) return Response.json({ error: 'Booking not found.' }, { status: 404 });
    const booking = bookings[0];

    // Ownership check
    if (booking.parent_user_id !== user.id) {
      return Response.json({ error: 'You can only review your own bookings.' }, { status: 403 });
    }

    // Must be completed
    if (booking.status !== 'completed') {
      return Response.json({ error: 'You can only review completed bookings.' }, { status: 422 });
    }

    // One review per booking
    const existing = await base44.asServiceRole.entities.Review.filter({ booking_request_id });
    if (existing.length > 0) {
      return Response.json({ error: 'You have already reviewed this booking.' }, { status: 409 });
    }

    // Create review
    const review = await base44.asServiceRole.entities.Review.create({
      booking_request_id,
      caregiver_profile_id: booking.caregiver_profile_id,
      parent_user_id: user.id,
      rating: Number(rating),
      comment: sanitizedComment,
      is_suppressed: false
    });

    // Recompute caregiver average_rating and total_reviews
    const allReviews = await base44.asServiceRole.entities.Review.filter({
      caregiver_profile_id: booking.caregiver_profile_id,
      is_suppressed: false
    });
    const totalReviews = allReviews.length;
    const avgRating = totalReviews > 0
      ? allReviews.reduce((sum, r) => sum + r.rating, 0) / totalReviews
      : 0;

    await base44.asServiceRole.entities.CaregiverProfile.update(booking.caregiver_profile_id, {
      average_rating: Math.round(avgRating * 10) / 10,
      total_reviews: totalReviews
    });

    return Response.json({ success: true, review });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});