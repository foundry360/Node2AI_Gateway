public with sharing class EnigmaAgentUpdatePatientFieldAction {
    public class Request {
        @InvocableVariable(required=true label='Patient Id')
        public Id patientId;

        @InvocableVariable(
            required=true
            label='Field API Name'
            description='Allowed: Phone__c, Email__c, Preferred_Language__c, Primary_Care_Provider__c, Emergency_Contact_Name__c, Emergency_Contact_Phone__c'
        )
        public String fieldApiName;

        @InvocableVariable(required=true label='Field Value')
        public String fieldValue;

        @InvocableVariable(
            label='User Request'
            description='Exact text of what the user asked (Prompt for Enigma).'
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
        @InvocableVariable(label='Updated Field')
        public String updatedField;
        @InvocableVariable(label='Updated Value')
        public String updatedValue;
        @InvocableVariable(label='Evaluation Id')
        public String evaluationId;
        @InvocableVariable(label='Request Id')
        public String requestId;
    }

    @InvocableMethod(
        label='Enigma Update Patient Field'
        description='Update an allowed Patient field after Enigma authorizes write capability. If held, tell the user to Authorize in Enigma, then retry — never ask them to enable write capability.'
        category='Enigma'
    )
    public static List<Response> run(List<Request> requests) {
        List<Response> out = new List<Response>();
        for (Request req : requests) {
            Response row = new Response();
            try {
                EnigmaGatewayService.GovernedWriteResult r = EnigmaGatewayService.updatePatientFieldGoverned(
                    req != null ? req.patientId : null,
                    req != null ? req.fieldApiName : null,
                    req != null ? req.fieldValue : null,
                    req != null ? req.userAsk : null
                );
                row.success = r.success;
                row.status = r.status;
                row.message = r.message;
                row.updatedField = r.updatedField;
                row.updatedValue = r.updatedValue;
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
