-- CreateEnum
CREATE TYPE "public"."AgentStatus" AS ENUM ('Active', 'Quarantined', 'Retired');

-- CreateEnum
CREATE TYPE "public"."TurnOutcome" AS ENUM ('Valid', 'Timeout', 'ApiError', 'Malformed');

-- CreateEnum
CREATE TYPE "public"."JobType" AS ENUM ('Activate', 'SubmitRound', 'Settle', 'MarkOracleFailure');

-- CreateEnum
CREATE TYPE "public"."JobStatus" AS ENUM ('Pending', 'Leased', 'Succeeded', 'Failed');

-- CreateEnum
CREATE TYPE "public"."EvidenceResult" AS ENUM ('Pass', 'Fail', 'Blocker');

-- CreateTable
CREATE TABLE "public"."StrategyCommitment" (
    "commitment" VARCHAR(64) NOT NULL,
    "matchPda" VARCHAR(64) NOT NULL,
    "playerWallet" VARCHAR(64) NOT NULL,
    "strategy" TEXT NOT NULL,
    "salt" VARCHAR(64) NOT NULL,
    "byteLength" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StrategyCommitment_pkey" PRIMARY KEY ("commitment")
);

-- CreateTable
CREATE TABLE "public"."BattleAgent" (
    "playerWallet" VARCHAR(64) NOT NULL,
    "agentId" TEXT NOT NULL,
    "agentWallet" VARCHAR(64) NOT NULL,
    "model" TEXT NOT NULL,
    "preset" TEXT NOT NULL,
    "lastZeroBalanceCheck" TIMESTAMP(3),
    "status" "public"."AgentStatus" NOT NULL DEFAULT 'Active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BattleAgent_pkey" PRIMARY KEY ("playerWallet")
);

-- CreateTable
CREATE TABLE "public"."MatchProjection" (
    "matchPda" VARCHAR(64) NOT NULL,
    "chainState" TEXT NOT NULL,
    "lastSlot" BIGINT NOT NULL,
    "creatorWallet" VARCHAR(64) NOT NULL,
    "challengerWallet" VARCHAR(64),
    "arenaPda" VARCHAR(64) NOT NULL,
    "profileKind" TEXT NOT NULL,
    "joinDeadlineTs" TIMESTAMP(3),
    "activationDeadlineTs" TIMESTAMP(3),
    "startTs" TIMESTAMP(3),
    "roundDueTs" TIMESTAMP(3)[],
    "targetEndTs" TIMESTAMP(3),
    "settlementDeadlineTs" TIMESTAMP(3),
    "optionExpiryTs" TIMESTAMP(3),
    "creatorCommitment" VARCHAR(64),
    "challengerCommitment" VARCHAR(64),
    "signatures" JSONB NOT NULL DEFAULT '{}',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MatchProjection_pkey" PRIMARY KEY ("matchPda")
);

-- CreateTable
CREATE TABLE "public"."AgentTurn" (
    "id" TEXT NOT NULL,
    "matchPda" VARCHAR(64) NOT NULL,
    "round" INTEGER NOT NULL,
    "playerIndex" INTEGER NOT NULL,
    "agentPlayerWallet" VARCHAR(64),
    "promptHash" VARCHAR(64) NOT NULL,
    "sanitizedResponse" TEXT,
    "responseHash" VARCHAR(64),
    "parsedPrediction" JSONB,
    "outcome" "public"."TurnOutcome" NOT NULL,
    "errorCode" TEXT,
    "requestId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentTurn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."OrchestrationJob" (
    "idempotencyKey" TEXT NOT NULL,
    "type" "public"."JobType" NOT NULL,
    "matchPda" VARCHAR(64),
    "round" INTEGER,
    "status" "public"."JobStatus" NOT NULL DEFAULT 'Pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "leaseOwner" TEXT,
    "leaseExpiry" TIMESTAMP(3),
    "nextAttempt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "errorSummary" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrchestrationJob_pkey" PRIMARY KEY ("idempotencyKey")
);

-- CreateTable
CREATE TABLE "public"."IntegrationEvidence" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "checkType" TEXT NOT NULL,
    "network" TEXT NOT NULL,
    "identifiers" JSONB NOT NULL DEFAULT '{}',
    "hashes" JSONB NOT NULL DEFAULT '{}',
    "signature" TEXT,
    "result" "public"."EvidenceResult" NOT NULL,
    "notes" TEXT,
    "observedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IntegrationEvidence_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StrategyCommitment_matchPda_idx" ON "public"."StrategyCommitment"("matchPda");

-- CreateIndex
CREATE INDEX "StrategyCommitment_playerWallet_idx" ON "public"."StrategyCommitment"("playerWallet");

-- CreateIndex
CREATE UNIQUE INDEX "BattleAgent_agentId_key" ON "public"."BattleAgent"("agentId");

-- CreateIndex
CREATE INDEX "AgentTurn_matchPda_idx" ON "public"."AgentTurn"("matchPda");

-- CreateIndex
CREATE UNIQUE INDEX "AgentTurn_matchPda_round_playerIndex_key" ON "public"."AgentTurn"("matchPda", "round", "playerIndex");

-- CreateIndex
CREATE INDEX "OrchestrationJob_status_nextAttempt_idx" ON "public"."OrchestrationJob"("status", "nextAttempt");

-- CreateIndex
CREATE INDEX "OrchestrationJob_matchPda_idx" ON "public"."OrchestrationJob"("matchPda");

-- CreateIndex
CREATE INDEX "IntegrationEvidence_provider_checkType_idx" ON "public"."IntegrationEvidence"("provider", "checkType");

-- AddForeignKey
ALTER TABLE "public"."AgentTurn" ADD CONSTRAINT "AgentTurn_agentPlayerWallet_fkey" FOREIGN KEY ("agentPlayerWallet") REFERENCES "public"."BattleAgent"("playerWallet") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AgentTurn" ADD CONSTRAINT "AgentTurn_matchPda_fkey" FOREIGN KEY ("matchPda") REFERENCES "public"."MatchProjection"("matchPda") ON DELETE RESTRICT ON UPDATE CASCADE;
