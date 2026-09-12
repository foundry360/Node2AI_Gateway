import { LightningElement } from 'lwc';

const STYLE_ID = 'enigma-hide-salesforce-highlights';

/**
 * Occupies the record-page header slot and hides the standard Salesforce
 * Highlights chrome (object icon + compact-layout fields). Does not touch
 * the custom Chart blue banner inside patientEmrChart.
 */
export default class HideSalesforceHighlights extends LightningElement {
  connectedCallback() {
    this.ensureStyle();
  }

  renderedCallback() {
    this.ensureStyle();
  }

  ensureStyle() {
    if (typeof document === 'undefined') {
      return;
    }
    if (document.getElementById(STYLE_ID)) {
      return;
    }
    const style = document.createElement('style');
    style.id = STYLE_ID;
    // Target the standard LEX Highlights / record-home page header only.
    style.textContent = `
      records-lwc-highlights-panel,
      force-highlights-details-panel,
      .forceHighlightPanel,
      .slds-page-header.slds-page-header_record-home,
      .slds-page-header.slds-page-header_joined,
      header.slds-page-header,
      .slds-brand-band .slds-page-header,
      .oneContent .slds-page-header,
      flexipage-component2[data-component-id="force_highlightsPanel"],
      flexipage-component2[data-component-id*="highlightsPanel"],
      flexipage-component2[data-component-id*="Highlights"],
      flexipage-component2[data-component-id*="dynamicHighlights"] {
        display: none !important;
        height: 0 !important;
        min-height: 0 !important;
        max-height: 0 !important;
        overflow: hidden !important;
        margin: 0 !important;
        padding: 0 !important;
        border: 0 !important;
        visibility: hidden !important;
      }
    `;
    document.head.appendChild(style);
  }
}
