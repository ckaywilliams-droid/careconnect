/**
 * F-018: TERMS OF SERVICE ACCEPTANCE CONFIGURATION
 * 
 * THIS IS A DOCUMENTATION COMPONENT - NOT FUNCTIONAL CODE
 * 
 * This component documents the Base44 platform configuration required for F-018
 * Terms of Service Acceptance. Ensures legal compliance by capturing and tracking
 * user acceptance of ToS and Privacy Policy at registration and on version updates.
 * 
 * STATUS: Phase 0 - Entities created (PolicyAcceptance, PolicyVersion)
 * NEXT STEP: Implement registration acceptance flow + re-acceptance on version change
 * 
 * ============================================================================
 * CRITICAL LEGAL COMPLIANCE REQUIREMENTS
 * ============================================================================
 */

const F018_TOS_ACCEPTANCE_SPECIFICATION = {
  
  /**
   * ENTITY SCHEMAS (Data.1-2)
   * PolicyAcceptance and PolicyVersion
   */
  entity_schemas: {
    
    policy_acceptance: {
      entity: 'PolicyAcceptance',
      purpose: 'Immutable record of user policy acceptance',
      
      fields: {
        id: 'UUID (auto)',
        user_id: 'Relation:User (required) - Who accepted',
        policy_type: 'Select (required) - tos or privacy_policy',
        policy_version: 'Text (required) - Version accepted (e.g., v1.0)',
        accepted_at: 'DateTime (auto, immutable) - When accepted',
        ip_address: 'Text (required) - IP from server request (Logic.3)',
        user_agent: 'Text (optional) - Browser/device for audit'
      },
      
      access_control: {
        // Access.1: INSERT-only
        create: ['system_automation'],  // Server-side only
        read: ['self', 'support_admin', 'trust_admin', 'super_admin'],
        update: [],  // EMPTY - no role can update
        delete: []   // EMPTY - never deleted (Audit.1)
      },
      
      immutability: {
        // Access.1: INSERT-only enforcement
        requirement: 'PolicyAcceptance is INSERT-only - no UPDATE or DELETE',
        verification: [
          'Attempt UPDATE as super_admin → expect 403',
          'Attempt DELETE as super_admin → expect 403'
        ],
        rationale: 'Legal compliance - acceptance records must be immutable'
      }
    },
    
    policy_version: {
      entity: 'PolicyVersion',
      purpose: 'Track policy versions and current active version',
      
      fields: {
        id: 'UUID (auto)',
        policy_type: 'Select - tos or privacy_policy',
        version: 'Text (required, unique per type) - e.g., v1.0, v1.1',
        effective_date: 'Date (required) - When version becomes active',
        content_url: 'Text - Link to full policy text',
        content_summary: 'Text - Summary of changes',
        is_current: 'Boolean (default false) - Only one per policy_type',
        published_by_admin_id: 'Relation:User - Admin who published',
        requires_re_acceptance: 'Boolean (default true) - Whether to force re-acceptance'
      },
      
      access_control: {
        // Access.2: Admin write, public read
        create: ['super_admin'],
        read: ['public'],  // Policy text must be accessible
        update: ['super_admin'],
        delete: []  // Never delete policy versions
      },
      
      uniqueness_constraint: {
        rule: 'Only one PolicyVersion per policy_type can have is_current=true',
        enforcement: 'When setting is_current=true, set all other versions for same policy_type to false'
      }
    }
  },
  
  /**
   * REGISTRATION ACCEPTANCE FLOW (States.1, Triggers.1)
   * User cannot register without accepting ToS
   */
  registration_acceptance: {
    
    state_machine: {
      // States.1: Registration requires acceptance
      unverified: {
        state: 'Unverified',
        description: 'No PolicyAcceptance record exists',
        allowed_actions: 'Cannot complete registration'
      },
      
      accepted: {
        state: 'Accepted',
        description: 'PolicyAcceptance record exists for current version',
        allowed_actions: 'Full platform access'
      }
    },
    
    registration_workflow: {
      // Triggers.1: Atomic registration with acceptance
      steps: [
        '1. User fills registration form',
        '2. User checks ToS acceptance checkbox',
        '3. Client validates checkbox is checked',
        '4. Server receives registration request',
        '5. Server fetches current policy version (Logic.1)',
        '6. Server creates User record',
        '7. Server creates PolicyAcceptance record',
        '8. If either fails, rollback both (Edge.1)'
      ],
      
      implementation: `
        // Registration endpoint
        async function registerUser(registrationData, tosAccepted, requestContext) {
          // Client-side validation already checked checkbox
          if (!tosAccepted) {
            return { error: 'ToS acceptance required' };
          }
          
          // Logic.1: Server fetches current policy version (NEVER trust client)
          const currentTOS = await base44.asServiceRole.entities.PolicyVersion.filter({
            policy_type: 'tos',
            is_current: true
          });
          
          const currentPrivacy = await base44.asServiceRole.entities.PolicyVersion.filter({
            policy_type: 'privacy_policy',
            is_current: true
          });
          
          if (currentTOS.length === 0 || currentPrivacy.length === 0) {
            // Abuse.1: Policy not published - block registration
            console.error('Current policy version not found - registration blocked');
            throw new Error('Service unavailable - please try again later');
          }
          
          let user, tosAcceptance, privacyAcceptance;
          
          try {
            // Step 1: Create User record
            user = await base44.asServiceRole.entities.User.create({
              email: registrationData.email,
              full_name: registrationData.full_name,
              role: registrationData.role || 'parent'
            });
            
            try {
              // Step 2: Create PolicyAcceptance for ToS (Triggers.1)
              tosAcceptance = await base44.asServiceRole.entities.PolicyAcceptance.create({
                user_id: user.id,
                policy_type: 'tos',
                policy_version: currentTOS[0].version,  // Errors.1: Server-fetched
                accepted_at: new Date().toISOString(),
                ip_address: requestContext.ip,  // Logic.3: Server-side capture
                user_agent: requestContext.userAgent
              });
              
              // Step 3: Create PolicyAcceptance for Privacy Policy
              privacyAcceptance = await base44.asServiceRole.entities.PolicyAcceptance.create({
                user_id: user.id,
                policy_type: 'privacy_policy',
                policy_version: currentPrivacy[0].version,
                accepted_at: new Date().toISOString(),
                ip_address: requestContext.ip,
                user_agent: requestContext.userAgent
              });
              
            } catch (error) {
              // Edge.1: PolicyAcceptance creation failed - rollback User
              console.error('PolicyAcceptance creation failed - rolling back user', error);
              await base44.asServiceRole.entities.User.delete(user.id);
              throw new Error('Registration failed - please try again');
            }
            
            console.info('User registered with ToS acceptance', {
              user_id: user.id,
              tos_version: currentTOS[0].version,
              privacy_version: currentPrivacy[0].version
            });
            
            return {
              success: true,
              user: user
            };
            
          } catch (error) {
            // Registration failed
            console.error('User registration failed', error);
            throw error;
          }
        }
      `
    }
  },
  
  /**
   * RE-ACCEPTANCE ON VERSION CHANGE (States.2, Triggers.2)
   * Force re-acceptance when policy updated
   */
  re_acceptance_flow: {
    
    state_transition: {
      // States.2: Existing users must re-accept new version
      trigger: 'super_admin publishes new policy version (sets is_current=true)',
      effect: 'All existing users transition to "re-acceptance required" state',
      enforcement: 'Login intercept - redirect to re-acceptance screen before dashboard'
    },
    
    login_intercept: {
      // Triggers.2: Check on every login
      location: 'After authentication, before redirecting to dashboard',
      
      check: 'Does user have PolicyAcceptance for current policy versions?',
      
      implementation: `
        // Login endpoint
        async function login(email, password, requestContext) {
          // Authenticate user
          const user = await authenticateUser(email, password);
          
          if (!user) {
            return { error: 'Invalid credentials' };
          }
          
          // Check suspension (F-015), lockout (F-012), etc.
          // ...
          
          // Triggers.2: Check if user needs to re-accept policies
          const needsReAcceptance = await checkPolicyReAcceptanceRequired(user.id);
          
          if (needsReAcceptance) {
            // Generate temporary "re-acceptance pending" token
            const reAcceptanceToken = generateReAcceptanceToken(user.id);
            
            return {
              success: true,
              requires_re_acceptance: true,
              re_acceptance_token: reAcceptanceToken,
              redirect_url: '/re-accept-policies'
            };
          }
          
          // User has accepted current versions - issue full JWT
          const jwt = generateJWT(user);
          return {
            success: true,
            token: jwt,
            redirect_url: '/dashboard'
          };
        }
        
        // Check if user needs to re-accept
        async function checkPolicyReAcceptanceRequired(userId) {
          // Get current policy versions
          const currentTOS = await base44.entities.PolicyVersion.filter({
            policy_type: 'tos',
            is_current: true
          });
          
          const currentPrivacy = await base44.entities.PolicyVersion.filter({
            policy_type: 'privacy_policy',
            is_current: true
          });
          
          if (currentTOS.length === 0 || currentPrivacy.length === 0) {
            // No current version - should not happen
            return false;
          }
          
          // Check if user has accepted current versions
          const tosAcceptance = await base44.entities.PolicyAcceptance.filter({
            user_id: userId,
            policy_type: 'tos',
            policy_version: currentTOS[0].version
          });
          
          const privacyAcceptance = await base44.entities.PolicyAcceptance.filter({
            user_id: userId,
            policy_type: 'privacy_policy',
            policy_version: currentPrivacy[0].version
          });
          
          // Re-acceptance needed if either is missing
          return tosAcceptance.length === 0 || privacyAcceptance.length === 0;
        }
      `
    },
    
    re_acceptance_email: {
      // Abuse.2: Email notification on version change
      trigger: 'super_admin publishes new policy version',
      recipient: 'All existing users',
      
      email_content: {
        subject: 'Updated Terms of Service - Action Required',
        body: `
          We've updated our [Terms of Service / Privacy Policy].
          
          What's changed:
          {{content_summary from PolicyVersion}}
          
          You will be asked to review and accept the updated policy on your next login.
          
          Read the full policy here: {{content_url}}
        `
      },
      
      implementation: `
        // When admin publishes new policy version
        async function publishPolicyVersion(adminUser, policyType, newVersion) {
          // Set is_current = true for new version
          await base44.asServiceRole.entities.PolicyVersion.update(newVersion.id, {
            is_current: true,
            published_by_admin_id: adminUser.id
          });
          
          // Set is_current = false for all other versions of same type
          const otherVersions = await base44.asServiceRole.entities.PolicyVersion.filter({
            policy_type: policyType,
            id: { $ne: newVersion.id }
          });
          
          for (const version of otherVersions) {
            await base44.asServiceRole.entities.PolicyVersion.update(version.id, {
              is_current: false
            });
          }
          
          // Abuse.2: Send re-acceptance email to all users
          if (newVersion.requires_re_acceptance) {
            const allUsers = await base44.asServiceRole.entities.User.filter({
              is_deleted: false,
              is_suspended: false
            });
            
            for (const user of allUsers) {
              await base44.integrations.Core.SendEmail({
                to: user.email,
                subject: \`Updated \${policyType === 'tos' ? 'Terms of Service' : 'Privacy Policy'} - Action Required\`,
                body: \`
                  We've updated our \${policyType === 'tos' ? 'Terms of Service' : 'Privacy Policy'}.
                  
                  What's changed:
                  \${newVersion.content_summary || 'Please review the updated policy.'}
                  
                  You will be asked to review and accept the updated policy on your next login.
                  
                  Read the full policy here: \${newVersion.content_url}
                \`
              });
            }
          }
        }
      `
    }
  },
  
  /**
   * SERVER-SIDE VERSION FETCH (Logic.1, Errors.1)
   * Never trust client-supplied version
   */
  server_side_version_fetch: {
    
    security_principle: {
      // Errors.1: Server-side version fetch
      rule: 'Server MUST fetch current policy_version from PolicyVersion collection',
      forbidden: 'NEVER trust policy_version string from client payload',
      attack_vector: 'Client could submit old version to avoid new policy terms'
    },
    
    correct_pattern: `
      // CORRECT: Server fetches version
      async function recordAcceptance(userId) {
        const currentVersion = await base44.entities.PolicyVersion.filter({
          policy_type: 'tos',
          is_current: true
        });
        
        await base44.entities.PolicyAcceptance.create({
          user_id: userId,
          policy_version: currentVersion[0].version,  // Server-fetched
          // ...
        });
      }
    `,
    
    incorrect_pattern: `
      // WRONG: Trusting client-supplied version
      async function recordAcceptance(userId, clientData) {
        await base44.entities.PolicyAcceptance.create({
          user_id: userId,
          policy_version: clientData.version,  // DANGER - client can manipulate
          // ...
        });
      }
    `
  },
  
  /**
   * IP ADDRESS CAPTURE (Logic.3)
   * Server-side IP from request context
   */
  ip_address_capture: {
    
    security_principle: {
      // Logic.3: Server-side IP capture
      rule: 'IP address captured from server-side request context',
      forbidden: 'NEVER use client-supplied IP address field',
      compliance: 'Legal requirement to capture IP for acceptance proof'
    },
    
    implementation: `
      // Capture IP from request (similar to F-014)
      function getClientIP(req) {
        // Use platform-provided real IP
        if (req.realIP) {
          return req.realIP;
        }
        
        // Behind trusted proxy
        if (req.headers['cf-connecting-ip']) {
          return req.headers['cf-connecting-ip'];  // CloudFlare
        }
        
        return req.connection.remoteAddress;
      }
      
      // Registration with IP capture
      async function registerUser(req, data) {
        const ip = getClientIP(req);  // Logic.3: Server-side
        
        await base44.entities.PolicyAcceptance.create({
          user_id: user.id,
          ip_address: ip,  // NOT from client payload
          user_agent: req.headers['user-agent'],
          // ...
        });
      }
    `
  },
  
  /**
   * ATOMIC REGISTRATION (Logic.2, Edge.1)
   * User and PolicyAcceptance created together
   */
  atomic_registration: {
    
    requirement: {
      // Logic.2: Cannot bypass acceptance
      rule: 'User creation and PolicyAcceptance creation MUST be atomic',
      no_bypass: 'No registration path may succeed without PolicyAcceptance',
      rollback: 'If PolicyAcceptance fails, User creation is rolled back (Edge.1)'
    },
    
    atomicity_pattern: `
      async function atomicRegistration(data, tosAccepted, requestContext) {
        if (!tosAccepted) {
          throw new Error('ToS acceptance required');
        }
        
        let user, tosAcceptance, privacyAcceptance;
        
        try {
          // Step 1: Create User
          user = await base44.asServiceRole.entities.User.create({
            email: data.email,
            full_name: data.full_name,
            role: data.role
          });
          
          try {
            // Step 2: Fetch current versions (Errors.1: server-side)
            const currentTOS = await getCurrentPolicyVersion('tos');
            const currentPrivacy = await getCurrentPolicyVersion('privacy_policy');
            
            // Step 3: Create PolicyAcceptance for ToS
            tosAcceptance = await base44.asServiceRole.entities.PolicyAcceptance.create({
              user_id: user.id,
              policy_type: 'tos',
              policy_version: currentTOS.version,
              accepted_at: new Date().toISOString(),
              ip_address: requestContext.ip,  // Logic.3: Server-captured
              user_agent: requestContext.userAgent
            });
            
            // Step 4: Create PolicyAcceptance for Privacy Policy
            privacyAcceptance = await base44.asServiceRole.entities.PolicyAcceptance.create({
              user_id: user.id,
              policy_type: 'privacy_policy',
              policy_version: currentPrivacy.version,
              accepted_at: new Date().toISOString(),
              ip_address: requestContext.ip,
              user_agent: requestContext.userAgent
            });
            
          } catch (error) {
            // Edge.1: PolicyAcceptance creation failed - rollback User
            console.error('PolicyAcceptance creation failed - rolling back user', error);
            await base44.asServiceRole.entities.User.delete(user.id);
            
            throw new Error('Registration failed - please try again');
          }
          
          // Both succeeded - registration complete
          return { success: true, user };
          
        } catch (error) {
          console.error('Registration failed', error);
          throw error;
        }
      }
    `
  },
  
  /**
   * POLICY AVAILABILITY CHECK (Abuse.1)
   * Policies must be live before registration opens
   */
  policy_availability: {
    
    requirement: {
      // Abuse.1: Pre-launch verification
      rule: 'ToS and Privacy Policy pages must be accessible before registration opens',
      check: 'HTTP GET to content_url must return 200',
      rationale: 'Cannot ask users to accept policies they cannot read'
    },
    
    pre_launch_checklist: [
      {
        task: 'Create ToS page at /legal/terms-of-service',
        verification: 'GET /legal/terms-of-service → 200 OK'
      },
      {
        task: 'Create Privacy Policy page at /legal/privacy-policy',
        verification: 'GET /legal/privacy-policy → 200 OK'
      },
      {
        task: 'Create PolicyVersion records for v1.0',
        verification: 'PolicyVersion.is_current = true for both tos and privacy_policy'
      },
      {
        task: 'Verify content_url links work',
        verification: 'Click links in registration form → pages load'
      }
    ],
    
    edge_case_handling: {
      // Edge.2: Policy URL unavailable at acceptance time
      scenario: 'Policy page returns 404 when user submits registration',
      response: 'Do NOT block registration - log warning (Edge.2)',
      
      implementation: `
        // Check policy availability (optional pre-check)
        async function verifyPolicyAvailable(contentUrl) {
          try {
            const response = await fetch(contentUrl);
            if (!response.ok) {
              // Edge.2: Policy unavailable - log warning but allow registration
              console.warn('Policy URL unavailable at acceptance time', {
                url: contentUrl,
                status: response.status
              });
              
              // Do NOT block registration - acceptance is still valid
            }
          } catch (error) {
            console.warn('Policy availability check failed', error);
          }
        }
      `
    }
  },
  
  /**
   * IMMUTABILITY (Audit.1)
   * PolicyAcceptance never deleted, even for GDPR
   */
  immutability: {
    
    policy: {
      // Audit.1: Permanent, immutable records
      rule: 'PolicyAcceptance records NEVER deleted - even for GDPR erasure',
      gdpr_handling: 'User record anonymised, but acceptance fact retained',
      rationale: 'Legal requirement to prove user accepted terms at specific time'
    },
    
    gdpr_scenario: {
      scenario: 'User requests GDPR erasure (F-017 hard delete)',
      user_record: 'User.email anonymised, User.full_name → "Deleted User"',
      policy_acceptance: 'PolicyAcceptance record RETAINED - shows anonymised user_id accepted ToS',
      
      example: `
        // After GDPR erasure
        PolicyAcceptance:
        {
          user_id: 'user_abc123',  // User still exists (skeleton)
          policy_type: 'tos',
          policy_version: 'v1.0',
          accepted_at: '2025-01-15T10:30:00Z',
          ip_address: '203.0.113.42'
        }
        
        User:
        {
          id: 'user_abc123',
          email: 'deleted_user_abc123@anon.local',  // Anonymised
          full_name: 'Deleted User',  // Anonymised
          is_deleted: true
        }
      `
    }
  },
  
  /**
   * MONTHLY COMPLIANCE AUDIT (Audit.2)
   * Verify all users have accepted current policies
   */
  compliance_audit: {
    
    requirement: {
      // Audit.2: Monthly verification
      frequency: 'Monthly',
      check: 'All active users have PolicyAcceptance for current policy versions',
      action: 'Flag any gaps for admin review'
    },
    
    audit_query: `
      // Monthly compliance audit script
      async function monthlyPolicyComplianceAudit() {
        console.log('Starting monthly policy compliance audit...');
        
        // Get current policy versions
        const currentTOS = await base44.asServiceRole.entities.PolicyVersion.filter({
          policy_type: 'tos',
          is_current: true
        });
        
        const currentPrivacy = await base44.asServiceRole.entities.PolicyVersion.filter({
          policy_type: 'privacy_policy',
          is_current: true
        });
        
        // Get all active users
        const activeUsers = await base44.asServiceRole.entities.User.filter({
          is_deleted: false,
          is_suspended: false
        });
        
        const gaps = [];
        
        for (const user of activeUsers) {
          // Check ToS acceptance
          const tosAcceptance = await base44.entities.PolicyAcceptance.filter({
            user_id: user.id,
            policy_type: 'tos',
            policy_version: currentTOS[0].version
          });
          
          // Check Privacy acceptance
          const privacyAcceptance = await base44.entities.PolicyAcceptance.filter({
            user_id: user.id,
            policy_type: 'privacy_policy',
            policy_version: currentPrivacy[0].version
          });
          
          if (tosAcceptance.length === 0 || privacyAcceptance.length === 0) {
            gaps.push({
              user_id: user.id,
              email: user.email,
              missing_tos: tosAcceptance.length === 0,
              missing_privacy: privacyAcceptance.length === 0
            });
          }
        }
        
        if (gaps.length > 0) {
          // Flag for admin review
          console.warn('Policy acceptance gaps detected', {
            gap_count: gaps.length,
            gaps: gaps
          });
          
          await sendAdminAlert({
            severity: 'WARNING',
            title: 'Policy acceptance compliance gaps',
            details: {
              gap_count: gaps.length,
              users: gaps
            }
          });
        } else {
          console.info('Policy compliance audit passed - no gaps');
        }
      }
    `
  },
  
  /**
   * REGISTRATION UI (UI.1)
   * ToS checkbox on registration form
   */
  registration_ui: {
    
    checkbox_requirements: {
      // UI.1: ToS acceptance checkbox
      label: 'I have read and agree to the [Terms of Service] and [Privacy Policy]',
      links: [
        'Terms of Service → opens in new tab',
        'Privacy Policy → opens in new tab'
      ],
      
      validation: {
        required: true,
        client_side: 'Submit button disabled until checked',
        server_side: 'Verify tosAccepted = true in payload'
      }
    },
    
    implementation_example: `
      import React, { useState } from 'react';
      import { base44 } from '@/api/base44Client';
      import { Button } from '@/components/ui/button';
      import { Input } from '@/components/ui/input';
      import { Checkbox } from '@/components/ui/checkbox';
      
      export default function RegistrationPage() {
        const [formData, setFormData] = useState({
          email: '',
          full_name: '',
          password: ''
        });
        const [tosAccepted, setTosAccepted] = useState(false);
        
        const handleRegister = async () => {
          if (!tosAccepted) {
            alert('You must accept the Terms of Service and Privacy Policy');
            return;
          }
          
          try {
            const response = await fetch('/api/register', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                ...formData,
                tos_accepted: tosAccepted
              })
            });
            
            const data = await response.json();
            
            if (data.success) {
              // Registration successful
              window.location.href = '/dashboard';
            } else {
              alert('Registration failed: ' + data.error);
            }
          } catch (error) {
            alert('Registration failed');
          }
        };
        
        return (
          <div className="max-w-md mx-auto mt-8 p-6">
            <h1 className="text-2xl font-bold mb-6">Create Account</h1>
            
            <div className="space-y-4">
              <Input
                placeholder="Full Name"
                value={formData.full_name}
                onChange={(e) => setFormData({...formData, full_name: e.target.value})}
              />
              
              <Input
                type="email"
                placeholder="Email"
                value={formData.email}
                onChange={(e) => setFormData({...formData, email: e.target.value})}
              />
              
              <Input
                type="password"
                placeholder="Password"
                value={formData.password}
                onChange={(e) => setFormData({...formData, password: e.target.value})}
              />
              
              {/* UI.1: ToS acceptance checkbox */}
              <div className="flex items-start gap-2 mt-4">
                <Checkbox
                  id="tos"
                  checked={tosAccepted}
                  onCheckedChange={setTosAccepted}
                />
                <label htmlFor="tos" className="text-sm leading-relaxed">
                  I have read and agree to the{' '}
                  <a
                    href="/legal/terms-of-service"
                    target="_blank"
                    className="text-blue-600 underline"
                  >
                    Terms of Service
                  </a>
                  {' '}and{' '}
                  <a
                    href="/legal/privacy-policy"
                    target="_blank"
                    className="text-blue-600 underline"
                  >
                    Privacy Policy
                  </a>
                </label>
              </div>
              
              <Button
                className="w-full"
                onClick={handleRegister}
                disabled={!tosAccepted || !formData.email || !formData.full_name}
              >
                Create Account
              </Button>
            </div>
          </div>
        );
      }
    `
  },
  
  /**
   * RE-ACCEPTANCE UI (UI.2)
   * Full-screen modal on login
   */
  re_acceptance_ui: {
    
    modal_requirements: {
      // UI.2: Re-acceptance screen
      trigger: 'Login successful but user needs to accept new policy version',
      display: 'Full-screen modal (cannot dismiss)',
      
      content: [
        'Policy summary (from PolicyVersion.content_summary)',
        'Link to full policy text (opens in new tab)',
        'What changed / What\'s new',
        '"I Accept" button',
        '"I Decline" button (logs out user)'
      ]
    },
    
    implementation_example: `
      import React, { useState } from 'react';
      import { base44 } from '@/api/base44Client';
      import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
      import { Button } from '@/components/ui/button';
      import { ScrollArea } from '@/components/ui/scroll-area';
      
      export default function ReAcceptPolicyModal({ reAcceptanceToken }) {
        const [loading, setLoading] = useState(false);
        
        const handleAccept = async () => {
          setLoading(true);
          
          try {
            const response = await fetch('/api/accept-policy-update', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': \`Bearer \${reAcceptanceToken}\`
              }
            });
            
            const data = await response.json();
            
            if (data.success) {
              // Re-acceptance successful - redirect to dashboard
              window.location.href = '/dashboard';
            } else {
              alert('Failed to record acceptance');
            }
          } catch (error) {
            alert('An error occurred');
          } finally {
            setLoading(false);
          }
        };
        
        const handleDecline = async () => {
          // User declines - log out
          await base44.auth.logout();
        };
        
        return (
          <Dialog open modal>
            <DialogContent className="max-w-2xl" hideClose>
              <DialogHeader>
                <DialogTitle>Updated Terms of Service</DialogTitle>
              </DialogHeader>
              
              <ScrollArea className="max-h-96 pr-4">
                <div className="space-y-4">
                  <p className="text-sm text-gray-600">
                    We've updated our Terms of Service and Privacy Policy.
                    Please review the changes and accept to continue using the platform.
                  </p>
                  
                  <div className="bg-gray-50 rounded-lg p-4">
                    <h3 className="font-semibold mb-2">What's Changed:</h3>
                    <p className="text-sm">
                      {/* Fetch from PolicyVersion.content_summary */}
                      - Updated data retention policy
                      - Clarified payment terms
                      - Added new safety guidelines
                    </p>
                  </div>
                  
                  <p className="text-sm">
                    <a
                      href="/legal/terms-of-service"
                      target="_blank"
                      className="text-blue-600 underline"
                    >
                      Read Full Terms of Service →
                    </a>
                  </p>
                  
                  <p className="text-sm">
                    <a
                      href="/legal/privacy-policy"
                      target="_blank"
                      className="text-blue-600 underline"
                    >
                      Read Full Privacy Policy →
                    </a>
                  </p>
                </div>
              </ScrollArea>
              
              <div className="flex gap-3 justify-end mt-4">
                <Button
                  variant="outline"
                  onClick={handleDecline}
                >
                  I Decline (Logout)
                </Button>
                <Button
                  onClick={handleAccept}
                  disabled={loading}
                >
                  I Accept
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        );
      }
    `
  }
};

