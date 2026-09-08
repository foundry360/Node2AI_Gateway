public with sharing class EnigmaSummarizeController {
    @AuraEnabled
    public static EnigmaGatewayService.CompletionResult summarizePatient(Id patientId) {
        try {
            EnigmaGatewayService.CompletionResult result = EnigmaGatewayService.summarizePatient(
                patientId
            );
            if (result.success) {
                update new Patient__c(
                    Id = patientId,
                    Enigma_Summary__c = result.summary,
                    Last_Enigma_Request_Id__c = result.requestId
                );
            }
            return result;
        } catch (EnigmaGatewayService.EnigmaException e) {
            throw new AuraHandledException(e.getMessage());
        } catch (Exception e) {
            throw new AuraHandledException(e.getMessage());
        }
    }
}
