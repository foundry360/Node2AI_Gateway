public with sharing class EnigmaPatientCopilotController {
    public class ChatResult {
        @AuraEnabled public Boolean success;
        @AuraEnabled public String status;
        @AuraEnabled public String reply;
        @AuraEnabled public String evaluationId;
        @AuraEnabled public String requestId;
        @AuraEnabled public Boolean refreshChart;
    }

    @AuraEnabled
    public static ChatResult handleUtterance(Id patientId, String utterance) {
        ChatResult out = new ChatResult();
        if (patientId == null || String.isBlank(utterance)) {
            out.success = false;
            out.status = 'ERROR';
            out.reply =
                'Ask me about this patient, request a summary, add a note, or update a field.';
            return out;
        }

        String text = utterance.trim();
        String lower = text.toLowerCase();

        try {
            if (isSummarizeIntent(lower)) {
                EnigmaGatewayService.CompletionResult r = EnigmaGatewayService.summarizePatient(
                    patientId
                );
                out.success = r.success;
                out.status = r.success ? 'COMPLETED' : 'ERROR';
                out.requestId = r.requestId;
                out.reply = r.success
                    ? r.summary
                    : (String.isNotBlank(r.message)
                          ? r.message
                          : 'Enigma could not summarize this chart.');
                out.refreshChart = false;
                return out;
            }

            ChatResult fieldResult = tryFieldUpdate(patientId, text, lower);
            if (fieldResult != null) {
                return fieldResult;
            }

            String note = extractNote(text, lower);
            if (note != null) {
                EnigmaGatewayService.GovernedWriteResult r = EnigmaGatewayService.appendClinicalNoteGoverned(
                    patientId,
                    note,
                    text
                );
                return fromGoverned(r, 'note');
            }

            if (
                lower.startsWith('add ') ||
                lower.startsWith('append ') ||
                isAddNoteIntent(lower)
            ) {
                String noteBody = stripTrailingAddNoteCue(text);
                EnigmaGatewayService.GovernedWriteResult r = EnigmaGatewayService.appendClinicalNoteGoverned(
                    patientId,
                    noteBody,
                    text
                );
                return fromGoverned(r, 'note');
            }

            // Default: chart-grounded Q&A through Enigma (summary agent).
            EnigmaGatewayService.CompletionResult qa = EnigmaGatewayService.answerPatientQuestion(
                patientId,
                text
            );
            out.success = qa.success;
            out.status = qa.success ? 'COMPLETED' : 'ERROR';
            out.requestId = qa.requestId;
            out.reply = qa.success
                ? qa.summary
                : (String.isNotBlank(qa.message)
                      ? qa.message
                      : 'Enigma could not answer from this chart.');
            out.refreshChart = false;
            return out;
        } catch (Exception e) {
            out.success = false;
            out.status = 'ERROR';
            out.reply = e.getMessage();
            return out;
        }
    }

    private static ChatResult tryFieldUpdate(Id patientId, String text, String lower) {
        List<FieldAlias> aliases = fieldAliases();
        for (FieldAlias alias : aliases) {
            String value = extractAfter(lower, text, alias.prefixes);
            if (value != null) {
                return fieldUpdate(patientId, alias.apiName, value, text, alias.label);
            }
        }
        // Natural language: "change ... date of birth ... to 9/22/1978"
        Matcher dob = Pattern.compile(
                '(?i)(?:change|update|set|correct).{0,48}(?:date of birth|dob|birthday).{0,24}to\\s+(.+)$'
            )
            .matcher(text.trim());
        if (dob.find()) {
            return fieldUpdate(
                patientId,
                'Date_of_Birth__c',
                dob.group(1).trim(),
                text,
                'date of birth'
            );
        }
        return null;
    }

    private class FieldAlias {
        String apiName;
        String label;
        List<String> prefixes;
        FieldAlias(String apiName, String label, List<String> prefixes) {
            this.apiName = apiName;
            this.label = label;
            this.prefixes = prefixes;
        }
    }

    private static List<FieldAlias> fieldAliases() {
        return new List<FieldAlias>{
            new FieldAlias(
                'Date_of_Birth__c',
                'date of birth',
                new List<String>{
                    'change the patient\'s date of birth to ',
                    'update the patient\'s date of birth to ',
                    'change the date of birth to ',
                    'update the date of birth to ',
                    'set the date of birth to ',
                    'change date of birth to ',
                    'update date of birth to ',
                    'set date of birth to ',
                    'date of birth to ',
                    'change the dob to ',
                    'update the dob to ',
                    'change dob to ',
                    'update dob to ',
                    'set dob to ',
                    'dob to ',
                    'change birthday to ',
                    'update birthday to ',
                    'birthday to '
                }
            ),
            new FieldAlias(
                'Gender__c',
                'gender',
                new List<String>{
                    'update gender to ',
                    'change gender to ',
                    'set gender to ',
                    'gender to '
                }
            ),
            new FieldAlias(
                'Phone__c',
                'phone number',
                new List<String>{
                    'update phone to ',
                    'change phone to ',
                    'set phone to ',
                    'phone to ',
                    'phone number to '
                }
            ),
            new FieldAlias(
                'Email__c',
                'email',
                new List<String>{
                    'update email to ',
                    'change email to ',
                    'set email to ',
                    'email to '
                }
            ),
            new FieldAlias(
                'Weight_lb__c',
                'weight',
                new List<String>{
                    'update weight to ',
                    'change weight to ',
                    'set weight to ',
                    'weight to '
                }
            ),
            new FieldAlias(
                'Height_in__c',
                'height',
                new List<String>{
                    'update height to ',
                    'change height to ',
                    'set height to ',
                    'height to '
                }
            ),
            new FieldAlias(
                'Allergies__c',
                'allergies',
                new List<String>{
                    'update allergies to ',
                    'change allergies to ',
                    'set allergies to ',
                    'allergies to '
                }
            ),
            new FieldAlias(
                'Patient_Status__c',
                'status',
                new List<String>{
                    'update status to ',
                    'change status to ',
                    'set status to ',
                    'patient status to '
                }
            ),
            new FieldAlias(
                'Primary_Care_Provider__c',
                'primary care provider',
                new List<String>{
                    'update pcp to ',
                    'change pcp to ',
                    'set pcp to ',
                    'update primary care provider to ',
                    'set primary care provider to ',
                    'pcp to '
                }
            ),
            new FieldAlias(
                'Preferred_Language__c',
                'preferred language',
                new List<String>{
                    'update language to ',
                    'change language to ',
                    'set language to ',
                    'preferred language to '
                }
            ),
            new FieldAlias(
                'City__c',
                'city',
                new List<String>{ 'update city to ', 'change city to ', 'set city to ', 'city to ' }
            ),
            new FieldAlias(
                'State__c',
                'state',
                new List<String>{
                    'update state to ',
                    'change state to ',
                    'set state to ',
                    'state to '
                }
            ),
            new FieldAlias(
                'Street__c',
                'street',
                new List<String>{
                    'update street to ',
                    'change street to ',
                    'set street to ',
                    'street to ',
                    'update address to '
                }
            ),
            new FieldAlias(
                'Postal_Code__c',
                'postal code',
                new List<String>{
                    'update zip to ',
                    'change zip to ',
                    'set zip to ',
                    'update postal code to ',
                    'zip to '
                }
            ),
            new FieldAlias(
                'Emergency_Contact_Phone__c',
                'emergency contact phone',
                new List<String>{
                    'update emergency contact phone to ',
                    'set emergency contact phone to ',
                    'emergency phone to '
                }
            ),
            new FieldAlias(
                'Emergency_Contact_Name__c',
                'emergency contact',
                new List<String>{
                    'update emergency contact to ',
                    'set emergency contact to ',
                    'emergency contact to '
                }
            ),
            new FieldAlias(
                'Primary_Diagnosis__c',
                'primary diagnosis',
                new List<String>{
                    'update primary diagnosis to ',
                    'set primary diagnosis to ',
                    'primary diagnosis to '
                }
            )
        };
    }

    private static ChatResult fieldUpdate(
        Id patientId,
        String fieldApi,
        String value,
        String userAsk,
        String label
    ) {
        EnigmaGatewayService.GovernedWriteResult r = EnigmaGatewayService.updatePatientFieldGoverned(
            patientId,
            fieldApi,
            value,
            userAsk
        );
        ChatResult out = fromGoverned(r, label);
        if (r.status == 'COMPLETED') {
            out.reply = 'Updated the patient ' + label + ' to ' + value + '.';
            out.refreshChart = true;
        }
        return out;
    }

    private static ChatResult fromGoverned(
        EnigmaGatewayService.GovernedWriteResult r,
        String kind
    ) {
        ChatResult out = new ChatResult();
        out.success = r.success;
        out.status = r.status;
        out.evaluationId = r.evaluationId;
        out.requestId = r.requestId;
        out.refreshChart = r.status == 'COMPLETED';
        if (r.status == 'HELD') {
            out.reply =
                'I can’t complete that write yet. Enigma is holding it for human authorization' +
                (String.isNotBlank(r.evaluationId) ? ' (' + r.evaluationId + ')' : '') +
                '. Authorize it in Enigma Decisions, then ask me again and I’ll finish the ' +
                kind +
                ' update.';
        } else if (r.status == 'COMPLETED') {
            out.reply = kind == 'note'
                ? 'Done. I added the clinical note to the chart.'
                : r.message;
        } else {
            out.reply = String.isNotBlank(r.message) ? r.message : 'Something went wrong.';
        }
        return out;
    }

    private static Boolean isSummarizeIntent(String lower) {
        return lower.startsWith('summarize') ||
            lower.contains('summarize this') ||
            lower.contains('summarize the chart') ||
            lower.contains('summarize patient') ||
            lower.contains('chart summary') ||
            lower == 'summary' ||
            lower == 'summarize';
    }

    private static String extractNote(String text, String lower) {
        // "Patient reports … Add a clinical note" → body is the preceding text
        Matcher trailing = Pattern.compile(
                '(?is)^(.+?)[.\\s]+add (?:a )?clinical note\\.?\\s*$'
            )
            .matcher(text.trim());
        if (trailing.find()) {
            String body = trailing.group(1).trim();
            if (String.isNotBlank(body)) {
                return body;
            }
        }
        // "Add a clinical note: …" / "Add clinical note …"
        Matcher leading = Pattern.compile(
                '(?is)^add (?:a )?clinical note\\s*[:\\-]?\\s*(.+)$'
            )
            .matcher(text.trim());
        if (leading.find()) {
            String body = leading.group(1).trim();
            if (String.isNotBlank(body)) {
                return body;
            }
        }

        List<String> prefixes = new List<String>{
            'add a note that ',
            'add note that ',
            'append a note that ',
            'append note that ',
            'add a note: ',
            'add note: ',
            'add a clinical note that ',
            'add clinical note that ',
            'add a clinical note: ',
            'add clinical note: ',
            'note that ',
            'clinical note: '
        };
        for (String p : prefixes) {
            Integer idx = lower.indexOf(p);
            if (idx >= 0) {
                return text.substring(idx + p.length()).trim();
            }
        }
        return null;
    }

    private static Boolean isAddNoteIntent(String lower) {
        return lower.contains('add a clinical note') ||
            lower.contains('add clinical note') ||
            lower.contains('append a clinical note') ||
            lower.contains('append clinical note') ||
            lower.endsWith('add a note') ||
            lower.endsWith('add note');
    }

    private static String stripTrailingAddNoteCue(String text) {
        Matcher trailing = Pattern.compile(
                '(?is)^(.+?)[.\\s]+add (?:a )?(?:clinical )?note\\.?\\s*$'
            )
            .matcher(text.trim());
        if (trailing.find()) {
            String body = trailing.group(1).trim();
            if (String.isNotBlank(body)) {
                return body;
            }
        }
        return text.trim();
    }

    private static String extractAfter(String lower, String original, List<String> needles) {
        for (String n : needles) {
            Integer idx = lower.indexOf(n);
            if (idx >= 0) {
                return original.substring(idx + n.length()).trim();
            }
        }
        return null;
    }
}
