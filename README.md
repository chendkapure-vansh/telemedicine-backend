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

## 6. Five-Minute Demo Video Walkthrough Script

Use this exact script and sequence of terminal commands when recording the 5-minute project demonstration:

```markdown
### 0:00 - 0:45 | Introduction & Architecture Overview
"Hello! Today I am presenting the Telemedicine Backend System built with TypeScript, Node.js,
PostgreSQL 16, and Redis 7. The platform is architected to handle 100,000 daily consultations
with zero double-booking, sub-200ms search latency, write idempotency, and field-level AES-256-GCM
encryption for patient health data.

Let's look at the project structure: We have a clean layered architecture with dependency
injection across controllers, services, repositories, and asynchronous background workers."

### 0:45 - 1:45 | Database Schema & Immutability Trigger
[Command: npm run migrate]
"Our database schema features 8 core domain tables plus an idempotency store.
Notice our audit_logs table: It is partitioned by monthly range on created_at for fast date-based
partition pruning. We also enforce regulatory immutability via a PostgreSQL trigger that blocks
any update or delete operations on audit records."

### 1:45 - 2:45 | The Zero Double-Booking Concurrency Proof
[Command: npm test]
"Now let's demonstrate the high-concurrency race condition test.
In this test, we spawn 50 concurrent client requests hitting our booking reservation endpoint
at the exact same millisecond, competing for the exact same consultation slot.

Notice the output: Exactly 1 reservation succeeded with HTTP 201 Created, and all other 49
requests received an immediate HTTP 409 Conflict. This is powered by PostgreSQL row-level
pessimistic locking using SELECT FOR UPDATE NOWAIT, preventing split-brain or double-bookings."

### 2:45 - 3:45 | Saga Compensation, Idempotency & PHI Encryption
"In our booking flow, payment processing runs outside the database transaction to prevent connection
pool starvation. If a payment fails or times out, our Saga compensation logic automatically releases
the locked slot back to AVAILABLE.

Furthermore, write requests enforce an Idempotency-Key header. If a mobile patient retries due to a
network drop, our idempotency engine detects the SHA-256 fingerprint and replays the cached response
with an X-Cache-Lookup: HIT header without duplicate charges.

All patient medical histories, clinical notes, and digital prescriptions are encrypted with
AES-256-GCM using authenticated key envelopes (v1:iv:tag:ciphertext)."

### 3:45 - 4:30 | Observability, Metrics & Admin Analytics
[Command: curl http://localhost:3000/health/ready]
[Command: curl http://localhost:3000/metrics]
"For production observability, we provide liveness and readiness health probes that test database
and Redis latency.
Our /metrics endpoint exports Prometheus metrics, including http_request_duration_seconds
histograms tracking our p95 SLA targets and request counts.
All logs emitted by Pino include correlated W3C trace IDs."

### 4:30 - 5:00 | Docker & GitHub Actions CI Conclusion
"The entire system is containerized with a production multi-stage Dockerfile and docker-compose.yml.
Our GitHub Actions CI pipeline runs linting, typechecking, high-severity npm audit vulnerability
scans, database migrations, and the automated race condition test suite on every commit.

Thank you for watching!"
```

---

## 7. License

ISC License. Built for technical evaluation.
