import { z } from 'zod';

/** Flags that attempt to disable security controls — always rejected. */
export const FORBIDDEN_SECURITY_OVERRIDE_KEYS = [
  'sanitize_input',
  'sanitize_output',
  'skip_policy',
  'skip_inspection',
  'bypass_governance',
  'disable_audit',
] as const;

export const completionRequestSchema = z
  .object({
    application_id: z.string().min(1),
    user: z.object({ id: z.string().min(1) }),
    operation: z.string().min(1),
    model: z.string().min(1).optional(),
    messages: z
      .array(
        z.object({
          role: z.enum(['system', 'user', 'assistant']),
          content: z.string(),
        }),
      )
      .min(1),
    /** Optional purpose of use (authorization/TPO context for policy). */
    purpose: z.string().min(1).optional(),
    /** Authorization/consent basis only — not governance documentation. */
    authorization_context: z.string().min(1).optional(),
    source_system: z.string().min(1).optional(),
    processing_location: z.string().min(1).optional(),
    /**
     * Generic governance evidence for policy evaluation.
     * Distinct from authorization_context.
     */
    governance_context: z
      .object({
        accountability_documented: z.boolean().optional(),
        system_context_documented: z.boolean().optional(),
        measurement_documented: z.boolean().optional(),
        risk_response_documented: z.boolean().optional(),
        security_controls: z
          .object({
            prompt_injection_controls: z.boolean().optional(),
            sensitive_data_controls: z.boolean().optional(),
            supply_chain_controls: z.boolean().optional(),
            poisoning_controls: z.boolean().optional(),
            output_validation_controls: z.boolean().optional(),
            agency_controls: z.boolean().optional(),
            system_prompt_protection: z.boolean().optional(),
            retrieval_security_controls: z.boolean().optional(),
            grounding_controls: z.boolean().optional(),
            resource_limits: z.boolean().optional(),
          })
          .strict()
          .optional(),
        management_system: z
          .object({
            ai_policy_established: z.boolean().optional(),
            roles_responsibilities_documented: z.boolean().optional(),
            ai_system_inventory_documented: z.boolean().optional(),
            risk_process_established: z.boolean().optional(),
            risk_assessment_completed: z.boolean().optional(),
            risk_treatment_documented: z.boolean().optional(),
            impact_assessment_completed: z.boolean().optional(),
            data_governance_established: z.boolean().optional(),
            human_oversight_defined: z.boolean().optional(),
            operational_controls_defined: z.boolean().optional(),
            monitoring_established: z.boolean().optional(),
            performance_evaluation_established: z.boolean().optional(),
            incident_process_established: z.boolean().optional(),
            internal_review_completed: z.boolean().optional(),
            continual_improvement_process_established: z.boolean().optional(),
          })
          .strict()
          .optional(),
        ai_risk: z
          .object({
            risk_management_established: z.boolean().optional(),
            risk_context_defined: z.boolean().optional(),
            risk_identification_completed: z.boolean().optional(),
            risk_analysis_completed: z.boolean().optional(),
            risk_evaluation_completed: z.boolean().optional(),
            risk_treatment_defined: z.boolean().optional(),
            risk_treatment_implemented: z.boolean().optional(),
            residual_risk_accepted: z.boolean().optional(),
            risk_monitoring_established: z.boolean().optional(),
            risk_communication_established: z.boolean().optional(),
            risk_review_established: z.boolean().optional(),
          })
          .strict()
          .optional(),
        impact: z
          .object({
            impact_assessment_completed: z.boolean().optional(),
            impact_scope_defined: z.boolean().optional(),
            affected_stakeholders_identified: z.boolean().optional(),
            potential_impacts_identified: z.boolean().optional(),
            impact_severity_assessed: z.boolean().optional(),
            impact_likelihood_assessed: z.boolean().optional(),
            mitigations_defined: z.boolean().optional(),
            mitigations_implemented: z.boolean().optional(),
            residual_impact_reviewed: z.boolean().optional(),
            impact_monitoring_established: z.boolean().optional(),
            impact_review_established: z.boolean().optional(),
          })
          .strict()
          .optional(),
        regulatory: z
          .object({
            actor_role: z.string().min(1).optional(),
            deployment_jurisdiction: z.string().min(1).optional(),
            market_placement_jurisdiction: z.string().min(1).optional(),
            affected_person_jurisdiction: z.string().min(1).optional(),
            provider_jurisdiction: z.string().min(1).optional(),
            regulatory_risk_category: z.string().min(1).optional(),
            prohibited_practice_code: z.string().min(1).optional(),
            high_risk_use_declared: z.boolean().optional(),
            high_risk_applicability: z.string().min(1).optional(),
            high_risk_pathway: z.string().min(1).optional(),
            high_risk_art6_1: z.boolean().optional(),
            intended_purpose: z.string().min(1).optional(),
            risk_management_system: z.boolean().optional(),
            data_governance: z.boolean().optional(),
            technical_documentation: z.boolean().optional(),
            logging_record_keeping: z.boolean().optional(),
            deployer_transparency: z.boolean().optional(),
            human_oversight: z.boolean().optional(),
            accuracy_robustness_cybersecurity: z.boolean().optional(),
            direct_ai_interaction: z.boolean().optional(),
            ai_interaction_disclosure: z.boolean().optional(),
            synthetic_or_manipulated_content: z.boolean().optional(),
            synthetic_content_marking: z.boolean().optional(),
            deepfake_content: z.boolean().optional(),
            deepfake_labeling: z.boolean().optional(),
            public_interest_ai_text: z.boolean().optional(),
            human_review_or_editorial_control: z.boolean().optional(),
            gpai_model: z.boolean().optional(),
            gpai_systemic_risk: z.boolean().optional(),
            gpai_technical_documentation: z.boolean().optional(),
            gpai_downstream_information: z.boolean().optional(),
            gpai_copyright_policy: z.boolean().optional(),
            gpai_training_content_summary: z.boolean().optional(),
            gpai_systemic_risk_assessment: z.boolean().optional(),
            gpai_systemic_risk_mitigation: z.boolean().optional(),
            gpai_incident_reporting: z.boolean().optional(),
            gpai_cybersecurity: z.boolean().optional(),
          })
          .strict()
          .optional(),
      })
      .strict()
      .optional(),
    /**
     * Evaluation timestamp (ISO-8601 date or datetime) for phased obligations.
     * When omitted, Gateway stamps request time once at the boundary.
     */
    evaluation_as_of: z.string().min(1).optional(),
    /** Optional regulatory applicability tags merged into classification reason codes. */
    regulatory_applicability: z.array(z.string().min(1)).optional(),
    metadata: z
      .object({
        correlation_id: z.string().optional(),
      })
      .passthrough()
      .optional(),
  })
  .strict();

export type CompletionRequestBody = z.infer<typeof completionRequestSchema>;

export function findForbiddenOverrides(body: unknown): string[] {
  if (!body || typeof body !== 'object') return [];
  const keys = Object.keys(body as Record<string, unknown>);
  return FORBIDDEN_SECURITY_OVERRIDE_KEYS.filter((k) => keys.includes(k));
}
