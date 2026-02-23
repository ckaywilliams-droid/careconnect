/**
 * F-004: TLS / HTTPS ENFORCEMENT CONFIGURATION
 * 
 * THIS IS A DOCUMENTATION COMPONENT - NOT FUNCTIONAL CODE
 * 
 * This component documents the Base44 platform and hosting-level configuration
 * required for F-004 TLS/HTTPS enforcement. These are INFRASTRUCTURE-level controls
 * that must be configured at the hosting/CDN layer, not in application code.
 * 
 * STATUS: Phase 0 - Documentation complete
 * NEXT STEP: Configure Base44 hosting platform + verify with security header scan
 * 
 * ============================================================================
 * CRITICAL INFRASTRUCTURE REQUIREMENTS
 * ============================================================================
 */

const F004_TLS_HTTPS_SPECIFICATION = {
  
  /**
   * HTTPS ENFORCEMENT (Logic.1)
   * All HTTP requests must receive 301 permanent redirect to HTTPS
   */
  https_enforcement: {
    requirement: 'ALL traffic over HTTPS - no exceptions',
    http_behavior: {
      status_code: 301,  // Permanent redirect
      redirect_to: 'https://' + 'same_domain' + 'same_path',
      content_served_over_http: 'NONE - redirect only, no content'
    },
    applies_to: [
      'Unauthenticated requests (Access.1)',
      'Authenticated requests',
      'API endpoints',
      'Static assets',
      'Admin dashboard',
      'Public pages',
      'ALL endpoints without exception (Access.2)'
    ],
    platform_config: `
      Base44 Hosting Dashboard:
      - Enable "Force HTTPS" / "HTTPS Only" setting
      - Configure automatic HTTP → HTTPS redirect
      - Verify redirect is 301 (permanent) not 302 (temporary)
      
      Test:
      curl -I http://yourdomain.com
      Expected: HTTP/1.1 301 Moved Permanently
                Location: https://yourdomain.com/
    `
  },
  
  /**
   * TLS VERSION REQUIREMENTS (Logic.2)
   * TLS 1.0 and 1.1 disabled. TLS 1.2 minimum. TLS 1.3 preferred.
   */
  tls_version_requirements: {
    disabled: ['TLS 1.0', 'TLS 1.1', 'SSL 3.0', 'SSL 2.0'],
    minimum: 'TLS 1.2',
    preferred: 'TLS 1.3',
    rationale: {
      'TLS 1.0/1.1': 'Deprecated by IETF, vulnerable to BEAST, POODLE attacks',
      'TLS 1.2': 'Industry minimum standard as of 2023',
      'TLS 1.3': 'Best performance and security - eliminates obsolete cryptographic algorithms'
    },
    platform_config: `
      Base44 Hosting / CDN Settings:
      - Disable TLS 1.0 and TLS 1.1
      - Enable TLS 1.2 (minimum)
      - Enable TLS 1.3 if hosting provider supports it
      
      Verification:
      nmap --script ssl-enum-ciphers -p 443 yourdomain.com
      OR
      ssllabs.com/ssltest/analyze.html?d=yourdomain.com
      
      Expected: TLS 1.2 and/or TLS 1.3 only
    `
  },
  
  /**
   * REQUIRED SECURITY HEADERS (Data.2)
   * Must be present on ALL responses (Access.1)
   */
  required_security_headers: {
    
    'Strict-Transport-Security': {
      value: 'max-age=31536000; includeSubDomains',
      purpose: 'Force browsers to use HTTPS for 1 year. Prevent SSL stripping attacks.',
      explanation: {
        'max-age=31536000': '1 year in seconds - browsers remember HTTPS requirement',
        'includeSubDomains': 'Apply HSTS to all subdomains (e.g., api.yourdomain.com)',
        'preload': 'Optional but recommended - submit domain to browser HSTS preload lists'
      },
      platform_config: `
        Base44 Platform Settings → Security Headers:
        Header Name: Strict-Transport-Security
        Header Value: max-age=31536000; includeSubDomains
        Apply To: All responses (200, 404, 500, etc.)
      `,
      preload_list: {
        requirement: 'Domain must serve HSTS header with max-age >= 31536000 before submitting to preload',
        submit_to: 'https://hstspreload.org/',
        warning: 'Preload is permanent and difficult to undo - only submit after Edge.2 verification',
        edge_case: 'Edge.2: Verify HSTS header present and max-age correct BEFORE preload submission'
      },
      testing: `
        curl -I https://yourdomain.com
        Expected: Strict-Transport-Security: max-age=31536000; includeSubDomains
      `
    },
    
    'X-Frame-Options': {
      value: 'DENY',
      purpose: 'Prevent clickjacking attacks by blocking iframe embedding',
      alternatives: {
        'DENY': 'Never allow framing (recommended for security)',
        'SAMEORIGIN': 'Allow framing only from same domain',
        'ALLOW-FROM uri': 'Deprecated - use CSP frame-ancestors instead'
      },
      platform_config: `
        Base44 Platform Settings → Security Headers:
        Header Name: X-Frame-Options
        Header Value: DENY
        Apply To: All HTML responses
      `,
      testing: `
        curl -I https://yourdomain.com
        Expected: X-Frame-Options: DENY
      `
    },
    
    'X-Content-Type-Options': {
      value: 'nosniff',
      purpose: 'Prevent MIME-type sniffing attacks. Force browser to respect Content-Type header.',
      explanation: 'Without this, browser may interpret text/plain as text/html and execute scripts',
      platform_config: `
        Base44 Platform Settings → Security Headers:
        Header Name: X-Content-Type-Options
        Header Value: nosniff
        Apply To: All responses
      `,
      testing: `
        curl -I https://yourdomain.com
        Expected: X-Content-Type-Options: nosniff
      `
    },
    
    'Content-Security-Policy': {
      value: "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net https://unpkg.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self' https://api.yourdomain.com; frame-ancestors 'none';",
      purpose: 'Restrict resource loading to prevent XSS attacks and data exfiltration',
      explanation: {
        "default-src 'self'": 'By default, only load resources from same origin',
        "script-src 'self' 'unsafe-inline' 'unsafe-eval'": 'Allow scripts from same origin + inline scripts (React requires unsafe-inline/unsafe-eval)',
        "script-src https://cdn.jsdelivr.net": 'Whitelist specific CDNs for Base44 dependencies',
        "style-src 'self' 'unsafe-inline'": 'Allow stylesheets from same origin + inline styles (Tailwind requires unsafe-inline)',
        "img-src 'self' data: https:": 'Allow images from same origin, data URIs, and any HTTPS source',
        "font-src 'self' data:": 'Allow fonts from same origin and data URIs',
        "connect-src 'self' https://api.yourdomain.com": 'Allow XHR/fetch to same origin and API subdomain',
        "frame-ancestors 'none'": 'Prevent framing (modern alternative to X-Frame-Options: DENY)'
      },
      customization_required: {
        warning: 'CSP must be customized based on actual Base44 dependencies',
        steps: [
          '1. Identify all external resources used by Base44 (CDNs, fonts, APIs)',
          '2. Add each trusted source to appropriate CSP directive',
          '3. Test in browser console - CSP violations appear as errors',
          '4. Tighten policy by removing unsafe-inline/unsafe-eval if possible'
        ]
      },
      platform_config: `
        Base44 Platform Settings → Security Headers:
        Header Name: Content-Security-Policy
        Header Value: [See value above - customize for Base44 dependencies]
        Apply To: All HTML responses
        
        IMPORTANT: Start with relaxed policy, monitor CSP violation reports,
        then tighten policy over time to remove unsafe-inline/unsafe-eval
      `,
      testing: `
        curl -I https://yourdomain.com
        Expected: Content-Security-Policy: [policy string]
        
        Browser testing:
        1. Open app in browser
        2. Open DevTools Console
        3. Look for CSP violation errors
        4. Add violated sources to CSP whitelist OR fix code to not require them
      `,
      reporting: {
        optional: 'Content-Security-Policy-Report-Only header for testing',
        report_uri: 'report-uri /csp-violation-report-endpoint',
        use_case: 'Deploy CSP in report-only mode first, monitor violations, then enforce'
      }
    }
  },
  
  /**
   * TLS CERTIFICATE MANAGEMENT (Errors.1)
   * Automated renewal required - certificate expiry breaks entire app
   */
  certificate_management: {
    certificate_provider: {
      recommended: "Let's Encrypt (free, automated)",
      alternatives: ['Paid SSL certificate from hosting provider', 'CloudFlare Universal SSL'],
      requirement: 'MUST support automated renewal'
    },
    
    automated_renewal: {
      requirement: 'Certificate must renew automatically BEFORE expiry',
      recommended_schedule: 'Renew at 30 days before expiry (Let\'s Encrypt renews at 30 days by default)',
      failure_impact: 'If certificate expires: ALL traffic fails for ALL users - total platform outage',
      platform_config: `
        Base44 Hosting Dashboard:
        - Enable "Auto-Renew SSL Certificate" setting
        - Verify renewal is automatic (not manual)
        - Confirm renewal happens at least 30 days before expiry
      `
    },
    
    expiry_monitoring: {
      // Audit.1: Certificate expiry monitoring
      requirement: 'External monitoring with alerts at 30 days and 7 days before expiry',
      monitoring_services: [
        'UptimeRobot (free tier includes SSL monitoring)',
        'Pingdom SSL Certificate Monitoring',
        'StatusCake SSL Monitoring',
        'Custom script: openssl s_client -connect yourdomain.com:443 -servername yourdomain.com | openssl x509 -noout -dates'
      ],
      alert_thresholds: {
        '30_days_before_expiry': {
          action: 'Warning alert to operator email + SMS',
          purpose: 'First warning - verify auto-renewal is configured'
        },
        '7_days_before_expiry': {
          action: 'Critical alert to operator email + SMS + Slack/Discord',
          purpose: 'Final warning - manually renew if auto-renewal failed'
        },
        '1_day_before_expiry': {
          action: 'Emergency alert + consider manual renewal NOW',
          purpose: 'Last chance before outage'
        }
      },
      platform_config: `
        1. Sign up for UptimeRobot or similar SSL monitoring service
        2. Add HTTPS monitor for yourdomain.com
        3. Enable SSL certificate expiry checks
        4. Configure alerts:
           - 30 days before expiry → email
           - 7 days before expiry → email + SMS
        5. Test alerts by temporarily setting alert threshold to far future date
      `,
      edge_case: {
        // Edge.1: Hosting provider auto-renewal verification
        scenario: 'Base44 hosting provider manages TLS automatically',
        requirement: 'Confirm automatic renewal is active + expiry alerts configured',
        verification: [
          'Check hosting dashboard for auto-renewal status',
          'Verify alerts sent to operator email (not just in dashboard)',
          'Set up EXTERNAL monitoring as backup (don\'t rely only on hosting provider alerts)'
        ]
      }
    },
    
    custom_domain_considerations: {
      scenario: 'Custom domain (e.g., caregivers.yourdomain.com) instead of base44.app subdomain',
      requirements: [
        'DNS A/AAAA record pointing to Base44 hosting IP',
        'TLS certificate issued for custom domain',
        'HSTS header configured BEFORE HSTS preload submission',
        'Verify certificate covers all subdomains if using wildcard'
      ],
      platform_config: `
        Base44 Custom Domain Setup:
        1. Add custom domain in Base44 dashboard
        2. Update DNS records per Base44 instructions
        3. Wait for TLS certificate provisioning (usually automatic)
        4. Verify HTTPS works: https://yourdomain.com
        5. Verify security headers present
        6. Only then submit to HSTS preload list (Edge.2)
      `
    }
  },
  
  /**
   * MIXED CONTENT AUDIT (Errors.2)
   * All embedded resources MUST load over HTTPS
   */
  mixed_content_prevention: {
    problem: 'HTTPS page loading HTTP resources → browser blocks them → broken UI/functionality',
    affected_resources: [
      'Images (<img src="http://...">)',
      'Stylesheets (<link href="http://...">)',
      'Scripts (<script src="http://...">)',
      'Fonts (@font-face url(http://...))',
      'Iframes (<iframe src="http://...">)',
      'XHR/Fetch requests to HTTP endpoints',
      'WebSocket connections to ws:// (should be wss://)'
    ],
    
    audit_checklist: {
      step_1: {
        action: 'Search codebase for hardcoded HTTP URLs',
        command: 'grep -r "http://" components/ pages/ --include="*.jsx" --include="*.js"',
        fix: 'Change all http:// to https:// OR use protocol-relative URLs (//domain.com/resource)'
      },
      step_2: {
        action: 'Check external CDN references',
        locations: [
          'package.json (if using CDN-hosted libraries)',
          'index.html or Layout.js (external script/style tags)',
          'Font imports (Google Fonts, etc.)'
        ],
        fix: 'Ensure all CDN URLs use https://'
      },
      step_3: {
        action: 'Check user-uploaded content',
        scenario: 'User uploads image, URL stored as http://... in database',
        fix: [
          'Upload files to HTTPS-accessible storage (Base44 integrations.Core.UploadFile)',
          'If storing external URLs, validate they are HTTPS before saving',
          'Add migration script to convert existing http:// URLs to https://'
        ]
      },
      step_4: {
        action: 'Browser testing for mixed content warnings',
        steps: [
          '1. Open app in browser over HTTPS',
          '2. Open DevTools Console',
          '3. Look for "Mixed Content" warnings',
          '4. Fix each warning before launch'
        ],
        example_warning: 'Mixed Content: The page at https://yourdomain.com was loaded over HTTPS, but requested an insecure image http://example.com/image.jpg'
      },
      step_5: {
        action: 'Enable "Upgrade Insecure Requests" CSP directive',
        purpose: 'Automatically upgrade HTTP requests to HTTPS',
        csp_addition: "upgrade-insecure-requests;",
        platform_config: `
          Content-Security-Policy: upgrade-insecure-requests; [other directives]
          
          This instructs browsers to automatically upgrade http:// to https://
          before making the request - acts as a safety net for missed HTTP URLs
        `
      }
    }
  },
  
  /**
   * PRE-LAUNCH VERIFICATION (Triggers.2, Audit.2, UI.2)
   * Run security header scan and document results before launch
   */
  pre_launch_verification: {
    required_scans: {
      'securityheaders.com': {
        url: 'https://securityheaders.com/?q=yourdomain.com',
        purpose: 'Scan security headers and assign letter grade (A+ is best)',
        passing_grade: 'A or A+ required for launch',
        fix_if_failed: [
          'Missing header: Add header per configuration above',
          'Weak header value: Strengthen per Data.2 requirements',
          'Inconsistent headers: Verify headers present on all response types (200, 404, 500)'
        ]
      },
      
      'ssllabs.com': {
        url: 'https://www.ssllabs.com/ssltest/analyze.html?d=yourdomain.com',
        purpose: 'Scan TLS configuration and certificate',
        passing_grade: 'A or A+ required for launch',
        checks: [
          'Certificate validity and expiry date',
          'TLS protocol versions (only 1.2+ enabled)',
          'Cipher suite strength',
          'Certificate chain completeness',
          'HSTS header presence'
        ]
      },
      
      'mozilla_observatory': {
        url: 'https://observatory.mozilla.org/analyze/yourdomain.com',
        purpose: 'Comprehensive security scan including headers, TLS, and best practices',
        passing_score: '80+ / 100 required for launch',
        categories: [
          'Content Security Policy',
          'Cookies (Secure flag, SameSite)',
          'Cross-origin Resource Sharing (CORS)',
          'Referrer Policy',
          'Subresource Integrity',
          'X-Content-Type-Options',
          'X-Frame-Options'
        ]
      }
    },
    
    documentation_requirement: {
      // Audit.2, UI.2: Document scan results in Phase 8 pre-launch checklist
      what_to_document: [
        'securityheaders.com grade (target: A or A+)',
        'ssllabs.com grade (target: A or A+)',
        'Mozilla Observatory score (target: 80+)',
        'Screenshot of each scan result',
        'List of any warnings/failures and how they were resolved',
        'Certificate expiry date and auto-renewal verification',
        'Mixed content audit completion confirmation'
      ],
      where_to_document: 'Phase 8 Pre-Launch Checklist document',
      who_approves: 'Senior security engineer or project lead'
    }
  }
};

