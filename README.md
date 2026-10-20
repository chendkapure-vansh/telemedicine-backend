# Production-Grade Telemedicine Backend System

[![CI Pipeline](https://github.com/chendkapure-vansh/telemedicine-backend/actions/workflows/ci.yml/badge.svg)](https://github.com/chendkapure-vansh/telemedicine-backend/actions/workflows/ci.yml)
[![Node.js](https://img.shields.io/badge/Node.js-20.x-green.svg)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue.svg)](https://www.typescriptlang.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-336791.svg)](https://www.postgresql.org/)
[![Redis](https://img.shields.io/badge/Redis-7-red.svg)](https://redis.io/)

A production-grade, highly scalable backend engineered for digital healthcare platforms. Designed to handle **100,000 daily consultations**, sub-200ms read latencies, write idempotency, strict multi-tenant HIPAA compliance, and provable **zero double-booking** under intense concurrent traffic.

---

## 1. System Architecture & Engineering Highlights

```
                                      Client Requests
                                             │
                      ┌──────────────────────┴──────────────────────┐
                      ▼                                             ▼
          [TLS 1.3 Reverse Proxy]                       [Prometheus Scrape]
                      │                                             │
                      ▼                                             ▼
        [Security & Parsing Layer]                             [/metrics]
       (Helmet, CORS, JSON 1MB, Pino)
                      │
                      ▼
         [Two-Tier Rate Limiting]
     (100 req/15m API, 10 req/15m Auth)
                      │
                      ▼
           [Auth & RBAC Middleware]
     (JWT HS256, PATIENT/DOCTOR/ADMIN, MFA)
                      │
                      ▼
        [Write Idempotency Engine]
     (SHA-256 Key Cache & Replay Protection)
                      │
                      ▼
          [Core Application Layer]
     ┌────────────────┼────────────────┐
     ▼                ▼                ▼
[Auth & Profiles] [Slot Engine]   [Booking & Saga]
     │                │                │
     ▼                ▼                ▼
[PostgreSQL 16]   [Redis Cache]   [Mock Gateway]
 (ACID & NOWAIT)   (L2 TTL Cache)  (Outside DB Tx)
```

### Key Technical Pillars:
1. **Zero Double-Booking Engine:** Row-level locking via PostgreSQL `SELECT ... FOR UPDATE NOWAIT` inside atomic transactions combined with a 10-minute lease lease window (`locked_until`). Concurrent booking attempts on the same slot immediately receive `409 Conflict`.
2. **Saga Compensation (Out-of-Transaction Payment):** Payment gateway charges are executed outside open database transactions, preventing connection pool starvation. If payment fails or times out, compensation logic automatically releases the slot back to `AVAILABLE`.
3. **Write Idempotency:** SHA-256 fingerprinting on `Idempotency-Key` headers prevents duplicate charges and replays cached results with `X-Cache-Lookup: HIT`.
4. **Field-Level PHI Encryption (AES-256-GCM):** Restricted patient medical histories, clinical notes, and digital prescriptions are encrypted with versioned envelopes (`v1:iv:authTag:ciphertext`). Tampered data throws immediate authentication exceptions.
5. **Declarative Partitioning & Immutability:** Security `audit_logs` are partitioned by monthly range (`PARTITION BY RANGE (created_at)`). A PostgreSQL trigger prohibits all updates and deletions for regulatory compliance.
6. **Sub-200ms Read Performance:** Multi-tier caching architecture combining composite PostgreSQL indexes `(specialization, language, consultation_fee)` with Redis L2 caches (5-minute TTL for doctor search, 60-second TTL for active slots).

---

## 2. Technology Stack

* **Runtime:** Node.js (v20+ LTS) with TypeScript (Strict mode enabled)
* **Web Framework:** Express.js 4.x
* **Primary Database:** PostgreSQL 16 (Connection pooling with `pg.Pool`)
* **In-Memory Cache & Queues:** Redis 7 with BullMQ
* **Security & Auth:** `bcryptjs` (Cost 12), `jsonwebtoken` (HS256 pinned), RFC 6238 TOTP MFA, `helmet`, `cors`, `express-rate-limit`
* **Telemetry & Metrics:** Pino (Structured JSON with W3C trace correlation) and `prom-client` (Prometheus)

---

## 3. Quickstart Guide

### Option A: Running with Docker Compose (Recommended)

Spins up the Backend API, PostgreSQL 16, and Redis 7 in isolated containers with a single command:

```bash
# 1. Clone repository
git clone https://github.com/chendkapure-vansh/telemedicine-backend.git
cd telemedicine-backend

# 2. Copy environment template
cp .env.example .env

# 3. Start containerized stack
docker compose up --build
```
The API is live on `http://localhost:3000`.

---

### Option B: Running Locally

**Prerequisites:** Node.js 20+, PostgreSQL 16 on port 5432, Redis 7 on port 6379.

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env

# 3. Run database migrations
npm run migrate

# 4. Start development server
npm run dev
```

---

## 4. Automated Testing & Concurrency Verification

The test suite validates cryptography, JWT security, consultation state machines, write idempotency, and the **50-client race condition test**:

```bash
# Run full automated test suite
npm test
```

### Concurrency Test Details:
The test [tests/integration/concurrency.test.ts](tests/integration/concurrency.test.ts) creates an available slot and dispatches **50 simultaneous reservation requests**:
```
▶ Starting Suite: Integration: High-Concurrency Zero Double-Booking (50 Clients)
  [PASS] Zero Double-Booking proven: 1 succeeded (201), 49 rejected (409) (100% concurrency safety)
```

---

## 5. API Endpoints Reference

Complete OpenAPI 3.0 specification available in [docs/openapi.yaml](docs/openapi.yaml).

| Module | Method & Route | Description | Auth & Access |
|---|---|---|---|
| **Health** | `GET /health/live` | Process liveness probe | Public |
| **Health** | `GET /health/ready` | DB & Redis readiness probe | Public |
| **Metrics** | `GET /metrics` | Prometheus metrics scrape | Public |
| **Auth** | `POST /api/v1/auth/register` | Register Patient or Doctor | Public (Rate-limited) |
| **Auth** | `POST /api/v1/auth/login` | Login & receive JWT pair | Public (Rate-limited) |
| **Auth** | `POST /api/v1/auth/refresh` | Refresh access token | Public |
| **Auth** | `POST /api/v1/auth/mfa/setup` | Generate TOTP secret & QR URI | Authenticated |
| **Auth** | `POST /api/v1/auth/mfa/verify` | Activate MFA on account | Authenticated |
| **Profiles** | `GET /api/v1/users/profile` | Read user profile (decrypts PHI) | Authenticated |
| **Profiles** | `PUT /api/v1/users/profile` | Update profile (encrypts PHI) | Authenticated |
| **Profiles** | `PUT /api/v1/doctors/profile` | Set specialization, fee, license | Doctor + MFA |
| **Discovery**| `GET /api/v1/doctors/search` | Search doctors (sub-200ms) | Public |
| **Slots** | `POST /api/v1/slots` | Schedule availability slot | Doctor + MFA |
| **Slots** | `GET /api/v1/slots?doctor_id=...` | List available slots | Public (Cached) |
| **Booking** | `POST /api/v1/bookings/reserve`| Lock slot for 10 min | Patient + Idempotency |
| **Booking** | `POST /api/v1/bookings/confirm`| Charge & book consultation | Patient + Idempotency |
| **Consult** | `GET /api/v1/consultations/:id` | Read consultation details | Patient / Doctor / Admin |
| **Consult** | `PATCH /api/v1/consultations/:id/status`| Update status (IN_PROGRESS/COMPLETED) | Doctor / Admin |
| **Prescribe**| `POST /api/v1/prescriptions` | Issue encrypted prescription | Doctor + MFA + Idemp |
| **Prescribe**| `GET /api/v1/prescriptions/:id` | Read prescription (decrypts PHI) | Patient / Doctor / Admin |
| **Analytics**| `GET /api/v1/admin/analytics/overview`| Platform volume & revenue KPIs | Admin Only |

---

## 6. Project Documentation & Deliverables

All technical deliverables specified in the system design requirements are documented in the `docs/` directory:

* **[Architecture Document (docs/architecture.md)](docs/architecture.md):** High-level data flow, booking sequence diagram, ER diagram, database partitioning, Saga transaction management, and Backup/DR strategy.
* **[Security Checklist & Threat Model (docs/security_threat_model.md)](docs/security_threat_model.md):** STRIDE threat modeling, OWASP Top 10 mitigations, data classification, AES-256-GCM key rotation policy, and audit trail compliance.
* **[OpenAPI 3.0 Specification (docs/openapi.yaml)](docs/openapi.yaml):** Complete REST API contract with request/response schemas, security definitions, and status codes.
* **[Continuous Integration (CI) Workflow (.github/workflows/ci.yml)](.github/workflows/ci.yml):** Automated pipeline enforcing linting, strict typing, high-severity dependency audits, migrations, and test execution.

---

## 7. License

ISC License. Built for technical evaluation.
