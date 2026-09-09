public with sharing class EnigmaAgentUpdateNotesAction {
    public class Request {
        @InvocableVariable(required=true label='Patient Id')
        public Id patientId;
        @InvocableVariable(required=true label='Note Text')
        public String noteText;
    }

    public class Response {
        @InvocableVariable(label='Success')
        public Boolean success;
        @InvocableVariable(label='Message')
        public String message;
        @InvocableVariable(label='Clinical Notes')
        public String clinicalNotes;
    }

    @InvocableMethod(
        label='Enigma Update Clinical Notes'
        description='Append text to Patient Clinical Notes (agent write capability).'
        category='Enigma'
    )
    public static List<Response> run(List<Request> requests) {
        List<Response> out = new List<Response>();
        for (Request req : requests) {
            Response row = new Response();
            try {
                if (req.patientId == null || String.isBlank(req.noteText)) {
                    row.success = false;
                    row.message = 'patientId and noteText are required';
                    out.add(row);
                    continue;
                }
                Patient__c patient = [
                    SELECT Id, Clinical_Notes__c
                    FROM Patient__c
                    WHERE Id = :req.patientId
                    LIMIT 1
                ];
                String stamp =
                    '\n\n[Agent write ' +
                    Datetime.now().formatGmt('yyyy-MM-dd HH:mm') +
                    ' UTC] ' +
                    req.noteText.trim();
                patient.Clinical_Notes__c = String.isBlank(patient.Clinical_Notes__c)
                    ? req.noteText.trim()
                    : patient.Clinical_Notes__c + stamp;
                update patient;
                row.success = true;
                row.message = 'Clinical notes updated';
                row.clinicalNotes = patient.Clinical_Notes__c;
            } catch (Exception e) {
                row.success = false;
                row.message = e.getMessage();
            }
            out.add(row);
        }
        return out;
    }
}
