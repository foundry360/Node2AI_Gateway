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
        Patient__c patient = loadPatientChart(patientId);
        String notes = patient.Clinical_Notes__c;
        if (String.isBlank(notes)) {
            throw new EnigmaException('Clinical Notes are required before summarizing.');
        }

        List<String> parts = new List<String>();
        parts.add('Summarize the following patient chart for a clinician.');
        parts.add('Include demographics, active conditions, medications, allergies, and key follow-ups.');
        parts.add(
            'Use plain text only. Do not use markdown, bold markers, headings with #, bullets with *, or em dashes.'
        );
        parts.add('');
        parts.add(formatPatientChart(patient));
        // Enigma Config Default_Model + policy decide path (TOKENIZE / local / DENY).
        return completeChartRead(
            String.join(parts, '\n'),
            'sf-patient-' + String.valueOf(patient.Id)
        );
    }

    /**
     * Answer a clinician question using the patient chart via Enigma completions.
     * Salesforce supplies chart context only. Enigma governs the model call.
     */
    public static CompletionResult answerPatientQuestion(Id patientId, String question) {
        if (patientId == null || String.isBlank(question)) {
            throw new EnigmaException('Patient and question are required.');
        }
        Patient__c patient = loadPatientChart(patientId);
        List<String> parts = new List<String>();
        parts.add(
            'You are a clinical copilot assisting a clinician with one patient chart.'
        );
        parts.add(
            'Answer using only the chart facts below. Be concise and clinically useful.'
        );
        parts.add(
            'If a value appears as {{TOK_...}}, that field is present — answer with the exact token. Do not invent values.'
        );
        parts.add(
            'Answer questions about the chart only. Do not claim you updated the chart.'
        );
        parts.add('');
        parts.add('=== Clinician question ===');
        parts.add(question.trim());
        parts.add('');
        parts.add(formatPatientChart(patient));
        return completeChartRead(
            String.join(parts, '\n'),
            'sf-patient-qa-' + String.valueOf(patient.Id)
        );
    }

    /**
     * Ask the configured Enigma model to interpret a Clinical Copilot utterance.
     * Salesforce does not phrase-match intents — the model classifies; Enigma still
     * governs the completion and any subsequent write Decision.
     */
    public class CopilotIntent {
        public Boolean success;
        public String intent; // summarize | field_update | clinical_note | prescription_update | question | multi
        public String fieldApi;
        public String fieldValue;
        public String noteBody;
        public String medicationName;
        public String frequency;
        public String prescriptionStatus;
        public String requestId;
        public String message;
        public String rawBody;
        public List<CopilotAction> actions;
    }

    public class CopilotAction {
        public String kind; // field_update | clinical_note | prescription_update
        public String fieldApi;
        public String fieldValue;
        public String noteBody;
        public String medicationName;
        public String frequency;
        public String prescriptionStatus;
    }

    public static CopilotIntent interpretCopilotIntent(String utterance) {
        CopilotIntent out = new CopilotIntent();
        if (String.isBlank(utterance)) {
            out.success = false;
            out.intent = 'question';
            out.message = 'Utterance is required.';
            return out;
        }

        String prompt =
            'You are the Clinical Copilot intent interpreter for a patient chart UI.\n' +
            'Classify the clinician utterance. Return JSON only (no markdown, no prose).\n' +
            'Schema:\n' +
            '{\n' +
            '  "intent": "summarize" | "field_update" | "clinical_note" | "prescription_update" | "question" | "multi",\n' +
            '  "field_api": string|null,\n' +
            '  "field_value": string|null,\n' +
            '  "note_body": string|null,\n' +
            '  "medication_name": string|null,\n' +
            '  "frequency": string|null,\n' +
            '  "prescription_status": "Active"|"Completed"|"Discontinued"|null,\n' +
            '  "actions": [{"kind":"field_update"|"clinical_note"|"prescription_update","field_api":string|null,"field_value":string|null,"note_body":string|null,"medication_name":string|null,"frequency":string|null,"prescription_status":string|null}]|null\n' +
            '}\n' +
            'Rules:\n' +
            '- summarize: chart summary / overview requests.\n' +
            '- field_update: set ONE demographic/admin Patient field ONLY. field_api MUST be an exact ' +
            'API name from this list (never invent medication/aspirin fields): ' +
            'Phone__c, Email__c, Date_of_Birth__c, Gender__c, Weight_lb__c, Height_in__c, ' +
            'Allergies__c, Patient_Status__c, Primary_Care_Provider__c, Preferred_Language__c, ' +
            'City__c, State__c, Street__c, Postal_Code__c, Emergency_Contact_Name__c, ' +
            'Emergency_Contact_Phone__c, Primary_Diagnosis__c. field_value is the new value.\n' +
            '  Patient-level only: "change the patient status to Active" → Patient_Status__c / Active.\n' +
            '- prescription_update: change a medication on the Prescription chart ' +
            '(frequency and/or prescription Status). medication_name is the drug name. ' +
            'frequency examples: "Twice daily", "Once daily". prescription_status: Active|Completed|Discontinued.\n' +
            '  "Update aspirin to twice daily and make it Active" →\n' +
            '  {"intent":"prescription_update","medication_name":"Aspirin","frequency":"Twice daily","prescription_status":"Active"}\n' +
            '  Do NOT use clinical_note or Patient_Status__c for medication dosing/status.\n' +
            '- clinical_note: symptoms, assessments, narrative documentation that is NOT a ' +
            'structured prescription or Patient field change.\n' +
            '- multi: MORE THAN ONE distinct change types (e.g. Patient field AND a note). ' +
            'Medication dosing+status alone is prescription_update, not multi.\n' +
            '- question: ask about chart facts without changing the record.\n\n' +
            'Utterance:\n' +
            utterance.trim();

        CompleteRequest req = new CompleteRequest();
        req.content = prompt;
        req.correlationId =
            'sf-copilot-intent-' + String.valueOf(Datetime.now().getTime());
        req.purpose = 'treatment';
        req.operation = 'summarize';
        CompletionResult r = completeWithOptions(req);
        out.requestId = r.requestId;
        out.rawBody = r.summary;
        if (!r.success || String.isBlank(r.summary)) {
            out.success = false;
            out.intent = 'question';
            out.message = String.isNotBlank(r.message)
                ? r.message
                : 'Enigma could not interpret the request.';
            return out;
        }

        Map<String, Object> parsed = parseModelJsonObject(r.summary);
        if (parsed == null) {
            out.success = false;
            out.intent = 'question';
            out.message = 'Intent response was not valid JSON.';
            return out;
        }

        String intent = String.valueOf(parsed.get('intent'));
        if (String.isBlank(intent)) {
            intent = 'question';
        }
        intent = intent.trim().toLowerCase();
        if (
            intent != 'summarize' &&
            intent != 'field_update' &&
            intent != 'clinical_note' &&
            intent != 'prescription_update' &&
            intent != 'question' &&
            intent != 'multi'
        ) {
            intent = 'question';
        }

        out.success = true;
        out.intent = intent;
        out.fieldApi = stringOrNull(parsed.get('field_api'));
        out.fieldValue = stringOrNull(parsed.get('field_value'));
        out.noteBody = stringOrNull(parsed.get('note_body'));
        out.medicationName = stringOrNull(parsed.get('medication_name'));
        out.frequency = stringOrNull(parsed.get('frequency'));
        out.prescriptionStatus = stringOrNull(parsed.get('prescription_status'));
        out.actions = parseCopilotActions(parsed.get('actions'));
        if (intent == 'multi' && (out.actions == null || out.actions.isEmpty())) {
            out.actions = new List<CopilotAction>();
            if (String.isNotBlank(out.fieldApi) && String.isNotBlank(out.fieldValue)) {
                CopilotAction a = new CopilotAction();
                a.kind = 'field_update';
                a.fieldApi = out.fieldApi;
                a.fieldValue = out.fieldValue;
                out.actions.add(a);
            }
            if (
                String.isNotBlank(out.medicationName) &&
                (String.isNotBlank(out.frequency) ||
                    String.isNotBlank(out.prescriptionStatus))
            ) {
                CopilotAction a = new CopilotAction();
                a.kind = 'prescription_update';
                a.medicationName = out.medicationName;
                a.frequency = out.frequency;
                a.prescriptionStatus = out.prescriptionStatus;
                out.actions.add(a);
            }
            if (String.isNotBlank(out.noteBody)) {
                CopilotAction a = new CopilotAction();
                a.kind = 'clinical_note';
                a.noteBody = out.noteBody;
                out.actions.add(a);
            }
            if (out.actions.isEmpty()) {
                intent = 'clinical_note';
                out.intent = intent;
                out.noteBody = utterance.trim();
            }
        }
        if (intent == 'clinical_note' && String.isBlank(out.noteBody)) {
            out.noteBody = utterance.trim();
        }
        return out;
    }

    private static List<CopilotAction> parseCopilotActions(Object raw) {
        if (!(raw instanceof List<Object>)) {
            return null;
        }
        List<CopilotAction> out = new List<CopilotAction>();
        for (Object item : (List<Object>) raw) {
            if (!(item instanceof Map<String, Object>)) {
                continue;
            }
            Map<String, Object> m = (Map<String, Object>) item;
            CopilotAction a = new CopilotAction();
            a.kind = stringOrNull(m.get('kind'));
            if (String.isBlank(a.kind)) {
                continue;
            }
            a.kind = a.kind.trim().toLowerCase();
            a.fieldApi = stringOrNull(m.get('field_api'));
            a.fieldValue = stringOrNull(m.get('field_value'));
            a.noteBody = stringOrNull(m.get('note_body'));
            a.medicationName = stringOrNull(m.get('medication_name'));
            a.frequency = stringOrNull(m.get('frequency'));
            a.prescriptionStatus = stringOrNull(m.get('prescription_status'));
            out.add(a);
        }
        return out.isEmpty() ? null : out;
    }

    private static String stringOrNull(Object value) {
        if (value == null) {
            return null;
        }
        String s = String.valueOf(value).trim();
        if (String.isBlank(s) || s == 'null') {
            return null;
        }
        return s;
    }

    private static Map<String, Object> parseModelJsonObject(String raw) {
        if (String.isBlank(raw)) {
            return null;
        }
        String s = raw.trim();
        if (s.startsWith('```')) {
            s = s.replaceFirst('(?s)^```(?:json)?\\s*', '');
            s = s.replaceFirst('(?s)\\s*```\\s*$', '');
            s = s.trim();
        }
        Integer start = s.indexOf('{');
        Integer last = s.lastIndexOf('}');
        if (start < 0 || last <= start) {
            return null;
        }
        s = s.substring(start, last + 1);
        try {
            Object decoded = JSON.deserializeUntyped(s);
            if (decoded instanceof Map<String, Object>) {
                return (Map<String, Object>) decoded;
            }
        } catch (Exception e) {
            return null;
        }
        return null;
    }

    /**
     * Patient chart summarize / Q&A — uses Enigma Config default model.
     * External-processing attestation is attached automatically for non-local models.
     */
    private static CompletionResult completeChartRead(
        String userContent,
        String correlationId
    ) {
        CompleteRequest req = new CompleteRequest();
        req.content = userContent;
        req.correlationId = correlationId;
        req.purpose = 'treatment';
        // model + external auth: leave null → Config Default_Model + auto attestation
        return completeWithOptions(req);
    }

    private static Patient__c loadPatientChart(Id patientId) {
        return [
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
    }

    private static String formatPatientChart(Patient__c patient) {
        List<String> parts = new List<String>();
        parts.add('=== Demographics ===');
        parts.add('Name: ' + displayName(patient));
        parts.add('MRN: ' + nullToEmpty(patient.MRN__c));
        parts.add(
            'Date of Birth: ' +
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
        parts.add(
            String.isBlank(patient.Primary_Diagnosis__c) ? 'None documented' : patient.Primary_Diagnosis__c
        );
        parts.add(
            'Last visit date (exact): ' +
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
        parts.add(
            String.isBlank(patient.Clinical_Notes__c)
                ? 'None documented'
                : patient.Clinical_Notes__c
        );
        return String.join(parts, '\n');
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
     * Salesforce supplies request fields only. Enigma decides policy.
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
         * Authorization context for EPA (e.g. authorized / unauthorized).
         * null → default "authorized" for clinical demo completions.
         */
        public String authorizationContext;
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
            : cfg.Default_Model__c;
        if (String.isBlank(modelName)) {
            throw new EnigmaException(
                'Enigma Config is missing Default Model. Set Custom Settings → Enigma Config.'
            );
        }
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

        // Clinical demo defaults to authorized; scenarios may override.
        String authz = String.isNotBlank(opts.authorizationContext)
            ? opts.authorizationContext
            : 'authorized';
        body.put('authorization_context', authz);

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
                    result.summary = stripMarkdown(
                        (String) messageObj.get('content')
                    );
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

    /**
     * Live client: Agent Id comes only from Enigma Config (Custom Setting).
     * Must match an Enigma-registered Agent ID bound to this Application.
     */
    public static String requireConfiguredAgentId() {
        return requireAgentId(requireConfig());
    }

    private static String requireAgentId(Enigma_Config__c cfg) {
        if (String.isNotBlank(cfg.Agent_Id__c)) {
            return cfg.Agent_Id__c.trim();
        }
        throw new EnigmaException(
            'Enigma Config is missing Agent Id. Set Custom Settings → Enigma Config → Agent Id to the Enigma-registered Agent ID (Agents page), then retry.'
        );
    }

    public static ChangeEvalResult getAgentBaseline() {
        Enigma_Config__c cfg = requireConfig();
        String agentId = requireAgentId(cfg);
        String adminKey = requireAdminKey(cfg);
        String base = cfg.Endpoint_URL__c.removeEnd('/');
        String endpoint =
            base +
            '/v1/admin/governance/baselines?target_id=' +
            EncodingUtil.urlEncode(agentId, 'UTF-8') +
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
            'target_id' => requireAgentId(cfg),
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

    /**
     * Result of a patient write that must pass Enigma change governance first.
     * Callers never "enable write" as a user step. Enigma decides.
     */
    public class GovernedWriteResult {
        @AuraEnabled public Boolean success;
        /** COMPLETED | HELD | ERROR | AUTHORIZED */
        @AuraEnabled public String status;
        @AuraEnabled public String message;
        @AuraEnabled public String evaluationId;
        @AuraEnabled public String requestId;
        /** Stable id for one downstream DML attempt (reported with Outcome). */
        @AuraEnabled public String executionId;
        @AuraEnabled public String changeId;
        @AuraEnabled public String materiality;
        @AuraEnabled public String lifecycleDecision;
        @AuraEnabled public Boolean writeCapability;
        @AuraEnabled public String clinicalNotes;
        @AuraEnabled public String updatedField;
        @AuraEnabled public String updatedValue;
        /** Client-reported Outcome status when sent to Enigma. */
        @AuraEnabled public String outcomeStatus;
    }

    /**
     * Append a clinical note only when Enigma approves this write Decision.
     * Each note creates its own Decision — prior write approvals are not a blank check.
     * If held for REVIEW, Authorize in Enigma then retry the same note to commit.
     */
    public static GovernedWriteResult appendClinicalNoteGoverned(
        Id patientId,
        String noteText,
        String userAsk
    ) {
        return appendClinicalNoteGoverned(patientId, noteText, userAsk, null);
    }

    public static GovernedWriteResult appendClinicalNoteGoverned(
        Id patientId,
        String noteText,
        String userAsk,
        String resumeEvaluationId
    ) {
        GovernedWriteResult out = new GovernedWriteResult();
        if (patientId == null || String.isBlank(noteText)) {
            out.success = false;
            out.status = 'ERROR';
            out.message = 'patientId and noteText are required.';
            return out;
        }

        String prompt = String.isNotBlank(userAsk)
            ? userAsk.trim()
            : 'Add a clinical note: ' + noteText.trim();

        Patient__c patient = [
            SELECT Id, Name, MRN__c, Date_of_Birth__c
            FROM Patient__c
            WHERE Id = :patientId
            LIMIT 1
        ];

        String content =
            'Agent write: append clinical note.\n' +
            'Patient: ' +
            patient.Name +
            '\nMRN: ' +
            (patient.MRN__c != null ? patient.MRN__c : '') +
            '\nDOB: ' +
            (patient.Date_of_Birth__c != null
                ? String.valueOf(patient.Date_of_Birth__c)
                : '') +
            '\nPrompt: ' +
            prompt;
        // Note body stays in action.attributes only — keeps Prompt-stable content for
        // resume / duplicate-hold matching when the model rephrases noteText.

        GovernedWriteResult gate = evaluateWriteAction(
            content,
            'update_clinical_notes',
            'clinical_note',
            String.valueOf(patientId),
            new Map<String, Object>{ 'note' => noteText.trim() },
            resumeEvaluationId
        );
        if (gate.status != 'AUTHORIZED') {
            return gate;
        }

        String executionId = newExecutionId();
        try {
            Clinical_Note__c note = new Clinical_Note__c(
                Patient__c = patientId,
                Body__c = noteText.trim(),
                Source__c = 'Agent',
                Noted_At__c = Datetime.now()
            );
            insert note;
            String notesText = rebuildClinicalNotesBlob(patientId);

            out.success = true;
            out.status = 'COMPLETED';
            out.evaluationId = gate.evaluationId;
            out.requestId = gate.requestId;
            out.executionId = executionId;
            out.writeCapability = true;
            out.clinicalNotes = notesText;
            out.message = 'Clinical note saved.';
            out.outcomeStatus = reportWriteOutcome(
                gate,
                executionId,
                'EXECUTED',
                'update_clinical_notes',
                'clinical_note',
                String.valueOf(patientId)
            );
            return out;
        } catch (Exception e) {
            out.success = false;
            out.status = 'ERROR';
            out.evaluationId = gate.evaluationId;
            out.requestId = gate.requestId;
            out.executionId = executionId;
            out.message = e.getMessage();
            out.outcomeStatus = reportWriteOutcome(
                gate,
                executionId,
                'EXECUTION_FAILED',
                'update_clinical_notes',
                'clinical_note',
                String.valueOf(patientId)
            );
            return out;
        }
    }

    /**
     * Keep Patient.Clinical_Notes__c as a readable rollup for summarize/legacy paths.
     */
    public static String rebuildClinicalNotesBlob(Id patientId) {
        List<String> parts = new List<String>();
        for (Clinical_Note__c n : [
            SELECT Body__c, Source__c, Noted_At__c, CreatedDate
            FROM Clinical_Note__c
            WHERE Patient__c = :patientId
            ORDER BY Noted_At__c ASC NULLS LAST, CreatedDate ASC
        ]) {
            Datetime whenAt = n.Noted_At__c != null ? n.Noted_At__c : n.CreatedDate;
            String stamp = whenAt == null
                ? ''
                : whenAt.formatGmt('yyyy-MM-dd HH:mm') + ' UTC';
            String source = String.isBlank(n.Source__c) ? 'Note' : n.Source__c;
            if (String.isBlank(n.Body__c)) {
                continue;
            }
            parts.add('[' + source + ' ' + stamp + '] ' + n.Body__c.trim());
        }
        String notesText = String.join(parts, '\n\n');
        update new Patient__c(Id = patientId, Clinical_Notes__c = notesText);
        return notesText;
    }

    /**
     * Update a simple Patient field under a per-write Enigma Decision.
     */
    public static GovernedWriteResult updatePatientFieldGoverned(
        Id patientId,
        String fieldApiName,
        String fieldValue,
        String userAsk
    ) {
        return updatePatientFieldGoverned(
            patientId,
            fieldApiName,
            fieldValue,
            userAsk,
            null
        );
    }

    public static GovernedWriteResult updatePatientFieldGoverned(
        Id patientId,
        String fieldApiName,
        String fieldValue,
        String userAsk,
        String resumeEvaluationId
    ) {
        GovernedWriteResult out = new GovernedWriteResult();
        if (patientId == null || String.isBlank(fieldApiName)) {
            out.success = false;
            out.status = 'ERROR';
            out.message = 'patientId and fieldApiName are required.';
            return out;
        }

        String field = fieldApiName.trim();
        Set<String> allowed = new Set<String>{
            'Phone__c',
            'Email__c',
            'Preferred_Language__c',
            'Primary_Care_Provider__c',
            'Emergency_Contact_Name__c',
            'Emergency_Contact_Phone__c',
            'Emergency_Contact_Relation__c',
            'Allergies__c',
            'Patient_Status__c',
            'Street__c',
            'City__c',
            'State__c',
            'Postal_Code__c',
            'Primary_Diagnosis__c',
            'Weight_lb__c',
            'Height_in__c',
            'Date_of_Birth__c',
            'Gender__c'
        };
        if (!allowed.contains(field)) {
            out.success = false;
            out.status = 'ERROR';
            out.message = 'Field is not allowed for agent update: ' + field;
            return out;
        }

        String prompt = String.isNotBlank(userAsk)
            ? userAsk.trim()
            : 'Update patient ' + field + ' to ' + String.valueOf(fieldValue);

        Patient__c patient = [
            SELECT Id, Name, MRN__c, Date_of_Birth__c
            FROM Patient__c
            WHERE Id = :patientId
            LIMIT 1
        ];

        String content =
            'Agent write: update patient field.\n' +
            'Patient: ' +
            patient.Name +
            '\nMRN: ' +
            (patient.MRN__c != null ? patient.MRN__c : '') +
            '\nDOB: ' +
            (patient.Date_of_Birth__c != null
                ? String.valueOf(patient.Date_of_Birth__c)
                : '') +
            '\nField: ' +
            field +
            '\nValue: ' +
            String.valueOf(fieldValue) +
            '\nPrompt: ' +
            prompt;

        GovernedWriteResult gate = evaluateWriteAction(
            content,
            'update_patient_field',
            'field_update',
            String.valueOf(patientId),
            new Map<String, Object>{
                'field' => field,
                'value' => fieldValue
            },
            resumeEvaluationId
        );
        if (gate.status != 'AUTHORIZED') {
            return gate;
        }

        String executionId = newExecutionId();
        try {
            Patient__c toUpdate = new Patient__c(Id = patientId);
            if (field == 'Weight_lb__c' || field == 'Height_in__c') {
                String numeric = fieldValue == null
                    ? null
                    : fieldValue.replaceAll('[^0-9.\\-]', '').trim();
                if (String.isBlank(numeric)) {
                    out.success = false;
                    out.status = 'ERROR';
                    out.evaluationId = gate.evaluationId;
                    out.requestId = gate.requestId;
                    out.executionId = executionId;
                    out.message = 'A numeric value is required for ' + field + '.';
                    out.outcomeStatus = reportWriteOutcome(
                        gate,
                        executionId,
                        'EXECUTION_FAILED',
                        'update_patient_field',
                        'field_update',
                        String.valueOf(patientId)
                    );
                    return out;
                }
                toUpdate.put(field, Decimal.valueOf(numeric));
            } else if (field == 'Date_of_Birth__c') {
                Date parsed = parseFlexibleDate(fieldValue);
                if (parsed == null) {
                    out.success = false;
                    out.status = 'ERROR';
                    out.evaluationId = gate.evaluationId;
                    out.requestId = gate.requestId;
                    out.executionId = executionId;
                    out.message =
                        'Could not parse date of birth. Use MM/DD/YYYY or YYYY-MM-DD.';
                    out.outcomeStatus = reportWriteOutcome(
                        gate,
                        executionId,
                        'EXECUTION_FAILED',
                        'update_patient_field',
                        'field_update',
                        String.valueOf(patientId)
                    );
                    return out;
                }
                toUpdate.Date_of_Birth__c = parsed;
            } else {
                toUpdate.put(field, fieldValue);
            }
            update toUpdate;

            out.success = true;
            out.status = 'COMPLETED';
            out.evaluationId = gate.evaluationId;
            out.requestId = gate.requestId;
            out.executionId = executionId;
            out.writeCapability = true;
            out.updatedField = field;
            out.updatedValue = fieldValue;
            out.message = 'Updated ' + field + '.';
            out.outcomeStatus = reportWriteOutcome(
                gate,
                executionId,
                'EXECUTED',
                'update_patient_field',
                'field_update',
                String.valueOf(patientId)
            );
            return out;
        } catch (Exception e) {
            out.success = false;
            out.status = 'ERROR';
            out.evaluationId = gate.evaluationId;
            out.requestId = gate.requestId;
            out.executionId = executionId;
            out.message = e.getMessage();
            // Callout after DML is not possible in the same transaction; when
            // the client cannot determine completion (e.g. lost response), use
            // EXECUTION_UNKNOWN. Known Apex DML exceptions are EXECUTION_FAILED.
            out.outcomeStatus = reportWriteOutcome(
                gate,
                executionId,
                'EXECUTION_FAILED',
                'update_patient_field',
                'field_update',
                String.valueOf(patientId)
            );
            return out;
        }
    }

    /**
     * Update a patient Prescription__c (frequency / status) under a per-write Enigma Decision.
     */
    public static GovernedWriteResult updatePrescriptionGoverned(
        Id patientId,
        String medicationName,
        String frequency,
        String prescriptionStatus,
        String userAsk,
        String resumeEvaluationId
    ) {
        GovernedWriteResult out = new GovernedWriteResult();
        if (patientId == null || String.isBlank(medicationName)) {
            out.success = false;
            out.status = 'ERROR';
            out.message = 'patientId and medicationName are required.';
            return out;
        }
        if (String.isBlank(frequency) && String.isBlank(prescriptionStatus)) {
            out.success = false;
            out.status = 'ERROR';
            out.message = 'Provide a frequency and/or prescription status to update.';
            return out;
        }

        Set<String> allowedStatus = new Set<String>{
            'Active',
            'Completed',
            'Discontinued'
        };
        String statusVal = null;
        if (String.isNotBlank(prescriptionStatus)) {
            statusVal = prescriptionStatus.trim();
            // Normalize common casing
            for (String s : allowedStatus) {
                if (s.equalsIgnoreCase(statusVal)) {
                    statusVal = s;
                    break;
                }
            }
            if (!allowedStatus.contains(statusVal)) {
                out.success = false;
                out.status = 'ERROR';
                out.message =
                    'Prescription status must be Active, Completed, or Discontinued.';
                return out;
            }
        }

        String med = medicationName.trim();
        List<Prescription__c> matches = [
            SELECT Id, Name, Frequency__c, Status__c, Dosage__c
            FROM Prescription__c
            WHERE Patient__c = :patientId
            ORDER BY Name
        ];
        Prescription__c rx = null;
        String medLower = med.toLowerCase();
        for (Prescription__c row : matches) {
            if (row.Name != null && row.Name.trim().toLowerCase() == medLower) {
                rx = row;
                break;
            }
        }
        if (rx == null) {
            for (Prescription__c row : matches) {
                if (
                    row.Name != null &&
                    row.Name.trim().toLowerCase().contains(medLower)
                ) {
                    rx = row;
                    break;
                }
            }
        }
        if (rx == null) {
            out.success = false;
            out.status = 'ERROR';
            out.message = 'No prescription named "' + med + '" found on this chart.';
            return out;
        }

        String freqVal = String.isNotBlank(frequency) ? frequency.trim() : null;
        String prompt = String.isNotBlank(userAsk)
            ? userAsk.trim()
            : 'Update prescription ' +
              rx.Name +
              (freqVal != null ? ' frequency to ' + freqVal : '') +
              (statusVal != null ? ' status to ' + statusVal : '');

        Patient__c patient = [
            SELECT Id, Name, MRN__c, Date_of_Birth__c
            FROM Patient__c
            WHERE Id = :patientId
            LIMIT 1
        ];

        String content =
            'Agent write: update prescription.\n' +
            'Patient: ' +
            patient.Name +
            '\nMRN: ' +
            (patient.MRN__c != null ? patient.MRN__c : '') +
            '\nDOB: ' +
            (patient.Date_of_Birth__c != null
                ? String.valueOf(patient.Date_of_Birth__c)
                : '') +
            '\nMedication: ' +
            rx.Name +
            '\nPrescriptionId: ' +
            String.valueOf(rx.Id) +
            (freqVal != null ? '\nFrequency: ' + freqVal : '') +
            (statusVal != null ? '\nStatus: ' + statusVal : '') +
            '\nPrompt: ' +
            prompt;

        Map<String, Object> attrs = new Map<String, Object>{
            'medication' => rx.Name,
            'prescription_id' => String.valueOf(rx.Id)
        };
        if (freqVal != null) {
            attrs.put('frequency', freqVal);
        }
        if (statusVal != null) {
            attrs.put('status', statusVal);
        }

        GovernedWriteResult gate = evaluateWriteAction(
            content,
            'update_prescription',
            'prescription_update',
            String.valueOf(rx.Id),
            attrs,
            resumeEvaluationId
        );
        if (gate.status != 'AUTHORIZED') {
            return gate;
        }

        String executionId = newExecutionId();
        try {
            Prescription__c toUpdate = new Prescription__c(Id = rx.Id);
            if (freqVal != null) {
                toUpdate.Frequency__c = freqVal;
            }
            if (statusVal != null) {
                toUpdate.Status__c = statusVal;
                if (statusVal == 'Active') {
                    toUpdate.End_Date__c = null;
                }
            }
            update toUpdate;

            out.success = true;
            out.status = 'COMPLETED';
            out.evaluationId = gate.evaluationId;
            out.requestId = gate.requestId;
            out.executionId = executionId;
            out.writeCapability = true;
            out.updatedField = rx.Name;
            out.updatedValue =
                (freqVal != null ? 'frequency=' + freqVal : '') +
                (freqVal != null && statusVal != null ? ', ' : '') +
                (statusVal != null ? 'status=' + statusVal : '');
            out.message =
                'Updated ' +
                rx.Name +
                (freqVal != null ? ' to ' + freqVal : '') +
                (statusVal != null
                    ? (freqVal != null ? ' and set status to ' : ' status to ') +
                      statusVal
                    : '') +
                '.';
            out.outcomeStatus = reportWriteOutcome(
                gate,
                executionId,
                'EXECUTED',
                'update_prescription',
                'prescription_update',
                String.valueOf(rx.Id)
            );
            return out;
        } catch (Exception e) {
            out.success = false;
            out.status = 'ERROR';
            out.evaluationId = gate.evaluationId;
            out.requestId = gate.requestId;
            out.executionId = executionId;
            out.message = e.getMessage();
            out.outcomeStatus = reportWriteOutcome(
                gate,
                executionId,
                'EXECUTION_FAILED',
                'update_prescription',
                'prescription_update',
                String.valueOf(rx.Id)
            );
            return out;
        }
    }

    private static Date parseFlexibleDate(String raw) {
        if (String.isBlank(raw)) {
            return null;
        }
        String s = raw.trim().replaceAll('[.,;]+$', '').trim();
        // MM/DD/YYYY or M/D/YYYY
        if (s.contains('/')) {
            List<String> parts = s.split('/');
            if (parts.size() == 3) {
                try {
                    Integer month = Integer.valueOf(parts[0].trim());
                    Integer day = Integer.valueOf(parts[1].trim());
                    Integer year = Integer.valueOf(parts[2].trim());
                    return Date.newInstance(year, month, day);
                } catch (Exception ignore) {
                    return null;
                }
            }
        }
        // YYYY-MM-DD
        try {
            return Date.valueOf(s);
        } catch (Exception ignore) {
            return null;
        }
    }

    /**
     * Evaluate a single agent write through Enigma. Always creates a Decision.
     * Returns AUTHORIZED when the client may commit DML, HELD when REVIEW, else ERROR.
     * Same content after AUTHORIZE is claimed (resume) without a new Decision.
     */
    public static GovernedWriteResult evaluateWriteAction(
        String content,
        String toolId,
        String actionKind,
        String targetId,
        Map<String, Object> actionAttributes
    ) {
        return evaluateWriteAction(
            content,
            toolId,
            actionKind,
            targetId,
            actionAttributes,
            null
        );
    }

    public static GovernedWriteResult evaluateWriteAction(
        String content,
        String toolId,
        String actionKind,
        String targetId,
        Map<String, Object> actionAttributes,
        String resumeEvaluationId
    ) {
        GovernedWriteResult out = new GovernedWriteResult();
        Enigma_Config__c cfg = requireConfig();
        String apiKey = cfg.Api_Key__c;
        if (String.isBlank(apiKey)) {
            out.success = false;
            out.status = 'ERROR';
            out.message = 'Enigma Config is missing API Key.';
            return out;
        }
        String applicationId = cfg.Application_Id__c;
        if (String.isBlank(applicationId)) {
            out.success = false;
            out.status = 'ERROR';
            out.message = 'Enigma Config is missing Application Id.';
            return out;
        }

        String base = cfg.Endpoint_URL__c.removeEnd('/');
        String endpoint = base + '/v1/ai/actions';
        String modelName = cfg.Default_Model__c;
        if (String.isBlank(modelName)) {
            out.success = false;
            out.status = 'ERROR';
            out.message = 'Enigma Config is missing Default Model.';
            return out;
        }

        Map<String, Object> action = new Map<String, Object>{
            'kind' => actionKind
        };
        if (String.isNotBlank(targetId)) {
            action.put('target_id', targetId);
        }
        if (actionAttributes != null && !actionAttributes.isEmpty()) {
            action.put('attributes', actionAttributes);
        }

        Map<String, Object> governanceContext = new Map<String, Object>{
            'tool_authorized' => true,
            'agent_authorized' => true
        };
        if (!modelName.startsWith('local-')) {
            governanceContext.put(
                'sensitive_data_processing',
                new Map<String, Object>{
                    'external_processing_authorized' => true
                }
            );
        }

        Map<String, Object> body = new Map<String, Object>{
            'application_id' => applicationId,
            'user' => new Map<String, Object>{ 'id' => 'user_clinician' },
            'operation' => 'write',
            'model' => modelName,
            'messages' => new List<Object>{
                new Map<String, Object>{ 'role' => 'user', 'content' => content }
            },
            'purpose' => 'treatment',
            'authorization_context' => 'authorized',
            'agent_id' => requireAgentId(cfg),
            'tool_id' => toolId,
            'governance_context' => governanceContext,
            'action' => action,
            'regulatory_applicability' => new List<Object>{ 'HIPAA' },
            'metadata' => new Map<String, Object>{
                'correlation_id' =>
                    'sf-write-' + String.valueOf(Datetime.now().getTime()),
                'salesforce_user_id' => UserInfo.getUserId()
            }
        };
        if (String.isNotBlank(resumeEvaluationId)) {
            body.put('resume_evaluation_id', resumeEvaluationId.trim());
        }

        HttpRequest req = new HttpRequest();
        req.setEndpoint(endpoint);
        req.setMethod('POST');
        req.setHeader('Content-Type', 'application/json');
        req.setHeader('Authorization', 'Bearer ' + apiKey);
        req.setTimeout(120000);
        req.setBody(JSON.serialize(body));

        HttpResponse res = new Http().send(req);
        Map<String, Object> parsed = parseJsonMap(res.getBody());
        out.evaluationId = (String) parsed.get('evaluation_id');
        if (String.isBlank(out.evaluationId) && String.isNotBlank(resumeEvaluationId)) {
            out.evaluationId = resumeEvaluationId.trim();
        }
        out.requestId = (String) parsed.get('request_id');
        out.lifecycleDecision = (String) parsed.get('machine_decision');

        if (
            res.getStatusCode() >= 200 &&
            res.getStatusCode() < 300 &&
            (String) parsed.get('status') == 'approved' &&
            (String) parsed.get('action') == 'commit_allowed'
        ) {
            out.success = true;
            out.status = 'AUTHORIZED';
            out.message = 'Enigma authorized this write.';
            return out;
        }

        // Explicit resume before Authorize — do not open a second Decision.
        if (String.isNotBlank(resumeEvaluationId)) {
            out.success = false;
            out.status = 'HELD';
            String reason = (String) parsed.get('reason_code');
            out.message =
                'Still waiting on human authorization for decision ' +
                resumeEvaluationId.trim() +
                (String.isNotBlank(reason) ? ' (' + reason + ')' : '') +
                '. Authorize it in Enigma Decisions, then send the same request again.';
            return out;
        }

        Boolean safetyHold = parsed.get('safety_hold') == true;
        String machine = String.isBlank(out.lifecycleDecision)
            ? ''
            : out.lifecycleDecision.toUpperCase();
        if (
            safetyHold ||
            machine == 'REVIEW' ||
            machine == 'REQUIRE_APPROVAL'
        ) {
            out.success = false;
            out.status = 'HELD';
            out.message =
                'Enigma is holding this write for human authorization' +
                (String.isNotBlank(out.evaluationId)
                    ? ' (decision ' + out.evaluationId + ')'
                    : '') +
                '. Authorize it in Enigma Decisions, then send the same request again to finish.';
            return out;
        }

        out.success = false;
        out.status = 'ERROR';
        String reason = (String) parsed.get('reason_code');
        if (String.isBlank(reason) && parsed.get('reason_codes') instanceof List<Object>) {
            List<Object> codes = (List<Object>) parsed.get('reason_codes');
            if (!codes.isEmpty()) {
                reason = String.valueOf(codes[0]);
            }
        }
        if (machine == 'DENY' || machine == 'BLOCK' || machine == 'BLOCK_OUTPUT') {
            out.message =
                'Enigma blocked this write' +
                (String.isNotBlank(out.evaluationId)
                    ? ' (decision ' + out.evaluationId + ')'
                    : '') +
                (String.isNotBlank(reason) ? ': ' + reason : '.') +
                ' This is a deny, not a human-review hold.';
            return out;
        }
        out.message =
            'Enigma blocked this write (HTTP ' +
            res.getStatusCode() +
            ')' +
            (String.isNotBlank(reason) ? ': ' + reason : '.');
        return out;
    }

    private static String newExecutionId() {
        return 'exec_' +
            String.valueOf(Crypto.getRandomLong()).replace('-', '') +
            String.valueOf(Datetime.now().getTime());
    }

    /**
     * Report client-reported execution Outcome to Enigma.
     * After DML, callouts must be async (Salesforce mixed DML/callout rule).
     * Retries must reuse the same executionId.
     *
     * Outcome semantics:
     * - EXECUTED: client observed successful DML
     * - EXECUTION_FAILED: client observed failure
     * - EXECUTION_UNKNOWN: client cannot determine whether DML completed
     *
     * Enigma records what the client reports; it does not independently verify Salesforce.
     */
    public static String reportWriteOutcome(
        GovernedWriteResult gate,
        String executionId,
        String outcome,
        String toolId,
        String actionKind,
        String targetId
    ) {
        if (gate == null || String.isBlank(gate.evaluationId) || String.isBlank(executionId)) {
            return null;
        }
        try {
            System.enqueueJob(
                new OutcomeReportQueueable(
                    gate.evaluationId,
                    gate.requestId,
                    executionId,
                    outcome,
                    toolId,
                    actionKind,
                    targetId
                )
            );
            return outcome + '_QUEUED';
        } catch (Exception e) {
            // Best-effort: do not fail the local write because Outcome reporting failed.
            return outcome + '_QUEUE_FAILED';
        }
    }

    /**
     * Async Outcome report so DML and Enigma callout are not in the same transaction.
     */
    public class OutcomeReportQueueable implements Queueable, Database.AllowsCallouts {
        private String evaluationId;
        private String requestId;
        private String executionId;
        private String outcome;
        private String toolId;
        private String actionKind;
        private String targetId;

        public OutcomeReportQueueable(
            String evaluationId,
            String requestId,
            String executionId,
            String outcome,
            String toolId,
            String actionKind,
            String targetId
        ) {
            this.evaluationId = evaluationId;
            this.requestId = requestId;
            this.executionId = executionId;
            this.outcome = outcome;
            this.toolId = toolId;
            this.actionKind = actionKind;
            this.targetId = targetId;
        }

        public void execute(QueueableContext ctx) {
            postOutcomeReceipt(
                evaluationId,
                requestId,
                executionId,
                outcome,
                toolId,
                actionKind,
                targetId
            );
        }
    }

    /**
     * POST /v1/ai/actions/outcome — idempotent on execution_id.
     * On transient failure, callers may retry with the same execution_id.
     */
    public static Boolean postOutcomeReceipt(
        String evaluationId,
        String requestId,
        String executionId,
        String outcome,
        String toolId,
        String actionKind,
        String targetId
    ) {
        Enigma_Config__c cfg = requireConfig();
        String apiKey = cfg.Api_Key__c;
        String applicationId = cfg.Application_Id__c;
        if (String.isBlank(apiKey) || String.isBlank(applicationId)) {
            return false;
        }
        String base = cfg.Endpoint_URL__c.removeEnd('/');
        String endpoint = base + '/v1/ai/actions/outcome';

        Map<String, Object> action = new Map<String, Object>{
            'kind' => actionKind
        };
        if (String.isNotBlank(targetId)) {
            action.put('target_id', targetId);
        }

        Map<String, Object> body = new Map<String, Object>{
            'application_id' => applicationId,
            'evaluation_id' => evaluationId,
            'execution_id' => executionId,
            'outcome' => outcome,
            'user' => new Map<String, Object>{ 'id' => 'user_clinician' },
            'request_id' => requestId,
            'agent_id' => requireAgentId(cfg),
            'tool_id' => toolId,
            'operation' => 'write',
            'action' => action,
            'metadata' => new Map<String, Object>{
                'correlation_id' =>
                    'sf-outcome-' + String.valueOf(Datetime.now().getTime()),
                'salesforce_user_id' => UserInfo.getUserId()
            }
        };

        HttpRequest req = new HttpRequest();
        req.setEndpoint(endpoint);
        req.setMethod('POST');
        req.setHeader('Content-Type', 'application/json');
        req.setHeader('Authorization', 'Bearer ' + apiKey);
        req.setTimeout(60000);
        req.setBody(JSON.serialize(body));

        HttpResponse res = new Http().send(req);
        // 200 accepted/idempotent; treat as success. 409 conflict is not retried here.
        return res.getStatusCode() >= 200 && res.getStatusCode() < 300;
    }

    /**
     * @deprecated Prefer evaluateWriteAction — capability enablement is not a
     * blank check for subsequent writes. Kept for baseline diagnostics only.
     */
    public static GovernedWriteResult ensureWriteAuthorized(
        String userAsk,
        String rationale,
        String intendedOutcome
    ) {
        GovernedWriteResult out = new GovernedWriteResult();
        ChangeEvalResult baseline = getAgentBaseline();
        if (!baseline.success) {
            out.success = false;
            out.status = 'ERROR';
            out.message = String.isNotBlank(baseline.message)
                ? baseline.message
                : 'Could not load Enigma agent baseline.';
            return out;
        }
        out.writeCapability = baseline.writeCapability == true;
        if (baseline.writeCapability == true) {
            out.success = true;
            out.status = 'AUTHORIZED';
            out.message = 'Write capability is already authorized.';
            return out;
        }

        ChangeEvalResult eval = evaluateEnableWrite(
            userAsk,
            rationale,
            intendedOutcome,
            null
        );
        out.evaluationId = eval.evaluationId;
        out.requestId = eval.requestId;
        out.changeId = eval.changeId;
        out.materiality = eval.materiality;
        out.lifecycleDecision = eval.lifecycleDecision;
        out.writeCapability = false;

        if (!eval.success) {
            out.success = false;
            out.status = 'ERROR';
            out.message = String.isNotBlank(eval.message)
                ? eval.message
                : 'Enigma could not evaluate this write.';
            return out;
        }

        if (isHeldForHumanReview(eval)) {
            out.success = false;
            out.status = 'HELD';
            out.message =
                'Enigma is holding this change for human authorization' +
                (String.isNotBlank(eval.evaluationId)
                    ? ' (decision ' + eval.evaluationId + ')'
                    : '') +
                '. Authorize it in Enigma, then ask me again to complete the update.';
            return out;
        }

        ChangeEvalResult again = getAgentBaseline();
        if (again.success && again.writeCapability == true) {
            out.success = true;
            out.status = 'AUTHORIZED';
            out.writeCapability = true;
            out.message = 'Write capability authorized.';
            return out;
        }

        out.success = false;
        out.status = 'HELD';
        out.message =
            'Enigma has not authorized write capability yet. Authorize the held decision, then retry.';
        return out;
    }

    private static Boolean isHeldForHumanReview(ChangeEvalResult eval) {
        String life = String.isBlank(eval.lifecycleDecision)
            ? ''
            : eval.lifecycleDecision.toUpperCase();
        String policy = String.isBlank(eval.policyDecision)
            ? ''
            : eval.policyDecision.toUpperCase();
        // Human review only when policy/lifecycle explicitly requires it -
        // not merely because the action is a write.
        if (
            life == 'MANDATORY_REVIEW' ||
            life.contains('HOLD') ||
            policy == 'REVIEW' ||
            policy == 'REQUIRE_APPROVAL' ||
            policy == 'HOLD'
        ) {
            return true;
        }
        return false;
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

    /**
     * Remove common markdown / typographic markers from model output for chart UI.
     */
    private static String stripMarkdown(String raw) {
        if (String.isBlank(raw)) {
            return raw;
        }
        String s = raw;
        // Bold / italic markers
        s = s.replace('**', '');
        s = s.replace('__', '');
        // Inline code
        s = s.replace('`', '');
        // Em / en dashes → hyphen or comma-friendly separator
        s = s.replace('—', ', ');
        s = s.replace('–', '-');
        // ATX headings
        s = s.replaceAll('(?m)^#{1,6}\\s*', '');
        // Horizontal rules
        s = s.replaceAll('(?m)^\\s*([-*_])\\1{2,}\\s*$', '');
        // Unordered list markers at line start
        s = s.replaceAll('(?m)^\\s*[-*•]\\s+', '');
        // Ordered list markers "1. "
        s = s.replaceAll('(?m)^\\s*\\d+\\.\\s+', '');
        // Links [text](url) → text
        s = s.replaceAll('\\[([^\\]]+)\\]\\([^)]+\\)', '$1');
        // Leftover single * used for emphasis pairs (best-effort)
        s = s.replaceAll('\\*([^*]+)\\*', '$1');
        // Collapse excess blank lines
        s = s.replaceAll('\\n{3,}', '\n\n');
        return s.trim();
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
