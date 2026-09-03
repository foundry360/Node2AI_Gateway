{{/*
Expand the name of the chart.
*/}}
{{- define "node2-enterprise.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Create a default fully qualified app name.
We truncate at 63 chars because some Kubernetes name fields are limited to this (by the DNS naming spec).
If release name contains chart name it will be used as a full name.
*/}}
{{- define "node2-enterprise.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- if contains $name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}
{{- end }}

{{/*
Create chart name and version as used by the chart label.
*/}}
{{- define "node2-enterprise.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Common labels
*/}}
{{- define "node2-enterprise.labels" -}}
helm.sh/chart: {{ include "node2-enterprise.chart" . }}
{{ include "node2-enterprise.selectorLabels" . }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{/*
Selector labels
*/}}
{{- define "node2-enterprise.selectorLabels" -}}
app.kubernetes.io/name: {{ include "node2-enterprise.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{/*
Create the name of the service account to use
*/}}
{{- define "node2-enterprise.serviceAccountName" -}}
{{- if .Values.serviceAccount.create }}
{{- default (include "node2-enterprise.fullname" .) .Values.serviceAccount.name }}
{{- else }}
{{- default "default" .Values.serviceAccount.name }}
{{- end }}
{{- end }}

{{/*
Create the name of the config map to use
*/}}
{{- define "node2-enterprise.configMapName" -}}
{{- if .Values.configMap.create }}
{{- default (include "node2-enterprise.fullname" .) .Values.configMap.name }}
{{- else }}
{{- default "default" .Values.configMap.name }}
{{- end }}
{{- end }}

{{/*
Create the name of the secret to use
*/}}
{{- define "node2-enterprise.secretName" -}}
{{- if .Values.secret.create }}
{{- default (include "node2-enterprise.fullname" .) .Values.secret.name }}
{{- else }}
{{- default "default" .Values.secret.name }}
{{- end }}
{{- end }}

{{/*
Create the name of the persistent volume claim to use
*/}}
{{- define "node2-enterprise.pvcName" -}}
{{- if .Values.persistence.enabled }}
{{- default (include "node2-enterprise.fullname" .) .Values.persistence.name }}
{{- else }}
{{- default "default" .Values.persistence.name }}
{{- end }}
{{- end }}

{{/*
Create the name of the models persistent volume claim to use
*/}}
{{- define "node2-enterprise.modelsPvcName" -}}
{{- if .Values.airgap.models.enabled }}
{{- default (printf "%s-models" (include "node2-enterprise.fullname" .)) .Values.airgap.models.name }}
{{- else }}
{{- default "default" .Values.airgap.models.name }}
{{- end }}
{{- end }}

{{/*
Create the name of the backup persistent volume claim to use
*/}}
{{- define "node2-enterprise.backupPvcName" -}}
{{- if .Values.backup.enabled }}
{{- default (printf "%s-backup" (include "node2-enterprise.fullname" .)) .Values.backup.storage.name }}
{{- else }}
{{- default "default" .Values.backup.storage.name }}
{{- end }}
{{- end }}

{{/*
Create the name of the ingress to use
*/}}
{{- define "node2-enterprise.ingressName" -}}
{{- if .Values.ingress.enabled }}
{{- default (include "node2-enterprise.fullname" .) .Values.ingress.name }}
{{- else }}
{{- default "default" .Values.ingress.name }}
{{- end }}
{{- end }}

{{/*
Create the name of the service to use
*/}}
{{- define "node2-enterprise.serviceName" -}}
{{- default (include "node2-enterprise.fullname" .) .Values.service.name }}
{{- end }}

{{/*
Create the name of the deployment to use
*/}}
{{- define "node2-enterprise.deploymentName" -}}
{{- default (include "node2-enterprise.fullname" .) .Values.deployment.name }}
{{- end }}

{{/*
Create the name of the pod disruption budget to use
*/}}
{{- define "node2-enterprise.pdbName" -}}
{{- if .Values.podDisruptionBudget.enabled }}
{{- default (include "node2-enterprise.fullname" .) .Values.podDisruptionBudget.name }}
{{- else }}
{{- default "default" .Values.podDisruptionBudget.name }}
{{- end }}
{{- end }}

{{/*
Create the name of the horizontal pod autoscaler to use
*/}}
{{- define "node2-enterprise.hpaName" -}}
{{- if .Values.autoscaling.enabled }}
{{- default (include "node2-enterprise.fullname" .) .Values.autoscaling.name }}
{{- else }}
{{- default "default" .Values.autoscaling.name }}
{{- end }}
{{- end }}

{{/*
Create the name of the network policy to use
*/}}
{{- define "node2-enterprise.networkPolicyName" -}}
{{- if .Values.networkPolicy.enabled }}
{{- default (include "node2-enterprise.fullname" .) .Values.networkPolicy.name }}
{{- else }}
{{- default "default" .Values.networkPolicy.name }}
{{- end }}
{{- end }}

{{/*
Create the name of the service monitor to use
*/}}
{{- define "node2-enterprise.serviceMonitorName" -}}
{{- if .Values.monitoring.prometheus.serviceMonitor.enabled }}
{{- default (include "node2-enterprise.fullname" .) .Values.monitoring.prometheus.serviceMonitor.name }}
{{- else }}
{{- default "default" .Values.monitoring.prometheus.serviceMonitor.name }}
{{- end }}
{{- end }}

{{/*
Create the name of the backup cron job to use
*/}}
{{- define "node2-enterprise.backupCronJobName" -}}
{{- if .Values.backup.enabled }}
{{- default (printf "%s-backup" (include "node2-enterprise.fullname" .)) .Values.backup.name }}
{{- else }}
{{- default "default" .Values.backup.name }}
{{- end }}
{{- end }}

{{/*
Create the name of the ollama deployment to use
*/}}
{{- define "node2-enterprise.ollamaDeploymentName" -}}
{{- if .Values.airgap.ollama.enabled }}
{{- default (printf "%s-ollama" (include "node2-enterprise.fullname" .)) .Values.airgap.ollama.name }}
{{- else }}
{{- default "default" .Values.airgap.ollama.name }}
{{- end }}
{{- end }}

{{/*
Create the name of the model manager deployment to use
*/}}
{{- define "node2-enterprise.modelManagerDeploymentName" -}}
{{- if .Values.airgap.models.enabled }}
{{- default (printf "%s-model-manager" (include "node2-enterprise.fullname" .)) .Values.airgap.models.name }}
{{- else }}
{{- default "default" .Values.airgap.models.name }}
{{- end }}
{{- end }}
