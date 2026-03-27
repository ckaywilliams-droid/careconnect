import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    console.log('[submitReview] user:', user ? { id: user.id, email: user.email, app_role: user.app_role } : null);

    if (!user || user.app_role !== 'parent') {
      return Response.json({ error: 'Only parents can submit reviews.' }, { status: 403 });
    }

    let payload = {};
    if (req.method === 'POST') {
      payload = await req.json();
    }
    const { booking_request_id, rating, body } = payload;
    console.log('[submitReview] payload:', { booking_request_id, rating, body });

    if (!booking_request_id || !rating) {
      return Response.json({ error: 'booking_request_id and rating are required.' }, { status: 400 });
    }

    if (rating < 1 || rating > 5 || !Number.isInteger(rating)) {
      return Response.json({ error: 'Rating must be an integer between 1 and 5.' }, { status: 400 });
    }

    // Use service role to bypass RLS, then do manual ownership check
    // Note: SDK filter does not support built-in `id` field directly, so filter by parent_user_id and find by id
    const allBookings = await base44.asServiceRole.entities.BookingRequest.filter({ parent_user_id: user.id });
    const booking = allBookings.find(b => b.id === booking_request_id);
    console.log('[submitReview] bookings found for parent:', allBookings.length);
    console.log('[submitReview] matched booking:', booking ? { id: booking.id, status: booking.status, parent_user_id: booking.parent_user_id } : null);

    if (!booking) {
      return Response.json({ error: 'Booking not found.' }, { status: 404 });
    }

    if (booking.parent_user_id !== user.id) {
      return Response.json({ error: 'You can only review your own bookings.' }, { status: 403 });
    }

    // Allow review if status is 'completed' or 'accepted' (frontend treats both as reviewable)
    const isReviewable = booking.status === 'completed' || booking.status === 'accepted';
    console.log('[submitReview] booking status:', booking.status, '| isReviewable:', isReviewable);
    if (!isReviewable) {
      return Response.json({ error: 'You can only review completed bookings.' }, { status: 400 });
    }

    // Duplicate check — one review per booking per parent
    const existing = await base44.asServiceRole.entities.Review.filter({
      booking_request_id,
      parent_user_id: user.id,
    });
    if (existing.length > 0) {
      return Response.json({ error: 'You have already reviewed this booking.' }, { status: 409 });
    }

    // Sanitize body: strip HTML/script tags
    const sanitizedBody = body
      ? body.replace(/<[^>]*>/g, '').replace(/&/g, '&amp;').slice(0, 1000)
      : null;

    // Create the review using service role
    const review = await base44.asServiceRole.entities.Review.create({
      booking_request_id,
      caregiver_profile_id: booking.caregiver_profile_id,
      caregiver_user_id: booking.caregiver_user_id,
      parent_user_id: user.id,
      rating,
      body: sanitizedBody,
      is_suppressed: false,
    });

    // Recalculate caregiver average_rating and total_reviews
    const allReviews = await base44.asServiceRole.entities.Review.filter({
      caregiver_profile_id: booking.caregiver_profile_id,
    });
    const visibleReviews = allReviews.filter(r => !r.is_suppressed);
    const total = visibleReviews.length;
    const avg = total > 0
      ? visibleReviews.reduce((sum, r) => sum + r.rating, 0) / total
      : 0;

    await base44.asServiceRole.entities.CaregiverProfile.update(booking.caregiver_profile_id, {
      average_rating: Math.round(avg * 10) / 10,
      total_reviews: total,
    });

    return Response.json({ success: true, review });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});