/**
 * ============================================================================
 * PHASE 0 CONFIGURATION CHECKLIST
 * ============================================================================
 */
const F018_CONFIGURATION_CHECKLIST = [
  {
    category: 'Entity Configuration',
    tasks: [
      { task: 'PolicyAcceptance entity created', status: 'complete' },
      { task: 'PolicyVersion entity created', status: 'complete' },
      { task: 'Configure PolicyAcceptance: INSERT-only (Access.1)', status: 'pending' },
      { task: 'Verify: UPDATE/DELETE blocked for all roles', status: 'pending' },
      { task: 'Configure PolicyVersion: writable by super_admin only (Access.2)', status: 'pending' },
      { task: 'Configure PolicyVersion: readable by public', status: 'pending' }
    ]
  },
  {
    category: 'Policy Content',
    tasks: [
      { task: 'Create ToS page at /legal/terms-of-service', status: 'pending' },
      { task: 'Create Privacy Policy page at /legal/privacy-policy', status: 'pending' },
      { task: 'Create initial PolicyVersion records (v1.0)', status: 'pending' },
      { task: 'Set is_current=true for both tos and privacy_policy', status: 'pending' },
      { task: 'Verify content_url links work (Abuse.1)', status: 'pending' }
    ]
  },
  {
    category: 'Registration Flow',
    tasks: [
      { task: 'Add ToS checkbox to registration form (UI.1)', status: 'pending' },
      { task: 'Link to ToS and Privacy Policy (opens in new tab)', status: 'pending' },
      { task: 'Disable submit until checkbox checked', status: 'pending' },
      { task: 'Implement atomic registration (Triggers.1)', status: 'pending' },
      { task: 'Server fetches current policy_version (Logic.1, Errors.1)', status: 'pending' },
      { task: 'Create User + PolicyAcceptance atomically (Logic.2)', status: 'pending' }
    ]
  },
  {
    category: 'IP Address Capture',
    tasks: [
      { task: 'Implement getClientIP function (Logic.3)', status: 'pending' },
      { task: 'Capture IP from server request context', status: 'pending' },
      { task: 'Never trust client-supplied IP', status: 'pending' },
      { task: 'Capture user_agent from request headers', status: 'pending' }
    ]
  },
  {
    category: 'Atomicity & Rollback',
    tasks: [
      { task: 'Implement try-catch for User creation', status: 'pending' },
      { task: 'If PolicyAcceptance fails → rollback User (Edge.1)', status: 'pending' },
      { task: 'Test: PolicyAcceptance failure → no User created', status: 'pending' }
    ]
  },
  {
    category: 'Re-Acceptance Flow',
    tasks: [
      { task: 'Implement checkPolicyReAcceptanceRequired function', status: 'pending' },
      { task: 'Intercept login if re-acceptance needed (Triggers.2)', status: 'pending' },
      { task: 'Create ReAcceptPolicyModal component (UI.2)', status: 'pending' },
      { task: 'Full-screen modal with policy summary', status: 'pending' },
      { task: 'Accept button → create PolicyAcceptance', status: 'pending' },
      { task: 'Decline button → logout user', status: 'pending' }
    ]
  },
  {
    category: 'Re-Acceptance Email',
    tasks: [
      { task: 'Implement publishPolicyVersion function', status: 'pending' },
      { task: 'Set is_current=true for new version', status: 'pending' },
      { task: 'Set is_current=false for old versions', status: 'pending' },
      { task: 'Send email to all active users (Abuse.2)', status: 'pending' },
      { task: 'Email includes: summary, what changed, link to policy', status: 'pending' }
    ]
  },
  {
    category: 'Compliance Audit',
    tasks: [
      { task: 'Implement monthlyPolicyComplianceAudit function (Audit.2)', status: 'pending' },
      { task: 'Check all active users have current version acceptance', status: 'pending' },
      { task: 'Flag gaps for admin review', status: 'pending' },
      { task: 'Schedule monthly execution', status: 'pending' }
    ]
  },
  {
    category: 'Edge Cases',
    tasks: [
      { task: 'Handle PolicyAcceptance failure → rollback User (Edge.1)', status: 'pending' },
      { task: 'Handle policy URL unavailable → allow registration (Edge.2)', status: 'pending' },
      { task: 'Log warning if policy URL returns 404', status: 'pending' }
    ]
  }
];

