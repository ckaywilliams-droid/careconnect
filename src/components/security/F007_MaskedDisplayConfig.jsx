/**
 * F-007: MASKED DISPLAY OF SENSITIVE DATA CONFIGURATION
 * 
 * THIS IS A DOCUMENTATION COMPONENT - NOT FUNCTIONAL CODE
 * 
 * This component documents the Base44 platform configuration required for F-007
 * Masked Display. Sensitive fields must be masked at the API response serialization
 * layer BEFORE data reaches the client - never mask at UI rendering layer.
 * 
 * STATUS: Phase 0 - Documentation complete
 * NEXT STEP: Implement response serialization masking for all sensitive fields
 * 
 * ============================================================================
 * CRITICAL SECURITY REQUIREMENTS
 * ============================================================================
 */

const F007_MASKED_DISPLAY_SPECIFICATION = {
  
  /**
   * MASKING RULES (Data.2)
   * Field-specific masking patterns
   */
  masking_rules: {
    
    bank_account_number: {
      pattern: 'xxxx-[last4]',
      input: '1234567890',
      output: 'xxxx-7890',
      rule: 'Show only last 4 digits, prefix with xxxx-',
      entities: ['Future BankAccount or StripeConnect entity'],
      implementation: `
        function maskBankAccount(accountNumber) {
          if (!accountNumber) return '';  // Triggers.1: Handle null gracefully
          if (accountNumber.length < 4) return 'xxxx';  // Errors.2: Mask entire value if <4 chars
          
          const last4 = accountNumber.slice(-4);
          return \`xxxx-\${last4}\`;
        }
      `
    },
    
    government_id: {
      pattern: '***-**-[last4]',
      input: '123456789',  // SSN format
      output: '***-**-6789',
      rule: 'Show only last 4 digits',
      entities: ['User or CaregiverProfile (if SSN field added post-MVP)'],
      implementation: `
        function maskGovernmentID(id) {
          if (!id) return '';  // Triggers.1
          if (id.length < 4) return '***-**-****';  // Errors.2
          
          const last4 = id.slice(-4);
          return \`***-**-\${last4}\`;
        }
      `
    },
    
    oauth_access_token: {
      pattern: '[first4]****...****[last6]',
      input: 'ghp_a1b2c3d4e5f6g7h8i9j0k1l2m3n4',
      output: 'ghp_****...****m3n4',
      rule: 'Show first 4 chars (prefix) + last 6 chars, mask middle',
      entities: ['Future OAuthIntegration entity'],
      implementation: `
        function maskOAuthToken(token) {
          if (!token) return '';  // Triggers.1
          if (token.length < 10) return '****';  // Errors.2
          
          const first4 = token.slice(0, 4);
          const last6 = token.slice(-6);
          return \`\${first4}****...\${last6}\`;
        }
      `
    },
    
    certification_file_url: {
      pattern: 'NEVER exposed as raw URL',
      rule: 'Render as download button, trigger server-side signed URL on click (UI.2)',
      entities: ['Certification'],
      ui_pattern: 'Button → Server generates signed URL → Redirect to download',
      implementation: `
        // DO NOT return raw cert_file_url in API response
        // Instead, return metadata + button trigger
        
        // Backend response serialization:
        function serializeCertification(cert) {
          return {
            id: cert.id,
            cert_type: cert.cert_type,
            cert_name: cert.cert_name,
            // DO NOT include: cert_file_url
            has_file: !!cert.cert_file_url,  // Boolean flag only
            file_size: cert.file_size,  // Metadata okay
            verification_status: cert.verification_status
          };
        }
        
        // UI: Certification download button (see UI implementation section)
      `
    },
    
    user_phone_masked: {
      pattern: '(***) ***-[last4]',
      input: '(555) 123-4567',
      output: '(***) ***-4567',
      rule: 'Show only last 4 digits (from F-002 PII protection)',
      entities: ['User'],
      implementation: `
        function maskPhoneNumber(phone) {
          if (!phone) return '';  // Triggers.1
          
          // Extract digits only
          const digits = phone.replace(/\D/g, '');
          if (digits.length < 4) return '(***) ***-****';  // Errors.2
          
          const last4 = digits.slice(-4);
          return \`(***) ***-\${last4}\`;
        }
      `
    },
    
    email_partial_masked: {
      pattern: '[first2]***@[domain]',
      input: 'caregiver@example.com',
      output: 'ca***@example.com',
      rule: 'Show first 2 chars of local part + full domain (optional masking)',
      entities: ['User'],
      note: 'Email masking is OPTIONAL - only if business requirements demand it',
      implementation: `
        function maskEmail(email) {
          if (!email) return '';
          
          const [localPart, domain] = email.split('@');
          if (!domain) return email;  // Invalid email, return as-is
          
          const first2 = localPart.slice(0, 2);
          return \`\${first2}***@\${domain}\`;
        }
      `
    }
  },
  
  /**
   * RESPONSE SERIALIZATION (Logic.1-2, Data.3)
   * Masking MUST happen at API response layer, NOT UI layer
   */
  response_serialization: {
    
    principle: 'Raw values never sent to client - mask BEFORE response',
    
    correct_approach: {
      where: 'API response serialization middleware',
      when: 'Before JSON encoding, after database read',
      result: 'Client receives only masked string - raw value never in browser',
      verification: 'Check browser Network tab - raw value must NOT appear in response payload'
    },
    
    incorrect_approaches: {
      ui_masking: {
        wrong: 'Fetch raw value → mask in React component',
        why_wrong: 'Raw value visible in Network tab, DOM, and browser memory',
        example_wrong: `
          // WRONG - DO NOT DO THIS
          const user = await base44.entities.User.read(userId);
          return <div>{maskPhoneNumber(user.phone)}</div>;
          // Problem: user.phone raw value is in API response
        `
      },
      
      css_masking: {
        wrong: 'Render raw value, hide with CSS',
        why_wrong: 'Raw value still in DOM, accessible via Inspect Element',
        example_wrong: `
          // WRONG - DO NOT DO THIS
          <span style={{display: 'none'}}>{user.phone}</span>
          <span>{maskedPhone}</span>
          // Problem: Raw value in DOM source code
        `
      },
      
      client_side_masking: {
        wrong: 'Send raw value, mask with JavaScript',
        why_wrong: 'Raw value visible in Network tab before masking',
        example_wrong: `
          // WRONG - DO NOT DO THIS
          fetch('/api/user').then(data => {
            data.phone = maskPhoneNumber(data.phone);
            setState(data);
          });
          // Problem: Raw phone visible in Network response
        `
      }
    },
    
    correct_implementation: {
      // Logic.1: Masking at response serialization
      approach: 'Backend serializes entity → applies masking → returns masked JSON',
      
      base44_middleware: `
        // Backend response serializer (runs before sending to client)
        function serializeUser(user, requestingRole) {
          const serialized = {
            id: user.id,
            email: user.email,
            full_name: user.full_name,
            role: user.role,
            created_date: user.created_date,
            // Mask sensitive fields based on role and context
            phone: maskPhoneNumber(user.phone),  // ALWAYS masked in UI (Access.1)
            // password_hash: NEVER included (F-002)
          };
          
          return serialized;
        }
        
        // API endpoint
        app.get('/api/user/:id', async (req, res) => {
          const user = await db.users.findById(req.params.id);
          const serialized = serializeUser(user, req.user.role);
          res.json(serialized);  // Client receives masked values only
        });
      `,
      
      entity_specific_serializers: `
        // BankAccount serialization
        function serializeBankAccount(account) {
          return {
            id: account.id,
            account_holder: account.account_holder,
            bank_name: account.bank_name,
            account_number: maskBankAccount(account.account_number),  // Masked
            routing_number: 'xxxx',  // Fully masked (no last digits needed)
            // Raw account_number NEVER sent to client
          };
        }
        
        // Certification serialization (UI.2: No raw file URLs)
        function serializeCertification(cert) {
          return {
            id: cert.id,
            cert_type: cert.cert_type,
            cert_name: cert.cert_name,
            verification_status: cert.verification_status,
            // cert_file_url: NEVER included
            has_file: !!cert.cert_file_url,  // Boolean flag only
            file_size_kb: cert.file_size,
            issue_date: cert.issue_date,
            expiry_date: cert.expiry_date
          };
        }
      `
    },
    
    role_based_masking: {
      // Access.1: Masking applies to ALL roles including admin
      rule: 'Admins see masked values in UI - full access requires separate audited action (Access.2)',
      
      ui_context: {
        parent_role: 'All sensitive fields masked',
        caregiver_role: 'All sensitive fields masked',
        trust_admin_role: 'All sensitive fields masked in UI',
        super_admin_role: 'All sensitive fields masked in UI'
      },
      
      admin_full_access: {
        // Access.2: Post-MVP feature
        context: 'Separate audited admin action (not a UI toggle)',
        why_not_toggle: 'Toggle would expose raw value in DOM when enabled',
        correct_approach: [
          'Admin clicks "View Full Value" button',
          'Server-side generates one-time signed URL or temporary token',
          'Redirect to dedicated admin page (not main UI)',
          'Server decrypts/unmasks and displays (logged to PIIAccessLog - F-009)',
          'Value expires after 5 minutes or on page close'
        ],
        never: 'Do NOT add a toggle in main UI that reveals raw value in DOM'
      }
    }
  },
  
  /**
   * EDGE CASES (Triggers.1, Errors.2, Edge.1-2)
   */
  edge_cases: {
    
    null_handling: {
      // Triggers.1: Handle null inputs gracefully
      requirement: 'Return empty string, not "null", "undefined", or error string',
      
      incorrect: `
        function maskBankAccount(account) {
          const last4 = account.slice(-4);  // Error if account is null
          return \`xxxx-\${last4}\`;
        }
      `,
      
      correct: `
        function maskBankAccount(account) {
          if (!account) return '';  // Graceful null handling
          if (account.length < 4) return 'xxxx';  // Errors.2
          
          const last4 = account.slice(-4);
          return \`xxxx-\${last4}\`;
        }
      `,
      
      ui_rendering: `
        // In UI component
        <div>
          Account: {user.masked_bank_account || 'Not provided'}
        </div>
        // If backend returns empty string, show fallback message
      `
    },
    
    short_values: {
      // Errors.2: Values shorter than 4 chars → mask entire value
      rule: 'Do NOT reveal any digits of values shorter than masking minimum',
      
      examples: {
        bank_account_3_digits: {
          input: '123',
          incorrect: 'xxxx-123',  // Reveals all digits
          correct: 'xxxx'  // Fully masked
        },
        ssn_2_digits: {
          input: '12',
          incorrect: '***-**-12',  // Reveals all digits
          correct: '***-**-****'  // Fully masked
        }
      },
      
      implementation: `
        function maskWithMinimum(value, minimumLength = 4) {
          if (!value) return '';
          if (value.length < minimumLength) {
            // Return fully masked placeholder
            return 'xxxx';  // Or appropriate mask for field type
          }
          // Normal masking
          return \`xxxx-\${value.slice(-4)}\`;
        }
      `
    },
    
    double_masking_prevention: {
      // Edge.2: Detect and prevent double-masking
      scenario: 'Read-modify-write cycle may pass already-masked value to masking function',
      
      problem: `
        // User record retrieved from database
        const user = { phone: '(***) ***-4567' };  // Already masked
        
        // If masking function called again:
        const masked = maskPhoneNumber(user.phone);
        // Result: '(***) ***-4567' → '(***) ***-4567' (okay)
        // OR worse: '(***) ***-****' if function doesn't detect
      `,
      
      solution: `
        function maskPhoneNumber(phone) {
          if (!phone) return '';
          
          // Detect if already masked (contains asterisks)
          if (phone.includes('*')) {
            return phone;  // Already masked, return as-is
          }
          
          // Normal masking
          const digits = phone.replace(/\D/g, '');
          if (digits.length < 4) return '(***) ***-****';
          const last4 = digits.slice(-4);
          return \`(***) ***-\${last4}\`;
        }
      `,
      
      best_practice: 'Store masked flag in response metadata OR always mask from raw DB value'
    },
    
    conditional_masking: {
      // Edge.1: Field that is sometimes sensitive, sometimes not
      scenario: 'Field sensitivity depends on record state or user context',
      
      example_1: {
        field: 'User.phone',
        rule: 'Masked in UI, revealed in email after booking acceptance (F-002)',
        implementation: `
          // API response: always masked
          function serializeUser(user, context) {
            return {
              phone: maskPhoneNumber(user.phone)  // Always masked in API
            };
          }
          
          // Email automation: full value (server-side only, never to client)
          async function sendBookingAcceptanceEmail(booking) {
            const caregiver = await getUser(booking.caregiver_user_id);
            const parent = await getUser(booking.parent_user_id);
            
            // Email includes full phone (server-side, F-077)
            await sendEmail({
              to: parent.email,
              subject: 'Booking Accepted',
              body: \`Contact caregiver: \${caregiver.phone}\`  // Full value in email
            });
            
            // Log access to PIIAccessLog (F-009)
            await logPIIAccess({
              accessor_user_id: parent.id,
              field_accessed: 'phone',
              context: 'booking_accepted'
            });
          }
        `
      },
      
      example_2: {
        field: 'Certification.cert_file_url',
        rule: 'Always hidden in API response, accessible via signed URL button',
        implementation: 'See UI implementation section below'
      }
    }
  },
  
  /**
   * UI IMPLEMENTATION PATTERNS (UI.1-2)
   */
  ui_implementation: {
    
    masked_field_display: {
      // UI.1: All sensitive fields render as masked strings
      
      user_profile: `
        import React from 'react';
        import { base44 } from '@/api/base44Client';
        
        export default function UserProfile({ userId }) {
          const { data: user } = useQuery({
            queryKey: ['user', userId],
            queryFn: () => base44.entities.User.read(userId)
            // Response already masked by backend serializer
          });
          
          if (!user) return <div>Loading...</div>;
          
          return (
            <div>
              <h2>{user.full_name}</h2>
              <p>Email: {user.email}</p>
              {/* Phone is already masked in API response */}
              <p>Phone: {user.phone || 'Not provided'}</p>
              {/* Triggers.1: Handle empty string gracefully */}
            </div>
          );
        }
      `,
      
      bank_account_display: `
        function BankAccountCard({ account }) {
          return (
            <div className="p-4 border rounded">
              <h3>{account.bank_name}</h3>
              {/* Account number already masked by backend */}
              <p>Account: {account.account_number}</p>
              <p>Routing: {account.routing_number}</p>
              {/* All values pre-masked - no masking logic in UI */}
            </div>
          );
        }
      `,
      
      admin_view: {
        // Access.1: Admins also see masked values in UI
        note: 'Admin UI shows same masked values as regular users',
        implementation: `
          function AdminUserList() {
            const { data: users } = useQuery({
              queryKey: ['users'],
              queryFn: () => base44.entities.User.list()
              // Even for admin role, response contains masked values
            });
            
            return (
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Phone</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map(user => (
                    <tr key={user.id}>
                      <td>{user.full_name}</td>
                      <td>{user.phone}</td>  {/* Masked for admin too */}
                      <td>
                        {/* Access.2: Full value access = separate action */}
                        <button onClick={() => viewFullValue(user.id, 'phone')}>
                          View Full (Audited)
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            );
          }
        `
      }
    },
    
    certification_download_button: {
      // UI.2: Never expose raw file URLs
      
      problem: 'If cert_file_url in API response, visible in Network tab and DOM',
      
      solution: 'Render download button → server generates signed URL on click',
      
      incorrect_approach: `
        // WRONG - DO NOT DO THIS
        function CertificationCard({ cert }) {
          return (
            <div>
              <a href={cert.cert_file_url} download>
                Download Certificate
              </a>
            </div>
          );
          // Problem: cert_file_url visible in page source and Network tab
        }
      `,
      
      correct_approach: `
        import React, { useState } from 'react';
        import { base44 } from '@/api/base44Client';
        import { Button } from '@/components/ui/button';
        import { Download, Loader2 } from 'lucide-react';
        
        export default function CertificationDownloadButton({ certId }) {
          const [isDownloading, setIsDownloading] = useState(false);
          
          const handleDownload = async () => {
            try {
              setIsDownloading(true);
              
              // Server-side generates signed URL
              const { signed_url } = await base44.integrations.Core.CreateFileSignedUrl({
                file_uri: certId,  // NOT the raw file_url
                expires_in: 900  // 15 minutes
              });
              
              // Log access to PIIAccessLog (F-009)
              await base44.entities.PIIAccessLog.create({
                accessor_user_id: currentUser.id,
                target_entity_type: 'Certification',
                target_entity_id: certId,
                field_accessed: 'cert_file_url',
                access_timestamp: new Date().toISOString(),
                access_context: 'cert_download'
              });
              
              // Redirect to signed URL (opens in new tab)
              window.open(signed_url, '_blank');
            } catch (error) {
              console.error('Download failed', error);
              alert('Unable to download file. Please try again.');
            } finally {
              setIsDownloading(false);
            }
          };
          
          return (
            <Button
              onClick={handleDownload}
              disabled={isDownloading}
              variant="outline"
            >
              {isDownloading ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Generating...</>
              ) : (
                <><Download className="w-4 h-4 mr-2" /> Download Certificate</>
              )}
            </Button>
          );
        }
      `,
      
      benefits: [
        'Raw file URL never in API response',
        'Raw file URL never in DOM',
        'Signed URL has 15-minute expiry (F-002)',
        'Access logged to PIIAccessLog (F-009)',
        'User cannot copy/share permanent URL'
      ]
    },
    
    confirmation_validation: {
      // Errors.1: Server-side comparison for masked value confirmation
      
      scenario: 'User confirms bank account by entering last 4 digits',
      
      incorrect_client_side: `
        // WRONG - DO NOT unmask client-side for comparison
        function ConfirmBankAccount({ maskedAccount }) {
          const [input, setInput] = useState('');
          
          const handleConfirm = () => {
            // WRONG: Cannot unmask on client
            const last4 = extractLast4(maskedAccount);  // Where does this come from?
            if (input === last4) {
              // This doesn't work without raw value
            }
          };
        }
      `,
      
      correct_server_side: `
        // UI: Collect user input
        function ConfirmBankAccount({ accountId }) {
          const [input, setInput] = useState('');
          
          const handleConfirm = async () => {
            // Send input to server for comparison
            const { isMatch } = await fetch('/api/confirm-bank-account', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                account_id: accountId,
                last4_input: input
              })
            }).then(r => r.json());
            
            if (isMatch) {
              alert('Account confirmed!');
            } else {
              alert('Incorrect. Please try again.');
            }
          };
          
          return (
            <div>
              <label>Enter last 4 digits of account number:</label>
              <input
                type="text"
                maxLength={4}
                value={input}
                onChange={(e) => setInput(e.target.value)}
              />
              <button onClick={handleConfirm}>Confirm</button>
            </div>
          );
        }
        
        // Backend: Server-side comparison
        app.post('/api/confirm-bank-account', async (req, res) => {
          const { account_id, last4_input } = req.body;
          
          // Fetch raw account number from database
          const account = await db.bank_accounts.findById(account_id);
          
          // Compare last 4 digits (server-side)
          const actualLast4 = account.account_number.slice(-4);
          const isMatch = actualLast4 === last4_input;
          
          res.json({ isMatch });
          // Raw value never sent to client
        });
      `
    }
  },
  
  /**
   * VERIFICATION & TESTING (Audit.2)
   */
  verification: {
    
    browser_network_tab_inspection: {
      // Logic.1: Verify raw value NOT in API response
      test: 'Browser DevTools Network Tab Inspection',
      steps: [
        'Open app in browser',
        'Open DevTools → Network tab',
        'Trigger action that fetches sensitive data (e.g., view user profile)',
        'Click on API request in Network tab',
        'View Response payload',
        'Verify: Sensitive fields show MASKED values, NOT raw values',
        'Example: phone: "(***) ***-4567" NOT phone: "(555) 123-4567"'
      ],
      fail_if: 'Raw value appears in response payload'
    },
    
    dom_inspection: {
      // Logic.2: Verify raw value NOT in DOM
      test: 'Browser DOM Source Inspection',
      steps: [
        'Open app in browser',
        'Right-click on page → View Page Source',
        'Search for sensitive field values (e.g., full phone number)',
        'Verify: Only masked values in HTML source',
        'Also check: Inspect Element → search rendered DOM',
        'Verify: No hidden elements containing raw values'
      ],
      fail_if: 'Raw value found in DOM (even if hidden with CSS)'
    },
    
    role_testing: {
      // Access.1: Verify masking for all roles
      test: 'Multi-Role Masking Verification',
      steps: [
        'Test as parent role: Verify all sensitive fields masked',
        'Test as caregiver role: Verify all sensitive fields masked',
        'Test as trust_admin role: Verify all sensitive fields masked in UI',
        'Test as super_admin role: Verify all sensitive fields masked in UI',
        'Verify: No role sees raw values in standard UI'
      ],
      pass_criteria: 'All roles see identical masked values in UI'
    },
    
    edge_case_testing: {
      test: 'Edge Case Handling',
      scenarios: [
        {
          case: 'Null value',
          input: null,
          expected: 'Empty string or "Not provided" message',
          fail_if: 'Displays "null" or "undefined"'
        },
        {
          case: 'Short value (3 digits)',
          input: '123',
          expected: 'Fully masked: "xxxx"',
          fail_if: 'Reveals any digits: "xxxx-123"'
        },
        {
          case: 'Already masked value',
          input: 'xxxx-7890',
          expected: 'Returns same: "xxxx-7890"',
          fail_if: 'Double-masks: "xxxx-****"'
        },
        {
          case: 'Empty string',
          input: '',
          expected: 'Returns empty string',
          fail_if: 'Error or "undefined"'
        }
      ]
    },
    
    certification_url_testing: {
      // UI.2: Verify file URLs never exposed
      test: 'Certification File URL Masking',
      steps: [
        'View certification list/details page',
        'Open DevTools Network tab',
        'Inspect API response for certifications',
        'Verify: cert_file_url field NOT in response',
        'Verify: has_file boolean flag present instead',
        'Click download button',
        'Verify: Signed URL generated server-side',
        'Verify: Signed URL expires after 15 minutes'
      ],
      fail_if: 'Raw cert_file_url visible in API response or page source'
    }
  }
};

