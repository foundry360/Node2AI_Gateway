import { LightningElement } from 'lwc';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import listScenarios from '@salesforce/apex/EnigmaScenarioController.listScenarios';
import runScenario from '@salesforce/apex/EnigmaScenarioController.runScenario';

export default class EnigmaScenarioConsole extends LightningElement {
  scenarios = [];
  loadError;
  busy = false;
  activeId;
  result;
  loading = true;

  connectedCallback() {
    this.loadScenarios();
  }

  async loadScenarios() {
    this.loading = true;
    this.loadError = undefined;
    try {
      const data = await listScenarios();
      const rows = Array.isArray(data) ? data : [];
      this.scenarios = rows.map((s) => this.decorate(s));
      if (this.scenarios.length === 0) {
        this.loadError = 'No scenarios returned from EnigmaScenarioController.';
      }
    } catch (e) {
      this.scenarios = [];
      this.loadError = e?.body?.message || e?.message || 'Failed to load scenarios';
    } finally {
      this.loading = false;
    }
  }

  get reasonDisplay() {
    return this.result?.reasonCode || '-';
  }

  get requestIdDisplay() {
    return this.result?.requestId || '-';
  }

  get hasTokenizedInput() {
    return !!this.result?.tokenizedInput;
  }

  get hasTokenizedOutput() {
    return !!this.result?.tokenizedOutput;
  }

  get showReleasedResponse() {
    return (
      !!this.result?.summary &&
      this.result.summary !== this.result.tokenizedOutput
    );
  }

  get policyDecisionDisplay() {
    return this.result?.policyDecision || '-';
  }

  get inputXformDisplay() {
    return this.result?.inputTransformation || '-';
  }

  get resultMatchLabel() {
    if (!this.result) return '';
    return this.result.matchedExpectation ? 'Expectation matched' : 'Unexpected outcome';
  }

  get resultBannerClass() {
    return this.result?.matchedExpectation
      ? 'result-banner ok'
      : 'result-banner miss';
  }

  get hasScenarios() {
    return this.scenarios.length > 0;
  }

  decorate(s) {
    // Do not object-spread Apex wire/imperative results. LWC proxies omit fields.
    const id = s.id;
    const active = id === this.activeId;
    return {
      id,
      title: s.title,
      description: s.description,
      expected: s.expected,
      model: s.model,
      purpose: s.purpose,
      includeExternalAuth: s.includeExternalAuth === true,
      contentPreview: s.contentPreview,
      evidenceLabel:
        s.includeExternalAuth === true
          ? 'external_processing_authorized'
          : 'none',
      runLabel: this.busy && active ? 'Running…' : 'Run',
      cardClass: active ? 'scenario-card active' : 'scenario-card'
    };
  }

  refreshScenarioDecorations() {
    this.scenarios = this.scenarios.map((s) => this.decorate(s));
  }

  async handleRun(event) {
    const scenarioId = event.currentTarget.dataset.id;
    if (!scenarioId || this.busy) return;

    this.busy = true;
    this.activeId = scenarioId;
    this.result = undefined;
    this.refreshScenarioDecorations();

    try {
      const result = await runScenario({ scenarioId });
      this.result = {
        scenarioId: result.scenarioId,
        title: result.title,
        expected: result.expected,
        success: result.success,
        status: result.status,
        reasonCode: result.reasonCode,
        message: result.message,
        requestId: result.requestId,
        summary: result.summary,
        modelUsed: result.modelUsed,
        matchedExpectation: result.matchedExpectation === true,
        policyDecision: result.policyDecision,
        inputTransformation: result.inputTransformation,
        tokenizedInput: result.tokenizedInput,
        tokenizedOutput: result.tokenizedOutput
      };
      this.dispatchEvent(
        new ShowToastEvent({
          title: this.result.matchedExpectation
            ? 'Scenario matched'
            : 'Scenario finished',
          message: this.result.requestId
            ? `${this.result.status || 'done'} · ${this.result.requestId}`
            : this.result.status || 'done',
          variant: this.result.matchedExpectation ? 'success' : 'warning',
          mode: this.result.matchedExpectation ? 'dismissible' : 'sticky'
        })
      );
    } catch (e) {
      const message = e?.body?.message || e?.message || 'Scenario callout failed';
      this.result = {
        title: 'Callout error',
        expected: '-',
        status: 'error',
        reasonCode: 'CALLOUT_ERROR',
        message,
        matchedExpectation: false,
        modelUsed: '-'
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
      this.refreshScenarioDecorations();
    }
  }
}
