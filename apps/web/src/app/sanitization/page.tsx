'use client';

import { useState } from 'react';
import {
  ShieldCheckIcon,
  ExclamationTriangleIcon,
} from '@heroicons/react/24/outline';

export default function SanitizationPage() {
  const [input, setInput] = useState('');
  const [output, setOutput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [results, setResults] = useState<any>(null);

  const handleSanitize = async () => {
    if (!input.trim()) return;

    setIsProcessing(true);
    try {
      const response = await fetch('/api/sanitization/sanitize', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          input,
          options: {
            categories: ['pii', 'phi', 'financial', 'government'],
            severity: ['high', 'critical'],
            strictMode: true,
            preserveFormat: true,
          },
        }),
      });

      const data = await response.json();
      if (data.success) {
        setOutput(data.data.sanitized);
        setResults(data.data);
      } else {
        console.error('Sanitization failed:', data.error);
      }
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow">
        <div className="mx-auto w-full max-w-[95%] px-4 sm:px-6 lg:px-8 xl:max-w-[98%]">
          <div className="flex items-center justify-between py-6">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                Data Sanitization
              </h1>
              <p className="mt-1 text-sm text-gray-500">
                Sanitize sensitive data using proprietary engine
              </p>
            </div>
            <div className="flex items-center space-x-4">
              <span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800">
                <ShieldCheckIcon className="mr-1 h-3 w-3" />
                Engine Active
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="mx-auto w-full max-w-[95%] px-4 pb-6 pt-2 sm:px-6 lg:px-8 xl:max-w-[98%]">
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
          {/* Input Section */}
          <div className="card">
            <div className="card-header">
              <h3 className="card-title">Input Text</h3>
              <p className="card-description">
                Enter text containing sensitive data to sanitize
              </p>
            </div>
            <div className="card-content">
              <textarea
                value={input}
                onChange={e => setInput(e.target.value)}
                placeholder="Enter text with sensitive data (SSN, email, phone, etc.)..."
                className="focus:ring-primary-500 focus:border-primary-500 h-64 w-full resize-none rounded-md border border-gray-300 p-3 focus:ring-2"
              />
              <div className="mt-4 flex justify-end">
                <button
                  onClick={handleSanitize}
                  disabled={!input.trim() || isProcessing}
                  className="btn btn-primary"
                >
                  {isProcessing ? 'Processing...' : 'Sanitize Data'}
                </button>
              </div>
            </div>
          </div>

          {/* Output Section */}
          <div className="card">
            <div className="card-header">
              <h3 className="card-title">Sanitized Output</h3>
              <p className="card-description">
                Sensitive data has been redacted and replaced
              </p>
            </div>
            <div className="card-content">
              <div className="h-64 w-full overflow-auto rounded-md border border-gray-300 bg-gray-50 p-3">
                {output ? (
                  <pre className="whitespace-pre-wrap text-sm text-gray-900">
                    {output}
                  </pre>
                ) : (
                  <p className="text-sm text-gray-500">
                    Sanitized output will appear here...
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Results Section */}
        {results && (
          <div className="mt-8">
            <div className="card">
              <div className="card-header">
                <h3 className="card-title">Sanitization Results</h3>
                <p className="card-description">
                  Detailed analysis of sanitization process
                </p>
              </div>
              <div className="card-content">
                <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
                  <div className="text-center">
                    <div className="text-primary-600 text-2xl font-bold">
                      {results.rulesApplied?.length || 0}
                    </div>
                    <div className="text-sm text-gray-500">Rules Applied</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-green-600">
                      {Math.round((results.confidence || 0) * 100)}%
                    </div>
                    <div className="text-sm text-gray-500">Confidence</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-orange-600">
                      {results.metadata?.riskScore || 0}
                    </div>
                    <div className="text-sm text-gray-500">Risk Score</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-blue-600">
                      {results.metadata?.processingTime || 0}ms
                    </div>
                    <div className="text-sm text-gray-500">Processing Time</div>
                  </div>
                </div>

                {results.rulesApplied && results.rulesApplied.length > 0 && (
                  <div className="mt-6">
                    <h4 className="mb-4 text-lg font-medium text-gray-900">
                      Applied Rules
                    </h4>
                    <div className="space-y-3">
                      {results.rulesApplied.map((rule: any, index: number) => (
                        <div
                          key={index}
                          className="flex items-center justify-between rounded-lg bg-gray-50 p-3"
                        >
                          <div className="flex items-center space-x-3">
                            <div className="flex-shrink-0">
                              <ExclamationTriangleIcon className="h-5 w-5 text-orange-500" />
                            </div>
                            <div>
                              <p className="text-sm font-medium text-gray-900">
                                {rule.ruleName}
                              </p>
                              <p className="text-xs text-gray-500">
                                {rule.category} • {rule.severity} •{' '}
                                {rule.matches} matches
                              </p>
                            </div>
                          </div>
                          <span
                            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                              rule.severity === 'critical'
                                ? 'bg-red-100 text-red-800'
                                : rule.severity === 'high'
                                  ? 'bg-orange-100 text-orange-800'
                                  : rule.severity === 'medium'
                                    ? 'bg-yellow-100 text-yellow-800'
                                    : 'bg-green-100 text-green-800'
                            }`}
                          >
                            {rule.severity}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {results.warnings && results.warnings.length > 0 && (
                  <div className="mt-6">
                    <h4 className="mb-4 text-lg font-medium text-gray-900">
                      Warnings
                    </h4>
                    <div className="space-y-2">
                      {results.warnings.map(
                        (warning: string, index: number) => (
                          <div
                            key={index}
                            className="flex items-center space-x-2 rounded border border-yellow-200 bg-yellow-50 p-2"
                          >
                            <ExclamationTriangleIcon className="h-4 w-4 text-yellow-600" />
                            <p className="text-sm text-yellow-800">{warning}</p>
                          </div>
                        )
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Example Data */}
        <div className="mt-8">
          <div className="card">
            <div className="card-header">
              <h3 className="card-title">Example Data</h3>
              <p className="card-description">
                Try these examples to test the sanitization engine
              </p>
            </div>
            <div className="card-content">
              <div className="space-y-4">
                <div>
                  <h4 className="mb-2 text-sm font-medium text-gray-900">
                    PII Example
                  </h4>
                  <button
                    onClick={() =>
                      setInput(`Patient: John Doe
SSN: 123-45-6789
Email: john.doe@example.com
Phone: (555) 123-4567
Address: 123 Main St, Anytown, NY 12345`)
                    }
                    className="text-primary-600 hover:text-primary-700 text-sm underline"
                  >
                    Load PII Example
                  </button>
                </div>
                <div>
                  <h4 className="mb-2 text-sm font-medium text-gray-900">
                    Financial Example
                  </h4>
                  <button
                    onClick={() =>
                      setInput(`Customer: Jane Smith
Credit Card: 4111 1111 1111 1111
Bank Account: 1234567890123456
Routing Number: 123456789
Tax ID: 12-3456789`)
                    }
                    className="text-primary-600 hover:text-primary-700 text-sm underline"
                  >
                    Load Financial Example
                  </button>
                </div>
                <div>
                  <h4 className="mb-2 text-sm font-medium text-gray-900">
                    Healthcare Example
                  </h4>
                  <button
                    onClick={() =>
                      setInput(`Patient: Robert Johnson
MRN: 123456789
DOB: 01/15/1980
Diagnosis: F32.9 (Depression)
Insurance ID: INS123456789`)
                    }
                    className="text-primary-600 hover:text-primary-700 text-sm underline"
                  >
                    Load Healthcare Example
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
