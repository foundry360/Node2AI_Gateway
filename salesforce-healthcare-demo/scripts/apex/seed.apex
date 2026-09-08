// Refresh Charles Greene chart with demographics, conditions, and prescriptions.

Enigma_Config__c cfg = Enigma_Config__c.getOrgDefaults();
if (cfg.Id == null || String.isBlank(cfg.Endpoint_URL__c)) {
  cfg.Endpoint_URL__c = 'https://4141d90c578775.lhr.life';
  cfg.Application_Id__c = 'app_clinical';
  cfg.Api_Key__c = 'n2ai_test_key_approved_app';
  cfg.Default_Model__c = 'local-general-v1';
  upsert cfg;
}

List<Patient__c> existing = [
  SELECT Id FROM Patient__c WHERE MRN__c = 'MRN-10042' LIMIT 1
];
if (!existing.isEmpty()) {
  delete existing;
}

Patient__c p = new Patient__c(
  Name = 'Charles Greene',
  First_Name__c = 'Charles',
  Last_Name__c = 'Greene',
  MRN__c = 'MRN-10042',
  Date_of_Birth__c = Date.newInstance(1978, 8, 22),
  Gender__c = 'Male',
  Phone__c = '(415) 555-0142',
  Email__c = 'charles.greene.demo@example.com',
  Street__c = '1847 Mission Street, Apt 4B',
  City__c = 'San Francisco',
  State__c = 'CA',
  Postal_Code__c = '94103',
  Preferred_Language__c = 'English',
  Primary_Care_Provider__c = 'Dr. Alicia Nguyen, MD',
  Insurance_Plan__c = 'Blue Shield PPO Gold',
  Member_Id__c = 'BS-88442109',
  Blood_Type__c = 'O+',
  Height_in__c = 70,
  Weight_lb__c = 198,
  Patient_Status__c = 'Active',
  Allergies__c = 'Penicillin (rash); shellfish (anaphylaxis risk — avoid)',
  Emergency_Contact_Name__c = 'Patricia Greene',
  Emergency_Contact_Relation__c = 'Spouse',
  Emergency_Contact_Phone__c = '(415) 555-0198',
  Primary_Diagnosis__c = 'Type 2 diabetes mellitus; Essential hypertension',
  Last_Visit_Date__c = Date.today().addDays(-14),
  Clinical_Notes__c =
    'Follow-up visit for diabetes and hypertension.\n' +
    'BP 138/86, HR 78, BMI 28.4. Patient reports improved diet compliance and ' +
    'walking 20 minutes most days. Denies chest pain, SOB, or hypoglycemia.\n' +
    'A1C drawn today (pending). Foot exam unremarkable. Discussed medication adherence ' +
    'and low-sodium diet. Continue current regimen. Return in 3 months or sooner if symptoms.'
);
insert p;

insert new List<Condition__c>{
  new Condition__c(
    Patient__c = p.Id,
    Name = 'Type 2 diabetes mellitus',
    ICD10_Code__c = 'E11.9',
    Status__c = 'Chronic',
    Onset_Date__c = Date.newInstance(2019, 6, 1),
    Notes__c = 'Diet and oral agent managed; last A1C 7.2% (3 months prior).'
  ),
  new Condition__c(
    Patient__c = p.Id,
    Name = 'Essential (primary) hypertension',
    ICD10_Code__c = 'I10',
    Status__c = 'Chronic',
    Onset_Date__c = Date.newInstance(2020, 1, 15),
    Notes__c = 'Stage 1; lifestyle + ACE inhibitor.'
  ),
  new Condition__c(
    Patient__c = p.Id,
    Name = 'Obesity, class I',
    ICD10_Code__c = 'E66.01',
    Status__c = 'Active',
    Onset_Date__c = Date.newInstance(2018, 1, 1),
    Notes__c = 'BMI currently ~28.4 after lifestyle changes.'
  ),
  new Condition__c(
    Patient__c = p.Id,
    Name = 'Seasonal allergic rhinitis',
    ICD10_Code__c = 'J30.2',
    Status__c = 'Resolved',
    Onset_Date__c = Date.newInstance(2010, 4, 1),
    Notes__c = 'Seasonal; PRN antihistamine historically.'
  )
};

insert new List<Prescription__c>{
  new Prescription__c(
    Patient__c = p.Id,
    Name = 'Metformin',
    Dosage__c = '500 mg',
    Frequency__c = 'Twice daily',
    Route__c = 'Oral',
    Prescriber__c = 'Dr. Alicia Nguyen',
    Start_Date__c = Date.newInstance(2019, 7, 1),
    Status__c = 'Active',
    Instructions__c = 'Take with meals. Hold if severe GI illness or contrast study.'
  ),
  new Prescription__c(
    Patient__c = p.Id,
    Name = 'Lisinopril',
    Dosage__c = '10 mg',
    Frequency__c = 'Once daily',
    Route__c = 'Oral',
    Prescriber__c = 'Dr. Alicia Nguyen',
    Start_Date__c = Date.newInstance(2020, 2, 1),
    Status__c = 'Active',
    Instructions__c = 'Monitor for cough or dizziness. Check BMP periodically.'
  ),
  new Prescription__c(
    Patient__c = p.Id,
    Name = 'Atorvastatin',
    Dosage__c = '20 mg',
    Frequency__c = 'Nightly',
    Route__c = 'Oral',
    Prescriber__c = 'Dr. Alicia Nguyen',
    Start_Date__c = Date.newInstance(2021, 3, 10),
    Status__c = 'Active',
    Instructions__c = 'Take in evening. Report muscle pain.'
  ),
  new Prescription__c(
    Patient__c = p.Id,
    Name = 'Aspirin',
    Dosage__c = '81 mg',
    Frequency__c = 'Once daily',
    Route__c = 'Oral',
    Prescriber__c = 'Dr. Alicia Nguyen',
    Start_Date__c = Date.newInstance(2021, 3, 10),
    End_Date__c = Date.newInstance(2024, 1, 1),
    Status__c = 'Discontinued',
    Instructions__c = 'Discontinued after risk/benefit review; no ASCVD event history.'
  )
};

System.debug('Seeded rich chart for patient Id=' + p.Id);
