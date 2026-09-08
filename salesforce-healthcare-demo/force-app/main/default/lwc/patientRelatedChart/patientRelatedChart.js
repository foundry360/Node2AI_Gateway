import { LightningElement, api, wire } from 'lwc';
import getConditions from '@salesforce/apex/PatientRelatedChartController.getConditions';
import getPrescriptions from '@salesforce/apex/PatientRelatedChartController.getPrescriptions';

export default class PatientRelatedChart extends LightningElement {
  @api recordId;

  conditionColumns = [
    { label: 'Condition', fieldName: 'Name', type: 'text' },
    { label: 'ICD-10', fieldName: 'ICD10_Code__c', type: 'text' },
    { label: 'Status', fieldName: 'Status__c', type: 'text' },
    { label: 'Onset', fieldName: 'Onset_Date__c', type: 'date' },
    { label: 'Notes', fieldName: 'Notes__c', type: 'text' }
  ];

  prescriptionColumns = [
    { label: 'Medication', fieldName: 'Name', type: 'text' },
    { label: 'Dosage', fieldName: 'Dosage__c', type: 'text' },
    { label: 'Frequency', fieldName: 'Frequency__c', type: 'text' },
    { label: 'Route', fieldName: 'Route__c', type: 'text' },
    { label: 'Status', fieldName: 'Status__c', type: 'text' },
    { label: 'Prescriber', fieldName: 'Prescriber__c', type: 'text' }
  ];

  @wire(getConditions, { patientId: '$recordId' })
  conditionWire;

  @wire(getPrescriptions, { patientId: '$recordId' })
  prescriptionWire;

  get conditions() {
    return this.conditionWire?.data || [];
  }

  get prescriptions() {
    return this.prescriptionWire?.data || [];
  }

  get conditionError() {
    return this.conditionWire?.error
      ? this.stringifyError(this.conditionWire.error)
      : undefined;
  }

  get prescriptionError() {
    return this.prescriptionWire?.error
      ? this.stringifyError(this.prescriptionWire.error)
      : undefined;
  }

  get hasConditions() {
    return this.conditions.length > 0;
  }

  get hasPrescriptions() {
    return this.prescriptions.length > 0;
  }

  stringifyError(err) {
    if (Array.isArray(err?.body)) {
      return err.body.map((e) => e.message).join(', ');
    }
    return err?.body?.message || err?.message || 'Unable to load related records';
  }
}