/**
 * ============================================================================
 * PHASE 0 CONFIGURATION CHECKLIST
 * ============================================================================
 */
const F007_CONFIGURATION_CHECKLIST = [
  {
    category: 'Response Serialization Implementation',
    tasks: [
      { task: 'Implement maskBankAccount() function', status: 'pending' },
      { task: 'Implement maskGovernmentID() function', status: 'pending' },
      { task: 'Implement maskPhoneNumber() function', status: 'pending' },
      { task: 'Implement maskOAuthToken() function', status: 'pending' },
      { task: 'Add null/empty handling to all masking functions (Triggers.1)', status: 'pending' },
      { task: 'Add short value handling (<4 chars) to all functions (Errors.2)', status: 'pending' },
      { task: 'Add double-masking detection to all functions (Edge.2)', status: 'pending' }
    ]
  },
  {
    category: 'Backend Serialization Middleware',
    tasks: [
      { task: 'Create serializeUser() function with phone masking', status: 'pending' },
      { task: 'Create serializeBankAccount() function (when entity exists)', status: 'pending' },
      { task: 'Create serializeCertification() function (exclude cert_file_url)', status: 'pending' },
      { task: 'Apply serializers to ALL API endpoints returning sensitive data', status: 'pending' },
      { task: 'Verify masking happens BEFORE JSON response encoding', status: 'pending' }
    ]
  },
  {
    category: 'UI Component Updates',
    tasks: [
      { task: 'Update user profile components to display masked phone', status: 'pending' },
      { task: 'Create CertificationDownloadButton component (UI.2)', status: 'pending' },
      { task: 'Remove any client-side masking logic (if exists)', status: 'pending' },
      { task: 'Verify no raw values displayed in admin UI (Access.1)', status: 'pending' }
    ]
  },
  {
    category: 'Edge Case Handling',
    tasks: [
      { task: 'Test: null input → empty string (not "null")', status: 'pending' },
      { task: 'Test: 3-digit value → fully masked (not revealing digits)', status: 'pending' },
      { task: 'Test: already-masked value → no double-masking', status: 'pending' },
      { task: 'Implement conditional masking if needed (Edge.1)', status: 'pending' }
    ]
  },
  {
    category: 'Pre-Launch Verification (Audit.2)',
    tasks: [
      { task: 'Browser Network tab: Verify no raw values in API responses', status: 'pending' },
      { task: 'DOM inspection: Verify no raw values in page source', status: 'pending' },
      { task: 'Test as parent role: All sensitive fields masked', status: 'pending' },
      { task: 'Test as caregiver role: All sensitive fields masked', status: 'pending' },
      { task: 'Test as admin role: All sensitive fields masked in UI', status: 'pending' },
      { task: 'Certification download: Verify no raw URLs exposed', status: 'pending' },
      { task: 'Document verification results in Phase 8 checklist', status: 'pending' }
    ]
  }
];

