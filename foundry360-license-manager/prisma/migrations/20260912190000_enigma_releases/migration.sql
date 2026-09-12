-- CreateEnum
CREATE TYPE "ReleaseType" AS ENUM ('PRODUCTION');

-- CreateEnum
CREATE TYPE "ReleaseStatus" AS ENUM ('DRAFT', 'APPROVED', 'DEPRECATED');

-- CreateEnum
CREATE TYPE "ReleaseArtifactType" AS ENUM ('DEPLOYMENT_PACKAGE');

-- CreateTable
CREATE TABLE "EnigmaRelease" (
    "id" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "releaseType" "ReleaseType" NOT NULL DEFAULT 'PRODUCTION',
    "status" "ReleaseStatus" NOT NULL DEFAULT 'DRAFT',
    "releaseNotes" TEXT,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EnigmaRelease_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EnigmaReleaseArtifact" (
    "id" TEXT NOT NULL,
    "releaseId" TEXT NOT NULL,
    "deploymentType" "DeploymentType" NOT NULL,
    "artifactType" "ReleaseArtifactType" NOT NULL DEFAULT 'DEPLOYMENT_PACKAGE',
    "fileName" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "sizeBytes" BIGINT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EnigmaReleaseArtifact_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EnigmaRelease_version_key" ON "EnigmaRelease"("version");

-- CreateIndex
CREATE INDEX "EnigmaRelease_status_idx" ON "EnigmaRelease"("status");

-- CreateIndex
CREATE INDEX "EnigmaRelease_publishedAt_idx" ON "EnigmaRelease"("publishedAt");

-- CreateIndex
CREATE INDEX "EnigmaReleaseArtifact_releaseId_idx" ON "EnigmaReleaseArtifact"("releaseId");

-- CreateIndex
CREATE INDEX "EnigmaReleaseArtifact_deploymentType_idx" ON "EnigmaReleaseArtifact"("deploymentType");

-- CreateIndex
CREATE UNIQUE INDEX "EnigmaReleaseArtifact_releaseId_deploymentType_artifactType_key" ON "EnigmaReleaseArtifact"("releaseId", "deploymentType", "artifactType");

-- AddForeignKey
ALTER TABLE "EnigmaReleaseArtifact" ADD CONSTRAINT "EnigmaReleaseArtifact_releaseId_fkey" FOREIGN KEY ("releaseId") REFERENCES "EnigmaRelease"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
