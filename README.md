# Amrutam Telemedicine Backend

Production-grade, highly scalable, and secure backend system for Amrutam's healthcare platform, designed to support 100,000 daily consultations with zero double-booking, strict write idempotency, field-level PHI encryption, RBAC, and observability.

---

## System Highlights & SLAs
- **Daily Scale:** 100,000 daily virtual consultations
- **Read Latency:** p95 < 200ms (PostgreSQL indexing & Redis caching)
- **Write Latency:** p95 < 500ms (Lean DB transactions & async job processing)
- **Availability:** 99.95% target uptime
- **Concurrency & Reliability:** Zero double-bookings via PostgreSQL row-level locks (`SELECT FOR UPDATE NOWAIT`) + atomic transaction management
- **Write Idempotency:** Universal `Idempotency-Key` tracking across write endpoints
- **Security & Compliance:** Field-level AES-256-GCM encryption with key versioning for PHI, bcrypt, JWT + RBAC, TOTP MFA, and immutable partitioned audit logs

---

## Core Architecture Stack
- **Runtime:** Node.js with TypeScript
- **Framework:** Express (Clean Layered Architecture with Dependency Injection)
- **Database:** PostgreSQL (with monthly range partitioning on `audit_logs`)
- **Caching & Async Jobs:** Redis + BullMQ
- **Observability:** Structured Pino JSON logs, Prometheus `/metrics`, OpenTelemetry distributed tracing
- **API Documentation:** OpenAPI 3.0 / Swagger interactive UI

---

## Project Status & Roadmap
This repository is being developed across 8 systematic phases:
- **Phase 1:** Architecture Documentation (`docs/ARCHITECTURE.md`), Threat Model (`docs/SECURITY.md`), and OpenAPI 3.0 Contract (`docs/openapi.yaml`) *(In Progress)*
- **Phase 2:** Project Scaffolding, Partitioned Database & BullMQ Worker
- **Phase 3:** Authentication, RBAC, TOTP MFA & Field-Level PHI Encryption
- **Phase 4:** Doctor Availability, Slots & Fast Search
- **Phase 5:** High-Concurrency Booking, Service Compensation & Write Idempotency
- **Phase 6:** Consultation Lifecycle, Prescriptions & Partitioned Audit Logs
- **Phase 7:** Observability, Security Hardening & Admin Analytics
- **Phase 8:** Automated Tests (Concurrency & Idempotency), Dockerization, CI Pipeline & Demo Video Walkthrough
