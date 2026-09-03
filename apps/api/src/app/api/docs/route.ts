import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const swaggerDocument = {
    openapi: '3.0.0',
    info: {
      title: 'Node2AI API',
      description:
        'Enterprise AI orchestration platform with data sanitization for regulated industries',
      version: '1.0.0',
      contact: {
        name: 'Node2AI Support',
        email: 'support@node2.ai',
      },
      license: {
        name: 'Proprietary',
        url: 'https://node2.ai/license',
      },
    },
    servers: [
      {
        url: process.env.API_BASE_URL || 'http://localhost:3001',
        description: 'Development server',
      },
    ],
    paths: {
      '/health': {
        get: {
          summary: 'Health Check',
          description: 'Check the health status of the API',
          responses: {
            '200': {
              description: 'Health status',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      success: { type: 'boolean' },
                      data: {
                        type: 'object',
                        properties: {
                          status: {
                            type: 'string',
                            enum: ['healthy', 'degraded', 'unhealthy'],
                          },
                          checks: {
                            type: 'array',
                            items: {
                              type: 'object',
                              properties: {
                                name: { type: 'string' },
                                status: {
                                  type: 'string',
                                  enum: ['pass', 'fail', 'warn'],
                                },
                                message: { type: 'string' },
                                duration: { type: 'number' },
                              },
                            },
                          },
                          lastChecked: { type: 'string', format: 'date-time' },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      '/auth/login': {
        post: {
          summary: 'User Login',
          description: 'Authenticate user with email and password',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['email', 'password'],
                  properties: {
                    email: { type: 'string', format: 'email' },
                    password: { type: 'string' },
                    rememberMe: { type: 'boolean' },
                  },
                },
              },
            },
          },
          responses: {
            '200': {
              description: 'Login successful',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      success: { type: 'boolean' },
                      data: {
                        type: 'object',
                        properties: {
                          user: { $ref: '#/components/schemas/User' },
                          token: { type: 'string' },
                          refreshToken: { type: 'string' },
                          expiresIn: { type: 'number' },
                        },
                      },
                    },
                  },
                },
              },
            },
            '401': {
              description: 'Authentication failed',
            },
          },
        },
      },
      '/sanitization/sanitize': {
        post: {
          summary: 'Sanitize Data',
          description: 'Sanitize sensitive data using proprietary engine',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['input'],
                  properties: {
                    input: { type: 'string' },
                    options: {
                      type: 'object',
                      properties: {
                        categories: {
                          type: 'array',
                          items: { type: 'string' },
                          enum: [
                            'pii',
                            'phi',
                            'financial',
                            'government',
                            'custom',
                          ],
                        },
                        severity: {
                          type: 'array',
                          items: { type: 'string' },
                          enum: ['low', 'medium', 'high', 'critical'],
                        },
                        strictMode: { type: 'boolean' },
                        preserveFormat: { type: 'boolean' },
                        customRules: {
                          type: 'array',
                          items: { type: 'string' },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          responses: {
            '200': {
              description: 'Sanitization successful',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      success: { type: 'boolean' },
                      data: {
                        type: 'object',
                        properties: {
                          original: { type: 'string' },
                          sanitized: { type: 'string' },
                          rulesApplied: {
                            type: 'array',
                            items: {
                              type: 'object',
                              properties: {
                                ruleId: { type: 'string' },
                                ruleName: { type: 'string' },
                                category: { type: 'string' },
                                severity: { type: 'string' },
                                matches: { type: 'number' },
                              },
                            },
                          },
                          confidence: { type: 'number' },
                          warnings: {
                            type: 'array',
                            items: { type: 'string' },
                          },
                          metadata: {
                            type: 'object',
                            properties: {
                              processingTime: { type: 'number' },
                              totalMatches: { type: 'number' },
                              categoriesFound: {
                                type: 'array',
                                items: { type: 'string' },
                              },
                              severityLevels: {
                                type: 'array',
                                items: { type: 'string' },
                              },
                              riskScore: { type: 'number' },
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    components: {
      schemas: {
        User: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            email: { type: 'string', format: 'email' },
            name: { type: 'string' },
            role: {
              type: 'string',
              enum: ['admin', 'operator', 'viewer', 'auditor'],
            },
            permissions: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  resource: { type: 'string' },
                  actions: {
                    type: 'array',
                    items: { type: 'string' },
                  },
                },
              },
            },
            tenantId: { type: 'string', nullable: true },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
            lastLoginAt: {
              type: 'string',
              format: 'date-time',
              nullable: true,
            },
            isActive: { type: 'boolean' },
          },
        },
      },
      securitySchemes: {
        BearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
        ApiKeyAuth: {
          type: 'apiKey',
          in: 'header',
          name: 'X-API-Key',
        },
      },
    },
    security: [
      {
        BearerAuth: [],
      },
      {
        ApiKeyAuth: [],
      },
    ],
  };

  return NextResponse.json(swaggerDocument);
}
