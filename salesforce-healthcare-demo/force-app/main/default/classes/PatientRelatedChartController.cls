public with sharing class PatientRelatedChartController {
    @AuraEnabled(cacheable=true)
    public static List<Condition__c> getConditions(Id patientId) {
        return [
            SELECT Id, Name, ICD10_Code__c, Status__c, Onset_Date__c, Notes__c
            FROM Condition__c
            WHERE Patient__c = :patientId
            ORDER BY Status__c, Name
        ];
    }

    @AuraEnabled(cacheable=true)
    public static List<Prescription__c> getPrescriptions(Id patientId) {
        return [
            SELECT
                Id,
                Name,
                Dosage__c,
                Frequency__c,
                Route__c,
                Status__c,
                Prescriber__c,
                Instructions__c
            FROM Prescription__c
            WHERE Patient__c = :patientId
            ORDER BY Status__c, Name
        ];
    }
}