/**
 * ============================================================================
 * ACCEPTANCE CRITERIA
 * ============================================================================
 */
const ACCEPTANCE_TESTS = [
  {
    test: 'Registration - ToS Acceptance',
    steps: [
      'Open registration page',
      'Fill in email, name, password',
      'Verify: Submit button DISABLED (checkbox unchecked)',
      'Check ToS acceptance checkbox',
      'Verify: Submit button ENABLED',
      'Click "Create Account"',
      'Verify: User created',
      'Verify: PolicyAcceptance created for tos (policy_version = current)',
      'Verify: PolicyAcceptance created for privacy_policy',
      'Verify: ip_address = server request IP (Logic.3)',
      'Verify: user_agent = request header'
    ]
  },
  {
    test: 'Registration - Without Acceptance',
    steps: [
      'Open registration page',
      'Fill in all fields',
      'Do NOT check ToS checkbox',
      'Attempt to submit (via API, bypassing UI)',
      'Verify: Registration FAILS',
      'Verify: Error: "ToS acceptance required"',
      'Verify: No User created',
      'Verify: No PolicyAcceptance created'
    ]
  },
  {
    test: 'Server-Side Version Fetch',
    steps: [
      'Current ToS version = v1.0',
      'Client submits registration with manipulated version = v0.9',
      'Verify: Server ignores client version (Errors.1)',
      'Verify: PolicyAcceptance.policy_version = v1.0 (server-fetched)',
      'Verify: Client manipulation had no effect'
    ]
  },
  {
    test: 'IP Address Server-Side Capture',
    steps: [
      'Client submits registration with ip_address = "1.2.3.4" in payload',
      'Server captures real IP = 203.0.113.42',
      'Verify: PolicyAcceptance.ip_address = 203.0.113.42 (Logic.3)',
      'Verify: Client-supplied IP ignored'
    ]
  },
  {
    test: 'Atomic Registration',
    steps: [
      'Mock PolicyAcceptance creation failure',
      'Attempt registration',
      'Verify: User NOT created (Edge.1)',
      'Verify: No orphaned User record',
      'Verify: Error message shown to user'
    ]
  },
  {
    test: 'Policy Availability',
    steps: [
      'Before opening registration, verify:',
      'GET /legal/terms-of-service → 200 OK (Abuse.1)',
      'GET /legal/privacy-policy → 200 OK',
      'PolicyVersion exists with is_current=true for tos',
      'PolicyVersion exists with is_current=true for privacy_policy'
    ]
  },
  {
    test: 'Re-Acceptance - Login Intercept',
    steps: [
      'User registered with ToS v1.0',
      'Admin publishes ToS v1.1 (sets is_current=true)',
      'User attempts to login',
      'Verify: Login succeeds',
      'Verify: Response includes requires_re_acceptance=true (Triggers.2)',
      'Verify: Redirect to /re-accept-policies (not dashboard)',
      'Verify: Full-screen modal shown'
    ]
  },
  {
    test: 'Re-Acceptance - Accept',
    steps: [
      'User shown re-acceptance modal',
      'User clicks "I Accept"',
      'Verify: PolicyAcceptance created for v1.1',
      'Verify: accepted_at = now',
      'Verify: ip_address = current session IP',
      'Verify: Redirect to dashboard',
      'User logs out and logs in again',
      'Verify: No re-acceptance required (has v1.1 acceptance)'
    ]
  },
  {
    test: 'Re-Acceptance - Decline',
    steps: [
      'User shown re-acceptance modal',
      'User clicks "I Decline"',
      'Verify: User logged out',
      'Verify: Redirect to login page',
      'Verify: No PolicyAcceptance for v1.1 created'
    ]
  },
  {
    test: 'Re-Acceptance Email',
    steps: [
      'Admin publishes ToS v1.1',
      'Verify: Email sent to all active users (Abuse.2)',
      'Verify: Subject mentions "Updated Terms"',
      'Verify: Body includes content_summary',
      'Verify: Body includes link to full policy',
      'Verify: Soft-deleted users NOT emailed',
      'Verify: Suspended users NOT emailed'
    ]
  },
  {
    test: 'Monthly Compliance Audit',
    steps: [
      'Run monthlyPolicyComplianceAudit()',
      'Scenario: 2 users have not accepted current version',
      'Verify: Audit identifies 2 gaps (Audit.2)',
      'Verify: Admin alert sent with gap details',
      'Scenario: All users have accepted current version',
      'Verify: Audit passes with no gaps'
    ]
  },
  {
    test: 'Immutability - PolicyAcceptance',
    steps: [
      'User accepts ToS v1.0',
      'PolicyAcceptance record created (acceptance_1)',
      'Admin attempts to UPDATE acceptance_1.policy_version = v1.1',
      'Verify: 403 Forbidden (Access.1 INSERT-only)',
      'Admin attempts to DELETE acceptance_1',
      'Verify: 403 Forbidden'
    ]
  },
  {
    test: 'Immutability - GDPR',
    steps: [
      'User accepts ToS v1.0',
      'PolicyAcceptance record created',
      'User requests GDPR erasure (F-017 hard delete)',
      'User record PII anonymised',
      'Verify: PolicyAcceptance record RETAINED (Audit.1)',
      'Verify: PolicyAcceptance.user_id still points to anonymised user',
      'Verify: Acceptance fact preserved for legal compliance'
    ]
  },
  {
    test: 'Policy URL Unavailable',
    steps: [
      'Set content_url to non-existent page',
      'User attempts registration',
      'Verify: Warning logged (Edge.2)',
      'Verify: Registration still SUCCEEDS',
      'Verify: PolicyAcceptance created',
      'Verify: User had checkbox to accept (opportunity to read policy)'
    ]
  },
  {
    test: 'Field-Level Security - policy_version',
    steps: [
      'User submits registration with policy_version = "hacked"',
      'Verify: Server fetches current version from DB (Errors.1)',
      'Verify: PolicyAcceptance.policy_version = current version',
      'Verify: Client-supplied value completely ignored'
    ]
  }
];

