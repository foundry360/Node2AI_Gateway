public with sharing class PatientEmrChartController {
    public class ChartDTO {
        @AuraEnabled public Patient__c patient;
        @AuraEnabled public List<Condition__c> conditions;
        @AuraEnabled public List<Prescription__c> prescriptions;
    }

    @AuraEnabled(cacheable=true)
    public static ChartDTO getChart(Id patientId) {
        if (patientId == null) {
            throw new AuraHandledException('Patient Id is required.');
        }

        ChartDTO chart = new ChartDTO();
        List<Patient__c> patients = [
            SELECT
                Id,
                Name,
                First_Name__c,
                Last_Name__c,
                MRN__c,
                Date_of_Birth__c,
                Gender__c,
                Phone__c,
                Email__c,
                Street__c,
                City__c,
                State__c,
                Postal_Code__c,
                Preferred_Language__c,
                Primary_Care_Provider__c,
                Insurance_Plan__c,
                Member_Id__c,
                Blood_Type__c,
                Height_in__c,
                Weight_lb__c,
                Patient_Status__c,
                Allergies__c,
                Emergency_Contact_Name__c,
                Emergency_Contact_Relation__c,
                Emergency_Contact_Phone__c,
                Primary_Diagnosis__c,
                Last_Visit_Date__c,
                Clinical_Notes__c
            FROM Patient__c
            WHERE Id = :patientId
            LIMIT 1
        ];
        if (patients.isEmpty()) {
            throw new AuraHandledException('Patient not found.');
        }
        chart.patient = patients[0];
        chart.conditions = [
            SELECT Id, Name, ICD10_Code__c, Status__c, Onset_Date__c, Notes__c
            FROM Condition__c
            WHERE Patient__c = :patientId
            ORDER BY Status__c, Name
        ];
        chart.prescriptions = [
            SELECT
                Id,
                Name,
                Dosage__c,
                Frequency__c,
                Route__c,
                Status__c,
                Prescriber__c,
                Start_Date__c,
                End_Date__c,
                Instructions__c
            FROM Prescription__c
            WHERE Patient__c = :patientId
            ORDER BY Status__c, Name
        ];
        return chart;
    }
}
