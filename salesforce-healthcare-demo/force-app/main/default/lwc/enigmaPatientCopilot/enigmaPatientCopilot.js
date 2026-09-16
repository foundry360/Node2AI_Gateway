import { LightningElement, api, track } from 'lwc';
import { notifyRecordUpdateAvailable } from 'lightning/uiRecordApi';
import handleUtterance from '@salesforce/apex/EnigmaPatientCopilotController.handleUtterance';

let msgSeq = 0;

function normalizeUtterance(s) {
  return (s || '')
    .trim()
    .toLowerCase()
    .replace(/[.!?]+$/g, '')
    .replace(/\s+/g, ' ');
}

function holdStorageKey(recordId) {
  return `enigma.copilot.pendingHold.${recordId || ''}`;
}

function readStoredHold(recordId) {
  try {
    const raw = sessionStorage.getItem(holdStorageKey(recordId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.evaluationId || !parsed?.utterance) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeStoredHold(recordId, hold) {
  try {
    if (!hold) {
      sessionStorage.removeItem(holdStorageKey(recordId));
      return;
    }
    sessionStorage.setItem(holdStorageKey(recordId), JSON.stringify(hold));
  } catch {
    /* private mode / quota — in-memory pendingHold still works */
  }
}

export default class EnigmaPatientCopilot extends LightningElement {
  @api recordId;

  @track messages = [
    {
      id: 'm0',
      role: 'assistant',
      cssClass: 'bubble bubble-assistant',
      text:
        'I’m this patient’s clinical copilot. Ask chart questions, request a summary, add notes, or update fields. Enigma governs model calls and writes.'
    }
  ];
  draft = '';
  busy = false;
  error;
  /** Pending HELD write — retry same utterance resumes this Decision. */
  pendingHold;

  connectedCallback() {
    this.pendingHold = readStoredHold(this.recordId) || undefined;
  }

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

  setPendingHold(hold) {
    this.pendingHold = hold || undefined;
    writeStoredHold(this.recordId, hold || null);
  }

  async send() {
    const text = (this.draft || '').trim();
    if (!text || !this.recordId || this.busy) return;

    if (!this.pendingHold) {
      this.pendingHold = readStoredHold(this.recordId) || undefined;
    }

    this.error = undefined;
    this.busy = true;
    this.messages = [
      ...this.messages,
      { id: `u${++msgSeq}`, role: 'user', cssClass: this.bubbleClass('user'), text }
    ];
    this.draft = '';

    try {
      const sameAsHold =
        this.pendingHold &&
        normalizeUtterance(this.pendingHold.utterance) ===
          normalizeUtterance(text);

      const result = await handleUtterance({
        patientId: this.recordId,
        utterance: text,
        resumeEvaluationId: sameAsHold ? this.pendingHold.evaluationId : null,
        resumeWriteKind: sameAsHold ? this.pendingHold.writeKind : null,
        resumeNoteBody: sameAsHold ? this.pendingHold.noteBody : null,
        resumeFieldApi: sameAsHold ? this.pendingHold.fieldApi : null,
        resumeFieldValue: sameAsHold ? this.pendingHold.fieldValue : null,
        resumeMedicationName: sameAsHold
          ? this.pendingHold.medicationName
          : null,
        resumeFrequency: sameAsHold ? this.pendingHold.frequency : null,
        resumePrescriptionStatus: sameAsHold
          ? this.pendingHold.prescriptionStatus
          : null
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
      if (result?.status === 'HELD' && result?.evaluationId) {
        const nextHold = {
          evaluationId:
            this.pendingHold &&
            normalizeUtterance(this.pendingHold.utterance) ===
              normalizeUtterance(text)
              ? this.pendingHold.evaluationId
              : result.evaluationId,
          utterance: text,
          writeKind:
            result.writeKind ||
            this.pendingHold?.writeKind ||
            'note',
          noteBody: result.noteBody || this.pendingHold?.noteBody || text,
          fieldApi: result.fieldApi || this.pendingHold?.fieldApi || null,
          fieldValue:
            result.fieldValue || this.pendingHold?.fieldValue || null,
          medicationName:
            result.medicationName ||
            this.pendingHold?.medicationName ||
            null,
          frequency:
            result.frequency || this.pendingHold?.frequency || null,
          prescriptionStatus:
            result.prescriptionStatus ||
            this.pendingHold?.prescriptionStatus ||
            null
        };
        this.setPendingHold(nextHold);
      } else if (result?.status === 'COMPLETED') {
        this.setPendingHold(null);
      } else if (result?.status === 'ERROR') {
        // Keep pending hold when resume failed but Decision is still open.
        if (!result?.evaluationId || !this.pendingHold) {
          this.setPendingHold(null);
        }
      }
      if (result?.refreshChart) {
        try {
          await notifyRecordUpdateAvailable([{ recordId: this.recordId }]);
        } catch {
          /* ignore */
        }
        try {
          window.dispatchEvent(
            new CustomEvent('enigmachartrefresh', {
              detail: { recordId: this.recordId }
            })
          );
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
