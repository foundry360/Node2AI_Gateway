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
        return complete(
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
            'Answer the clinician question using only the chart facts below. Be concise and clinically useful.'
        );
        parts.add(
            'Demographics in the chart (including DOB) are authoritative. Never say a listed field is missing.'
        );
        parts.add(
            'You cannot update chart fields in this path. If the clinician asks to change a field, state the current chart value and tell them to use a clear update phrase such as "update date of birth to MM/DD/YYYY".'
        );
        parts.add(
            'If the chart truly does not contain the answer, say what is missing. Do not invent facts.'
        );
        parts.add('');
        parts.add('=== Clinician question ===');
        parts.add(question.trim());
        parts.add('');
        parts.add(formatPatientChart(patient));
        return complete(
            String.join(parts, '\n'),
            'sf-patient-qa-' + String.valueOf(patient.Id)
        );
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
        parts.add(
            String.isBlank(patient.Primary_Diagnosis__c) ? 'None documented' : patient.Primary_Diagnosis__c
        );
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

    /**
     * Result of a patient write that must pass Enigma change governance first.
     * Callers never "enable write" as a user step. Enigma decides.
     */
    public class GovernedWriteResult {
        @AuraEnabled public Boolean success;
        /** COMPLETED | HELD | ERROR */
        @AuraEnabled public String status;
        @AuraEnabled public String message;
        @AuraEnabled public String evaluationId;
        @AuraEnabled public String requestId;
        @AuraEnabled public String changeId;
        @AuraEnabled public String materiality;
        @AuraEnabled public String lifecycleDecision;
        @AuraEnabled public Boolean writeCapability;
        @AuraEnabled public String clinicalNotes;
        @AuraEnabled public String updatedField;
        @AuraEnabled public String updatedValue;
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
            prompt +
            '\nNote:\n' +
            noteText.trim();

        GovernedWriteResult gate = evaluateWriteAction(
            content,
            'update_clinical_notes',
            'clinical_note',
            String.valueOf(patientId),
            new Map<String, Object>{ 'note' => noteText.trim() }
        );
        if (gate.status != 'AUTHORIZED') {
            return gate;
        }

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
            out.writeCapability = true;
            out.clinicalNotes = notesText;
            out.message = 'Clinical note saved.';
            return out;
        } catch (Exception e) {
            out.success = false;
            out.status = 'ERROR';
            out.message = e.getMessage();
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
            }
        );
        if (gate.status != 'AUTHORIZED') {
            return gate;
        }

        try {
            Patient__c toUpdate = new Patient__c(Id = patientId);
            if (field == 'Weight_lb__c' || field == 'Height_in__c') {
                String numeric = fieldValue == null
                    ? null
                    : fieldValue.replaceAll('[^0-9.\\-]', '').trim();
                if (String.isBlank(numeric)) {
                    out.success = false;
                    out.status = 'ERROR';
                    out.message = 'A numeric value is required for ' + field + '.';
                    return out;
                }
                toUpdate.put(field, Decimal.valueOf(numeric));
            } else if (field == 'Date_of_Birth__c') {
                Date parsed = parseFlexibleDate(fieldValue);
                if (parsed == null) {
                    out.success = false;
                    out.status = 'ERROR';
                    out.message =
                        'Could not parse date of birth. Use MM/DD/YYYY or YYYY-MM-DD.';
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
            out.writeCapability = true;
            out.updatedField = field;
            out.updatedValue = fieldValue;
            out.message = 'Updated ' + field + '.';
            return out;
        } catch (Exception e) {
            out.success = false;
            out.status = 'ERROR';
            out.message = e.getMessage();
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
        String modelName = String.isBlank(cfg.Default_Model__c)
            ? 'local-general-v1'
            : cfg.Default_Model__c;
        if (!modelName.startsWith('local-')) {
            modelName = 'local-general-v1';
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
            'agent_id' => AGENT_TARGET_ID,
            'tool_id' => toolId,
            'governance_context' => new Map<String, Object>{
                'tool_authorized' => true,
                'agent_authorized' => true
            },
            'action' => action,
            'regulatory_applicability' => new List<Object>{ 'HIPAA' },
            'metadata' => new Map<String, Object>{
                'correlation_id' =>
                    'sf-write-' + String.valueOf(Datetime.now().getTime()),
                'salesforce_user_id' => UserInfo.getUserId()
            }
        };

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

        Boolean safetyHold = parsed.get('safety_hold') == true;
        String machine = String.isBlank(out.lifecycleDecision)
            ? ''
            : out.lifecycleDecision.toUpperCase();
        if (
            safetyHold ||
            machine == 'REVIEW' ||
            machine == 'REQUIRE_APPROVAL' ||
            res.getStatusCode() == 403
        ) {
            out.success = false;
            out.status = 'HELD';
            out.message =
                'Enigma is holding this write for human authorization' +
                (String.isNotBlank(out.evaluationId)
                    ? ' (decision ' + out.evaluationId + ')'
                    : '') +
                '. Authorize it in Enigma Decisions, then ask me again with the same update to finish.';
            return out;
        }

        out.success = false;
        out.status = 'ERROR';
        out.message =
            (String) parsed.get('message') != null
                ? (String) parsed.get('message')
                : 'Enigma blocked this write (HTTP ' + res.getStatusCode() + ').';
        return out;
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
