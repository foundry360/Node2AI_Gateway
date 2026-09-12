public with sharing class EnigmaAgentUpdateNotesAction {
    public class Request {
        @InvocableVariable(
            required=true
            label='Patient Id'
            description='Patient__c Id (usually the record the user is viewing).'
        )
        public Id patientId;

        @InvocableVariable(
            required=true
            label='Note Text'
            description='Clinical note content to append.'
        )
        public String noteText;

        @InvocableVariable(
            label='User Request'
            description='Exact text of what the user asked (Prompt for Enigma). Defaults to note intent if blank.'
        )
        public String userAsk;
    }

    public class Response {
        @InvocableVariable(label='Success')
        public Boolean success;
        @InvocableVariable(label='Status')
        public String status;
        @InvocableVariable(label='Message')
        public String message;
        @InvocableVariable(label='Clinical Notes')
        public String clinicalNotes;
        @InvocableVariable(label='Evaluation Id')
        public String evaluationId;
        @InvocableVariable(label='Request Id')
        public String requestId;
    }

    @InvocableMethod(
        label='Enigma Update Clinical Notes'
        description='Append a clinical note after Enigma authorizes this specific write. Each note creates a Decision. If held for review, returns HELD - tell them to Authorize in Enigma, then retry the same request.'
        category='Enigma'
    )
    public static List<Response> run(List<Request> requests) {
        List<Response> out = new List<Response>();
        for (Request req : requests) {
            Response row = new Response();
            try {
                EnigmaGatewayService.GovernedWriteResult r = EnigmaGatewayService.appendClinicalNoteGoverned(
                    req != null ? req.patientId : null,
                    req != null ? req.noteText : null,
                    req != null ? req.userAsk : null
                );
                row.success = r.success;
                row.status = r.status;
                row.message = r.message;
                row.clinicalNotes = r.clinicalNotes;
                row.evaluationId = r.evaluationId;
                row.requestId = r.requestId;
            } catch (Exception e) {
                row.success = false;
                row.status = 'ERROR';
                row.message = e.getMessage();
            }
            out.add(row);
        }
        return out;
    }
}
