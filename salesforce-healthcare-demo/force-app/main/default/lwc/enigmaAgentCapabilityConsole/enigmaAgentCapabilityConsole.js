import { LightningElement, track } from 'lwc';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import { notifyRecordUpdateAvailable } from 'lightning/uiRecordApi';
import getConsoleState from '@salesforce/apex/EnigmaAgentConsoleController.getConsoleState';
import enableWriteCapability from '@salesforce/apex/EnigmaAgentConsoleController.enableWriteCapability';
import summarizePatient from '@salesforce/apex/EnigmaAgentConsoleController.summarizePatient';
import updateClinicalNotes from '@salesforce/apex/EnigmaAgentConsoleController.updateClinicalNotes';

export default class EnigmaAgentCapabilityConsole extends LightningElement {
  @track patients = [];
  @track selectedPatientId;
  @track baselineId;
  @track writeCapability = false;
  @track baselineOk = false;
  @track baselineMessage;
  @track agentTargetId = 'agent_enigma_clinical';
  @track userRequest = '';
  @track noteText = '';
  @track result;
  @track loading = true;
  @track busy = false;
  @track capabilityChangeShown = false;
  loadError;

  connectedCallback() {
    this.refreshState();
  }

  get patientOptions() {
    return (this.patients || []).map((p) => ({
      label: `${p.name}${p.mrn ? ' · ' + p.mrn : ''}`,
      value: p.id
    }));
  }

  get writeCapabilityLabel() {
    return this.writeCapability ? 'true' : 'false';
  }

  get canUpdateNotes() {
    return this.capabilityChangeShown === true && !!this.selectedPatientId;
  }

  get notesDisabled() {
    return this.busy || !this.canUpdateNotes || !this.noteText?.trim();
  }

  get resultBannerClass() {
    if (!this.result) return 'result-banner';
    return this.result.matched
      ? 'result-banner ok'
      : 'result-banner miss';
  }

  get resultMatchLabel() {
    if (!this.result) return '';
    return this.result.matched ? 'Expectation matched' : 'Outcome';
  }

  async refreshState() {
    this.loading = true;
    this.loadError = undefined;
    try {
      const state = await getConsoleState();
      this.patients = Array.isArray(state.patients) ? state.patients : [];
      this.agentTargetId = state.agentTargetId || 'agent_enigma_clinical';
      this.baselineId = state.baselineId;
      this.writeCapability = state.writeCapability === true;
      this.baselineOk = state.baselineOk === true;
      this.baselineMessage = state.baselineMessage;
      if (!this.selectedPatientId && this.patients.length) {
        const greene = this.patients.find((p) =>
          (p.mrn || '').includes('10042')
        );
        this.selectedPatientId = greene ? greene.id : this.patients[0].id;
      }
      if (!this.baselineOk) {
        this.loadError = this.baselineMessage || 'Baseline unavailable';
      }
    } catch (e) {
      this.loadError = e?.body?.message || e?.message || 'Failed to load console';
    } finally {
      this.loading = false;
    }
  }

  handlePatientChange(event) {
    this.selectedPatientId = event.detail.value;
  }

  handleNoteChange(event) {
    this.noteText = event.target.value;
  }

  handleUserRequestChange(event) {
    this.userRequest = event.target.value;
  }

