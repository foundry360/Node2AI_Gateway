# Sanitization and Rehydration Workflow

## Current Implementation

### What Happens Now

1. **Input** with PII/PHI: "Patient John Doe, SSN 123-45-6789 has headaches..."
2. **Detected**: SSN, name, DOB, MRN, phone, email are detected
3. **Sanitized** before sending to OpenAI: "[NAME-REDACTED], SSN [SSN-REDACTED] has headaches..."
4. **Sent to OpenAI**: Only sanitized version
5. **Response from OpenAI**: Medical answer without PHI
6. **Returned**: Response + sanitization metadata

### What SHOULD Happen (Ideal Workflow)

1. **Input** with PII/PHI: "Patient John Doe, SSN 123-45-6789 has headaches..."
2. **Detect & Sanitize**: Create token mappings
   - "John Doe" → "TOKEN_ABC123"
   - "123-45-6789" → "TOKEN_DEF456"
3. **Send to OpenAI**: "Patient TOKEN_ABC123, SSN TOKEN_DEF456 has headaches..."
4. **Response from OpenAI**: "TOKEN_ABC123 should consult a neurologist..."
5. **Rehydrate**: Replace tokens back with original values
   - "TOKEN_ABC123" → "John Doe"
   - "TOKEN_DEF456" → "123-45-6789"
6. **Return** rehydrated response: "John Doe should consult a neurologist..."

## Implementation Status

### ✅ Completed

- Input sanitization (detection and replacement)
- Token mapping creation
- Metadata tracking
- HIPAA/GDPR compliance flags

### ⚠️ Partial

- Token storage (currently in-memory, not persistent)
- Output sanitization (optional, to catch any PHI that leaks through)

### ❌ Not Implemented

- Automatic rehydration
- Persistent token mapping storage
- Token expiry management
- Secure rehydration with access controls

## Why This Matters

**Current approach** (sanitize input only):

- ✅ Protects patient data from being sent to OpenAI
- ✅ AI never sees real PHI
- ❌ Response doesn't contain patient-specific information
- ❌ Less useful for medical records

**Ideal approach** (with rehydration):

- ✅ Protects PHI during API call
- ✅ Response is patient-specific and useful
- ✅ Maintains HIPAA compliance
- ⚠️ Requires careful token management
- ⚠️ Need to store mappings securely

## Next Steps

To implement full rehydration:

1. **Token Storage**: Replace in-memory Map with Redis or database
2. **Token Expiry**: Auto-delete mappings after use or time limit
3. **Rehydrate Function**: Add logic to replace tokens in response
4. **Security**: Encrypt token mappings, add access controls
5. **Audit**: Log all rehydration operations

## Current Behavior

Right now, the system:

- ✅ Strips PHI before sending to AI (protecting it)
- ✅ Shows what was detected
- ✅ Provides AI answer without PHI
- ❌ Does NOT rehydrate the response

This is a **safe, conservative approach** that prioritizes data protection.
