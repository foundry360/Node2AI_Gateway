import { LightningElement, api, wire } from 'lwc';
import { getRecord, getFieldValue, notifyRecordUpdateAvailable } from 'lightning/uiRecordApi';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import summarizePatient from '@salesforce/apex/EnigmaSummarizeController.summarizePatient';
import CLINICAL_NOTES from '@salesforce/schema/Patient__c.Clinical_Notes__c';
import ENIGMA_SUMMARY from '@salesforce/schema/Patient__c.Enigma_Summary__c';
import LAST_REQUEST from '@salesforce/schema/Patient__c.Last_Enigma_Request_Id__c';

const FIELDS = [CLINICAL_NOTES, ENIGMA_SUMMARY, LAST_REQUEST];

export default class PatientEnigmaSummary extends LightningElement {
  @api recordId;
  busy = false;
  errorMessage;
  lastResult;

  @wire(getRecord, { recordId: '$recordId', fields: FIELDS })
  patient;

  get notes() {
    return getFieldValue(this.patient.data, CLINICAL_NOTES);
  }

  get existingSummary() {
    return this.lastResult?.summary || getFieldValue(this.patient.data, ENIGMA_SUMMARY);
  }

  get requestId() {
    return this.lastResult?.requestId || getFieldValue(this.patient.data, LAST_REQUEST);
  }

  get canSummarize() {
    return !!this.recordId && !this.busy;
  }

  get isSummarizeDisabled() {
    return !this.canSummarize;
  }

  get summarizeLabel() {
    return this.busy ? 'Summarizing…' : 'Summarize';
  }

  async handleSummarize() {
    this.busy = true;
    this.errorMessage = undefined;
    try {
      const result = await summarizePatient({ patientId: this.recordId });
      this.lastResult = result;
      if (result?.success) {
        this.dispatchEvent(
          new ShowToastEvent({
            title: 'Enigma summary ready',
            message: result.requestId
              ? `Request ${result.requestId}`
              : 'Summary returned through Enigma.',
            variant: 'success'
          })
        );
        await notifyRecordUpdateAvailable([{ recordId: this.recordId }]);
      } else {
        this.errorMessage =
          result?.message ||
          `Enigma ${result?.status || 'blocked'}${
            result?.reasonCode ? ` (${result.reasonCode})` : ''
          }`;
        this.dispatchEvent(
          new ShowToastEvent({
            title: 'Enigma blocked or failed',
            message: this.errorMessage,
            variant: 'error',
            mode: 'sticky'
          })
        );
      }
    } catch (e) {
      this.errorMessage = e?.body?.message || e?.message || 'Callout failed';
      this.dispatchEvent(
        new ShowToastEvent({
          title: 'Enigma callout error',
          message: this.errorMessage,
          variant: 'error',
          mode: 'sticky'
        })
      );
    } finally {
      this.busy = false;
    }
  }
}
