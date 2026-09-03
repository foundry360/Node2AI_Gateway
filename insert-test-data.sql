-- Insert test data for Control Center
-- Run this after the tables are created

-- Ensure the default organization exists
INSERT INTO organizations (id, name) 
VALUES ('00000000-0000-0000-0000-000000000001', 'Default Organization')
ON CONFLICT (id) DO NOTHING;

-- Insert test usage events
INSERT INTO usage_events (
    organization_id,
    provider,
    model,
    endpoint,
    tokens_input,
    tokens_output,
    total_tokens,
    cost,
    latency_ms,
    status,
    data_sanitized,
    sanitization_count,
    pii_detected,
    phi_detected,
    request_id,
    timestamp
) VALUES 
    ('00000000-0000-0000-0000-000000000001', 'openai', 'gpt-4', '/v1/chat/completions', 100, 50, 150, 0.003, 1200, 'success', true, 5, false, true, 'req-001', NOW()),
    ('00000000-0000-0000-0000-000000000001', 'openai', 'gpt-4', '/v1/chat/completions', 150, 75, 225, 0.0045, 1350, 'success', true, 3, true, false, 'req-002', NOW() - INTERVAL '1 minute'),
    ('00000000-0000-0000-0000-000000000001', 'anthropic', 'claude-3', '/v1/messages', 200, 100, 300, 0.006, 1100, 'success', false, 0, false, false, 'req-003', NOW() - INTERVAL '2 minutes'),
    ('00000000-0000-0000-0000-000000000001', 'google', 'gemini', '/v1/models/gemini-pro:generateContent', 80, 40, 120, 0.002, 950, 'success', true, 2, false, false, 'req-004', NOW() - INTERVAL '5 minutes'),
    ('00000000-0000-0000-0000-000000000001', 'openai', 'gpt-4', '/v1/chat/completions', 120, 60, 180, 0.0036, 1450, 'failed', false, 0, false, false, 'req-005', NOW() - INTERVAL '10 minutes');

-- Add more data points for better visualization
INSERT INTO usage_events (
    organization_id,
    provider,
    model,
    endpoint,
    tokens_input,
    tokens_output,
    total_tokens,
    cost,
    latency_ms,
    status,
    data_sanitized,
    sanitization_count,
    request_id,
    timestamp
)
SELECT
    '00000000-0000-0000-0000-000000000001' as organization_id,
    (ARRAY['openai', 'anthropic', 'google'])[floor(random() * 3 + 1)]::text as provider,
    (ARRAY['gpt-4', 'claude-3', 'gemini'])[floor(random() * 3 + 1)]::text as model,
    '/v1/chat/completions' as endpoint,
    80 + floor(random() * 150)::int as tokens_input,
    40 + floor(random() * 100)::int as tokens_output,
    120 + floor(random() * 250)::int as total_tokens,
    (random() * 0.01)::decimal as cost,
    800 + floor(random() * 1000)::int as latency_ms,
    (ARRAY['success', 'success', 'success', 'failed'])[floor(random() * 4 + 1)]::text as status,
    (random() > 0.5) as data_sanitized,
    floor(random() * 10)::int as sanitization_count,
    'req-' || generate_series as request_id,
    NOW() - (random() * INTERVAL '60 minutes')
FROM generate_series(100, 150);

-- Success message
SELECT 'Test data inserted successfully! 🎉' as status, COUNT(*) as total_events FROM usage_events WHERE organization_id = '00000000-0000-0000-0000-000000000001';