/**
 * ============================================================================
 * IMPLEMENTATION NOTES
 * ============================================================================
 * 
 * Base44 Platform Requirements:
 * - INSERT-only entity configuration (PolicyAcceptance)
 * - Atomic transaction support (User + PolicyAcceptance)
 * - Server-side request context (IP, user agent)
 * - Email integration for re-acceptance notifications
 * 
 * Supporting Entities:
 * - PolicyAcceptance: Immutable acceptance records
 * - PolicyVersion: Track policy versions and current version
 * 
 * Integration with Other Features:
 * - F-017: GDPR erasure - PolicyAcceptance retained
 * - F-011: Rate limiting on registration form
 * - F-023: CAPTCHA on registration (post-MVP)
 * 
 * CRITICAL WARNINGS:
 * - Access.1: PolicyAcceptance is INSERT-only (never update/delete)
 * - Logic.1: Server MUST fetch current policy_version (Errors.1)
 * - Logic.2: User + PolicyAcceptance atomic (no bypass)
 * - Logic.3: IP address captured server-side (never client-supplied)
 * - Triggers.1: Atomic registration - rollback on failure (Edge.1)
 * - Triggers.2: Login intercept for re-acceptance
 * - Abuse.1: Policy pages MUST be live before registration opens
 * - Abuse.2: Re-acceptance email to all users on version change
 * - Audit.1: PolicyAcceptance never deleted (even for GDPR)
 * - Audit.2: Monthly compliance audit for gaps
 * - Edge.2: Policy URL unavailable → allow registration + log warning
 * 
 * NEXT STEPS:
 * 1. Configure PolicyAcceptance INSERT-only permissions
 * 2. Create ToS and Privacy Policy pages
 * 3. Create initial PolicyVersion records (v1.0)
 * 4. Implement atomic registration flow
 * 5. Implement server-side version fetch
 * 6. Implement IP capture from request context
 * 7. Update registration UI with ToS checkbox
 * 8. Implement login re-acceptance check
 * 9. Create ReAcceptPolicyModal component
 * 10. Implement re-acceptance email automation
 * 11. Implement monthly compliance audit
 * 12. Test all acceptance criteria
 */