  async handleEnableWrite() {
    if (this.busy) return;
    const prompt = (this.userRequest || '').trim();
    if (!prompt) {
      this.dispatchEvent(
        new ShowToastEvent({
          title: 'User request required',
          message:
            'Enter what the user asked the agent to do (e.g. add a note, update a case). That text is the Prompt in Enigma.',
          variant: 'warning'
        })
      );
      return;
    }
    this.busy = true;
    this.result = undefined;
    try {
      const r = await enableWriteCapability({
        requesterPrompt: prompt,
        agentRationale:
          'Write capability is required to fulfill the user request after Enigma Authorize.'
      });
      const matched =
        r.success === true &&
        r.materiality === 'CRITICAL' &&
        r.lifecycleDecision === 'MANDATORY_REVIEW' &&
        String(r.policyDecision || '').toUpperCase() === 'REVIEW';
      this.capabilityChangeShown = matched || r.success === true;
      this.result = {
        title: 'Enable write capability',
        matched,
        status: r.status || (r.success ? 'evaluated' : 'error'),
        materiality: r.materiality || '—',
        lifecycleDecision: r.lifecycleDecision || '—',
        policyDecision: r.policyDecision || '—',
        evaluationId: r.evaluationId || '—',
        changeId: r.changeId || '—',
        requestId: r.requestId || '—',
        changeTypes: r.changeTypes || '—',
        message: r.message || ''
      };
      this.dispatchEvent(
        new ShowToastEvent({
          title: matched ? 'CRITICAL write change held' : 'Change evaluated',
          message: r.evaluationId || r.message || '',
          variant: matched ? 'success' : 'warning',
          mode: matched ? 'dismissible' : 'sticky'
        })
      );
    } catch (e) {
      const message = e?.body?.message || e?.message || 'Enable write failed';
      this.result = {
        title: 'Enable write capability',
        matched: false,
        status: 'error',
        materiality: '—',
        lifecycleDecision: '—',
        policyDecision: '—',
        evaluationId: '—',
        changeId: '—',
        requestId: '—',
        changeTypes: '—',
        message
      };
      this.dispatchEvent(
        new ShowToastEvent({
          title: 'Enigma callout error',
          message,
          variant: 'error',
          mode: 'sticky'
        })
      );
    } finally {
      this.busy = false;
    }
  }

  async handleSummarize() {
    if (this.busy || !this.selectedPatientId) return;
    this.busy = true;
    this.result = undefined;
    try {
      const r = await summarizePatient({ patientId: this.selectedPatientId });
      this.result = {
        title: 'Summarize via Enigma',
        matched: r.success === true && r.status === 'approved',
        status: r.status || '—',
        materiality: '—',
        lifecycleDecision: '—',
        policyDecision: r.policyDecision || '—',
        evaluationId: '—',
        changeId: '—',
        requestId: r.requestId || '—',
        changeTypes: '—',
        message: r.summary || r.message || ''
      };
    } catch (e) {
      this.result = {
        title: 'Summarize via Enigma',
        matched: false,
        status: 'error',
        materiality: '—',
        lifecycleDecision: '—',
        policyDecision: '—',
        evaluationId: '—',
        changeId: '—',
        requestId: '—',
        changeTypes: '—',
        message: e?.body?.message || e?.message || 'Summarize failed'
      };
    } finally {
      this.busy = false;
    }
  }

  async handleUpdateNotes() {
    if (this.busy || !this.canUpdateNotes) return;
    this.busy = true;
    try {
      const r = await updateClinicalNotes({
        patientId: this.selectedPatientId,
        noteAppend: this.noteText,
        capabilityChangeShown: this.capabilityChangeShown
      });
      this.noteText = '';
      try {
        await notifyRecordUpdateAvailable([
          { recordId: this.selectedPatientId }
        ]);
      } catch (e) {
        // Chart can still Refresh manually if LDS notify fails.
      }
      this.result = {
        title: 'Update clinical notes',
        matched: r.success === true,
        status: r.success ? 'updated' : 'error',
        materiality: '—',
        lifecycleDecision: '—',
        policyDecision: '—',
        evaluationId: '—',
        changeId: '—',
        requestId: '—',
        changeTypes: '—',
        message: r.message || ''
      };
      this.dispatchEvent(
        new ShowToastEvent({
          title: 'Notes updated',
          message: 'Open the patient chart and Refresh if notes do not appear yet.',
          variant: 'success'
        })
      );
    } catch (e) {
      this.result = {
        title: 'Update clinical notes',
        matched: false,
        status: 'error',
        materiality: '—',
        lifecycleDecision: '—',
        policyDecision: '—',
        evaluationId: '—',
        changeId: '—',
        requestId: '—',
        changeTypes: '—',
        message: e?.body?.message || e?.message || 'Update failed'
      };
    } finally {
      this.busy = false;
    }
  }
}
