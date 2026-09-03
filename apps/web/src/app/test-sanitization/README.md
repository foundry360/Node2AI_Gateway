# Sanitization Test Page

This page provides a user-friendly interface to test the PHI/PII sanitization and AI orchestration features.

## 🎯 Purpose

The sanitization test page allows you to:

- Enter prompts containing sensitive data (SSN, emails, phone numbers, etc.)
- Send them to the AI API with sanitization enabled
- View the sanitization results and metadata
- See which entities were detected and sanitized
- View compliance flags and risk assessments

## 🚀 How to Use

1. **Access the page**: Navigate to `/test-sanitization` in the sidebar
2. **Use quick examples**: Click on any of the example prompts to populate the form
3. **Or enter custom text**: Type your own prompt with sensitive data
4. **Click "Test Sanitization"**: Sends the request to the API
5. **View results**: See the sanitization metadata, detected entities, and AI response

## 📊 What You'll See

### Sanitization Metadata

- **Input Sanitized**: Whether the input was sanitized
- **Output Sanitized**: Whether the AI response was sanitized
- **Input/Output Risk Level**: Risk assessment (none, low, medium, high, critical)
- **Detected Entities**: List of sensitive data types found (SSN, PHONE, EMAIL, etc.)
- **Compliance Flags**: HIPAA, GDPR, or SOX compliance warnings

### Side-by-Side Comparison

- **Original Input**: Your original prompt with sensitive data
- **AI Response**: The sanitized AI response

### Request Details

- Provider used
- Latency
- Cost

## 🧪 Example Prompts

The page includes four pre-built examples:

1. **PHI Example**: Contains medical record information
2. **PII Example**: Contains personally identifiable information
3. **Financial Data**: Contains banking and financial information
4. **Government Data**: Contains passport and visa information

## 📝 Notes

- Sanitization is enabled by default on all requests
- The page uses the `/api/v1/chat/completions` endpoint
- All detection categories (PII, PHI, Financial, Government) are enabled
- Audit level is set to "COMPREHENSIVE" for detailed logging
- Responses are sanitized before being displayed

## 🔍 Tips for Testing

1. **Test various data types**: Try different combinations of sensitive data
2. **Check metadata**: Look at the compliance flags and risk levels
3. **Compare outputs**: See how different prompts affect sanitization
4. **Test edge cases**: Try unusual formats or edge cases

## ⚠️ Important

This is a TEST page. Do not enter real production data or actual patient information. Use test data only.