export default function F018TOSAcceptanceDocumentation() {
  return (
    <div style={{ padding: '2rem', fontFamily: 'monospace', maxWidth: '1400px', margin: '0 auto' }}>
      <h1>F-018: Terms of Service Acceptance - Configuration Required</h1>
      <p><strong>Phase 0 Status:</strong> Entities created (PolicyAcceptance, PolicyVersion)</p>
      <p><strong>Next Step:</strong> Create policy pages + implement atomic registration flow</p>
      
      <h2>Critical Requirements</h2>
      <div style={{ padding: '1rem', backgroundColor: '#fee2e2', borderLeft: '4px solid #ef4444', marginTop: '1rem' }}>
        <strong>⚠️ LEGAL COMPLIANCE</strong>
        <ul>
          <li><strong>Access.1:</strong> PolicyAcceptance is INSERT-only (never update/delete)</li>
          <li><strong>Logic.1:</strong> Server MUST fetch current policy_version (Errors.1 - never trust client)</li>
          <li><strong>Logic.2:</strong> User + PolicyAcceptance atomic (no bypass allowed)</li>
          <li><strong>Logic.3:</strong> IP address captured server-side (never client-supplied)</li>
          <li><strong>Audit.1:</strong> PolicyAcceptance never deleted (even for GDPR)</li>
        </ul>
      </div>
      
      <h2>Registration State Machine (States.1)</h2>
      <ul>
        <li><strong>Unverified:</strong> No PolicyAcceptance record → cannot complete registration</li>
        <li><strong>Accepted:</strong> PolicyAcceptance exists for current version → full access</li>
      </ul>
      
      <h2>Atomic Registration (Triggers.1, Logic.2)</h2>
      <div style={{ padding: '1rem', backgroundColor: '#fef3c7', borderLeft: '4px solid #f59e0b', marginTop: '1rem' }}>
        <strong>IMPORTANT: Registration atomicity</strong>
        <ol>
          <li>Validate all fields</li>
          <li>Verify checkbox checked (client-side)</li>
          <li>Server fetches current policy_version (Errors.1)</li>
          <li>Create User record</li>
          <li>Create PolicyAcceptance records (ToS + Privacy)</li>
          <li>If PolicyAcceptance fails → rollback User (Edge.1)</li>
        </ol>
      </div>
      
      <h2>Server-Side Security (Logic.1, Logic.3, Errors.1)</h2>
      <table border="1" cellPadding="8" style={{ borderCollapse: 'collapse', width: '100%', marginTop: '1rem' }}>
        <thead>
          <tr style={{ backgroundColor: '#f3f4f6' }}>
            <th>Field</th>
            <th>Source</th>
            <th>NEVER Trust Client</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>policy_version</td>
            <td>Server fetches from PolicyVersion.is_current=true</td>
            <td>Client cannot manipulate to accept old version</td>
          </tr>
          <tr>
            <td>ip_address</td>
            <td>Server request context (req.ip or proxy header)</td>
            <td>Client cannot spoof IP for legal compliance</td>
          </tr>
          <tr>
            <td>accepted_at</td>
            <td>Server timestamp (new Date())</td>
            <td>Client cannot backdate acceptance</td>
          </tr>
        </tbody>
      </table>
      
      <h2>Re-Acceptance Flow (States.2, Triggers.2)</h2>
      <ul>
        <li><strong>Trigger:</strong> Admin publishes new policy version (sets is_current=true)</li>
        <li><strong>Effect:</strong> Existing users → "re-acceptance required" state</li>
        <li><strong>Enforcement:</strong> Login intercept before dashboard redirect</li>
        <li><strong>UI:</strong> Full-screen modal with Accept / Decline options (UI.2)</li>
        <li><strong>Email:</strong> All active users notified of change (Abuse.2)</li>
      </ul>
      
      <h2>Pre-Launch Requirements (Abuse.1)</h2>
      <div style={{ padding: '1rem', backgroundColor: '#fef3c7', borderLeft: '4px solid #f59e0b', marginTop: '1rem' }}>
        <strong>REQUIRED: Policy pages MUST be live before registration opens</strong>
        <ol>
          <li>Create /legal/terms-of-service page</li>
          <li>Create /legal/privacy-policy page</li>
          <li>Verify both URLs return 200 OK</li>
          <li>Create PolicyVersion records (v1.0) for both</li>
          <li>Set is_current=true for both</li>
          <li>Test: Links in registration form work</li>
        </ol>
      </div>
      
      <h2>Immutability (Access.1, Audit.1)</h2>
      <div style={{ padding: '1rem', backgroundColor: '#fee2e2', borderLeft: '4px solid #ef4444', marginTop: '1rem' }}>
        <strong>⚠️ CRITICAL: PolicyAcceptance is INSERT-only</strong>
        <ul>
          <li>No UPDATE allowed for any role</li>
          <li>No DELETE allowed for any role</li>
          <li>NEVER deleted - even for GDPR erasure</li>
          <li>Fact of acceptance retained (user record anonymised)</li>
        </ul>
      </div>
      
      <h2>Monthly Compliance Audit (Audit.2)</h2>
      <ul>
        <li><strong>Frequency:</strong> Monthly</li>
        <li><strong>Check:</strong> All active users have PolicyAcceptance for current versions</li>
        <li><strong>Action:</strong> Flag gaps for admin review</li>
        <li><strong>Use Case:</strong> Detect compliance gaps (e.g., bug in re-acceptance flow)</li>
      </ul>
      
      <h2>Registration UI (UI.1)</h2>
      <ul>
        <li><strong>Checkbox:</strong> "I have read and agree to the [ToS] and [Privacy Policy]"</li>
        <li><strong>Links:</strong> Open in new tab</li>
        <li><strong>Validation:</strong> Submit button disabled until checked</li>
        <li><strong>Server-Side:</strong> Verify tosAccepted = true in payload</li>
      </ul>
      
      <h2>Re-Acceptance UI (UI.2)</h2>
      <ul>
        <li><strong>Display:</strong> Full-screen modal (cannot dismiss)</li>
        <li><strong>Content:</strong> Policy summary, what changed, link to full text</li>
        <li><strong>Buttons:</strong>
          <ul>
            <li>"I Accept" → Create PolicyAcceptance, redirect to dashboard</li>
            <li>"I Decline" → Logout user</li>
          </ul>
        </li>
      </ul>
      
      <h2>Edge Cases</h2>
      <table border="1" cellPadding="8" style={{ borderCollapse: 'collapse', width: '100%', marginTop: '1rem' }}>
        <thead>
          <tr style={{ backgroundColor: '#f3f4f6' }}>
            <th>Scenario</th>
            <th>Response</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>PolicyAcceptance creation fails (Edge.1)</td>
            <td>Rollback User creation - no orphaned records</td>
          </tr>
          <tr>
            <td>Policy URL unavailable (Edge.2)</td>
            <td>Allow registration + log warning (user had checkbox to accept)</td>
          </tr>
        </tbody>
      </table>
      
      <h2>Implementation Checklist</h2>
      <ol>
        <li>Configure PolicyAcceptance INSERT-only permissions</li>
        <li>Create /legal/terms-of-service page</li>
        <li>Create /legal/privacy-policy page</li>
        <li>Create PolicyVersion records (v1.0) for both</li>
        <li>Implement atomic registration flow</li>
        <li>Server-side policy_version fetch (Errors.1)</li>
        <li>Server-side IP address capture (Logic.3)</li>
        <li>Update registration UI with ToS checkbox (UI.1)</li>
        <li>Implement login re-acceptance check (Triggers.2)</li>
        <li>Create ReAcceptPolicyModal component (UI.2)</li>
        <li>Implement re-acceptance email automation (Abuse.2)</li>
        <li>Implement monthly compliance audit (Audit.2)</li>
        <li>Test all acceptance criteria</li>
      </ol>
      
      <p style={{ marginTop: '2rem' }}><em>See component source code for complete registration flow, re-acceptance logic, and compliance audit procedures.</em></p>
    </div>
  );
}