/**
 * ============================================================================
 * PHASE 0 CONFIGURATION CHECKLIST
 * ============================================================================
 */
const F004_CONFIGURATION_CHECKLIST = [
  {
    category: 'HTTPS Enforcement',
    tasks: [
      { task: 'Enable "Force HTTPS" in Base44 hosting settings', status: 'pending' },
      { task: 'Verify HTTP → HTTPS redirect is 301 (permanent)', status: 'pending' },
      { task: 'Test: curl -I http://yourdomain.com returns 301', status: 'pending' }
    ]
  },
  {
    category: 'TLS Version Configuration',
    tasks: [
      { task: 'Disable TLS 1.0 and TLS 1.1 in hosting settings', status: 'pending' },
      { task: 'Enable TLS 1.2 (minimum required)', status: 'pending' },
      { task: 'Enable TLS 1.3 if hosting provider supports it', status: 'pending' },
      { task: 'Verify: ssllabs.com scan shows only TLS 1.2+', status: 'pending' }
    ]
  },
  {
    category: 'Security Headers',
    tasks: [
      { task: 'Add Strict-Transport-Security: max-age=31536000; includeSubDomains', status: 'pending' },
      { task: 'Add X-Frame-Options: DENY', status: 'pending' },
      { task: 'Add X-Content-Type-Options: nosniff', status: 'pending' },
      { task: 'Add Content-Security-Policy (customize for Base44 dependencies)', status: 'pending' },
      { task: 'Verify: curl -I https://yourdomain.com shows all headers', status: 'pending' },
      { task: 'Verify: securityheaders.com scan shows A or A+ grade', status: 'pending' }
    ]
  },
  {
    category: 'Certificate Management',
    tasks: [
      { task: 'Confirm TLS certificate is provisioned and valid', status: 'pending' },
      { task: 'Enable automated certificate renewal (Let\'s Encrypt or provider)', status: 'pending' },
      { task: 'Verify auto-renewal is active (check hosting dashboard)', status: 'pending' },
      { task: 'Note certificate expiry date: _______________', status: 'pending' },
      { task: 'Set up external monitoring (UptimeRobot, Pingdom, etc.)', status: 'pending' },
      { task: 'Configure alerts: 30 days before expiry → email', status: 'pending' },
      { task: 'Configure alerts: 7 days before expiry → email + SMS', status: 'pending' },
      { task: 'Test alert delivery by triggering test alert', status: 'pending' }
    ]
  },
  {
    category: 'Mixed Content Audit',
    tasks: [
      { task: 'Search codebase for hardcoded http:// URLs', status: 'pending' },
      { task: 'Verify all CDN references use https://', status: 'pending' },
      { task: 'Check user-uploaded content storage is HTTPS-accessible', status: 'pending' },
      { task: 'Open app in browser and check DevTools for mixed content warnings', status: 'pending' },
      { task: 'Add "upgrade-insecure-requests" to CSP directive', status: 'pending' }
    ]
  },
  {
    category: 'Pre-Launch Verification (Phase 8)',
    tasks: [
      { task: 'Run securityheaders.com scan - target grade: A or A+', status: 'pending' },
      { task: 'Run ssllabs.com SSL test - target grade: A or A+', status: 'pending' },
      { task: 'Run Mozilla Observatory scan - target score: 80+', status: 'pending' },
      { task: 'Take screenshots of all scan results', status: 'pending' },
      { task: 'Document results in Phase 8 Pre-Launch Checklist', status: 'pending' },
      { task: 'Resolve any scan warnings/failures', status: 'pending' },
      { task: 'Get security approval from senior engineer or project lead', status: 'pending' }
    ]
  },
  {
    category: 'HSTS Preload (Optional but Recommended)',
    tasks: [
      { task: 'Verify HSTS header has max-age >= 31536000', status: 'pending' },
      { task: 'Verify HSTS header includes "includeSubDomains"', status: 'pending' },
      { task: 'Add "preload" to HSTS header value', status: 'pending' },
      { task: 'Test HSTS with multiple browsers for 24 hours', status: 'pending' },
      { task: 'Submit domain to https://hstspreload.org/', status: 'pending' },
      { task: 'WARNING: Preload is permanent - only submit after thorough testing', status: 'pending' }
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
    test: 'HTTPS Enforcement',
    method: 'curl -I http://yourdomain.com',
    expected: 'HTTP/1.1 301 Moved Permanently + Location: https://yourdomain.com/',
    fail_if: 'Content served over HTTP OR 302 temporary redirect'
  },
  {
    test: 'TLS Version',
    method: 'nmap --script ssl-enum-ciphers -p 443 yourdomain.com',
    expected: 'Only TLS 1.2 and/or TLS 1.3 protocols listed',
    fail_if: 'TLS 1.0 or TLS 1.1 or SSL 3.0 appears in results'
  },
  {
    test: 'HSTS Header',
    method: 'curl -I https://yourdomain.com | grep -i strict-transport-security',
    expected: 'Strict-Transport-Security: max-age=31536000; includeSubDomains',
    fail_if: 'Header missing OR max-age < 31536000'
  },
  {
    test: 'X-Frame-Options Header',
    method: 'curl -I https://yourdomain.com | grep -i x-frame-options',
    expected: 'X-Frame-Options: DENY',
    fail_if: 'Header missing OR value is not DENY'
  },
  {
    test: 'X-Content-Type-Options Header',
    method: 'curl -I https://yourdomain.com | grep -i x-content-type-options',
    expected: 'X-Content-Type-Options: nosniff',
    fail_if: 'Header missing'
  },
  {
    test: 'Content-Security-Policy Header',
    method: 'curl -I https://yourdomain.com | grep -i content-security-policy',
    expected: 'Content-Security-Policy: [policy string with script-src, style-src, frame-ancestors restrictions]',
    fail_if: 'Header missing OR policy is empty'
  },
  {
    test: 'Certificate Validity',
    method: 'openssl s_client -connect yourdomain.com:443 -servername yourdomain.com < /dev/null | openssl x509 -noout -dates',
    expected: 'notAfter date is > 30 days in the future',
    fail_if: 'Certificate expired OR expires within 30 days'
  },
  {
    test: 'Mixed Content Check',
    method: 'Open app in Chrome DevTools → Console tab',
    expected: 'No "Mixed Content" warnings',
    fail_if: 'Any warnings about insecure resources loaded on HTTPS page'
  },
  {
    test: 'Security Headers Scan',
    method: 'Visit https://securityheaders.com/?q=yourdomain.com',
    expected: 'Grade: A or A+',
    fail_if: 'Grade is B or lower'
  },
  {
    test: 'SSL Labs Scan',
    method: 'Visit https://www.ssllabs.com/ssltest/analyze.html?d=yourdomain.com',
    expected: 'Overall Rating: A or A+',
    fail_if: 'Rating is B or lower OR any critical warnings'
  }
];

/**
 * ============================================================================
 * IMPLEMENTATION NOTES
 * ============================================================================
 * 
 * F-004 is ENTIRELY platform/hosting-level configuration.
 * No entities, no code, no automations - just infrastructure setup.
 * 
 * Base44 Platform Requirements:
 * - HTTPS enforcement at hosting/CDN layer
 * - Security header configuration (custom response headers)
 * - TLS version configuration (disable 1.0/1.1, enable 1.2+)
 * - Automated certificate renewal (Let's Encrypt or equivalent)
 * 
 * Dependencies:
 * - F-005: CSRF & XSS Protection (CSP header is part of XSS prevention)
 * - All future features: Everything depends on HTTPS being enforced
 * 
 * CRITICAL: This MUST be configured before any user data is collected.
 * Running even a test environment over HTTP exposes credentials and session tokens.
 * 
 * NEXT STEPS:
 * 1. Complete configuration checklist above
 * 2. Run all acceptance tests
 * 3. Document results for Phase 8 pre-launch audit
 * 4. Set up external certificate monitoring with alerts
 * 5. Proceed to F-005 (CSRF & XSS Protection)
 */

export default function F004TLSEnforcementDocumentation() {
  return (
    <div style={{ padding: '2rem', fontFamily: 'monospace', maxWidth: '1400px', margin: '0 auto' }}>
      <h1>F-004: TLS / HTTPS Enforcement - Platform Configuration Required</h1>
      <p><strong>Phase 0 Status:</strong> Documentation complete - no entities or code needed</p>
      <p><strong>Next Step:</strong> Configure Base44 hosting platform per checklist below</p>
      
      <h2>Critical Requirements</h2>
      <ul>
        <li><strong>HTTPS Only:</strong> All HTTP requests → 301 redirect to HTTPS. No content over HTTP.</li>
        <li><strong>TLS Versions:</strong> Disable TLS 1.0/1.1. Enable TLS 1.2 minimum, TLS 1.3 preferred.</li>
        <li><strong>Security Headers:</strong> HSTS, X-Frame-Options, X-Content-Type-Options, CSP on all responses.</li>
        <li><strong>Certificate Management:</strong> Automated renewal + external monitoring with 30/7 day alerts.</li>
        <li><strong>Mixed Content:</strong> All embedded resources must load over HTTPS.</li>
      </ul>
      
      <h2>Required Security Headers (Data.2)</h2>
      <table border="1" cellPadding="8" style={{ borderCollapse: 'collapse', width: '100%', marginTop: '1rem' }}>
        <thead>
          <tr style={{ backgroundColor: '#f3f4f6' }}>
            <th>Header</th>
            <th>Value</th>
            <th>Purpose</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><code>Strict-Transport-Security</code></td>
            <td><code>max-age=31536000; includeSubDomains</code></td>
            <td>Force HTTPS for 1 year, prevent SSL stripping</td>
          </tr>
          <tr>
            <td><code>X-Frame-Options</code></td>
            <td><code>DENY</code></td>
            <td>Prevent clickjacking attacks</td>
          </tr>
          <tr>
            <td><code>X-Content-Type-Options</code></td>
            <td><code>nosniff</code></td>
            <td>Prevent MIME-type sniffing</td>
          </tr>
          <tr>
            <td><code>Content-Security-Policy</code></td>
            <td><em>See component source for full policy</em></td>
            <td>Restrict resource loading, prevent XSS</td>
          </tr>
        </tbody>
      </table>
      
      <h2>Configuration Checklist</h2>
      <ol style={{ lineHeight: '1.8' }}>
        <li>Enable "Force HTTPS" in Base44 hosting settings</li>
        <li>Disable TLS 1.0/1.1, enable TLS 1.2+</li>
        <li>Add all required security headers</li>
        <li>Enable automated certificate renewal</li>
        <li>Set up external certificate monitoring (UptimeRobot, etc.)</li>
        <li>Configure expiry alerts (30 days, 7 days before expiry)</li>
        <li>Audit codebase for mixed content (hardcoded http:// URLs)</li>
        <li>Add "upgrade-insecure-requests" to CSP</li>
      </ol>
      
      <h2>Pre-Launch Verification (Phase 8)</h2>
      <ul>
        <li><strong>securityheaders.com:</strong> Grade A or A+ required</li>
        <li><strong>ssllabs.com:</strong> Grade A or A+ required</li>
        <li><strong>Mozilla Observatory:</strong> Score 80+ required</li>
        <li>Document all scan results with screenshots</li>
        <li>Resolve any warnings before launch</li>
      </ul>
      
      <h2>Testing Commands</h2>
      <pre style={{ backgroundColor: '#f3f4f6', padding: '1rem', borderRadius: '4px', overflow: 'auto' }}>
{`# Test HTTPS redirect
curl -I http://yourdomain.com

# Test security headers
curl -I https://yourdomain.com

# Test TLS versions
nmap --script ssl-enum-ciphers -p 443 yourdomain.com

# Check certificate expiry
echo | openssl s_client -connect yourdomain.com:443 -servername yourdomain.com 2>/dev/null | openssl x509 -noout -dates`}
      </pre>
      
      <p style={{ marginTop: '2rem', padding: '1rem', backgroundColor: '#fef3c7', borderLeft: '4px solid #f59e0b' }}>
        <strong>⚠️ CRITICAL:</strong> Certificate expiry causes total platform outage.
        External monitoring with alerts is REQUIRED, not optional.
      </p>
      
      <p><em>See component source code for complete configuration specification, CSP customization guide, and full checklist.</em></p>
    </div>
  );
}