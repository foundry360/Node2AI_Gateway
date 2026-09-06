/** Display labels for policy pack domains (acronyms stay uppercase). */
const DOMAIN_LABELS: Record<string, string> = {
  enterprise: 'Enterprise',
  healthcare: 'Healthcare',
  hipaa: 'HIPAA',
  part2: '42 CFR Part 2',
  '42_cfr_part_2': '42 CFR Part 2',
  financial: 'Financial',
  legal: 'Legal',
  pci: 'PCI',
  gdpr: 'GDPR',
  sox: 'SOX',
  soc2: 'SOC 2',
  hitrust: 'HITRUST',
};

export function formatDomainLabel(domain: string | undefined | null): string {
  if (!domain) return '-';
  const key = domain.trim().toLowerCase();
  if (DOMAIN_LABELS[key]) return DOMAIN_LABELS[key];
  return domain.charAt(0).toUpperCase() + domain.slice(1);
}
