/**
 * Integration Tests — Task SRU-10
 * Administrator Workspace, Catalogue Moderation & Payment Reconciliation APIs
 *
 * Verifies:
 *  1. Admin RBAC Enforcement:
 *     - Only ADMIN can create/patch suppliers.
 *     - ADMIN or assigned SUPPLIER can create/patch offers.
 *     - ADMIN and REVIEWER can view reconciliation dashboard and audit logs.
 *     - Only ADMIN can annotate payments or run lifecycle checks.
 *     - Non-admin users (SHOP_OWNER, unauthenticated) receive 403 Forbidden / 401 Unauthorized.
 *  2. Catalogue Moderation & Provenance Verification:
 *     - POST /api/admin/suppliers & PATCH /api/admin/suppliers/:id.
 *     - POST /api/admin/offers & PATCH /api/admin/offers/:id.
 *  3. Reconciliation Dashboard Queries (GET /api/admin/reconciliation):
 *     - Surfacing stalled pools, expired quotes, UNKNOWN/NEEDS_REVIEW/FAILED payments,
 *       failed refunds, and failed AI extractions.
 *  4. FR-ADMIN-005: Immutability of Captured Payment Facts:
 *     - POST /api/admin/reconciliation/:paymentId/annotate allows adding notes and sync,
 *       but strictly prevents overwriting or altering captured payment facts.
 *  5. Audit Trails & Lifecycle Jobs:
 *     - GET /api/admin/audit-logs.
 *     - POST /api/admin/jobs/run-lifecycle-check.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import request from "supertest";
import express from "express";

process.env.PAYMENT_MODE = "mock";
process.env.NODE_ENV = "test";

import { User } from "../../src/models/User.model.js";
import { Supplier } from "../../src/models/Supplier.model.js";
import { Product } from "../../src/models/Product.model.js";
import { SupplierOffer } from "../../src/models/SupplierOffer.model.js";
import { GroupBuyPool } from "../../src/models/GroupBuyPool.model.js";
import { Quote } from "../../src/models/Quote.model.js";
import { Payment } from "../../src/models/Payment.model.js";
import { Refund } from "../../src/models/Refund.model.js";
import { AuditLog } from "../../src/models/AuditLog.model.js";
import { AIExecutionLog } from "../../src/models/AIExecutionLog.model.js";
import adminRouter from "../../src/routes/admin.routes.js";
import clockService from "../../src/services/clock/clock.service.js";

// Helper to construct Express test app with dynamic user injection
function buildTestApp(getUser) {
  const app = express();
  app.use(express.json());

  app.use((req, _res, next) => {
    req.user = typeof getUser === "function" ? getUser(req) : getUser;
    next();
  });

  app.use("/api/admin", adminRouter);

  app.use((err, _req, res, _next) => {
    const statusCode = err.statusCode || 500;
    res.status(statusCode).json({
      success: false,
      statusCode,
      message: err.message,
    });
  });

  return app;
}

let mongod;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri(), { retryWrites: false });
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

describe("Task SRU-10: Administrator Workspace, Moderation & Reconciliation APIs", () => {
  let adminUser;
  let reviewerUser;
  let supplierUser;
  let shopOwnerUser;
  let supplierDoc;
  let productDoc;

  beforeEach(async () => {
    clockService.reset();

    // Clean collections
    await User.deleteMany({});
    await Supplier.deleteMany({});
    await Product.deleteMany({});
    await SupplierOffer.deleteMany({});
    await GroupBuyPool.deleteMany({});
    await Quote.deleteMany({});
    await Payment.deleteMany({});
    await Refund.deleteMany({});
    await AuditLog.deleteMany({});
    await AIExecutionLog.deleteMany({});

    // User Roles
    adminUser = {
      _id: new mongoose.Types.ObjectId(),
      role: "ADMIN",
      email: "admin@platform.demo",
    };

    reviewerUser = {
      _id: new mongoose.Types.ObjectId(),
      role: "REVIEWER",
      email: "reviewer@platform.demo",
    };

    const supplierOwnerId = new mongoose.Types.ObjectId();
    supplierDoc = await Supplier.create({
      ownerUserId: supplierOwnerId,
      name: "Ganga Commercial Packaging",
      contactReference: {
        contactPerson: "Arun Verma",
        email: "arun@gangapack.demo",
        phone: "+91-522-334455",
      },
      serviceAreas: ["LUCKNOW", "KANPUR"],
      verificationStatus: "VERIFIED",
      dataSourceType: "VERIFIED_LIVE",
    });

    supplierUser = {
      _id: supplierOwnerId,
      role: "SUPPLIER",
      supplierId: supplierDoc._id,
      email: "arun@gangapack.demo",
    };

    shopOwnerUser = {
      _id: new mongoose.Types.ObjectId(),
      role: "SHOP_OWNER",
      email: "retailer@kirana.demo",
    };

    productDoc = await Product.create({
      canonicalName: "500ml Heavy Duty PP Containers",
      category: "FOOD_PACKAGING",
      baseUnit: "CASE",
      packSizeDescription: "500 containers per case",
      specifications: {
        material: "Virgin Polypropylene",
        capacityOrSize: "500ml",
        grade: "Food-Safe Grade A",
        foodSafe: true,
      },
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 1. RBAC Enforcement
  // ───────────────────────────────────────────────────────────────────────────

  describe("1. RBAC Enforcement", () => {
    it("allows ADMIN to access all admin endpoints", async () => {
      const app = buildTestApp(adminUser);

      const res = await request(app).get("/api/admin/reconciliation");
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it("allows REVIEWER read-only access to reconciliation and audit-logs", async () => {
      const app = buildTestApp(reviewerUser);

      const reconRes = await request(app).get("/api/admin/reconciliation");
      expect(reconRes.status).toBe(200);

      const auditRes = await request(app).get("/api/admin/audit-logs");
      expect(auditRes.status).toBe(200);
    });

    it("rejects REVIEWER from modifying suppliers, offers, or payments with 403 Forbidden", async () => {
      const app = buildTestApp(reviewerUser);

      const supRes = await request(app)
        .post("/api/admin/suppliers")
        .send({ name: "Unauthorized Supplier", serviceAreas: ["LUCKNOW"] });
      expect(supRes.status).toBe(403);

      const jobRes = await request(app).post("/api/admin/jobs/run-lifecycle-check");
      expect(jobRes.status).toBe(403);
    });

    it("rejects SHOP_OWNER from accessing any admin endpoints with 403 Forbidden", async () => {
      const app = buildTestApp(shopOwnerUser);

      const resRecon = await request(app).get("/api/admin/reconciliation");
      expect(resRecon.status).toBe(403);

      const resAudit = await request(app).get("/api/admin/audit-logs");
      expect(resAudit.status).toBe(403);

      const resSupp = await request(app).post("/api/admin/suppliers").send({});
      expect(resSupp.status).toBe(403);
    });

    it("rejects unauthenticated requests with 401 Unauthorized", async () => {
      const app = buildTestApp(null);

      const res = await request(app).get("/api/admin/reconciliation");
      expect(res.status).toBe(401);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 2. Supplier & Offer Moderation
  // ───────────────────────────────────────────────────────────────────────────

  describe("2. Supplier & Offer Moderation APIs", () => {
    it("POST /api/admin/suppliers creates a verified supplier and records audit log", async () => {
      const app = buildTestApp(adminUser);

      const payload = {
        name: "Awadh Wholesale Distributors",
        contactReference: {
          contactPerson: "Sunil Gupta",
          email: "sunil@awadh.demo",
          phone: "+91-522-889900",
        },
        serviceAreas: ["LUCKNOW", "VARANASI"],
        verificationStatus: "VERIFIED",
        dataSourceType: "VERIFIED_LIVE",
      };

      const res = await request(app).post("/api/admin/suppliers").send(payload);

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toBe("Awadh Wholesale Distributors");
      expect(res.body.data.verificationStatus).toBe("VERIFIED");
      expect(res.body.data.dataSourceType).toBe("VERIFIED_LIVE");

      // Verify DB persistence
      const saved = await Supplier.findById(res.body.data._id);
      expect(saved).toBeDefined();

      // Verify Audit Log
      const audit = await AuditLog.findOne({
        action: "SUPPLIER_CREATED",
        resourceId: saved._id,
      });
      expect(audit).toBeDefined();
      expect(audit.actorRole).toBe("ADMIN");
    });

    it("PATCH /api/admin/suppliers/:id updates supplier status and provenance", async () => {
      const app = buildTestApp(adminUser);

      const res = await request(app)
        .patch(`/api/admin/suppliers/${supplierDoc._id}`)
        .send({
          verificationStatus: "UNDER_REVIEW",
          activeStatus: "INACTIVE",
        });

      expect(res.status).toBe(200);
      expect(res.body.data.verificationStatus).toBe("UNDER_REVIEW");
      expect(res.body.data.activeStatus).toBe("INACTIVE");

      const updated = await Supplier.findById(supplierDoc._id);
      expect(updated.verificationStatus).toBe("UNDER_REVIEW");

      // Verify Audit Log
      const audit = await AuditLog.findOne({
        action: "SUPPLIER_UPDATED",
        resourceId: supplierDoc._id,
      });
      expect(audit).toBeDefined();
    });

    it("POST /api/admin/offers creates an offer with tiered pricing", async () => {
      const app = buildTestApp(adminUser);

      const offerPayload = {
        supplierId: supplierDoc._id,
        productId: productDoc._id,
        packUnit: "CASE",
        packSize: "500 containers per case",
        currency: "INR",
        baseUnitPriceMinor: 150000,
        minimumOrderQuantity: 50,
        retailerMoqPercentage: 20,
        retailerStepPercentage: 1,
        quantityTiers: [
          { minQuantity: 50, maxQuantity: 99, unitPriceMinor: 150000 },
          { minQuantity: 100, maxQuantity: null, unitPriceMinor: 135000 },
        ],
        deliveryAreas: ["LUCKNOW"],
        leadTimeDays: 4,
        shippingTerms: "Free Delivery on Bulk",
        flatShippingCostMinor: 0,
        shippingAllocationMethod: "EQUAL_SHARE",
        taxInclusion: "GST_INCLUDED",
        availabilityStatus: "IN_STOCK",
        expiresAt: new Date(Date.now() + 10 * 86400000),
        dataSourceType: "VERIFIED_LIVE",
        verificationStatus: "VERIFIED",
      };

      const res = await request(app).post("/api/admin/offers").send(offerPayload);

      expect(res.status).toBe(201);
      expect(res.body.data.supplierId.toString()).toBe(supplierDoc._id.toString());
      expect(res.body.data.quantityTiers).toHaveLength(2);

      const saved = await SupplierOffer.findById(res.body.data._id);
      expect(saved).toBeDefined();

      const audit = await AuditLog.findOne({
        action: "OFFER_CREATED",
        resourceId: saved._id,
      });
      expect(audit).toBeDefined();
    });

    it("PATCH /api/admin/offers/:id updates offer pricing and validity", async () => {
      const offer = await SupplierOffer.create({
        supplierId: supplierDoc._id,
        productId: productDoc._id,
        packUnit: "CASE",
        packSize: "500 containers per case",
        currency: "INR",
        baseUnitPriceMinor: 150000,
        minimumOrderQuantity: 50,
        retailerMoqPercentage: 20,
        retailerStepPercentage: 1,
        quantityTiers: [{ minQuantity: 50, maxQuantity: null, unitPriceMinor: 150000 }],
        deliveryAreas: ["LUCKNOW"],
        leadTimeDays: 3,
        shippingTerms: "Standard",
        flatShippingCostMinor: 20000,
        expiresAt: new Date(Date.now() + 5 * 86400000),
      });

      const app = buildTestApp(adminUser);

      const res = await request(app)
        .patch(`/api/admin/offers/${offer._id}`)
        .send({
          baseUnitPriceMinor: 140000,
          availabilityStatus: "LOW_STOCK",
        });

      expect(res.status).toBe(200);
      expect(res.body.data.baseUnitPriceMinor).toBe(140000);
      expect(res.body.data.availabilityStatus).toBe("LOW_STOCK");
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 3. Reconciliation Dashboard Queries
  // ───────────────────────────────────────────────────────────────────────────

  describe("3. GET /api/admin/reconciliation", () => {
    it("surfaces stalled pools, expired quotes, attention payments, failed refunds, and failed AI logs", async () => {
      const app = buildTestApp(adminUser);

      // 1. Seed Stalled Pool (state: NEEDS_REVIEW)
      const stalledPool = await GroupBuyPool.create({
        title: "Stalled Packaging Pool",
        productId: productDoc._id,
        supplierOfferId: new mongoose.Types.ObjectId(),
        deliveryArea: "LUCKNOW",
        currency: "INR",
        packUnit: "CASE",
        targetMoq: 100,
        totalEligibleQuantity: 40,
        baseUnitPriceMinor: 150000,
        currentUnitPriceMinor: 150000,
        publishedAt: new Date(),
        deadline: new Date(Date.now() + 86400000),
        state: "NEEDS_REVIEW",
        closureReason: "Payment processing anomaly reported",
        createdByUserId: new mongoose.Types.ObjectId(),
      });

      // 2. Seed Expired Quote
      const expiredQuote = await Quote.create({
        supplierId: supplierDoc._id,
        productId: productDoc._id,
        requestedByUserId: new mongoose.Types.ObjectId(),
        requestedQuantity: 200,
        deliveryArea: "LUCKNOW",
        status: "EXPIRED",
        validUntil: new Date(Date.now() - 3600000), // expired 1h ago
      });

      // 3. Seed Attention Payment (UNKNOWN status)
      const attentionPayment = await Payment.create({
        poolId: stalledPool._id,
        contributionId: new mongoose.Types.ObjectId(),
        shopId: new mongoose.Types.ObjectId(),
        payerUserId: new mongoose.Types.ObjectId(),
        paymentPurpose: "INITIAL_JOIN",
        provider: "PAYPAL_SANDBOX",
        providerOrderId: "ORDER-UNKNOWN-101",
        idempotencyKey: "idemp-unknown-101",
        amountMinor: 3000000,
        currency: "INR",
        paymentStatus: "UNKNOWN",
        isTestTransaction: true,
      });

      // 4. Seed Failed Refund
      const failedRefund = await Refund.create({
        paymentId: attentionPayment._id,
        poolId: stalledPool._id,
        contributionId: attentionPayment.contributionId,
        shopId: attentionPayment.shopId,
        recipientUserId: attentionPayment.payerUserId,
        amountMinor: 3000000,
        currency: "INR",
        reason: "BUYER_WITHDRAWAL",
        idempotencyKey: "idemp-refund-failed-1",
        status: "FAILED",
        failureReason: "PayPal adapter network connection timeout",
      });

      // 5. Seed Failed AI Execution Log
      const failedAiLog = await AIExecutionLog.create({
        correlationId: "corr-ai-err-99",
        triggeredByUserId: new mongoose.Types.ObjectId(),
        operation: "EXTRACT_REQUIREMENT",
        provider: "gemini",
        model: "gemini-1.5-flash",
        status: "PROVIDER_ERROR",
        latencyMs: 1200,
        schemaValidated: false,
        safeErrorCode: "UPSTREAM_RATE_LIMIT",
      });

      const res = await request(app).get("/api/admin/reconciliation");

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const data = res.body.data;
      expect(data.summary).toBeDefined();
      expect(data.summary.stalledPoolsCount).toBeGreaterThanOrEqual(1);
      expect(data.summary.expiredQuotesCount).toBeGreaterThanOrEqual(1);
      expect(data.summary.attentionPaymentsCount).toBeGreaterThanOrEqual(1);
      expect(data.summary.failedRefundsCount).toBeGreaterThanOrEqual(1);
      expect(data.summary.failedAiLogsCount).toBeGreaterThanOrEqual(1);

      // Verify specific records surfaced
      const foundPool = data.stalledPools.find((p) => p._id.toString() === stalledPool._id.toString());
      expect(foundPool).toBeDefined();

      const foundPayment = data.attentionPayments.find((p) => p._id.toString() === attentionPayment._id.toString());
      expect(foundPayment).toBeDefined();

      const foundRefund = data.failedRefunds.find((r) => r._id.toString() === failedRefund._id.toString());
      expect(foundRefund).toBeDefined();

      const foundAi = data.failedAiLogs.find((a) => a._id.toString() === failedAiLog._id.toString());
      expect(foundAi).toBeDefined();
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 4. Immutability of Captured Payment Facts (FR-ADMIN-005)
  // ───────────────────────────────────────────────────────────────────────────

  describe("4. Immutability Guard: POST /api/admin/reconciliation/:paymentId/annotate", () => {
    it("adds reconciliation note and audit log, but strictly protects immutable payment facts", async () => {
      const payment = await Payment.create({
        poolId: new mongoose.Types.ObjectId(),
        contributionId: new mongoose.Types.ObjectId(),
        shopId: new mongoose.Types.ObjectId(),
        payerUserId: new mongoose.Types.ObjectId(),
        paymentPurpose: "INITIAL_JOIN",
        provider: "PAYPAL_SANDBOX",
        providerOrderId: "PAYPAL-ORD-IMMUTABLE-1",
        providerCaptureId: "PAYPAL-CAP-IMMUTABLE-1",
        idempotencyKey: "idemp-immutable-1",
        amountMinor: 480000, // ₹4,800.00
        currency: "INR",
        paymentStatus: "PAID",
        isTestTransaction: true,
      });

      const app = buildTestApp(adminUser);

      // Attempt to maliciously modify captured payment facts
      const res = await request(app)
        .post(`/api/admin/reconciliation/${payment._id}/annotate`)
        .send({
          note: "Verified bank statement manually with accounts team.",
          // Malicious overwrites that MUST be ignored / rejected under FR-ADMIN-005
          amountMinor: 100,
          currency: "USD",
          providerOrderId: "HACKED-ORDER-ID",
          providerCaptureId: "HACKED-CAPTURE-ID",
          paymentStatus: "CANCELLED",
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      // 1. Verify note was added
      const updatedPayment = await Payment.findById(payment._id);
      expect(updatedPayment.reconciliationNotes).toHaveLength(1);
      expect(updatedPayment.reconciliationNotes[0].note).toBe(
        "Verified bank statement manually with accounts team."
      );
      expect(updatedPayment.reconciliationNotes[0].addedByUserId.toString()).toBe(
        adminUser._id.toString()
      );

      // 2. CRITICAL: Assert immutable payment facts remain EXACTLY as originally captured
      expect(updatedPayment.amountMinor).toBe(480000);
      expect(updatedPayment.currency).toBe("INR");
      expect(updatedPayment.providerOrderId).toBe("PAYPAL-ORD-IMMUTABLE-1");
      expect(updatedPayment.providerCaptureId).toBe("PAYPAL-CAP-IMMUTABLE-1");
      expect(updatedPayment.paymentStatus).toBe("PAID");

      // 3. Verify Audit Log
      const audit = await AuditLog.findOne({
        action: "PAYMENT_ANNOTATED",
        resourceId: payment._id,
      });
      expect(audit).toBeDefined();
      expect(audit.actorRole).toBe("ADMIN");
    });

    it("rejects annotation request if note is missing or empty", async () => {
      const payment = await Payment.create({
        poolId: new mongoose.Types.ObjectId(),
        contributionId: new mongoose.Types.ObjectId(),
        shopId: new mongoose.Types.ObjectId(),
        payerUserId: new mongoose.Types.ObjectId(),
        paymentPurpose: "INITIAL_JOIN",
        idempotencyKey: "idemp-empty-note",
        amountMinor: 100000,
        currency: "INR",
        paymentStatus: "PAID",
      });

      const app = buildTestApp(adminUser);

      const res = await request(app)
        .post(`/api/admin/reconciliation/${payment._id}/annotate`)
        .send({ note: "   " });

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/note is required/i);
    });

    it("triggers provider sync when syncWithProvider is true", async () => {
      const payment = await Payment.create({
        poolId: new mongoose.Types.ObjectId(),
        contributionId: new mongoose.Types.ObjectId(),
        shopId: new mongoose.Types.ObjectId(),
        payerUserId: new mongoose.Types.ObjectId(),
        paymentPurpose: "INITIAL_JOIN",
        provider: "MOCK_DEV",
        providerOrderId: "MOCK-ORD-SYNC-1",
        idempotencyKey: "idemp-sync-1",
        amountMinor: 200000,
        currency: "INR",
        paymentStatus: "UNKNOWN",
        isTestTransaction: true,
      });

      const app = buildTestApp(adminUser);

      const res = await request(app)
        .post(`/api/admin/reconciliation/${payment._id}/annotate`)
        .send({
          note: "Network recovery sync triggered by administrator.",
          syncWithProvider: true,
        });

      expect(res.status).toBe(200);
      expect(res.body.data.synced).toBe(true);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 5. Audit Logs & Lifecycle Check
  // ───────────────────────────────────────────────────────────────────────────

  describe("5. Audit Logs & Lifecycle Check", () => {
    it("GET /api/admin/audit-logs returns filtered and paginated audit events", async () => {
      const corrId = "corr-test-trace-123";

      await AuditLog.create({
        correlationId: corrId,
        actorId: adminUser._id,
        actorRole: "ADMIN",
        action: "SUPPLIER_VERIFIED",
        resourceType: "SUPPLIER",
        resourceId: supplierDoc._id,
        metadata: { note: "KYC approved" },
      });

      await AuditLog.create({
        correlationId: "corr-other-456",
        actorId: adminUser._id,
        actorRole: "ADMIN",
        action: "POOL_LOCKED",
        resourceType: "POOL",
        resourceId: new mongoose.Types.ObjectId(),
      });

      const app = buildTestApp(adminUser);

      const res = await request(app)
        .get(`/api/admin/audit-logs?correlationId=${corrId}`);

      expect(res.status).toBe(200);
      expect(res.body.data.auditLogs).toHaveLength(1);
      expect(res.body.data.auditLogs[0].action).toBe("SUPPLIER_VERIFIED");
      expect(res.body.data.total).toBe(1);
    });

    it("POST /api/admin/jobs/run-lifecycle-check triggers pool evaluations and advances test clock if requested", async () => {
      // Create a pool expiring in 72 hours
      const publishedAt = clockService.now();
      const deadline = new Date(publishedAt.getTime() + 72 * 3600 * 1000);

      const pool = await GroupBuyPool.create({
        title: "Expiring Cups Pool Under-MOQ",
        productId: productDoc._id,
        supplierOfferId: new mongoose.Types.ObjectId(),
        deliveryArea: "LUCKNOW",
        packUnit: "CASE",
        targetMoq: 100,
        totalEligibleQuantity: 40, // 40 < 100 -> will trigger under-MOQ window
        baseUnitPriceMinor: 150000,
        currentUnitPriceMinor: 150000,
        publishedAt,
        deadline,
        state: "RECRUITING",
        createdByUserId: new mongoose.Types.ObjectId(),
      });

      const app = buildTestApp(adminUser);

      // Trigger lifecycle check with offset to pass 72 hours
      const res = await request(app)
        .post("/api/admin/jobs/run-lifecycle-check")
        .send({
          offsetHours: 73,
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.results.lockedUnderMoq).toBe(1);

      // Verify DB update
      const updatedPool = await GroupBuyPool.findById(pool._id);
      expect(updatedPool.state).toBe("UNDER_MOQ_DECISION_PENDING");
      expect(updatedPool.lockReason).toBe("EXPIRED_72H_UNDER_MOQ");
    });
  });
});
