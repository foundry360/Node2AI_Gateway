import { LightningElement, api, wire } from 'lwc';
import getChart from '@salesforce/apex/PatientEmrChartController.getChart';

export default class PatientEmrChart extends LightningElement {
  @api recordId;

  @wire(getChart, { patientId: '$recordId' })
  chartWire;

  get loading() {
    return !this.chartWire?.data && !this.chartWire?.error;
  }

  get errorMessage() {
    if (!this.chartWire?.error) {
      return undefined;
    }
    const err = this.chartWire.error;
    if (Array.isArray(err?.body)) {
      return err.body.map((e) => e.message).join(', ');
    }
    return err?.body?.message || err?.message || 'Unable to load patient chart.';
  }

  get patient() {
    return this.chartWire?.data?.patient;
  }

  get conditions() {
    return this.chartWire?.data?.conditions || [];
  }

  get prescriptions() {
    return this.chartWire?.data?.prescriptions || [];
  }

  get displayName() {
    const p = this.patient;
    if (!p) {
      return '';
    }
    if (p.First_Name__c || p.Last_Name__c) {
      return [p.First_Name__c, p.Last_Name__c].filter(Boolean).join(' ');
    }
    return p.Name || '';
  }

  get initials() {
    const p = this.patient;
    if (!p) {
      return '?';
    }
    const first = (p.First_Name__c || p.Name || '?').trim().charAt(0);
    const last = (p.Last_Name__c || '').trim().charAt(0);
    return `${first}${last}`.toUpperCase();
  }

  get ageLabel() {
    const dob = this.patient?.Date_of_Birth__c;
    if (!dob) {
      return '—';
    }
    const birth = new Date(dob);
    const today = new Date();
    let age = today.getFullYear() - birth.getFullYear();
    const m = today.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) {
      age -= 1;
    }
    return `${age} y/o`;
  }

  get dobLabel() {
    const dob = this.patient?.Date_of_Birth__c;
    if (!dob) {
      return '—';
    }
    return new Date(dob).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  }

  get lastVisitLabel() {
    const d = this.patient?.Last_Visit_Date__c;
    if (!d) {
      return '—';
    }
    return new Date(d).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  }

  get bmiLabel() {
    const h = Number(this.patient?.Height_in__c);
    const w = Number(this.patient?.Weight_lb__c);
    if (!h || !w) {
      return '—';
    }
    return ((703 * w) / (h * h)).toFixed(1);
  }

  get addressLine() {
    const p = this.patient;
    if (!p) {
      return '—';
    }
    const cityState = [p.City__c, p.State__c].filter(Boolean).join(', ');
    const line = [p.Street__c, cityState, p.Postal_Code__c].filter(Boolean).join(' · ');
    return line || '—';
  }

  get hasAllergies() {
    return Boolean(this.patient?.Allergies__c);
  }

  get activeConditions() {
    return this.conditions.filter((c) => c.Status__c !== 'Resolved');
  }

  get resolvedConditions() {
    return this.conditions.filter((c) => c.Status__c === 'Resolved');
  }

  get activeMeds() {
    return this.prescriptions.filter((c) => c.Status__c === 'Active');
  }

  get otherMeds() {
    return this.prescriptions.filter((c) => c.Status__c !== 'Active');
  }

  get hasActiveConditions() {
    return this.activeConditions.length > 0;
  }

  get hasResolvedConditions() {
    return this.resolvedConditions.length > 0;
  }

  get hasActiveMeds() {
    return this.activeMeds.length > 0;
  }

  get hasOtherMeds() {
    return this.otherMeds.length > 0;
  }

  get statusClass() {
    const status = (this.patient?.Patient_Status__c || '').toLowerCase();
    return status === 'active' ? 'status status-active' : 'status';
  }
}
