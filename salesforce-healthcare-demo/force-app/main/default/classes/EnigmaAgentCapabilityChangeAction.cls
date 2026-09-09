public with sharing class EnigmaAgentCapabilityChangeAction {
    public class Request {
        @InvocableVariable(
            label='Confirm Enable Write'
            description='Set true to evaluate enabling agent write capability in Enigma.'
            required=true
        )
        public Boolean confirmEnableWrite;

        @InvocableVariable(
            label='User Request'
            description='Exact text of what the end user asked the agent to do (add a note, update a case, send an email). This is the Prompt in Enigma — not write justification.'
        )
        public String requesterPrompt;

        @InvocableVariable(
            label='Rationale'
            description='Why write capability is needed to fulfill that user request (separate from the Prompt).'
        )
        public String agentRationale;

        @InvocableVariable(
            label='Intended Outcome'
            description='What should happen after a human Authorizes this change.'
        )
        public String intendedOutcome;
    }

    public class Response {
        @InvocableVariable(label='Success')
        public Boolean success;
        @InvocableVariable(label='Materiality')
        public String materiality;
        @InvocableVariable(label='Lifecycle Decision')
        public String lifecycleDecision;
        @InvocableVariable(label='Policy Decision')
        public String policyDecision;
        @InvocableVariable(label='Evaluation Id')
        public String evaluationId;
        @InvocableVariable(label='Change Id')
        public String changeId;
        @InvocableVariable(label='Request Id')
        public String requestId;
        @InvocableVariable(label='Change Types')
        public String changeTypes;
        @InvocableVariable(label='Message')
        public String message;
    }

    @InvocableMethod(
        label='Enigma Evaluate Write Capability Change'
        description='Ask Enigma to evaluate enabling write capability. Pass requesterPrompt as the user’s business ask (not write justification) so Request Review shows that Prompt.'
        category='Enigma'
    )
    public static List<Response> run(List<Request> requests) {
        List<Response> out = new List<Response>();
        for (Request req : requests) {
            Response row = new Response();
            if (req != null && req.confirmEnableWrite == false) {
                row.success = false;
                row.message = 'confirmEnableWrite must be true to evaluate.';
                out.add(row);
                continue;
            }
            try {
                EnigmaGatewayService.ChangeEvalResult r = EnigmaGatewayService.evaluateEnableWrite(
                    req != null ? req.requesterPrompt : null,
                    req != null ? req.agentRationale : null,
                    req != null ? req.intendedOutcome : null,
                    null
                );
                row.success = r.success;
                row.materiality = r.materiality;
                row.lifecycleDecision = r.lifecycleDecision;
                row.policyDecision = r.policyDecision;
                row.evaluationId = r.evaluationId;
                row.changeId = r.changeId;
                row.requestId = r.requestId;
                row.changeTypes = r.changeTypes;
                row.message = r.message;
            } catch (Exception e) {
                row.success = false;
                row.message = e.getMessage();
            }
            out.add(row);
        }
        return out;
    }
}
