public with sharing class EnigmaGatewayService {
    public class EnigmaException extends Exception {
    }

    public class CompletionResult {
        @AuraEnabled public Boolean success;
        @AuraEnabled public String status;
        @AuraEnabled public String summary;
        @AuraEnabled public String requestId;
        @AuraEnabled public String reasonCode;
        @AuraEnabled public String message;
        @AuraEnabled public String rawBody;
        @AuraEnabled public String policyDecision;
        @AuraEnabled public String inputTransformation;
        @AuraEnabled public String responseTransformation;
        @AuraEnabled public String tokenizedInput;
        @AuraEnabled public String tokenizedOutput;
    }

    public static CompletionResult summarizePatient(Id patientId) {
        Patient__c patient = [
            SELECT
                Id,
                Name,
                First_Name__c,
                Last_Name__c,
                MRN__c,
                Date_of_Birth__c,
                Gender__c,
                Phone__c,
                Email__c,
                Street__c,
                City__c,
                State__c,
                Postal_Code__c,
                Preferred_Language__c,
                Primary_Care_Provider__c,
                Insurance_Plan__c,
                Member_Id__c,
                Blood_Type__c,
                Allergies__c,
                Emergency_Contact_Name__c,
                Emergency_Contact_Phone__c,
                Emergency_Contact_Relation__c,
                Patient_Status__c,
                Height_in__c,
                Weight_lb__c,
                Primary_Diagnosis__c,
                Clinical_Notes__c,
                Last_Visit_Date__c,
                (
                    SELECT Name, ICD10_Code__c, Status__c, Onset_Date__c, Notes__c
                    FROM PatientConditions__r
                    ORDER BY Status__c, Name
                ),
                (
                    SELECT
                        Name,
                        Dosage__c,
                        Frequency__c,
                        Route__c,
                        Prescriber__c,
                        Start_Date__c,
                        End_Date__c,
                        Status__c,
                        Instructions__c
                    FROM PatientPrescriptions__r
                    ORDER BY Status__c, Name
                )
            FROM Patient__c
            WHERE Id = :patientId
            LIMIT 1
        ];

        String notes = patient.Clinical_Notes__c;
        if (String.isBlank(notes)) {
            throw new EnigmaException('Clinical Notes are required before summarizing.');
        }

        List<String> parts = new List<String>();
        parts.add('Summarize the following patient chart for a clinician.');
        parts.add('Include demographics, active conditions, medications, allergies, and key follow-ups.');
        parts.add('');
        parts.add('=== Demographics ===');
        parts.add('Name: ' + displayName(patient));
        parts.add('MRN: ' + nullToEmpty(patient.MRN__c));
        parts.add(
            'DOB: ' +
                (patient.Date_of_Birth__c == null ? 'n/a' : String.valueOf(patient.Date_of_Birth__c))
        );
        parts.add('Gender: ' + nullToEmpty(patient.Gender__c));
        parts.add('Language: ' + nullToEmpty(patient.Preferred_Language__c));
        parts.add(
            'Address: ' +
                joinNonBlank(
                    new List<String>{
                        patient.Street__c,
                        patient.City__c,
                        patient.State__c,
                        patient.Postal_Code__c
                    },
                    ', '
                )
        );
        parts.add('Phone: ' + nullToEmpty(patient.Phone__c));
        parts.add('Email: ' + nullToEmpty(patient.Email__c));
        parts.add('PCP: ' + nullToEmpty(patient.Primary_Care_Provider__c));
        parts.add(
            'Insurance: ' +
                joinNonBlank(
                    new List<String>{ patient.Insurance_Plan__c, patient.Member_Id__c },
                    ' / '
                )
        );
        parts.add('Blood type: ' + nullToEmpty(patient.Blood_Type__c));
        parts.add(
            'Vitals: height ' +
                (patient.Height_in__c == null ? 'n/a' : String.valueOf(patient.Height_in__c) + ' in') +
                ', weight ' +
                (patient.Weight_lb__c == null ? 'n/a' : String.valueOf(patient.Weight_lb__c) + ' lb')
        );
        parts.add('Status: ' + nullToEmpty(patient.Patient_Status__c));
        parts.add(
            'Emergency contact: ' +
                joinNonBlank(
                    new List<String>{
                        patient.Emergency_Contact_Name__c,
                        patient.Emergency_Contact_Relation__c,
                        patient.Emergency_Contact_Phone__c
                    },
                    ' | '
                )
        );
        parts.add('');
        parts.add('=== Primary diagnosis ===');
        parts.add(nullToEmpty(patient.Primary_Diagnosis__c));
        parts.add(
            'Last visit: ' +
                (patient.Last_Visit_Date__c == null
                    ? 'n/a'
                    : String.valueOf(patient.Last_Visit_Date__c))
        );
        parts.add('');
        parts.add('=== Allergies ===');
        parts.add(String.isBlank(patient.Allergies__c) ? 'NKDA / none documented' : patient.Allergies__c);
        parts.add('');
        parts.add('=== Conditions ===');
        if (patient.PatientConditions__r.isEmpty()) {
            parts.add('None documented');
        } else {
            for (Condition__c c : patient.PatientConditions__r) {
                parts.add(
                    '- ' +
                        c.Name +
                        ' [' +
                        nullToEmpty(c.ICD10_Code__c) +
                        '] status=' +
                        nullToEmpty(c.Status__c) +
                        ' onset=' +
                        (c.Onset_Date__c == null ? 'n/a' : String.valueOf(c.Onset_Date__c)) +
                        (String.isBlank(c.Notes__c) ? '' : ' notes=' + c.Notes__c)
                );
            }
        }
        parts.add('');
        parts.add('=== Prescriptions ===');
        if (patient.PatientPrescriptions__r.isEmpty()) {
            parts.add('None documented');
        } else {
            for (Prescription__c rx : patient.PatientPrescriptions__r) {
                parts.add(
                    '- ' +
                        rx.Name +
                        ' ' +
                        nullToEmpty(rx.Dosage__c) +
                        ' ' +
                        nullToEmpty(rx.Frequency__c) +
                        ' route=' +
                        nullToEmpty(rx.Route__c) +
                        ' status=' +
                        nullToEmpty(rx.Status__c) +
                        ' prescriber=' +
                        nullToEmpty(rx.Prescriber__c) +
                        (String.isBlank(rx.Instructions__c) ? '' : ' instr=' + rx.Instructions__c)
                );
            }
        }
        parts.add('');
        parts.add('=== Clinical notes ===');
        parts.add(notes);

        return complete(
            String.join(parts, '\n'),
            'sf-patient-' + String.valueOf(patient.Id)
        );
    }

    public static CompletionResult complete(String userContent, String correlationId) {
        CompleteRequest req = new CompleteRequest();
        req.content = userContent;
        req.correlationId = correlationId;
        // Preserve patient-summary defaults: purpose + external attestation for non-local.
        req.purpose = 'treatment';
        req.includeExternalAuth = null; // auto from model
        return completeWithOptions(req);
    }

    /**
     * Flexible completion for scenario lab / integrations.
     * Salesforce supplies request fields only — Enigma decides policy.
     */
    public class CompleteRequest {
        public String content;
        public String correlationId;
        public String model; // null → Enigma Config default
        public String applicationId; // null → Enigma Config
        public String apiKey; // null → Enigma Config
        public String operation; // null → summarize
        public String purpose; // null → omit purpose field
        /**
         * null = auto (true when model is non-local);
         * true/false = force governance_context.sensitive_data_processing.external_processing_authorized
         * or omit when false.
         */
        public Boolean includeExternalAuth;
    }

    public static CompletionResult completeWithOptions(CompleteRequest opts) {
        if (opts == null || String.isBlank(opts.content)) {
            throw new EnigmaException('Request content is required.');
        }

        Enigma_Config__c cfg = Enigma_Config__c.getOrgDefaults();
        if (cfg == null || String.isBlank(cfg.Endpoint_URL__c)) {
            throw new EnigmaException(
                'Enigma Config is missing Endpoint URL. Set Custom Settings → Enigma Config.'
            );
        }

        String apiKey = String.isNotBlank(opts.apiKey) ? opts.apiKey : cfg.Api_Key__c;
        if (String.isBlank(apiKey)) {
            throw new EnigmaException(
                'Enigma Config is missing API Key. Set Custom Settings → Enigma Config.'
            );
        }

        String applicationId = String.isNotBlank(opts.applicationId)
            ? opts.applicationId
            : cfg.Application_Id__c;
        if (String.isBlank(applicationId)) {
            throw new EnigmaException(
                'Enigma Config is missing Application Id. Set Custom Settings → Enigma Config.'
            );
        }

        String modelName = String.isNotBlank(opts.model)
            ? opts.model
            : (String.isBlank(cfg.Default_Model__c) ? 'cloud-public-gpt' : cfg.Default_Model__c);
        String operation = String.isBlank(opts.operation) ? 'summarize' : opts.operation;
        String correlationId = String.isBlank(opts.correlationId)
            ? 'sf-' + String.valueOf(Datetime.now().getTime())
            : opts.correlationId;

        String base = cfg.Endpoint_URL__c.removeEnd('/');
        String endpoint = base + '/v1/ai/completions';

        Map<String, Object> body = new Map<String, Object>{
            'application_id' => applicationId,
            'user' => new Map<String, Object>{ 'id' => 'user_clinician' },
            'operation' => operation,
            'model' => modelName,
            'messages' => new List<Object>{
                new Map<String, Object>{ 'role' => 'user', 'content' => opts.content }
            },
            'metadata' => new Map<String, Object>{
                'correlation_id' => correlationId,
                'salesforce_user_id' => UserInfo.getUserId()
            }
        };

        if (String.isNotBlank(opts.purpose)) {
            body.put('purpose', opts.purpose);
        }

        Boolean attachExternalAuth = opts.includeExternalAuth;
        if (attachExternalAuth == null) {
            attachExternalAuth = modelName == null || !modelName.startsWith('local-');
        }
        if (attachExternalAuth == true) {
            body.put(
                'governance_context',
                new Map<String, Object>{
                    'sensitive_data_processing' => new Map<String, Object>{
                        'external_processing_authorized' => true
                    }
                }
            );
        }

        HttpRequest req = new HttpRequest();
        req.setEndpoint(endpoint);
        req.setMethod('POST');
        req.setHeader('Content-Type', 'application/json');
        req.setHeader('Authorization', 'Bearer ' + apiKey);
        req.setTimeout(120000);
        req.setBody(JSON.serialize(body));

        HttpResponse res = new Http().send(req);
        CompletionResult result = new CompletionResult();
        result.rawBody = res.getBody();

        Map<String, Object> parsed;
        try {
            parsed = (Map<String, Object>) JSON.deserializeUntyped(
                String.isBlank(res.getBody()) ? '{}' : res.getBody()
            );
        } catch (Exception e) {
            result.success = false;
            result.status = 'error';
            result.message = 'Invalid JSON from Enigma (HTTP ' + res.getStatusCode() + ').';
            result.reasonCode = 'INVALID_RESPONSE';
            return result;
        }

        result.requestId = (String) parsed.get('request_id');
        result.status = (String) parsed.get('status');
        result.reasonCode = (String) parsed.get('reason_code');
        result.message = (String) parsed.get('message');

        if (res.getStatusCode() >= 200 && res.getStatusCode() < 300 && result.status == 'approved') {
            Map<String, Object> responseObj = (Map<String, Object>) parsed.get('response');
            if (responseObj != null) {
                Map<String, Object> messageObj = (Map<String, Object>) responseObj.get('message');
                if (messageObj != null) {
                    result.summary = (String) messageObj.get('content');
                }
            }
            applyGovernance(result, parsed);
            result.success = String.isNotBlank(result.summary);
            if (!result.success) {
                result.message = 'Enigma returned approved with empty content.';
            }
            return result;
        }

        result.success = false;
        applyGovernance(result, parsed);
        if (String.isBlank(result.message)) {
            result.message =
                'Enigma blocked or failed the request (HTTP ' +
                res.getStatusCode() +
                ').';
        }
        return result;
    }

    public class ChangeEvalResult {
        @AuraEnabled public Boolean success;
        @AuraEnabled public String status;
        @AuraEnabled public String materiality;
        @AuraEnabled public String lifecycleDecision;
        @AuraEnabled public String evaluationId;
        @AuraEnabled public String changeId;
        @AuraEnabled public String requestId;
        @AuraEnabled public String policyDecision;
        @AuraEnabled public String reasonCodes;
        @AuraEnabled public String changeTypes;
        @AuraEnabled public String governanceImpacts;
        @AuraEnabled public String message;
        @AuraEnabled public String baselineId;
        @AuraEnabled public Boolean writeCapability;
        @AuraEnabled public String rawBody;
    }

    public static final String AGENT_TARGET_ID = 'agent_enigma_clinical';

    public static ChangeEvalResult getAgentBaseline() {
        Enigma_Config__c cfg = requireConfig();
        String adminKey = requireAdminKey(cfg);
        String base = cfg.Endpoint_URL__c.removeEnd('/');
        String endpoint =
            base +
            '/v1/admin/governance/baselines?target_id=' +
            EncodingUtil.urlEncode(AGENT_TARGET_ID, 'UTF-8') +
            '&target_type=application';

        HttpResponse res = adminGet(endpoint, adminKey);
        ChangeEvalResult out = new ChangeEvalResult();
        out.rawBody = res.getBody();
        Map<String, Object> parsed = parseJsonMap(res.getBody());
        if (res.getStatusCode() >= 200 && res.getStatusCode() < 300) {
            Map<String, Object> baseline = (Map<String, Object>) parsed.get('baseline');
            out.success = baseline != null;
            out.status = 'ok';
            if (baseline != null) {
                out.baselineId = (String) baseline.get('baseline_id');
                Map<String, Object> caps = (Map<String, Object>) baseline.get('capabilities');
                out.writeCapability =
                    caps != null && caps.get('write_capability') == true;
            }
            return out;
        }
        out.success = false;
        out.status = 'error';
        out.message =
            (String) parsed.get('message') != null
                ? (String) parsed.get('message')
                : 'Baseline fetch failed (HTTP ' + res.getStatusCode() + ').';
        return out;
    }

    public static ChangeEvalResult evaluateEnableWrite() {
        return evaluateEnableWrite(null, null, null, null);
    }

    public static ChangeEvalResult evaluateEnableWrite(
        String requesterPrompt,
        String agentRationale,
        String intendedOutcome,
        String summary
    ) {
        Enigma_Config__c cfg = requireConfig();
        String adminKey = requireAdminKey(cfg);
        ChangeEvalResult current = getAgentBaseline();
        if (!current.success || String.isBlank(current.baselineId)) {
            return current;
        }

        String promptText = String.isBlank(requesterPrompt)
            ? null
            : requesterPrompt.trim();
        String rationaleText = String.isBlank(agentRationale)
            ? 'Write capability is required to fulfill the user request after human authorization.'
            : agentRationale.trim();
        String outcomeText = String.isBlank(intendedOutcome)
            ? 'After human Authorize, write tools become available under the approved baseline so the user request can proceed.'
            : intendedOutcome.trim();
        String summaryText = String.isBlank(summary)
            ? (String.isBlank(promptText)
                ? 'Request to enable write capability.'
                : 'User asked the agent to: ' + promptText)
            : summary.trim();

        String base = cfg.Endpoint_URL__c.removeEnd('/');
        String endpoint = base + '/v1/admin/governance/changes/evaluate';
        Map<String, Object> reviewContext = new Map<String, Object>{
            'title' => 'Enable write capability',
            'summary' => summaryText,
            'rationale' => rationaleText,
            'intended_outcome' => outcomeText
        };
        // requester_prompt = the end-user business ask (send email, update case, add note…).
        // Never invent write-capability justification as a stand-in.
        if (!String.isBlank(promptText)) {
            reviewContext.put('requester_prompt', promptText);
            reviewContext.put(
                'conversation',
                new List<Object>{
                    new Map<String, Object>{
                        'role' => 'user',
                        'content' => promptText
                    },
                    new Map<String, Object>{
                        'role' => 'assistant',
                        'content' =>
                        'Submitting a governance change to Enigma for mandatory human review before write capability is enabled.\n\nRationale: ' +
                        rationaleText
                    }
                }
            );
        }

        Map<String, Object> body = new Map<String, Object>{
            'target_type' => 'application',
            'target_id' => AGENT_TARGET_ID,
            'previous_baseline_id' => current.baselineId,
            'request_id' => 'sf-agent-write-' + String.valueOf(Datetime.now().getTime()),
            'actor' => 'salesforce_healthcare_demo',
            'source' => 'salesforce_healthcare_demo',
            'application_id' => String.isBlank(cfg.Application_Id__c)
                ? 'app_clinical'
                : cfg.Application_Id__c,
            'proposed_state' => new Map<String, Object>{
                'write_capability' => true,
                'tools' => new List<Object>{
                    new Map<String, Object>{
                        'id' => 'summarize_patient',
                        'write' => false
                    },
                    new Map<String, Object>{
                        'id' => 'update_clinical_notes',
                        'write' => true
                    }
                }
            },
            'review_context' => reviewContext
        };

        HttpResponse res = adminPost(endpoint, adminKey, JSON.serialize(body));
        ChangeEvalResult out = new ChangeEvalResult();
        out.rawBody = res.getBody();
        Map<String, Object> parsed = parseJsonMap(res.getBody());
        out.baselineId = current.baselineId;
        out.writeCapability = current.writeCapability;

        if (res.getStatusCode() >= 200 && res.getStatusCode() < 300) {
            out.success = true;
            out.status = (String) parsed.get('status');
            out.materiality = (String) parsed.get('materiality');
            out.lifecycleDecision = (String) parsed.get('lifecycle_decision');
            out.evaluationId = (String) parsed.get('evaluation_id');
            out.changeId = (String) parsed.get('change_id');
            out.requestId = (String) parsed.get('request_id');
            out.changeTypes = joinStringList(parsed.get('change_types'));
            out.governanceImpacts = joinStringList(parsed.get('governance_impacts'));
            Map<String, Object> pd = (Map<String, Object>) parsed.get('policy_decision');
            if (pd != null) {
                out.policyDecision = String.valueOf(pd.get('decision'));
                out.reasonCodes = joinStringList(pd.get('reason_codes'));
                if (String.isBlank(out.evaluationId)) {
                    out.evaluationId = (String) pd.get('evaluation_id');
                }
            }
            out.message =
                'Write capability change evaluated as ' +
                out.materiality +
                ' / ' +
                out.lifecycleDecision;
            return out;
        }

        out.success = false;
        out.status = 'error';
        out.message =
            (String) parsed.get('message') != null
                ? (String) parsed.get('message')
                : 'Change evaluate failed (HTTP ' + res.getStatusCode() + ').';
        return out;
    }

    private static Enigma_Config__c requireConfig() {
        Enigma_Config__c cfg = Enigma_Config__c.getOrgDefaults();
        if (cfg == null || String.isBlank(cfg.Endpoint_URL__c)) {
            throw new EnigmaException(
                'Enigma Config is missing Endpoint URL. Set Custom Settings → Enigma Config.'
            );
        }
        return cfg;
    }

    private static String requireAdminKey(Enigma_Config__c cfg) {
        if (String.isBlank(cfg.Admin_Api_Key__c)) {
            throw new EnigmaException(
                'Enigma Config is missing Admin API Key (required for change governance).'
            );
        }
        return cfg.Admin_Api_Key__c;
    }

    private static HttpResponse adminGet(String endpoint, String adminKey) {
        HttpRequest req = new HttpRequest();
        req.setEndpoint(endpoint);
        req.setMethod('GET');
        req.setHeader('Authorization', 'Bearer ' + adminKey);
        req.setTimeout(60000);
        return new Http().send(req);
    }

    private static HttpResponse adminPost(
        String endpoint,
        String adminKey,
        String body
    ) {
        HttpRequest req = new HttpRequest();
        req.setEndpoint(endpoint);
        req.setMethod('POST');
        req.setHeader('Content-Type', 'application/json');
        req.setHeader('Authorization', 'Bearer ' + adminKey);
        req.setTimeout(120000);
        req.setBody(body);
        return new Http().send(req);
    }

    private static Map<String, Object> parseJsonMap(String raw) {
        try {
            return (Map<String, Object>) JSON.deserializeUntyped(
                String.isBlank(raw) ? '{}' : raw
            );
        } catch (Exception e) {
            return new Map<String, Object>();
        }
    }

    private static String joinStringList(Object raw) {
        if (raw == null) {
            return null;
        }
        if (!(raw instanceof List<Object>)) {
            return String.valueOf(raw);
        }
        List<String> parts = new List<String>();
        for (Object o : (List<Object>) raw) {
            if (o != null) {
                parts.add(String.valueOf(o));
            }
        }
        return String.join(parts, ', ');
    }

    private static void applyGovernance(
        CompletionResult result,
        Map<String, Object> parsed
    ) {
        Map<String, Object> gov = (Map<String, Object>) parsed.get('governance');
        if (gov == null) {
            return;
        }
        result.policyDecision = (String) gov.get('policy_decision');
        result.inputTransformation = (String) gov.get('input_transformation');
        Object responseXform = gov.get('response_transformation');
        if (responseXform == null) {
            responseXform = gov.get('response_decision');
        }
        result.responseTransformation = responseXform == null
            ? null
            : String.valueOf(responseXform);
        result.tokenizedInput = (String) gov.get('tokenized_input');
        result.tokenizedOutput = (String) gov.get('tokenized_output');
    }

    private static String displayName(Patient__c patient) {
        String composed = joinNonBlank(
            new List<String>{ patient.First_Name__c, patient.Last_Name__c },
            ' '
        );
        return String.isBlank(composed) ? nullToEmpty(patient.Name) : composed;
    }

    private static String nullToEmpty(String value) {
        return value == null ? '' : value;
    }

    private static String joinNonBlank(List<String> values, String sep) {
        List<String> kept = new List<String>();
        for (String value : values) {
            if (!String.isBlank(value)) {
                kept.add(value);
            }
        }
        return String.join(kept, sep);
    }
}
