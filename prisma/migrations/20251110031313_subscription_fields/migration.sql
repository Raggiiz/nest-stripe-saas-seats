/*
  Warnings:

  - The values [BASIC,ADVANCED,PREMIUM] on the enum `Plan` will be removed. If these variants are still used in the database, this will fail.

*/
-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('ACTIVE', 'TRIALING', 'PAST_DUE', 'UNPAID', 'CANCELED', 'INCOMPLETE', 'INCOMPLETE_EXPIRED');

-- AlterEnum
BEGIN;
CREATE TYPE "Plan_new" AS ENUM ('BASIC_MONTH', 'BASIC_YEAR', 'ADVANCED_MONTH', 'ADVANCED_YEAR', 'PREMIUM_MONTH', 'PREMIUM_YEAR');
ALTER TABLE "public"."Organization" ALTER COLUMN "plan" DROP DEFAULT;
ALTER TABLE "Organization" ALTER COLUMN "plan" TYPE "Plan_new" USING ("plan"::text::"Plan_new");
ALTER TYPE "Plan" RENAME TO "Plan_old";
ALTER TYPE "Plan_new" RENAME TO "Plan";
DROP TYPE "public"."Plan_old";
ALTER TABLE "Organization" ALTER COLUMN "plan" SET DEFAULT 'BASIC_MONTH';
COMMIT;

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "subscriptionCheckedAt" TIMESTAMP(3),
ADD COLUMN     "subscriptionStatus" "SubscriptionStatus",
ALTER COLUMN "plan" SET DEFAULT 'BASIC_MONTH',
ALTER COLUMN "seatLimit" SET DEFAULT 1;