/**
 * ============================================================================
 * ACCEPTANCE CRITERIA (Phase 0 Gate)
 * ============================================================================
 */
const ACCEPTANCE_TESTS = [
  {
    test: 'Masking at Response Layer',
    steps: [
      'Fetch user record via API',
      'Open browser Network tab',
      'Inspect API response payload',
      'Verify: phone field shows "(***) ***-4567" format',
      'Verify: Raw phone number NOT in response'
    ],
    fail_if: 'Raw phone number appears in response payload'
  },
  {
    test: 'No Raw Values in DOM',
    steps: [
      'View user profile page',
      'Right-click → View Page Source',
      'Search for known phone number (e.g., "5551234567")',
      'Verify: Phone number NOT in page source',
      'Inspect Element → search rendered DOM',
      'Verify: No hidden elements with raw values'
    ],
    fail_if: 'Raw value found anywhere in DOM'
  },
  {
    test: 'Null Handling',
    method: 'Call maskPhoneNumber(null)',
    expected: 'Returns empty string ""',
    fail_if: 'Returns "null", "undefined", or throws error'
  },
  {
    test: 'Short Value Masking',
    method: 'Call maskBankAccount("123")',
    expected: 'Returns "xxxx" (fully masked)',
    fail_if: 'Returns "xxxx-123" (reveals digits)'
  },
  {
    test: 'Double-Masking Prevention',
    method: 'Call maskPhoneNumber("(***) ***-4567")',
    expected: 'Returns "(***) ***-4567" (unchanged)',
    fail_if: 'Returns "(***) ***-****" or other corruption'
  },
  {
    test: 'Admin UI Masking',
    steps: [
      'Login as super_admin',
      'View admin user list',
      'Verify: Phone numbers displayed as "(***) ***-4567"',
      'Verify: Same masked format as regular users see'
    ],
    fail_if: 'Admin sees raw values in UI'
  },
  {
    test: 'Certification URL Masking',
    steps: [
      'View certification details page',
      'Open browser Network tab',
      'Inspect certification API response',
      'Verify: cert_file_url field NOT in response',
      'Verify: has_file boolean flag present',
      'Click download button',
      'Verify: Server generates signed URL',
      'Verify: Redirect to download works'
    ],
    fail_if: 'Raw cert_file_url in API response or page source'
  },
  {
    test: 'Server-Side Confirmation',
    steps: [
      'Implement bank account confirmation flow',
      'User enters last 4 digits',
      'Submit to server for comparison',
      'Verify: Server compares with raw value',
      'Verify: Client never receives raw value for comparison'
    ],
    fail_if: 'Raw value sent to client for comparison'
  },
  {
    test: 'All Roles Consistency',
    steps: [
      'Test same sensitive field as parent, caregiver, admin',
      'Verify: All roles see same masked format',
      'Verify: No role sees raw value in UI'
    ],
    fail_if: 'Different masking for different roles OR any role sees raw value'
  }
];

