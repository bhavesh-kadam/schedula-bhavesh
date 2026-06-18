
# Advanced Rescheduling & Doctor Appointment System

A NestJS and Prisma-based backend service providing authentication, dynamic availability matrix management, and appointment scheduling (supporting both WAVE and STREAM booking capacities).

---

## Features Implemented

### 1. Authentication & Context Guarding
* JWT-based authentication via HTTP-only secure cookie strategies.
* Automated `RefreshToken` lifecycle tracking (generation, context refresh, and forced absolute revocation).
* Multi-role Access Control Lists (`DOCTOR` vs. `PATIENT` execution routes).

### 2. User & Medical Profiling
* **Doctor Profiles:** Automated board verification tracking (`licenseNo`), tracking specializations, consultation fees, and active engagement matrices.
* **Patient Profiles:** Complete biographical profiling, blood group classification, and structured electronic health record tracking (`pastIllness`).

### 3. Core Engine Mechanics (Dynamic Availability Matrix)
* Complex scheduling calculations for `WAVE` (bulk capacity) vs. `STREAM` (sequential interval) slot allocation.
* Structural residual capacity validation checks protecting against overlapping registrations.
* Contextual fallback recommendation system generating alternative times when a target slot capacity peaks.
* Safety window enforcement rejecting modification actions within 30 minutes of a booking target.

---

## Project Setup Steps

### 1. Prerequisite Installations
* Node.js v18+ or v20+
* PostgreSQL Database Server

### 2. Installation
```bash
# Clone the repository
git clone https://github.com/bhavesh-kadam/schedula-bhavesh
cd schedula-bhavesh

# Install dependencies
npm install

```
### 3. Database Initialization & Migration

```Bash
# Run database migrations using Prisma
npx prisma migrate dev --name init
```
### 4. Running the Application
```bash
# Development build
npm run start:dev

# Production build
npm run build
npm run start:prod
```

## Environment Variables (`.env`)

Create a `.env` file in the root directory of your project and assign the following parameters:

Code snippet

```bash
# Server Port Configuration
PORT=3000

# Database Connections
DATABASE_URL="postgresql://[USER]:[PASSWORD]@[HOST]:[PORT]/[DATABASE]?schema=public"

# Cryptographic Token Hashes
ACCESS_TOKEN_SECRET=[your-super-secure-hash_for_access_token]
REFRESH_TOKEN_SECRET=[your-super-secure-hash_for_refresh_token]
HMAC_HASH=[your-super-secure-hash_for_hmac_secret]

# Operational Context State
NODE_ENV="development"
BASE_URL="http://localhost:3000"
```

## 🔗 Delivery & API Assets

- **Live Server URL:** https://schedula-bhavesh.onrender.com/
- **Postman API collection:** https://kadambhavesh700-1551830.postman.co/workspace/Bhavesh-Kadam's-Workspace~ce20867b-58e7-4848-8c0e-d6ad319aa38e/run/55980064-cbb61368-9d1e-4601-bc89-ff4f024e2f81

