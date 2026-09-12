import { LightningElement, api, wire } from 'lwc';
import { refreshApex } from '@salesforce/apex';
import { notifyRecordUpdateAvailable } from 'lightning/uiRecordApi';
import getChart from '@salesforce/apex/PatientEmrChartController.getChart';
import deleteClinicalNote from '@salesforce/apex/PatientEmrChartController.deleteClinicalNote';
import ensureNotesMigrated from '@salesforce/apex/PatientEmrChartController.ensureNotesMigrated';

export default class PatientEmrChart extends LightningElement {
  @api recordId;

  chartWireResult;
  notesRefreshing = false;
  notesBusy = false;
  /** Optimistic list after delete until wire refresh lands. */
  notesOverride;

  connectedCallback() {
    this.migrateAndRefresh();
  }

  async migrateAndRefresh() {
    if (!this.recordId) {
      return;
    }
    try {
      const created = await ensureNotesMigrated({ patientId: this.recordId });
      if (created > 0 && this.chartWireResult) {
        await refreshApex(this.chartWireResult);
      }
    } catch {
      /* ignore migration errors; chart still loads */
    }
  }

  @wire(getChart, { patientId: '$recordId' })
  wiredChart(result) {
    this.chartWireResult = result;
    if (result?.data) {
      this.notesOverride = undefined;
    }
  }

  get loading() {
    return !this.chartWireResult?.data && !this.chartWireResult?.error;
  }

  get errorMessage() {
    if (!this.chartWireResult?.error) {
      return undefined;
    }
    const err = this.chartWireResult.error;
    if (Array.isArray(err?.body)) {
      return err.body.map((e) => e.message).join(', ');
    }
    return err?.body?.message || err?.message || 'Unable to load patient chart.';
  }

  get patient() {
    return this.chartWireResult?.data?.patient;
  }

  get conditions() {
    return this.chartWireResult?.data?.conditions || [];
  }

  get prescriptions() {
    return this.chartWireResult?.data?.prescriptions || [];
  }

  get clinicalNoteItems() {
    if (this.notesOverride) {
      return this.notesOverride;
    }
    return this.chartWireResult?.data?.clinicalNotes || [];
  }

  get hasClinicalNotes() {
    return this.clinicalNoteItems.length > 0;
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
      return '-';
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
      return '-';
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
      return '-';
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
      return '-';
    }
    return ((703 * w) / (h * h)).toFixed(1);
  }

  get addressLine() {
    const p = this.patient;
    if (!p) {
      return '-';
    }
    const cityState = [p.City__c, p.State__c].filter(Boolean).join(', ');
    const line = [p.Street__c, cityState, p.Postal_Code__c]
      .filter(Boolean)
      .join(' · ');
    return line || '-';
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

  get refreshDisabled() {
    return this.notesRefreshing || this.notesBusy || !this.recordId;
  }

  async handleRefreshNotes() {
    if (!this.recordId || this.notesRefreshing) {
      return;
    }
    this.notesRefreshing = true;
    try {
      this.notesOverride = undefined;
      try {
        await ensureNotesMigrated({ patientId: this.recordId });
      } catch {
        /* ignore */
      }
      const jobs = [];
      if (this.chartWireResult) {
        jobs.push(refreshApex(this.chartWireResult));
      }
      jobs.push(notifyRecordUpdateAvailable([{ recordId: this.recordId }]));
      await Promise.all(jobs);
    } finally {
      this.notesRefreshing = false;
    }
  }

  async handleDeleteNote(event) {
    const noteId = event.currentTarget?.dataset?.id;
    if (!noteId || !this.recordId || this.notesBusy) {
      return;
    }
    // eslint-disable-next-line no-alert
    if (!window.confirm('Delete this clinical note?')) {
      return;
    }
    this.notesBusy = true;
    try {
      const remaining = await deleteClinicalNote({
        noteId,
        patientId: this.recordId
      });
      this.notesOverride = remaining || [];
      if (this.chartWireResult) {
        await refreshApex(this.chartWireResult);
      }
      await notifyRecordUpdateAvailable([{ recordId: this.recordId }]);
    } catch (e) {
      // eslint-disable-next-line no-alert
      window.alert(e?.body?.message || e?.message || 'Unable to delete note.');
    } finally {
      this.notesBusy = false;
    }
  }
}
