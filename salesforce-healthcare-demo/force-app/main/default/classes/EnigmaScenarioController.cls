/**
 * Scenario lab for Enigma governance demos.
 * Salesforce only supplies request fields. Enigma remains the decision authority.
 */
public with sharing class EnigmaScenarioController {
    public class ScenarioDef {
        @AuraEnabled public String id;
        @AuraEnabled public String title;
        @AuraEnabled public String description;
        @AuraEnabled public String expected;
        @AuraEnabled public String model;
        @AuraEnabled public String purpose;
        @AuraEnabled public Boolean includeExternalAuth;
        @AuraEnabled public String contentPreview;
    }

    public class ScenarioRunResult {
        @AuraEnabled public Boolean success;
        @AuraEnabled public String scenarioId;
        @AuraEnabled public String title;
        @AuraEnabled public String expected;
        @AuraEnabled public String status;
        @AuraEnabled public String reasonCode;
        @AuraEnabled public String message;
        @AuraEnabled public String requestId;
        @AuraEnabled public String summary;
        @AuraEnabled public String modelUsed;
        @AuraEnabled public Boolean matchedExpectation;
        @AuraEnabled public String policyDecision;
        @AuraEnabled public String inputTransformation;
        @AuraEnabled public String tokenizedInput;
        @AuraEnabled public String tokenizedOutput;
    }

    @AuraEnabled(cacheable=true)
    public static List<ScenarioDef> listScenarios() {
        List<ScenarioDef> out = new List<ScenarioDef>();
        out.add(
            def(
                'clean_internal',
                'Clean internal summary',
                'Non-sensitive text on the local model. No PHI/PII markers.',
                'approved (ALLOW)',
                'local-general-v1',
                null,
                false,
                'Summarize quarterly readiness: operations stable, no incidents.'
            )
        );
        out.add(
            def(
                'pii_tokenize',
                'PII → TOKENIZE',
                'Contact email + SSN-like content. Expect tokenization before model use.',
                'approved (TOKENIZE path)',
                'local-general-v1',
                null,
                false,
                'Contact jane.doe@example.com about account 123-45-6789 for billing follow-up.'
            )
        );
        out.add(
            def(
                'phi_cloud_deny',
                'PHI + cloud, no evidence → DENY',
                'Clinical PHI with public cloud and no external-processing attestation.',
                'blocked PHI_PUBLIC_CLOUD_BLOCKED',
                'cloud-public-gpt',
                'treatment',
                false,
                'Clinical note MRN: A1234567 patient presents with fever and cough.'
            )
        );
        out.add(
            def(
                'phi_cloud_tokenize',
                'PHI + cloud + evidence → TOKENIZE',
                'Evidence allows TOKENIZE→cloud. Output is governed independently - residual plaintext PHI is blocked.',
                'TOKENIZE input; then APPROVE or BLOCK residual PHI',
                'cloud-public-gpt',
                'treatment',
                true,
                'Clinical note MRN: A1234567 patient presents with fever and cough. Summarize clinical findings only; do not restate MRN or identifiers.'
            )
        );
        out.add(
            def(
                'phi_local',
                'PHI + local model',
                'Clinical PHI on an approved local model (no cloud attestation required).',
                'approved (local path)',
                'local-general-v1',
                'treatment',
                false,
                'Clinical note MRN: A1234567 patient presents with fever and cough.'
            )
        );
        out.add(
            def(
                'unauthorized_model',
                'Unauthorized model',
                'Request a model that is not on the application allowlist.',
                'blocked MODEL_NOT_ELIGIBLE',
                'cloud-restricted-unlisted',
                'treatment',
                false,
                'Summarize discharge instructions for outpatient follow-up.'
            )
        );
        return out;
    }

    @AuraEnabled
    public static ScenarioRunResult runScenario(String scenarioId) {
        if (String.isBlank(scenarioId)) {
            throw new AuraHandledException('scenarioId is required');
        }

        ScenarioDef matched;
        for (ScenarioDef s : listScenarios()) {
            if (s.id == scenarioId) {
                matched = s;
                break;
            }
        }
        if (matched == null) {
            throw new AuraHandledException('Unknown scenario: ' + scenarioId);
        }

        EnigmaGatewayService.CompleteRequest req = new EnigmaGatewayService.CompleteRequest();
        req.content = matched.contentPreview;
        req.correlationId = 'sf-scenario-' + matched.id;
        req.model = matched.model;
        req.purpose = matched.purpose;
        req.includeExternalAuth = matched.includeExternalAuth;
        req.operation = 'summarize';

        EnigmaGatewayService.CompletionResult raw;
        try {
            raw = EnigmaGatewayService.completeWithOptions(req);
        } catch (EnigmaGatewayService.EnigmaException e) {
            throw new AuraHandledException(e.getMessage());
        }

        ScenarioRunResult result = new ScenarioRunResult();
        result.scenarioId = matched.id;
        result.title = matched.title;
        result.expected = matched.expected;
        result.success = raw.success;
        result.status = raw.status;
        result.reasonCode = raw.reasonCode;
        result.message = raw.message;
        result.requestId = raw.requestId;
        result.summary = raw.summary;
        result.modelUsed = matched.model;
        result.policyDecision = raw.policyDecision;
        result.inputTransformation = raw.inputTransformation;
        result.tokenizedInput = raw.tokenizedInput;
        result.tokenizedOutput = raw.tokenizedOutput;
        result.matchedExpectation = expectationMet(matched.id, raw);
        if (raw.reasonCode == 'INVALID_RESPONSE' || raw.status == 'error') {
            result.matchedExpectation = false;
            if (String.isBlank(result.message)) {
                result.message = 'Callout failed (tunnel/network) - not a policy decision.';
            } else if (!result.message.contains('Callout') && !result.message.contains('tunnel')) {
                result.message = result.message + ' (callout/transport - not a policy miss)';
            }
        }
        return result;
    }

    private static ScenarioDef def(
        String id,
        String title,
        String description,
        String expected,
        String model,
        String purpose,
        Boolean includeExternalAuth,
        String contentPreview
    ) {
        ScenarioDef s = new ScenarioDef();
        s.id = id;
        s.title = title;
        s.description = description;
        s.expected = expected;
        s.model = model;
        s.purpose = purpose;
        s.includeExternalAuth = includeExternalAuth;
        s.contentPreview = contentPreview;
        return s;
    }

    private static Boolean expectationMet(
        String scenarioId,
        EnigmaGatewayService.CompletionResult raw
    ) {
        if (scenarioId == 'phi_cloud_deny') {
            return raw.status == 'blocked' && raw.reasonCode == 'PHI_PUBLIC_CLOUD_BLOCKED';
        }
        if (scenarioId == 'unauthorized_model') {
            return raw.status == 'blocked' && raw.reasonCode == 'MODEL_NOT_ELIGIBLE';
        }
        if (scenarioId == 'phi_cloud_tokenize') {
            // Controlled path: input TOKENIZE, then either release or block residual PHI.
            if (
                raw.success == true &&
                raw.status == 'approved' &&
                raw.inputTransformation == 'tokenize'
            ) {
                return true;
            }
            return (
                raw.status == 'blocked' &&
                (raw.reasonCode == 'HIPAA_PHI_OUTPUT_NOT_AUTHORIZED' ||
                    raw.reasonCode == 'RESPONSE_PHI_BLOCKED')
            );
        }
        // Remaining happy-path scenarios expect an approved release.
        return raw.success == true && raw.status == 'approved';
    }
}
