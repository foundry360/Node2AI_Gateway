public with sharing class EnigmaAgentConsoleController {
    public class PatientOption {
        @AuraEnabled public Id id;
        @AuraEnabled public String name;
        @AuraEnabled public String mrn;
    }

    public class ConsoleState {
        @AuraEnabled public List<PatientOption> patients;
        @AuraEnabled public String agentTargetId;
        @AuraEnabled public String baselineId;
        @AuraEnabled public Boolean writeCapability;
        @AuraEnabled public Boolean baselineOk;
        @AuraEnabled public String baselineMessage;
    }

    public class NoteUpdateResult {
        @AuraEnabled public Boolean success;
        @AuraEnabled public String message;
        @AuraEnabled public String clinicalNotes;
    }

    @AuraEnabled
    public static ConsoleState getConsoleState() {
        ConsoleState state = new ConsoleState();
        state.agentTargetId = EnigmaGatewayService.AGENT_TARGET_ID;
        state.patients = new List<PatientOption>();
        for (Patient__c p : [
            SELECT Id, Name, MRN__c
            FROM Patient__c
            ORDER BY Name
            LIMIT 50
        ]) {
            PatientOption o = new PatientOption();
            o.id = p.Id;
            o.name = p.Name;
            o.mrn = p.MRN__c;
            state.patients.add(o);
        }

        try {
            EnigmaGatewayService.ChangeEvalResult baseline = EnigmaGatewayService.getAgentBaseline();
            state.baselineOk = baseline.success == true;
            state.baselineId = baseline.baselineId;
            state.writeCapability = baseline.writeCapability == true;
            state.baselineMessage = baseline.message;
            if (!state.baselineOk && String.isBlank(state.baselineMessage)) {
                state.baselineMessage = 'Could not load Enigma agent baseline.';
            }
        } catch (EnigmaGatewayService.EnigmaException e) {
            state.baselineOk = false;
            state.baselineMessage = e.getMessage();
        } catch (Exception e) {
            state.baselineOk = false;
            state.baselineMessage = e.getMessage();
        }
        return state;
    }

    @AuraEnabled
    public static EnigmaGatewayService.ChangeEvalResult enableWriteCapability(
        String requesterPrompt,
        String agentRationale
    ) {
        try {
            return EnigmaGatewayService.evaluateEnableWrite(
                requesterPrompt,
                agentRationale,
                'After Authorize, the clinical agent may append notes via update_clinical_notes.',
                'Console operator requested enabling write on agent_enigma_clinical.'
            );
        } catch (EnigmaGatewayService.EnigmaException e) {
            throw new AuraHandledException(e.getMessage());
        } catch (Exception e) {
            throw new AuraHandledException(e.getMessage());
        }
    }

    @AuraEnabled
    public static EnigmaGatewayService.CompletionResult summarizePatient(Id patientId) {
        try {
            return EnigmaSummarizeController.summarizePatient(patientId);
        } catch (AuraHandledException e) {
            throw e;
        } catch (Exception e) {
            throw new AuraHandledException(e.getMessage());
        }
    }

    @AuraEnabled
    public static NoteUpdateResult updateClinicalNotes(
        Id patientId,
        String noteAppend,
        Boolean capabilityChangeShown
    ) {
        if (patientId == null) {
            throw new AuraHandledException('patientId is required');
        }
        if (capabilityChangeShown != true) {
            throw new AuraHandledException(
                'Enable write capability must be evaluated in Enigma before updating notes (demo gate).'
            );
        }
        if (String.isBlank(noteAppend)) {
            throw new AuraHandledException('Note text is required');
        }

        insert new Clinical_Note__c(
            Patient__c = patientId,
            Body__c = noteAppend.trim(),
            Source__c = 'Agent',
            Noted_At__c = Datetime.now()
        );
        String notesText = EnigmaGatewayService.rebuildClinicalNotesBlob(patientId);

        NoteUpdateResult result = new NoteUpdateResult();
        result.success = true;
        result.message = 'Clinical notes updated (agent write path).';
        result.clinicalNotes = notesText;
        return result;
    }
}
