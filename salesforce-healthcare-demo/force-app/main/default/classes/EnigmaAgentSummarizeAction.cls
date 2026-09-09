public with sharing class EnigmaAgentSummarizeAction {
    public class Request {
        @InvocableVariable(required=true label='Patient Id')
        public Id patientId;
    }

    public class Response {
        @InvocableVariable(label='Success')
        public Boolean success;
        @InvocableVariable(label='Status')
        public String status;
        @InvocableVariable(label='Summary')
        public String summary;
        @InvocableVariable(label='Request Id')
        public String requestId;
        @InvocableVariable(label='Reason Code')
        public String reasonCode;
        @InvocableVariable(label='Message')
        public String message;
    }

    @InvocableMethod(
        label='Enigma Summarize Patient'
        description='Summarize a Patient chart through Enigma Gateway (read path).'
        category='Enigma'
    )
    public static List<Response> run(List<Request> requests) {
        List<Response> out = new List<Response>();
        for (Request req : requests) {
            Response row = new Response();
            try {
                EnigmaGatewayService.CompletionResult r = EnigmaSummarizeController.summarizePatient(
                    req.patientId
                );
                row.success = r.success;
                row.status = r.status;
                row.summary = r.summary;
                row.requestId = r.requestId;
                row.reasonCode = r.reasonCode;
                row.message = r.message;
            } catch (Exception e) {
                row.success = false;
                row.status = 'error';
                row.message = e.getMessage();
            }
            out.add(row);
        }
        return out;
    }
}
