/** Application categories enforced by Enigma policy. */
export const APPLICATION_TYPE_OPTIONS = [
  {
    value: 'clinical',
    label: 'Clinical',
    description: 'Healthcare / PHI-governed',
  },
  {
    value: 'financial',
    label: 'Financial',
    description: 'Payments, banking, or SOX-sensitive workloads',
  },
  {
    value: 'customer',
    label: 'Customer',
    description: 'CRM / support customer PII',
  },
  {
    value: 'internal',
    label: 'Internal',
    description: 'Internal ops / admin tooling',
  },
  {
    value: 'custom',
    label: 'Custom',
    description: 'General integration when no domain pack applies',
  },
] as const;

export type ApplicationTypeOption = (typeof APPLICATION_TYPE_OPTIONS)[number]['value'];
