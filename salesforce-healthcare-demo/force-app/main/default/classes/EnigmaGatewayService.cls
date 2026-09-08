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
        Enigma_Config__c cfg = Enigma_Config__c.getOrgDefaults();
        if (cfg == null || String.isBlank(cfg.Endpoint_URL__c)) {
            throw new EnigmaException(
                'Enigma Config is missing Endpoint URL. Set Custom Settings → Enigma Config.'
            );
        }
        if (String.isBlank(cfg.Api_Key__c)) {
            throw new EnigmaException(
                'Enigma Config is missing API Key. Set Custom Settings → Enigma Config.'
            );
        }
        if (String.isBlank(cfg.Application_Id__c)) {
            throw new EnigmaException(
                'Enigma Config is missing Application Id. Set Custom Settings → Enigma Config.'
            );
        }

        String modelName = String.isBlank(cfg.Default_Model__c)
            ? 'cloud-public-gpt'
            : cfg.Default_Model__c;
        String base = cfg.Endpoint_URL__c.removeEnd('/');
        String endpoint = base + '/v1/ai/completions';

        Map<String, Object> body = new Map<String, Object>{
            'application_id' => cfg.Application_Id__c,
            // Enigma resolves roles from its identity store — use the seeded clinician
            // principal. Salesforce user id is retained in metadata for correlation.
            'user' => new Map<String, Object>{ 'id' => 'user_clinician' },
            'operation' => 'summarize',
            'model' => modelName,
            'messages' => new List<Object>{
                new Map<String, Object>{ 'role' => 'user', 'content' => userContent }
            },
            'metadata' => new Map<String, Object>{
                'correlation_id' => correlationId,
                'salesforce_user_id' => UserInfo.getUserId()
            }
        };

        HttpRequest req = new HttpRequest();
        req.setEndpoint(endpoint);
        req.setMethod('POST');
        req.setHeader('Content-Type', 'application/json');
        req.setHeader('Authorization', 'Bearer ' + cfg.Api_Key__c);
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
            result.success = String.isNotBlank(result.summary);
            if (!result.success) {
                result.message = 'Enigma returned approved with empty content.';
            }
            return result;
        }

        result.success = false;
        if (String.isBlank(result.message)) {
            result.message =
                'Enigma blocked or failed the request (HTTP ' +
                res.getStatusCode() +
                ').';
        }
        return result;
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
