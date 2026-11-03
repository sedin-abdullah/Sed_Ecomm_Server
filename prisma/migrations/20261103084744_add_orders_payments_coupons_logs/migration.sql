-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'returned', 'payment_failed');

-- CreateEnum
CREATE TYPE "OrderPaymentStatus" AS ENUM ('pending', 'success', 'failed', 'refunded');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('card_credit', 'card_debit', 'upi', 'netbanking', 'wallet', 'cod');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('pending', 'success', 'failed');

-- CreateEnum
CREATE TYPE "CouponType" AS ENUM ('percentage', 'flat');

-- CreateEnum
CREATE TYPE "ChangeModule" AS ENUM ('product', 'category', 'coupon', 'order');

-- CreateEnum
CREATE TYPE "ChangeAction" AS ENUM ('create', 'update', 'delete', 'status', 'refund');

-- CreateEnum
CREATE TYPE "ChangeStatus" AS ENUM ('applied', 'pending', 'approved', 'rejected');

-- CreateTable
CREATE TABLE "orders" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "shipping_address_id" UUID NOT NULL,
    "billing_address_id" UUID,
    "subtotal" DECIMAL(10,2) NOT NULL,
    "discount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "coupon_code" TEXT,
    "shipping_fee" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "tax" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(10,2) NOT NULL,
    "payment_method" "PaymentMethod" NOT NULL,
    "payment_status" "OrderPaymentStatus" NOT NULL DEFAULT 'pending',
    "status" "OrderStatus" NOT NULL DEFAULT 'pending',
    "refund" JSONB,
    "cancelled_by" TEXT,
    "cancellation_reason" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_items" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "product_id" UUID,
    "name" TEXT NOT NULL,
    "image" TEXT NOT NULL,
    "price" DECIMAL(10,2) NOT NULL,
    "qty" INTEGER NOT NULL,
    "size" TEXT,
    "color" TEXT,

    CONSTRAINT "order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_tracking_events" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "status" "OrderStatus" NOT NULL,
    "timestamp" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT,

    CONSTRAINT "order_tracking_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'pending',
    "amount" DECIMAL(10,2) NOT NULL,
    "card_last4" VARCHAR(4),
    "card_brand" TEXT,
    "upi_vpa" TEXT,
    "bank_code" TEXT,
    "wallet_provider" TEXT,
    "requires_otp" BOOLEAN NOT NULL DEFAULT false,
    "otp_attempts" INTEGER NOT NULL DEFAULT 0,
    "forced_failure" BOOLEAN NOT NULL DEFAULT false,
    "transaction_ref" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "coupons" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "type" "CouponType" NOT NULL,
    "value" DECIMAL(10,2) NOT NULL,
    "min_order_value" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "max_discount" DECIMAL(10,2),
    "expires_at" TIMESTAMPTZ NOT NULL,
    "usage_limit" INTEGER NOT NULL DEFAULT 1,
    "used_count" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "min_items" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "coupons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_logs" (
    "id" UUID NOT NULL,
    "order_id" UUID,
    "to" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "change_requests" (
    "id" UUID NOT NULL,
    "actor_id" UUID NOT NULL,
    "actor_name" TEXT NOT NULL,
    "actor_role" TEXT,
    "module" "ChangeModule" NOT NULL,
    "action" "ChangeAction" NOT NULL,
    "target_id" TEXT,
    "target_label" TEXT,
    "summary" TEXT,
    "changes" JSONB NOT NULL DEFAULT '[]',
    "payload" JSONB,
    "before" JSONB,
    "status" "ChangeStatus" NOT NULL DEFAULT 'applied',
    "reviewer_id" UUID,
    "reviewer_name" TEXT,
    "reviewed_at" TIMESTAMPTZ,
    "note" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "change_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "orders_user_id_created_at_idx" ON "orders"("user_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "order_items_order_id_idx" ON "order_items"("order_id");

-- CreateIndex
CREATE INDEX "order_tracking_events_order_id_idx" ON "order_tracking_events"("order_id");

-- CreateIndex
CREATE UNIQUE INDEX "payments_transaction_ref_key" ON "payments"("transaction_ref");

-- CreateIndex
CREATE INDEX "payments_order_id_idx" ON "payments"("order_id");

-- CreateIndex
CREATE UNIQUE INDEX "coupons_code_key" ON "coupons"("code");

-- CreateIndex
CREATE INDEX "change_requests_status_idx" ON "change_requests"("status");

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_shipping_address_id_fkey" FOREIGN KEY ("shipping_address_id") REFERENCES "addresses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_billing_address_id_fkey" FOREIGN KEY ("billing_address_id") REFERENCES "addresses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_tracking_events" ADD CONSTRAINT "order_tracking_events_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_logs" ADD CONSTRAINT "email_logs_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "change_requests" ADD CONSTRAINT "change_requests_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "change_requests" ADD CONSTRAINT "change_requests_reviewer_id_fkey" FOREIGN KEY ("reviewer_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
