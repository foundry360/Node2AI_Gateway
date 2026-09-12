-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "CustomerStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "DeploymentType" AS ENUM ('VPC', 'AIR_GAPPED');

-- CreateEnum
CREATE TYPE "DeploymentEnvironment" AS ENUM ('PRODUCTION', 'NON_PRODUCTION');

-- CreateEnum
CREATE TYPE "DeploymentStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'RETIRED');

-- CreateEnum
CREATE TYPE "LicenseStatus" AS ENUM ('DRAFT', 'ISSUED', 'REVOKED', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "LicenseEventType" AS ENUM ('CREATED', 'ISSUED', 'DOWNLOADED', 'RENEWED', 'REVOKED', 'REPLACED');

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('VIEWER', 'ADMINISTRATOR');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'VIEWER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Customer" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "externalReference" TEXT,
    "contactName" TEXT,
    "contactEmail" TEXT,
    "status" "CustomerStatus" NOT NULL DEFAULT 'ACTIVE',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Deployment" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "deploymentId" TEXT NOT NULL,
    "deploymentType" "DeploymentType" NOT NULL,
    "environment" "DeploymentEnvironment" NOT NULL DEFAULT 'PRODUCTION',
    "description" TEXT,
    "status" "DeploymentStatus" NOT NULL DEFAULT 'ACTIVE',
    "firstRegisteredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUpdatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Deployment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "License" (
    "id" TEXT NOT NULL,
    "licenseId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "deploymentDbId" TEXT NOT NULL,
    "deploymentId" TEXT NOT NULL,
    "deploymentType" "DeploymentType" NOT NULL,
    "validFrom" TEXT NOT NULL,
    "validUntil" TEXT NOT NULL,
    "graceDays" INTEGER NOT NULL DEFAULT 30,
    "status" "LicenseStatus" NOT NULL DEFAULT 'DRAFT',
    "licenseVersion" INTEGER NOT NULL DEFAULT 1,
    "keyId" TEXT NOT NULL DEFAULT 'enigma-lic-2026-09',
    "issuedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "revocationReason" TEXT,
    "artifactSha256" TEXT,
    "artifactFilename" TEXT,
    "artifactPath" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "replacedById" TEXT,
    "replacesId" TEXT,

    CONSTRAINT "License_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LicenseEvent" (
    "id" TEXT NOT NULL,
    "licenseDbId" TEXT NOT NULL,
    "licenseId" TEXT NOT NULL,
    "eventType" "LicenseEventType" NOT NULL,
    "actor" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LicenseEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "Deployment_deploymentId_key" ON "Deployment"("deploymentId");

-- CreateIndex
CREATE INDEX "Deployment_customerId_idx" ON "Deployment"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "License_licenseId_key" ON "License"("licenseId");

-- CreateIndex
CREATE INDEX "License_customerId_idx" ON "License"("customerId");

-- CreateIndex
CREATE INDEX "License_deploymentDbId_idx" ON "License"("deploymentDbId");

-- CreateIndex
CREATE INDEX "License_deploymentId_idx" ON "License"("deploymentId");

-- CreateIndex
CREATE INDEX "License_status_idx" ON "License"("status");

-- CreateIndex
CREATE INDEX "LicenseEvent_licenseDbId_idx" ON "LicenseEvent"("licenseDbId");

-- CreateIndex
CREATE INDEX "LicenseEvent_licenseId_idx" ON "LicenseEvent"("licenseId");

-- CreateIndex
CREATE INDEX "LicenseEvent_createdAt_idx" ON "LicenseEvent"("createdAt");

-- AddForeignKey
ALTER TABLE "Deployment" ADD CONSTRAINT "Deployment_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "License" ADD CONSTRAINT "License_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "License" ADD CONSTRAINT "License_deploymentDbId_fkey" FOREIGN KEY ("deploymentDbId") REFERENCES "Deployment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LicenseEvent" ADD CONSTRAINT "LicenseEvent_licenseDbId_fkey" FOREIGN KEY ("licenseDbId") REFERENCES "License"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
