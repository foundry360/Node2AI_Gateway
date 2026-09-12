public with sharing class PatientEmrChartController {
    public class ChartDTO {
        @AuraEnabled public Patient__c patient;
        @AuraEnabled public List<Condition__c> conditions;
        @AuraEnabled public List<Prescription__c> prescriptions;
        @AuraEnabled public List<ClinicalNoteDTO> clinicalNotes;
    }

    public class ClinicalNoteDTO {
        @AuraEnabled public Id id;
        @AuraEnabled public String name;
        @AuraEnabled public String body;
        @AuraEnabled public String source;
        @AuraEnabled public Datetime notedAt;
        @AuraEnabled public String notedAtLabel;
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
        chart.clinicalNotes = listNotes(patientId);
        return chart;
    }

    /** Split legacy Clinical_Notes__c blob into Clinical_Note__c rows when needed. */
    @AuraEnabled
    public static Integer ensureNotesMigrated(Id patientId) {
        if (patientId == null) {
            throw new AuraHandledException('Patient Id is required.');
        }
        return migrateLegacyNotesIfNeeded(patientId);
    }

    @AuraEnabled
    public static List<ClinicalNoteDTO> deleteClinicalNote(Id noteId, Id patientId) {
        if (noteId == null || patientId == null) {
            throw new AuraHandledException('Note Id and Patient Id are required.');
        }
        List<Clinical_Note__c> notes = [
            SELECT Id, Patient__c
            FROM Clinical_Note__c
            WHERE Id = :noteId AND Patient__c = :patientId
            LIMIT 1
        ];
        if (notes.isEmpty()) {
            throw new AuraHandledException('Clinical note not found.');
        }
        delete notes;
        EnigmaGatewayService.rebuildClinicalNotesBlob(patientId);
        return listNotes(patientId);
    }

    private static List<ClinicalNoteDTO> listNotes(Id patientId) {
        List<ClinicalNoteDTO> out = new List<ClinicalNoteDTO>();
        for (Clinical_Note__c n : [
            SELECT Id, Name, Body__c, Source__c, Noted_At__c, CreatedDate
            FROM Clinical_Note__c
            WHERE Patient__c = :patientId
            ORDER BY Noted_At__c DESC NULLS LAST, CreatedDate DESC
        ]) {
            ClinicalNoteDTO dto = new ClinicalNoteDTO();
            dto.id = n.Id;
            dto.name = n.Name;
            dto.body = n.Body__c;
            dto.source = n.Source__c;
            dto.notedAt = n.Noted_At__c != null ? n.Noted_At__c : n.CreatedDate;
            dto.notedAtLabel = dto.notedAt == null
                ? ''
                : dto.notedAt.format('yyyy-MM-dd HH:mm');
            out.add(dto);
        }
        return out;
    }

    /**
     * One-time split of legacy Patient.Clinical_Notes__c into Clinical_Note__c rows.
     * @return number of notes created
     */
    private static Integer migrateLegacyNotesIfNeeded(Id patientId) {
        Integer existing = [
            SELECT COUNT()
            FROM Clinical_Note__c
            WHERE Patient__c = :patientId
        ];
        if (existing > 0) {
            return 0;
        }
        Patient__c patient = [
            SELECT Id, Clinical_Notes__c
            FROM Patient__c
            WHERE Id = :patientId
            LIMIT 1
        ];
        if (String.isBlank(patient.Clinical_Notes__c)) {
            return 0;
        }
        List<Clinical_Note__c> created = new List<Clinical_Note__c>();
        String notesText = patient.Clinical_Notes__c.trim();
        Pattern stamp = Pattern.compile('\\n\\n\\[Agent [^\\]]+\\] ');
        Matcher m = stamp.matcher(notesText);
        List<Integer> starts = new List<Integer>{ 0 };
        while (m.find()) {
            starts.add(m.start());
        }
        for (Integer i = 0; i < starts.size(); i++) {
            Integer fromIdx = starts[i];
            Integer toIdx = i + 1 < starts.size() ? starts[i + 1] : notesText.length();
            String segment = notesText.substring(fromIdx, toIdx).trim();
            if (String.isBlank(segment)) {
                continue;
            }
            String source = 'Seed';
            String body = segment;
            Datetime notedAt = Datetime.now().addMinutes(-(starts.size() - i));
            Matcher agent = Pattern.compile('^\\[Agent ([^\\]]+)\\] ([\\s\\S]*)$')
                .matcher(segment);
            if (agent.find()) {
                source = 'Agent';
                body = agent.group(2) != null ? agent.group(2).trim() : segment;
                try {
                    notedAt = Datetime.valueOfGmt(
                        agent.group(1).replace(' UTC', '').trim() + ':00'
                    );
                } catch (Exception ignore) {
                    notedAt = Datetime.now();
                }
            }
            created.add(
                new Clinical_Note__c(
                    Patient__c = patientId,
                    Body__c = body,
                    Source__c = source,
                    Noted_At__c = notedAt
                )
            );
        }
        if (!created.isEmpty()) {
            insert created;
        }
        return created.size();
    }
}
