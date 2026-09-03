# @supernova/sanitization

Proprietary data sanitization engine for Node2AI - handles PII, PHI, financial, and government data with enterprise-grade security and compliance.

## Overview

This package provides a comprehensive data sanitization engine designed for regulated industries including healthcare, finance, and government. It offers:

- **Multi-Category Detection**: PII, PHI, financial, and government data patterns
- **Compliance Ready**: GDPR, HIPAA, SOX compliance built-in
- **Enterprise Security**: Proprietary algorithms and pattern matching
- **High Performance**: Optimized for large-scale data processing
- **Audit Trail**: Complete logging and compliance reporting

## Features

- 🔒 **Proprietary Patterns**: Advanced pattern recognition for sensitive data
- 🏥 **Healthcare Compliance**: HIPAA-ready PHI detection and sanitization
- 💰 **Financial Security**: Credit cards, bank accounts, tax IDs, and more
- 🏛️ **Government Data**: Passport numbers, visa IDs, case numbers
- 📊 **Compliance Reporting**: Automated GDPR, HIPAA, SOX compliance checks
- ⚡ **High Performance**: Optimized for enterprise-scale processing
- 🔍 **Audit Logging**: Complete audit trail for compliance requirements

## Installation

```bash
pnpm add @supernova/sanitization
```

## Usage

### Basic Sanitization

```typescript
import { createSanitizationEngine } from '@supernova/sanitization';

const engine = createSanitizationEngine();

// Sanitize text with sensitive data
const result = await engine.sanitize(`
  Patient: John Doe
  SSN: 123-45-6789
  Email: john.doe@example.com
  Phone: (555) 123-4567
  Credit Card: 4111 1111 1111 1111
`);

console.log(result.sanitized);
// Patient: John Doe
// SSN: [SSN-REDACTED]
// Email: [EMAIL-REDACTED]
// Phone: [PHONE-REDACTED]
// Credit Card: [CARD-REDACTED]
```

### Advanced Configuration

```typescript
import { createSanitizationEngine } from '@supernova/sanitization';

const engine = createSanitizationEngine({
  strictMode: true,
  preserveFormat: true,
  maxProcessingTime: 10000,
});

const result = await engine.sanitize(input, {
  categories: ['pii', 'phi', 'financial'],
  severity: ['high', 'critical'],
  strictMode: true,
  context: { department: 'healthcare' },
});
```

### Custom Rules

```typescript
import { createRule, createSanitizationEngine } from '@supernova/sanitization';

const engine = createSanitizationEngine();

// Create custom sanitization rule
const customRule = createRule(
  'Employee ID',
  'EMP[:\s]*\d{4,8}',
  '[EMP-ID-REDACTED]',
  'custom',
  'medium',
  0.9,
  10,
  'Employee ID sanitization',
  ['hr', 'internal']
);

engine.addRule(customRule);
```

### Compliance Reporting

```typescript
import { generateComplianceReport } from '@supernova/sanitization';

const results = [
  /* sanitization results */
];
const report = generateComplianceReport(results);

console.log('GDPR Compliant:', report.gdprCompliant);
console.log('HIPAA Compliant:', report.hipaaCompliant);
console.log('SOX Compliant:', report.soxCompliant);
console.log('Recommendations:', report.recommendations);
```

## API Reference

### SanitizationEngine

Main engine class for data sanitization.

#### Methods

- `sanitize(input: string, options?: SanitizationOptions): Promise<SanitizationResult>`
- `addRule(rule: SanitizationRule): void`
- `removeRule(ruleId: string): void`
- `updateRule(ruleId: string, rule: Partial<SanitizationRule>): void`
- `getRules(): SanitizationRule[]`
- `getRuleById(ruleId: string): SanitizationRule | undefined`
- `validateRule(rule: SanitizationRule): ValidationResult`

### SanitizationResult

Result object containing sanitization details.

```typescript
interface SanitizationResult {
  original: string;
  sanitized: string;
  rulesApplied: AppliedRule[];
  confidence: number;
  warnings: string[];
  metadata: SanitizationMetadata;
}
```

### SanitizationOptions

Configuration options for sanitization.

```typescript
interface SanitizationOptions {
  categories?: string[];
  severity?: string[];
  strictMode?: boolean;
  preserveFormat?: boolean;
  customRules?: SanitizationRule[];
  context?: Record<string, any>;
}
```

## Pattern Categories

### PII (Personally Identifiable Information)

- Social Security Numbers
- Email addresses
- Phone numbers
- Credit card numbers
- Driver license numbers

### PHI (Protected Health Information)

- Medical record numbers
- Patient IDs
- Diagnosis codes
- Insurance IDs
- Dates of birth

### Financial Data

- Bank account numbers
- Routing numbers
- Tax IDs (EIN/TIN)
- SWIFT codes

### Government Data

- Passport numbers
- Visa numbers
- Alien registration numbers
- Government case numbers

## Compliance Features

### GDPR Compliance

- Automatic PII detection and sanitization
- Data processing audit trails
- Right to be forgotten support
- Data minimization principles

### HIPAA Compliance

- PHI detection and protection
- Healthcare data sanitization
- Audit logging for healthcare data
- Minimum necessary standard

### SOX Compliance

- Financial data protection
- Audit trail maintenance
- Internal controls validation
- Financial reporting compliance

## Performance

The sanitization engine is optimized for enterprise-scale processing:

- **Throughput**: 10,000+ characters per second
- **Memory Efficient**: Minimal memory footprint
- **Scalable**: Handles large documents and batch processing
- **Configurable**: Adjustable processing limits and timeouts

## Security

- **Proprietary Algorithms**: Advanced pattern matching
- **No Data Storage**: No sensitive data is stored or logged
- **Encrypted Processing**: All processing is done in memory
- **Audit Trail**: Complete logging without exposing sensitive data

## Development

### Building

```bash
pnpm build
```

### Testing

```bash
pnpm test
```

### Coverage

```bash
pnpm test:coverage
```

### Linting

```bash
pnpm lint
```

## License

Proprietary - Node2AI Enterprise License

## Support

For enterprise support and custom pattern development, contact Node2AI support.
