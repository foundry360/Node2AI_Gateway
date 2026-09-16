public with sharing class EnigmaPatientCopilotController {
    public class ChatResult {
        @AuraEnabled public Boolean success;
        @AuraEnabled public String status;
        @AuraEnabled public String reply;
        @AuraEnabled public String evaluationId;
        @AuraEnabled public String requestId;
        @AuraEnabled public Boolean refreshChart;
        /** For resume after HELD — LWC must resend these with resumeEvaluationId. */
        @AuraEnabled public String writeKind;
        @AuraEnabled public String noteBody;
        @AuraEnabled public String fieldApi;
        @AuraEnabled public String fieldValue;
        @AuraEnabled public String medicationName;
        @AuraEnabled public String frequency;
        @AuraEnabled public String prescriptionStatus;
    }

    private static final Set<String> ALLOWED_FIELD_UPDATES = new Set<String>{
        'Phone__c',
        'Email__c',
        'Date_of_Birth__c',
        'Gender__c',
        'Weight_lb__c',
        'Height_in__c',
        'Allergies__c',
        'Patient_Status__c',
        'Primary_Care_Provider__c',
        'Preferred_Language__c',
        'City__c',
        'State__c',
        'Street__c',
        'Postal_Code__c',
        'Emergency_Contact_Name__c',
        'Emergency_Contact_Phone__c',
        'Primary_Diagnosis__c'
    };

    private static final Map<String, String> FIELD_LABELS = new Map<String, String>{
        'Phone__c' => 'phone number',
        'Email__c' => 'email',
        'Date_of_Birth__c' => 'date of birth',
        'Gender__c' => 'gender',
        'Weight_lb__c' => 'weight',
        'Height_in__c' => 'height',
        'Allergies__c' => 'allergies',
        'Patient_Status__c' => 'status',
        'Primary_Care_Provider__c' => 'primary care provider',
        'Preferred_Language__c' => 'preferred language',
        'City__c' => 'city',
        'State__c' => 'state',
        'Street__c' => 'street',
        'Postal_Code__c' => 'postal code',
        'Emergency_Contact_Name__c' => 'emergency contact',
        'Emergency_Contact_Phone__c' => 'emergency contact phone',
        'Primary_Diagnosis__c' => 'primary diagnosis'
    };

    @AuraEnabled
    public static ChatResult handleUtterance(
        Id patientId,
        String utterance,
        String resumeEvaluationId,
        String resumeWriteKind,
        String resumeNoteBody,
        String resumeFieldApi,
        String resumeFieldValue,
        String resumeMedicationName,
        String resumeFrequency,
        String resumePrescriptionStatus
    ) {
        ChatResult out = new ChatResult();
        if (patientId == null || String.isBlank(utterance)) {
            out.success = false;
            out.status = 'ERROR';
            out.reply =
                'Ask me about this patient, request a summary, add a note, or update a field.';
            return out;
        }

        String text = utterance.trim();

        try {
            // Resume a held Decision — do not re-interpret or open a second write.
            if (String.isNotBlank(resumeEvaluationId)) {
                return resumeHeldWrite(
                    patientId,
                    text,
                    resumeEvaluationId,
                    resumeWriteKind,
                    resumeNoteBody,
                    resumeFieldApi,
                    resumeFieldValue,
                    resumeMedicationName,
                    resumeFrequency,
                    resumePrescriptionStatus
                );
            }

            EnigmaGatewayService.CopilotIntent intent = EnigmaGatewayService.interpretCopilotIntent(
                text
            );
            if (!intent.success) {
                out.success = false;
                out.status = 'ERROR';
                out.requestId = intent.requestId;
                out.reply = String.isNotBlank(intent.message)
                    ? intent.message
                    : 'Enigma could not interpret that request.';
                out.refreshChart = false;
                return out;
            }

            String kind = String.isBlank(intent.intent) ? 'question' : intent.intent;

            // Prefer structured prescription chart updates over note-only for med changes.
            if (
                kind == 'clinical_note' ||
                kind == 'field_update' ||
                kind == 'question'
            ) {
                RxChange rxGuess = resolvePrescriptionChange(patientId, intent, text);
                if (rxGuess != null) {
                    kind = 'prescription_update';
                    intent.intent = kind;
                    intent.medicationName = rxGuess.medicationName;
                    intent.frequency = rxGuess.frequency;
                    intent.prescriptionStatus = rxGuess.prescriptionStatus;
                }
            }

            if (kind == 'summarize') {
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

            if (kind == 'prescription_update') {
                RxChange rx = resolvePrescriptionChange(patientId, intent, text);
                if (rx == null) {
                    out.success = false;
                    out.status = 'ERROR';
                    out.requestId = intent.requestId;
                    out.reply =
                        'I understood a medication change, but could not match it to a prescription on this chart.';
                    out.refreshChart = false;
                    return out;
                }
                return finishPrescriptionWrite(
                    patientId,
                    rx.medicationName,
                    rx.frequency,
                    rx.prescriptionStatus,
                    text,
                    null
                );
            }

            if (kind == 'field_update') {
                String fieldApi = intent.fieldApi;
                String value = intent.fieldValue;
                if (
                    String.isBlank(fieldApi) ||
                    !ALLOWED_FIELD_UPDATES.contains(fieldApi)
                ) {
                    String noteBody = String.isNotBlank(intent.noteBody)
                        ? intent.noteBody
                        : (String.isNotBlank(value) ? value : text);
                    return finishNoteWrite(patientId, noteBody, text, null);
                }
                if (String.isBlank(value)) {
                    out.success = false;
                    out.status = 'ERROR';
                    out.requestId = intent.requestId;
                    out.reply =
                        'I understood a field update, but could not determine the new value.';
                    out.refreshChart = false;
                    return out;
                }
                return finishFieldWrite(patientId, fieldApi, value, text, null);
            }

            if (kind == 'clinical_note') {
                String noteBody = String.isNotBlank(intent.noteBody)
                    ? intent.noteBody
                    : text;
                return finishNoteWrite(patientId, noteBody, text, null);
            }

            if (kind == 'multi') {
                return finishMultiWrite(patientId, intent, text);
            }

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

    private class RxChange {
        public String medicationName;
        public String frequency;
        public String prescriptionStatus;
    }

    /**
     * Resolve medication chart updates from model intent and/or utterance heuristics
     * against prescriptions on the patient.
     */
    private static RxChange resolvePrescriptionChange(
        Id patientId,
        EnigmaGatewayService.CopilotIntent intent,
        String text
    ) {
        String med = intent != null ? intent.medicationName : null;
        String freq = intent != null ? intent.frequency : null;
        String status = intent != null ? intent.prescriptionStatus : null;

        String lower = text == null ? '' : text.toLowerCase();
        if (String.isBlank(freq)) {
            if (lower.contains('twice daily') || lower.contains('twice a day') || lower.contains('bid')) {
                freq = 'Twice daily';
            } else if (
                lower.contains('once daily') ||
                lower.contains('once a day') ||
                lower.contains('daily') ||
                lower.contains('qd')
            ) {
                freq = 'Once daily';
            } else if (lower.contains('nightly') || lower.contains('at bedtime') || lower.contains('qhs')) {
                freq = 'Nightly';
            } else if (lower.contains('three times') || lower.contains('tid')) {
                freq = 'Three times daily';
            }
        }
        if (String.isBlank(status)) {
            Boolean mentionsMedStatus =
                lower.contains('make it active') ||
                lower.contains('make the prescription active') ||
                lower.contains('set status to active') ||
                lower.contains('change the status to active') ||
                lower.contains('status to active') ||
                lower.contains('and make it active') ||
                (lower.contains('active') &&
                    (lower.contains('prescription') ||
                        lower.contains('medication') ||
                        lower.contains('aspirin') ||
                        lower.contains('med')));
            if (mentionsMedStatus) {
                status = 'Active';
            } else if (lower.contains('discontinu')) {
                status = 'Discontinued';
            } else if (lower.contains('completed') && lower.contains('prescription')) {
                status = 'Completed';
            }
        }

        List<Prescription__c> rxs = [
            SELECT Id, Name
            FROM Prescription__c
            WHERE Patient__c = :patientId
            ORDER BY Name
        ];
        if (rxs.isEmpty()) {
            return null;
        }

        Prescription__c matched = null;
        if (String.isNotBlank(med)) {
            String medLower = med.trim().toLowerCase();
            for (Prescription__c rx : rxs) {
                if (rx.Name != null && rx.Name.trim().toLowerCase() == medLower) {
                    matched = rx;
                    break;
                }
            }
            if (matched == null) {
                for (Prescription__c rx : rxs) {
                    if (
                        rx.Name != null &&
                        rx.Name.trim().toLowerCase().contains(medLower)
                    ) {
                        matched = rx;
                        break;
                    }
                }
            }
        }
        if (matched == null) {
            for (Prescription__c rx : rxs) {
                if (
                    rx.Name != null &&
                    lower.contains(rx.Name.trim().toLowerCase())
                ) {
                    matched = rx;
                    break;
                }
            }
        }

        // Only treat as prescription update when we matched a med AND have a chart change.
        Boolean looksLikeMedWrite =
            matched != null &&
            (String.isNotBlank(freq) || String.isNotBlank(status)) &&
            (lower.contains('prescription') ||
                lower.contains('medication') ||
                lower.contains('med ') ||
                (matched.Name != null && lower.contains(matched.Name.toLowerCase())) ||
                (intent != null && intent.intent == 'prescription_update'));

        if (!looksLikeMedWrite) {
            return null;
        }

        // If "active" was meant as patient status with no medication cue, skip.
        // looksLikeMedWrite already requires medication match.

        RxChange change = new RxChange();
        change.medicationName = matched.Name;
        change.frequency = freq;
        change.prescriptionStatus = status;
        return change;
    }

    private static ChatResult resumeHeldWrite(
        Id patientId,
        String text,
        String resumeEvaluationId,
        String resumeWriteKind,
        String resumeNoteBody,
        String resumeFieldApi,
        String resumeFieldValue,
        String resumeMedicationName,
        String resumeFrequency,
        String resumePrescriptionStatus
    ) {
        String kind = String.isBlank(resumeWriteKind) ? 'note' : resumeWriteKind.trim();
        if (kind == 'prescription' || kind == 'prescription_update') {
            String med = resumeMedicationName;
            String freq = resumeFrequency;
            String rxStatus = resumePrescriptionStatus;
            if (String.isBlank(med) || (String.isBlank(freq) && String.isBlank(rxStatus))) {
                EnigmaGatewayService.CopilotIntent stub = new EnigmaGatewayService.CopilotIntent();
                stub.intent = 'prescription_update';
                stub.medicationName = med;
                stub.frequency = freq;
                stub.prescriptionStatus = rxStatus;
                RxChange resolved = resolvePrescriptionChange(patientId, stub, text);
                if (resolved != null) {
                    if (String.isBlank(med)) {
                        med = resolved.medicationName;
                    }
                    if (String.isBlank(freq)) {
                        freq = resolved.frequency;
                    }
                    if (String.isBlank(rxStatus)) {
                        rxStatus = resolved.prescriptionStatus;
                    }
                }
            }
            if (String.isBlank(med)) {
                ChatResult err = new ChatResult();
                err.success = false;
                err.status = 'ERROR';
                err.evaluationId = resumeEvaluationId;
                err.writeKind = 'prescription';
                err.reply =
                    'Cannot resume that prescription update — could not match a medication on this chart. Name the drug (e.g. Aspirin) and try again.';
                return err;
            }
            return finishPrescriptionWrite(
                patientId,
                med,
                freq,
                rxStatus,
                text,
                resumeEvaluationId
            );
        }
        if (kind == 'field' || kind == 'field_update') {
            if (String.isBlank(resumeFieldApi) || String.isBlank(resumeFieldValue)) {
                ChatResult err = new ChatResult();
                err.success = false;
                err.status = 'ERROR';
                err.evaluationId = resumeEvaluationId;
                err.reply =
                    'Cannot resume that field update — missing field details. Start the request again.';
                return err;
            }
            return finishFieldWrite(
                patientId,
                resumeFieldApi,
                resumeFieldValue,
                text,
                resumeEvaluationId
            );
        }
        if (kind == 'multi') {
            String med = resumeMedicationName;
            String freq = resumeFrequency;
            String rxStatus = resumePrescriptionStatus;
            if (String.isBlank(med)) {
                EnigmaGatewayService.CopilotIntent stub = new EnigmaGatewayService.CopilotIntent();
                stub.intent = 'prescription_update';
                RxChange resolved = resolvePrescriptionChange(patientId, stub, text);
                if (resolved != null) {
                    med = resolved.medicationName;
                    if (String.isBlank(freq)) {
                        freq = resolved.frequency;
                    }
                    if (String.isBlank(rxStatus)) {
                        rxStatus = resolved.prescriptionStatus;
                    }
                }
            }
            if (String.isNotBlank(med)) {
                return finishPrescriptionWrite(
                    patientId,
                    med,
                    freq,
                    rxStatus,
                    text,
                    resumeEvaluationId
                );
            }
            String noteBody = String.isNotBlank(resumeNoteBody) ? resumeNoteBody : text;
            if (String.isNotBlank(resumeFieldApi) && String.isNotBlank(resumeFieldValue)) {
                ChatResult fieldOut = finishFieldWrite(
                    patientId,
                    resumeFieldApi,
                    resumeFieldValue,
                    text,
                    null
                );
                if (fieldOut.status == 'HELD' || fieldOut.status == 'ERROR') {
                    return fieldOut;
                }
            }
            ChatResult noteOut = finishNoteWrite(patientId, noteBody, text, resumeEvaluationId);
            if (noteOut.status == 'COMPLETED' && String.isNotBlank(resumeFieldApi)) {
                noteOut.reply =
                    'Done. Updated status/field and added the clinical note to the chart.';
                noteOut.refreshChart = true;
            }
            return noteOut;
        }
        String noteBody = String.isNotBlank(resumeNoteBody) ? resumeNoteBody : text;
        return finishNoteWrite(patientId, noteBody, text, resumeEvaluationId);
    }

    private static ChatResult finishMultiWrite(
        Id patientId,
        EnigmaGatewayService.CopilotIntent intent,
        String text
    ) {
        List<EnigmaGatewayService.CopilotAction> actions = intent.actions;
        if (actions == null || actions.isEmpty()) {
            RxChange rx = resolvePrescriptionChange(patientId, intent, text);
            if (rx != null) {
                return finishPrescriptionWrite(
                    patientId,
                    rx.medicationName,
                    rx.frequency,
                    rx.prescriptionStatus,
                    text,
                    null
                );
            }
            return finishNoteWrite(
                patientId,
                String.isNotBlank(intent.noteBody) ? intent.noteBody : text,
                text,
                null
            );
        }

        List<String> completedBits = new List<String>();

        for (EnigmaGatewayService.CopilotAction a : actions) {
            if (a == null || String.isBlank(a.kind)) {
                continue;
            }
            if (a.kind == 'prescription_update') {
                RxChange rx = new RxChange();
                rx.medicationName = a.medicationName;
                rx.frequency = a.frequency;
                rx.prescriptionStatus = a.prescriptionStatus;
                EnigmaGatewayService.CopilotIntent tmp = new EnigmaGatewayService.CopilotIntent();
                tmp.intent = 'prescription_update';
                tmp.medicationName = a.medicationName;
                tmp.frequency = a.frequency;
                tmp.prescriptionStatus = a.prescriptionStatus;
                RxChange resolved = resolvePrescriptionChange(patientId, tmp, text);
                if (resolved == null) {
                    continue;
                }
                ChatResult rxOut = finishPrescriptionWrite(
                    patientId,
                    resolved.medicationName,
                    resolved.frequency,
                    resolved.prescriptionStatus,
                    text,
                    null
                );
                if (rxOut.status == 'HELD' || rxOut.status == 'ERROR') {
                    return rxOut;
                }
                completedBits.add(rxOut.reply);
            }
            if (a.kind == 'field_update') {
                if (
                    String.isBlank(a.fieldApi) ||
                    !ALLOWED_FIELD_UPDATES.contains(a.fieldApi) ||
                    String.isBlank(a.fieldValue)
                ) {
                    continue;
                }
                ChatResult fieldOut = finishFieldWrite(
                    patientId,
                    a.fieldApi,
                    a.fieldValue,
                    text,
                    null
                );
                if (fieldOut.status == 'HELD' || fieldOut.status == 'ERROR') {
                    return fieldOut;
                }
                String label = FIELD_LABELS.containsKey(a.fieldApi)
                    ? FIELD_LABELS.get(a.fieldApi)
                    : a.fieldApi;
                completedBits.add(label + ' → ' + a.fieldValue);
            }
        }

        for (EnigmaGatewayService.CopilotAction a : actions) {
            if (a == null || a.kind != 'clinical_note') {
                continue;
            }
            String noteBody = String.isNotBlank(a.noteBody) ? a.noteBody : text;
            ChatResult noteOut = finishNoteWrite(patientId, noteBody, text, null);
            if (noteOut.status == 'HELD') {
                if (!completedBits.isEmpty()) {
                    noteOut.reply =
                        String.join(completedBits, ' ') +
                        ' The clinical note is held for human authorization' +
                        (String.isNotBlank(noteOut.evaluationId)
                            ? ' (' + noteOut.evaluationId + ')'
                            : '') +
                        '. Authorize it in Enigma Decisions, then send the same request again.';
                }
                return noteOut;
            }
            if (noteOut.status == 'COMPLETED' && !completedBits.isEmpty()) {
                noteOut.reply =
                    'Done. ' +
                    String.join(completedBits, ' ') +
                    ' Also added the clinical note.';
                noteOut.refreshChart = true;
            }
            return noteOut;
        }

        if (!completedBits.isEmpty()) {
            ChatResult out = new ChatResult();
            out.success = true;
            out.status = 'COMPLETED';
            out.refreshChart = true;
            out.reply = String.join(completedBits, ' ');
            return out;
        }

        return finishNoteWrite(patientId, text, text, null);
    }

    private static ChatResult finishNoteWrite(
        Id patientId,
        String noteBody,
        String userAsk,
        String resumeEvaluationId
    ) {
        EnigmaGatewayService.GovernedWriteResult r = EnigmaGatewayService.appendClinicalNoteGoverned(
            patientId,
            noteBody,
            userAsk,
            resumeEvaluationId
        );
        ChatResult out = fromGoverned(r, 'note');
        out.writeKind = 'note';
        out.noteBody = noteBody;
        return out;
    }

    private static ChatResult finishFieldWrite(
        Id patientId,
        String fieldApi,
        String value,
        String userAsk,
        String resumeEvaluationId
    ) {
        String label = FIELD_LABELS.containsKey(fieldApi)
            ? FIELD_LABELS.get(fieldApi)
            : fieldApi;
        EnigmaGatewayService.GovernedWriteResult r = EnigmaGatewayService.updatePatientFieldGoverned(
            patientId,
            fieldApi,
            value,
            userAsk,
            resumeEvaluationId
        );
        ChatResult out = fromGoverned(r, label);
        out.writeKind = 'field';
        out.fieldApi = fieldApi;
        out.fieldValue = value;
        if (r.status == 'COMPLETED') {
            out.reply = 'Updated the patient ' + label + ' to ' + value + '.';
            out.refreshChart = true;
        }
        return out;
    }

    private static ChatResult finishPrescriptionWrite(
        Id patientId,
        String medicationName,
        String frequency,
        String prescriptionStatus,
        String userAsk,
        String resumeEvaluationId
    ) {
        EnigmaGatewayService.GovernedWriteResult r = EnigmaGatewayService.updatePrescriptionGoverned(
            patientId,
            medicationName,
            frequency,
            prescriptionStatus,
            userAsk,
            resumeEvaluationId
        );
        ChatResult out = fromGoverned(r, 'prescription');
        out.writeKind = 'prescription';
        out.medicationName = medicationName;
        out.frequency = frequency;
        out.prescriptionStatus = prescriptionStatus;
        if (r.status == 'COMPLETED') {
            out.reply = String.isNotBlank(r.message)
                ? r.message
                : 'Updated the ' + medicationName + ' prescription on the chart.';
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
                '. Authorize it in Enigma Decisions, then send the same request again and I’ll finish the ' +
                kind +
                ' update.';
        } else if (r.status == 'COMPLETED') {
            out.reply = kind == 'note'
                ? 'Done. I added the clinical note to the chart.'
                : (String.isNotBlank(r.message) ? r.message : 'Done.');
        } else {
            out.reply = String.isNotBlank(r.message) ? r.message : 'Something went wrong.';
        }
        return out;
    }
}
