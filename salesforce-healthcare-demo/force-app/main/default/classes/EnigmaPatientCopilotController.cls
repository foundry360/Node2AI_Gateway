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
            out.reply = 'Tell me what you need on this patient — for example, add a note or summarize the chart.';
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
                    ? ('Here is the Enigma summary:\n\n' + r.summary)
                    : (String.isNotBlank(r.message)
                          ? r.message
                          : 'Enigma could not summarize this chart.');
                out.refreshChart = false;
                return out;
            }

            String phone = extractAfter(lower, text, new List<String>{
                'update phone to ',
                'change phone to ',
                'set phone to ',
                'phone to ',
                'phone number to '
            });
            if (phone != null) {
                return fieldUpdate(
                    patientId,
                    'Phone__c',
                    phone,
                    text,
                    'phone number'
                );
            }

            String email = extractAfter(lower, text, new List<String>{
                'update email to ',
                'change email to ',
                'set email to ',
                'email to '
            });
            if (email != null) {
                return fieldUpdate(
                    patientId,
                    'Email__c',
                    email,
                    text,
                    'email'
                );
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

            // Default: treat free text as a clinical note request when it looks like clinical content.
            if (lower.startsWith('add ') || lower.startsWith('append ') || lower.contains(' note')) {
                EnigmaGatewayService.GovernedWriteResult r = EnigmaGatewayService.appendClinicalNoteGoverned(
                    patientId,
                    text,
                    text
                );
                return fromGoverned(r, 'note');
            }

            out.success = true;
            out.status = 'HELP';
            out.reply =
                'I can help with this patient. Try:\n' +
                '• “Summarize this chart”\n' +
                '• “Add a note that diet compliance improved”\n' +
                '• “Update phone to (415) 555-0199”\n' +
                '• “Update email to patient@example.com”\n\n' +
                'Writes go through Enigma automatically — you do not enable write capability yourself.';
            return out;
        } catch (Exception e) {
            out.success = false;
            out.status = 'ERROR';
            out.reply = e.getMessage();
            return out;
        }
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
                'I can’t complete that write yet — Enigma is holding it for human authorization' +
                (String.isNotBlank(r.evaluationId) ? ' (' + r.evaluationId + ')' : '') +
                '. Authorize it in Enigma Decisions, then ask me again and I’ll finish the ' +
                kind +
                ' update.';
        } else if (r.status == 'COMPLETED') {
            out.reply = kind == 'note'
                ? 'Done — I added the clinical note to the chart.'
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
            lower == 'summary';
    }

    private static String extractNote(String text, String lower) {
        List<String> prefixes = new List<String>{
            'add a note that ',
            'add note that ',
            'append a note that ',
            'append note that ',
            'add a note: ',
            'add note: ',
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
