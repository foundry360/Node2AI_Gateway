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
    /** Optional disclosure/recipient context for output governance. */
    recipient: z.string().min(1).optional(),
    /** Agent identity when an agent is acting on the request. */
    agent_id: z.string().min(1).optional(),
    /** Tool identity when a tool invocation is in scope. */
    tool_id: z.string().min(1).optional(),
    /**
     * Entity types permitted under minimum-necessary scope.
     * Excess detected types are restricted by gateway transforms.
     */
    permitted_entity_types: z.array(z.string().min(1)).optional(),
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
        agent_authorized: z.boolean().optional(),
        tool_authorized: z.boolean().optional(),
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
        assurance: z
          .object({
            control_environment_documented: z.boolean().optional(),
            access_controls_verified: z.boolean().optional(),
            change_management_controls_verified: z.boolean().optional(),
            logical_access_controls_verified: z.boolean().optional(),
            data_protection_controls_verified: z.boolean().optional(),
            system_monitoring_controls_verified: z.boolean().optional(),
            incident_response_controls_verified: z.boolean().optional(),
            availability_controls_verified: z.boolean().optional(),
            processing_integrity_controls_verified: z.boolean().optional(),
            confidentiality_controls_verified: z.boolean().optional(),
            privacy_category_applicable: z.boolean().optional(),
            privacy_controls_verified: z.boolean().optional(),
          })
          .strict()
          .optional(),
        cybersecurity: z
          .object({
            govern: z
              .object({
                accountability_documented: z.boolean().optional(),
                cybersecurity_roles_defined: z.boolean().optional(),
                cybersecurity_policy_documented: z.boolean().optional(),
              })
              .strict()
              .optional(),
            identify: z
              .object({
                assets_identified: z.boolean().optional(),
                dependencies_identified: z.boolean().optional(),
                cybersecurity_risk_identified: z.boolean().optional(),
              })
              .strict()
              .optional(),
            protect: z
              .object({
                access_controls_documented: z.boolean().optional(),
                safeguards_implemented: z.boolean().optional(),
                data_protection_documented: z.boolean().optional(),
              })
              .strict()
              .optional(),
            detect: z
              .object({
                monitoring_established: z.boolean().optional(),
                anomalous_activity_detection: z.boolean().optional(),
                cybersecurity_events_logged: z.boolean().optional(),
              })
              .strict()
              .optional(),
            respond: z
              .object({
                response_plan_documented: z.boolean().optional(),
                incident_response_process: z.boolean().optional(),
                communication_process: z.boolean().optional(),
              })
              .strict()
              .optional(),
            recover: z
              .object({
                recovery_plan_documented: z.boolean().optional(),
                recovery_process: z.boolean().optional(),
                lessons_learned_process: z.boolean().optional(),
              })
              .strict()
              .optional(),
          })
          .strict()
          .optional(),
        organizational_governance: z
          .object({
            accountability: z
              .object({
                governing_body_accountable: z.boolean().optional(),
                executive_accountability_defined: z.boolean().optional(),
                ai_responsibilities_defined: z.boolean().optional(),
              })
              .strict()
              .optional(),
            direction: z
              .object({
                ai_governance_policy_defined: z.boolean().optional(),
                strategic_alignment_documented: z.boolean().optional(),
                acceptable_use_direction_defined: z.boolean().optional(),
              })
              .strict()
              .optional(),
            oversight: z
              .object({
                ai_oversight_established: z.boolean().optional(),
                reporting_path_defined: z.boolean().optional(),
                decision_rights_defined: z.boolean().optional(),
              })
              .strict()
              .optional(),
            stakeholder: z
              .object({
                relevant_stakeholders_identified: z.boolean().optional(),
                stakeholder_impacts_considered: z.boolean().optional(),
                stakeholder_communication_defined: z.boolean().optional(),
              })
              .strict()
              .optional(),
            decision_governance: z
              .object({
                human_accountability_defined: z.boolean().optional(),
                escalation_path_defined: z.boolean().optional(),
                significant_ai_decisions_reviewed: z.boolean().optional(),
              })
              .strict()
              .optional(),
            organizational_effectiveness: z
              .object({
                ai_use_objectives_defined: z.boolean().optional(),
                performance_monitoring_established: z.boolean().optional(),
                governance_review_established: z.boolean().optional(),
              })
              .strict()
              .optional(),
          })
          .strict()
          .optional(),
        information_security: z
          .object({
            isms: z
              .object({
                scope_defined: z.boolean().optional(),
                context_established: z.boolean().optional(),
                interested_parties_identified: z.boolean().optional(),
                information_security_objectives_defined: z.boolean().optional(),
              })
              .strict()
              .optional(),
            risk: z
              .object({
                risk_process_established: z.boolean().optional(),
                risks_identified: z.boolean().optional(),
                risks_assessed: z.boolean().optional(),
                risk_treatment_defined: z.boolean().optional(),
                risk_treatment_implemented: z.boolean().optional(),
                residual_risk_reviewed: z.boolean().optional(),
              })
              .strict()
              .optional(),
            information_assets: z
              .object({
                assets_identified: z.boolean().optional(),
                information_classification_defined: z.boolean().optional(),
                asset_ownership_defined: z.boolean().optional(),
              })
              .strict()
              .optional(),
            access: z
              .object({
                access_control_defined: z.boolean().optional(),
                identity_management_established: z.boolean().optional(),
                privileged_access_controlled: z.boolean().optional(),
                access_review_established: z.boolean().optional(),
              })
              .strict()
              .optional(),
            operations: z
              .object({
                operational_controls_established: z.boolean().optional(),
                change_management_established: z.boolean().optional(),
                logging_monitoring_established: z.boolean().optional(),
                backup_recovery_established: z.boolean().optional(),
              })
              .strict()
              .optional(),
            supplier_security: z
              .object({
                supplier_risk_controls_established: z.boolean().optional(),
                third_party_security_requirements_defined: z.boolean().optional(),
                supplier_monitoring_established: z.boolean().optional(),
              })
              .strict()
              .optional(),
            incident: z
              .object({
                incident_management_established: z.boolean().optional(),
                incident_response_defined: z.boolean().optional(),
                incident_learning_established: z.boolean().optional(),
              })
              .strict()
              .optional(),
            continuity: z
              .object({
                business_continuity_security_defined: z.boolean().optional(),
                resilience_controls_established: z.boolean().optional(),
                recovery_capability_established: z.boolean().optional(),
              })
              .strict()
              .optional(),
            people: z
              .object({
                security_roles_defined: z.boolean().optional(),
                security_awareness_established: z.boolean().optional(),
                personnel_security_controls_established: z.boolean().optional(),
              })
              .strict()
              .optional(),
            monitoring: z
              .object({
                security_performance_monitored: z.boolean().optional(),
                internal_review_established: z.boolean().optional(),
                management_review_established: z.boolean().optional(),
              })
              .strict()
              .optional(),
            improvement: z
              .object({
                nonconformities_managed: z.boolean().optional(),
                corrective_actions_managed: z.boolean().optional(),
                continual_improvement_established: z.boolean().optional(),
              })
              .strict()
              .optional(),
          })
          .strict()
          .optional(),
        privacy: z
          .object({
            processing_role: z
              .enum([
                'controller',
                'processor',
                'joint_controller',
                'other_defined_role',
                'unknown',
              ])
              .optional(),
            purpose_status: z
              .enum(['specified', 'documented', 'authorized', 'unknown'])
              .optional(),
            nist_pf: z
              .object({
                identify: z
                  .object({
                    processing_context_documented: z.boolean().optional(),
                    privacy_risk_identified: z.boolean().optional(),
                    data_actions_documented: z.boolean().optional(),
                  })
                  .strict()
                  .optional(),
                govern: z
                  .object({
                    policies_documented: z.boolean().optional(),
                    roles_documented: z.boolean().optional(),
                    risk_governance_documented: z.boolean().optional(),
                  })
                  .strict()
                  .optional(),
                control: z
                  .object({
                    data_actions_controlled: z.boolean().optional(),
                    individual_choice_addressed: z.boolean().optional(),
                  })
                  .strict()
                  .optional(),
                communicate: z
                  .object({
                    transparency_documented: z.boolean().optional(),
                    expectations_documented: z.boolean().optional(),
                  })
                  .strict()
                  .optional(),
                protect: z
                  .object({
                    privacy_risk_mitigation_documented: z.boolean().optional(),
                  })
                  .strict()
                  .optional(),
              })
              .strict()
              .optional(),
            pims: z
              .object({
                scope_defined: z.boolean().optional(),
                privacy_context_established: z.boolean().optional(),
                roles_responsibilities_defined: z.boolean().optional(),
                privacy_objectives_defined: z.boolean().optional(),
              })
              .strict()
              .optional(),
            pii_governance: z
              .object({
                pii_processing_inventory_established: z.boolean().optional(),
                processing_purposes_defined: z.boolean().optional(),
                processing_roles_defined: z.boolean().optional(),
                controller_processor_role_defined: z.boolean().optional(),
                processing_responsibilities_defined: z.boolean().optional(),
              })
              .strict()
              .optional(),
            privacy_risk: z
              .object({
                privacy_risk_process_established: z.boolean().optional(),
                privacy_risks_identified: z.boolean().optional(),
                privacy_risks_assessed: z.boolean().optional(),
                privacy_risk_treatment_defined: z.boolean().optional(),
                residual_privacy_risk_reviewed: z.boolean().optional(),
              })
              .strict()
              .optional(),
            privacy_impact: z
              .object({
                privacy_impact_assessment_established: z.boolean().optional(),
                potential_impacts_identified: z.boolean().optional(),
                affected_individuals_considered: z.boolean().optional(),
                mitigations_defined: z.boolean().optional(),
                residual_impact_reviewed: z.boolean().optional(),
              })
              .strict()
              .optional(),
            data_lifecycle: z
              .object({
                collection_governance_established: z.boolean().optional(),
                use_governance_established: z.boolean().optional(),
                sharing_governance_established: z.boolean().optional(),
                retention_governance_established: z.boolean().optional(),
                deletion_disposal_governance_established: z.boolean().optional(),
              })
              .strict()
              .optional(),
            rights: z
              .object({
                privacy_rights_process_established: z.boolean().optional(),
                rights_request_handling_established: z.boolean().optional(),
                identity_verification_for_rights_established: z.boolean().optional(),
                response_process_established: z.boolean().optional(),
              })
              .strict()
              .optional(),
            transparency: z
              .object({
                privacy_information_provided: z.boolean().optional(),
                processing_transparency_established: z.boolean().optional(),
                notice_governance_established: z.boolean().optional(),
              })
              .strict()
              .optional(),
            third_party: z
              .object({
                processor_requirements_defined: z.boolean().optional(),
                third_party_privacy_requirements_defined: z.boolean().optional(),
                processor_monitoring_established: z.boolean().optional(),
              })
              .strict()
              .optional(),
            privacy_incident: z
              .object({
                privacy_incident_process_established: z.boolean().optional(),
                privacy_breach_response_established: z.boolean().optional(),
                notification_process_established: z.boolean().optional(),
              })
              .strict()
              .optional(),
            monitoring: z
              .object({
                privacy_performance_monitored: z.boolean().optional(),
                privacy_review_established: z.boolean().optional(),
                management_review_established: z.boolean().optional(),
              })
              .strict()
              .optional(),
            improvement: z
              .object({
                privacy_nonconformities_managed: z.boolean().optional(),
                corrective_actions_managed: z.boolean().optional(),
                continual_improvement_established: z.boolean().optional(),
              })
              .strict()
              .optional(),
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
        predictive_dsi: z
          .object({
            applicability: z.string().min(1).optional(),
            organization_role: z.string().min(1).optional(),
            certified_health_it_context: z.boolean().optional(),
            algorithm_id: z.string().min(1).optional(),
            model_id: z.string().min(1).optional(),
            model_version: z.string().min(1).optional(),
            provider: z.string().min(1).optional(),
            application: z.string().min(1).optional(),
            agent: z.string().min(1).optional(),
            intended_use: z.string().min(1).optional(),
            intended_users: z.string().min(1).optional(),
            population: z.string().min(1).optional(),
            use_class: z.string().min(1).optional(),
            risk_tier: z.string().min(1).optional(),
            risk_level: z.string().min(1).optional(),
            environment: z.string().min(1).optional(),
            governance_status: z.string().min(1).optional(),
            transparency_sufficient: z.boolean().optional(),
            source_attributes_documented: z.boolean().optional(),
            development_info_available: z.boolean().optional(),
            evaluation_info_available: z.boolean().optional(),
            performance_info_available: z.boolean().optional(),
            known_limitations_documented: z.boolean().optional(),
            fairness_considerations_documented: z.boolean().optional(),
            monitoring_info_available: z.boolean().optional(),
            faves_status: z.string().min(1).optional(),
            faves: z
              .object({
                fair: z.boolean().optional(),
                appropriate: z.boolean().optional(),
                valid: z.boolean().optional(),
                effective: z.boolean().optional(),
                safe: z.boolean().optional(),
              })
              .strict()
              .optional(),
            risk_management_status: z.string().min(1).optional(),
            risk_management_sufficient: z.boolean().optional(),
            human_oversight: z.boolean().optional(),
            human_oversight_status: z.string().min(1).optional(),
            version_governance_current: z.boolean().optional(),
            version_changed: z.boolean().optional(),
          })
          .strict()
          .optional(),
        sensitive_data_processing: z
          .object({
            external_processing_authorized: z.boolean().optional(),
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
