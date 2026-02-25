/**
 * F-033 EMERGENCY ACCOUNT LOCK - CONFIGURATION DOCUMENTATION
 * 
 * PURPOSE:
 * Emergency lock allows super_admin to freeze a user's write permissions
 * during investigation, while allowing them to view their data.
 * 
 * DISTINCTION FROM OTHER LOCK TYPES (F-033 Data.2):
 * 
 * 1. EMERGENCY LOCK (this feature):
 *    - Trigger: Super admin investigation
 *    - Effect: Blocks writes, allows reads
 *    - Duration: Permanent until super admin unlocks
 *    - Use case: Suspected TOS violation under investigation
 * 
 * 2. SUSPENSION (F-032):
 *    - Trigger: Admin moderation action
 *    - Effect: Blocks everything (reads + writes)
 *    - Duration: Permanent until admin unsuspends
 *    - Use case: Confirmed TOS violation
 * 
 * 3. BRUTE-FORCE LOCKOUT (F-012):
 *    - Trigger: Too many failed login attempts
 *    - Effect: Blocks login only
 *    - Duration: Auto-expires after time window
 *    - Use case: Credential stuffing protection
 * 
 * ============================================================================
 * IMPLEMENTATION REQUIREMENTS
 * ============================================================================
 * 
 * PLATFORM-MANAGED (Base44):
 * - JWT validation
 * - Session management
 * - Database storage of User.is_locked field
 * 
 * BUILD REQUIRED (Developer):
 * - User entity fields: is_locked, locked_reason, locked_at, locked_by
 * - Middleware Gate 2b enforcement (F-033 Logic.1)
 * - Backend functions: lockUser, unlockUser
 * - UI components: LockUserModal, UnlockUserModal, LockedAccountBanner
 * 
 * ============================================================================
 * DATA MODEL (F-033 Data.1)
 * ============================================================================
 * 
 * User entity fields:
 * {
 *   is_locked: Boolean (default false),
 *   locked_reason: Text (nullable, admin-only),
 *   locked_at: DateTime (nullable),
 *   locked_by: Relation:User (super_admin who locked)
 * }
 * 
 * ============================================================================
 * MIDDLEWARE ENFORCEMENT (F-033 Logic.1)
 * ============================================================================
 * 
 * Authorization Flow (F-003 Four-Gate Model):
 * 
 * Gate 1: JWT Validation
 *   ↓
 * Gate 2: Suspension Check (F-032)
 *   if (is_suspended) → 403 Forbidden
 *   ↓
 * Gate 2b: LOCK CHECK (F-033)
 *   if (is_locked && request.method !== 'GET') → 403 Forbidden
 *   ↓
 * Gate 3: Role-Based Permissions
 *   ↓
 * Gate 4: Record Ownership
 * 
 * IMPLEMENTATION:
 * 
 * const authGuard = async (req) => {
 *   const user = await authenticateUser(req);
 *   
 *   // Gate 2: Suspension
 *   if (user.is_suspended) {
 *     return { error: 'Account suspended', status: 403 };
 *   }
 *   
 *   // Gate 2b: Lock (F-033 Logic.1)
 *   if (user.is_locked && req.method !== 'GET') {
 *     return { 
 *       error: 'Account under review — contact support', 
 *       status: 403 
 *     };
 *   }
 *   
 *   // Continue to Gate 3...
 * };
 * 
 * ============================================================================
 * ACCESS CONTROL (F-033 Access.1-2)
 * ============================================================================
 * 
 * LOCKED USER CAN:
 * ✅ View dashboard
 * ✅ View profile
 * ✅ View existing bookings
 * ✅ View messages
 * ✅ View booking history
 * 
 * LOCKED USER CANNOT:
 * ❌ Update profile
 * ❌ Create bookings
 * ❌ Send messages
 * ❌ Submit reports
 * ❌ Change password
 * ❌ Upload files
 * ❌ Accept/decline bookings
 * 
 * LOGIC: All GET requests pass. All POST/PUT/PATCH/DELETE blocked.
 * 
 * ============================================================================
 * AUTHORIZATION (F-033 Data.3)
 * ============================================================================
 * 
 * WHO CAN LOCK:
 * - super_admin ONLY
 * 
 * WHO CANNOT LOCK:
 * - support_admin
 * - trust_admin
 * - The user themselves
 * 
 * ============================================================================
 * STATE MACHINE (F-033 States.1-2)
 * ============================================================================
 * 
 * active → locked (super_admin investigation)
 *            ↓
 *            ├─→ active (investigation cleared)
 *            │
 *            └─→ suspended (investigation found violation)
 * 
 * F-033 States.2: Lock can escalate to suspension.
 * Both actions logged separately in AdminActionLog.
 * 
 * ============================================================================
 * SESSION HANDLING (F-033 Logic.3)
 * ============================================================================
 * 
 * CRITICAL: Lock does NOT invalidate sessions.
 * 
 * WHY: The goal is to freeze activity for investigation WITHOUT alerting
 * the user via forced logout. User remains logged in but cannot write.
 * 
 * This differs from suspension, which immediately invalidates all tokens.
 * 
 * ============================================================================
 * ERROR MESSAGES (F-033 Errors.1-2)
 * ============================================================================
 * 
 * LOCKED USER WRITE ATTEMPT:
 * "Your account is currently under review. Some actions are temporarily 
 * unavailable. Contact support."
 * 
 * Generic message. Does NOT reveal:
 * - That they are locked (vs other investigation)
 * - Why they are locked
 * - Who locked them
 * 
 * PARENT BOOKING LOCKED CAREGIVER:
 * "This caregiver is currently unavailable."
 * 
 * Does NOT reveal lock status to third parties.
 * 
 * ============================================================================
 * UI IMPLEMENTATION (F-033 UI.1-3)
 * ============================================================================
 * 
 * ADMIN PANEL:
 * - 'Lock account' action in user action menu (super_admin only)
 * - Amber 'Under Review' badge for locked users
 * - Separate filter for locked accounts
 * - Distinct from suspend toggle
 * 
 * USER DASHBOARD:
 * - Yellow banner at top: "Account under review, some features unavailable"
 * - All write buttons disabled with tooltip: "Unavailable while under review"
 * - Read-only views still functional
 * 
 * ============================================================================
 * RATE LIMITING (F-033 Abuse.1)
 * ============================================================================
 * 
 * Lock Actions: Max 10 per super_admin per hour
 * 
 * Rationale: Unusual locking volume indicates:
 * - Compromised super_admin account
 * - Scripted attack using admin credentials
 * 
 * Mitigation: Alert other super_admin accounts if limit hit
 * 
 * ============================================================================
 * AUDIT TRAIL (F-033 Audit.1-3)
 * ============================================================================
 * 
 * EVERY LOCK ACTION LOGS:
 * - admin_user_id: Who locked
 * - target_entity_id: Who was locked
 * - locked_reason: Why (required, min 10 chars)
 * - locked_at: When
 * - payload: User state snapshot
 * 
 * EVERY UNLOCK ACTION LOGS:
 * - admin_user_id: Who unlocked
 * - target_entity_id: Who was unlocked
 * - reason: Why unlock (required, min 10 chars)
 * - timestamp
 * 
 * F-033 Audit.3: Lock-to-suspension escalation logs BOTH:
 * 1. Original lock entry (remains)
 * 2. New suspension entry (added)
 * 
 * Full timeline visible in AdminActionLog.
 * 
 * ============================================================================
 * EDGE CASES (F-033 Edge.1-3)
 * ============================================================================
 * 
 * EDGE CASE 1: Lock + Suspension Simultaneously Set
 * Resolution: Suspension takes precedence. Locked state irrelevant.
 * 
 * EDGE CASE 2: Investigation Finds No Evidence
 * Resolution: Super admin unlocks. All logs retained permanently.
 * 
 * EDGE CASE 3: Locked User Creates New Account
 * Resolution: Manual detection only at MVP. Same as suspension (F-032).
 * Post-MVP: IP + device fingerprinting heuristics.
 * 
 * ============================================================================
 * TESTING CHECKLIST
 * ============================================================================
 * 
 * □ Super admin can lock user account
 * □ support_admin/trust_admin cannot lock accounts
 * □ Locked user can GET (read) all endpoints
 * □ Locked user cannot POST/PUT/PATCH/DELETE (403)
 * □ Locked user sees yellow banner on dashboard
 * □ Locked user write buttons disabled with tooltip
 * □ Lock does not invalidate active sessions
 * □ Lock action logged to AdminActionLog
 * □ Unlock action logged to AdminActionLog
 * □ Rate limit enforced (10 per hour)
 * □ Admin panel shows amber 'Under Review' badge
 * □ Lock can escalate to suspension (both logged)
 * □ Suspension takes precedence if both set
 * 
 * ============================================================================
 */

export default function F033_EmergencyLockConfig() {
  return null; // Documentation only
}