/**
 * ============================================================================
 * IMPLEMENTATION NOTES
 * ============================================================================
 * 
 * Base44 Platform Requirements:
 * - Response serialization middleware that runs before JSON encoding
 * - Support for role-based serialization (if needed for Access.2 post-MVP)
 * - Signed URL generation for private files (already implemented in F-002)
 * 
 * Supporting Entities:
 * - NO new entities - masking applies to existing entity fields
 * - PIIAccessLog (F-009) logs when full values are accessed
 * 
 * Integration with Other Features:
 * - F-002: Field-level security (masking is additional layer on top of access control)
 * - F-006: Encryption at Rest (encrypt before storage, decrypt on server, mask in response)
 * - F-009: PII Access Logging (log when full value accessed via Access.2 feature)
 * 
 * CRITICAL WARNINGS:
 * - Logic.1-2: NEVER mask at UI layer - always at response serialization
 * - Data.3: Raw values NEVER sent to client
 * - Access.1: Masking applies to ALL roles (even admin) in UI
 * - UI.2: Certification URLs NEVER exposed as raw URLs
 * - Triggers.1: Always handle null gracefully
 * - Errors.2: Fully mask values shorter than 4 characters
 * - Edge.2: Prevent double-masking
 * 
 * CURRENT STATUS (Phase 0):
 * - Document all masking patterns
 * - Implement masking functions
 * - Apply to existing sensitive fields (User.phone)
 * - Prepare for future fields (bank accounts, government IDs, OAuth tokens)
 * 
 * NEXT STEPS:
 * 1. Implement all masking functions with edge case handling
 * 2. Create response serializers for each entity with sensitive fields
 * 3. Update UI components to display masked values
 * 4. Create CertificationDownloadButton component
 * 5. Test all acceptance criteria
 * 6. Verify via browser Network tab and DOM inspection
 * 7. Document verification in Phase 8 checklist
 */

