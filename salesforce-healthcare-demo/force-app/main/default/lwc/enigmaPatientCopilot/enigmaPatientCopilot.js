import { LightningElement, api, track } from 'lwc';
import { notifyRecordUpdateAvailable } from 'lightning/uiRecordApi';
import handleUtterance from '@salesforce/apex/EnigmaPatientCopilotController.handleUtterance';

let msgSeq = 0;

export default class EnigmaPatientCopilot extends LightningElement {
  @api recordId;

  @track messages = [
    {
      id: 'm0',
      role: 'assistant',
      cssClass: 'bubble bubble-assistant',
      text:
        'I can help with this patient. Ask me to summarize the chart, add a clinical note, or update phone/email. Writes are governed by Enigma automatically.'
    }
  ];
  draft = '';
  busy = false;
  error;

  get canSend() {
    return !!this.recordId && !this.busy && !!this.draft?.trim();
  }

  get isSendDisabled() {
    return !this.canSend;
  }

  get sendLabel() {
    return this.busy ? '…' : 'Send';
  }

  bubbleClass(role) {
    return role === 'user' ? 'bubble bubble-user' : 'bubble bubble-assistant';
  }

  handleDraftChange(event) {
    this.draft = event.target.value;
  }

  handleKeydown(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.send();
    }
  }

  useSuggestion(event) {
    this.draft = event.currentTarget.dataset.text || '';
    this.send();
  }

  async send() {
    const text = (this.draft || '').trim();
    if (!text || !this.recordId || this.busy) return;

    this.error = undefined;
    this.busy = true;
    this.messages = [
      ...this.messages,
      { id: `u${++msgSeq}`, role: 'user', cssClass: this.bubbleClass('user'), text }
    ];
    this.draft = '';

    try {
      const result = await handleUtterance({
        patientId: this.recordId,
        utterance: text
      });
      this.messages = [
        ...this.messages,
        {
          id: `a${++msgSeq}`,
          role: 'assistant',
          cssClass: this.bubbleClass('assistant'),
          text: result?.reply || 'No response.',
          status: result?.status,
          evaluationId: result?.evaluationId
        }
      ];
      if (result?.refreshChart) {
        try {
          await notifyRecordUpdateAvailable([{ recordId: this.recordId }]);
        } catch {
          /* ignore */
        }
      }
    } catch (e) {
      this.error = e?.body?.message || e?.message || 'Request failed';
      this.messages = [
        ...this.messages,
        {
          id: `e${++msgSeq}`,
          role: 'assistant',
          cssClass: this.bubbleClass('assistant'),
          text: this.error,
          status: 'ERROR'
        }
      ];
    } finally {
      this.busy = false;
      // eslint-disable-next-line @lwc/lwc/no-async-operation
      requestAnimationFrame(() => {
        const scroller = this.template.querySelector('.copilot-messages');
        if (scroller) scroller.scrollTop = scroller.scrollHeight;
      });
    }
  }
}