export default function F007MaskedDisplayDocumentation() {
  return (
    <div style={{ padding: '2rem', fontFamily: 'monospace', maxWidth: '1400px', margin: '0 auto' }}>
      <h1>F-007: Masked Display of Sensitive Data - Configuration Required</h1>
      <p><strong>Phase 0 Status:</strong> Documentation complete</p>
      <p><strong>Next Step:</strong> Implement response serialization masking</p>
      
      <h2>Masking Rules (Data.2)</h2>
      <table border="1" cellPadding="8" style={{ borderCollapse: 'collapse', width: '100%', marginTop: '1rem' }}>
        <thead>
          <tr style={{ backgroundColor: '#f3f4f6' }}>
            <th>Field</th>
            <th>Pattern</th>
            <th>Example</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Bank Account</td>
            <td>xxxx-[last4]</td>
            <td>1234567890 → xxxx-7890</td>
          </tr>
          <tr>
            <td>Government ID (SSN)</td>
            <td>***-**-[last4]</td>
            <td>123456789 → ***-**-6789</td>
          </tr>
          <tr>
            <td>Phone Number</td>
            <td>(***) ***-[last4]</td>
            <td>(555) 123-4567 → (***) ***-4567</td>
          </tr>
          <tr>
            <td>OAuth Token</td>
            <td>[first4]****...[last6]</td>
            <td>ghp_abc...xyz → ghp_****...xyz</td>
          </tr>
          <tr>
            <td>Cert File URL</td>
            <td>NEVER exposed</td>
            <td>Button → signed URL</td>
          </tr>
        </tbody>
      </table>
      
      <h2>Critical Rules (Logic.1-2, Data.3)</h2>
      <div style={{ padding: '1rem', backgroundColor: '#fee2e2', borderLeft: '4px solid #ef4444', marginTop: '1rem' }}>
        <strong>⚠️ MASKING LAYER: Response Serialization ONLY</strong>
        <ul>
          <li><strong>✓ CORRECT:</strong> Mask at API response serialization layer (before JSON encoding)</li>
          <li><strong>✗ WRONG:</strong> Mask at UI rendering layer (raw value in Network tab)</li>
          <li><strong>✗ WRONG:</strong> CSS masking (raw value in DOM)</li>
          <li><strong>✗ WRONG:</strong> Client-side masking (raw value in Network response)</li>
        </ul>
        <p><strong>Verification:</strong> Open browser DevTools → Network tab → inspect response payload</p>
        <p><strong>Fail if:</strong> Raw value appears in response JSON</p>
      </div>
      
      <h2>Access Control (Access.1-2)</h2>
      <ul>
        <li><strong>ALL roles</strong> see masked values in UI (including admin)</li>
        <li>Admin full value access = separate audited action (Access.2, post-MVP)</li>
        <li><strong>NEVER</strong> add UI toggle that reveals raw value in DOM</li>
      </ul>
      
      <h2>Edge Case Handling</h2>
      <table border="1" cellPadding="8" style={{ borderCollapse: 'collapse', width: '100%', marginTop: '1rem' }}>
        <thead>
          <tr style={{ backgroundColor: '#f3f4f6' }}>
            <th>Case</th>
            <th>Input</th>
            <th>Expected Output</th>
            <th>Fail If</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Null value (Triggers.1)</td>
            <td>null</td>
            <td>Empty string ""</td>
            <td>Returns "null" or "undefined"</td>
          </tr>
          <tr>
            <td>Short value (Errors.2)</td>
            <td>"123"</td>
            <td>"xxxx" (fully masked)</td>
            <td>"xxxx-123" (reveals digits)</td>
          </tr>
          <tr>
            <td>Already masked (Edge.2)</td>
            <td>"xxxx-7890"</td>
            <td>"xxxx-7890" (unchanged)</td>
            <td>"xxxx-****" (double-masked)</td>
          </tr>
          <tr>
            <td>Empty string</td>
            <td>""</td>
            <td>Empty string ""</td>
            <td>Error or "undefined"</td>
          </tr>
        </tbody>
      </table>
      
      <h2>Certification File URLs (UI.2)</h2>
      <div style={{ padding: '1rem', backgroundColor: '#fef3c7', borderLeft: '4px solid #f59e0b', marginTop: '1rem' }}>
        <strong>NEVER expose raw file URLs:</strong>
        <ol>
          <li>API response: Exclude cert_file_url field</li>
          <li>Include metadata only: has_file (boolean), file_size</li>
          <li>UI: Render download button (NOT raw URL link)</li>
          <li>Click button → server generates signed URL (15 min expiry)</li>
          <li>Log access to PIIAccessLog (F-009)</li>
        </ol>
        <p><strong>Verification:</strong> Network tab must NOT show cert_file_url in response</p>
      </div>
      
      <h2>Implementation Checklist</h2>
      <ol>
        <li>Implement masking functions: maskBankAccount(), maskPhoneNumber(), etc.</li>
        <li>Add null/empty/short value handling to all functions</li>
        <li>Add double-masking detection</li>
        <li>Create response serializers for User, BankAccount, Certification</li>
        <li>Apply serializers to ALL API endpoints</li>
        <li>Create CertificationDownloadButton component</li>
        <li>Remove any client-side masking logic</li>
      </ol>
      
      <h2>Pre-Launch Verification (Audit.2)</h2>
      <ol>
        <li>Browser Network tab: No raw values in API responses ✓</li>
        <li>DOM inspection: No raw values in page source ✓</li>
        <li>Test all roles: parent, caregiver, admin see same masked values ✓</li>
        <li>Certification URLs: No raw URLs in response ✓</li>
        <li>Edge cases: null, short values, double-masking ✓</li>
        <li>Document results in Phase 8 checklist</li>
      </ol>
      
      <p style={{ marginTop: '2rem' }}><em>See component source code for complete masking specification, pseudocode implementation, and UI examples.</em></p>
    </div>
  );
}