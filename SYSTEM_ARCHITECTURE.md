# Skoolific V2 — System Architecture & Branch Isolation Rules

> **Purpose:** This document defines the database architecture and branch isolation rules
> for all current and future developers working on this system.

---

## 1. Database Architecture

### 1.1 Master Database (`skoolific`)

The master database exists at `localhost:5432/skoolific`.  
It stores **only** system-level configuration that is shared across all branches:

| Table / Schema | Purpose | Branch-specific? |
|---|---|---|
| `public.admin_users` | Admin login accounts | No |
| `public.branch_config` | Branch → database mappings | No |
| `public.branding_settings` | School branding/themes | No |
| `public.budgets` | System budgets | No |
| `public.expenses` | System expenses | No |
| `school_comms.*` | Prisma-managed finance tables (Account, Invoice, Payment, etc.) | No |
| `public.migrations` | Database migration tracking | No |

**⚠️ CRITICAL:** The master database must NOT contain any branch-specific data
(staff records, student records, class data, attendance, marks, schedules, etc.).
All branch-specific data belongs in the branch databases.

### 1.2 Branch Databases (`skooloficb1`, `skooloficb2`, etc.)

Each branch has its **own independent PostgreSQL database**.  
Examples: `skooloficb1` for SB1, `skooloficb2` for SB2.

Each branch database is auto-initialized with its own copy of all required schemas:
- `staff_teachers` — Teacher staff tables
- `staff_administrative_staff` — Administrative staff tables
- `staff_supportive_staff` — Supportive staff tables
- `classes_schema` — Student class tables
- `schedule_schema` — Schedule and timetable data
- `school_schema_points` — Teacher assignment data
- `subjects_of_school_schema` — Subject definitions
- `form_metadata` — Custom form field definitions
- `public.staff_users` — Staff login credentials
- `public.staff_counter` — Staff ID counter
- `public.admin_users` — Branch-specific admin account

---

## 2. Branch Routing — How It Works

### 2.1 The `X-Branch-Code` Header

Every HTTP request to the backend for branch-specific data **MUST** include the
`X-Branch-Code` header with the branch code (e.g., `SB1`, `MAI`, `IQ3`).

```
GET /api/staff/classes?staffType=Teachers
X-Branch-Code: SB1
```

### 2.2 The Flow

```
Browser (React App)
    │
    │ 1. User logs in → branch code stored in sessionStorage
    │ 2. Every axios/fetch call reads getBranchCode()
    │ 3. Header X-Branch-Code is added to every request
    ▼
Nginx (v2.skoolific.com)
    │
    │ 4. Proxies /api/* to backend at localhost:5052
    ▼
Express Backend (Node.js)
    │
    │ 5. server.js middleware reads X-Branch-Code header
    │ 6. branchContext.run(branchCode, () => next())
    │    - Uses AsyncLocalStorage (request-scoped)
    │ 7. All subsequent pool.query()/pool.connect() calls
    │    resolve to the correct branch database via resolvePool()
    ▼
PostgreSQL (Branch DB: skooloficb1)
    │
    │ 8. Query runs against the correct branch database
    │ 9. Data is isolated per branch
    ▼
Response returned to browser
```

### 2.3 The Branch Code Gate (Middleware)

All routes in `staffRoutes.js` are protected by `validateBranchCode` middleware
(`backend/middleware/branchAuth.js`). This middleware:

1. Checks for branch code in order:
   - JWT token (`req.user.branchCode`)
   - HTTP header (`X-Branch-Code`)
   - Query parameter (`?branchCode=XXX`)
   - Request body (`body.branchCode`)
2. Returns **400 Bad Request** if no branch code is found
3. Validates format (`^[A-Z0-9]{2,5}$`)
4. Resolves the branch pool and attaches it to `req.branchPool`

**If you add new routes, ensure they include `validateBranchCode` middleware**
or are placed after the `router.use(validateBranchCode)` call.

---

## 3. Frontend Branch Code Handling

### 3.1 The Utility: `APP/src/utils/branchCode.js`

```javascript
getBranchCode()
  → Reads from sessionStorage FIRST (per-tab), localStorage SECOND (fallback)
  → Returns uppercase branch code or empty string

setBranchCode(code, remember = false)
  → ALWAYS writes to sessionStorage (current tab only)
  → If remember=true, ALSO writes to localStorage (shared across tabs)
```

### 3.2 Multi-Tab Isolation

Each browser tab has its **own sessionStorage**. This means:

| Action | Tab 1 | Tab 2 |
|--------|-------|-------|
| Login to SB1 | sessionStorage = "SB1" | — |
| Login to SB2 | — | sessionStorage = "SB2" |
| API calls | X-Branch-Code: SB1 ✅ | X-Branch-Code: SB2 ✅ |
| New tab (no session) | Falls back to localStorage → last used branch |

### 3.3 Rules for Frontend Developers

1. **NEVER** read `localStorage.getItem('branchCode')` directly.  
   ✅ Use `getBranchCode()` from `utils/branchCode.js`

2. **NEVER** write `localStorage.setItem('branchCode', ...)` directly.  
   ✅ Use `setBranchCode(code, remember)` from `utils/branchCode.js`

3. **ALWAYS** include `X-Branch-Code` header in API requests.  
   ✅ Use the global axios interceptor (set up in `axios.config.js`)  
   ✅ Or pass `{ headers: { 'X-Branch-Code': getBranchCode() } }` explicitly

4. **NEVER** hardcode `localhost:5052` as API URL.  
   ✅ Use `window.location.origin + '/api'` or `import.meta.env.VITE_API_URL`

---

## 4. Backend Connection Pool Resolution

### `backend/config/db.js` — `resolvePool()`

```javascript
async function resolvePool() {
  const branchCode = branchContext.getStore();
  if (!branchCode) return masterPool;  // ← fallback to master
  // ...resolve to branch pool...
}
```

When no branch code is provided:
- **Staff/Data routes** → REJECTED by `validateBranchCode` middleware before reaching pool
- **System routes** (health, login, branch config) → use master pool safely

### Adding a New Route

```javascript
// If it serves branch-specific data:
router.get('/my-data', validateBranchCode, async (req, res) => {
  // req.branchPool is available
  const result = await req.branchPool.query('SELECT ...');
  res.json(result.rows);
});

// If it's system-level (no branch needed):
router.get('/system-config', async (req, res) => {
  // Uses master pool via fallback
  const result = await pool.query('SELECT ...');
  res.json(result.rows);
});
```

---

## 5. Concurrent Multi-User Support

### How it works

The backend uses Node.js with a **single-threaded event loop** + **PostgreSQL connection pooling**.

| Component | Behavior |
|-----------|----------|
| **AsyncLocalStorage** | Request-scoped context — each request has its own branch code |
| **Connection Pool** | Each branch gets its own pool (max 20 connections) |
| **Queries** | `pool.query()` resolves to the correct branch pool per request |
| **Transactions** | `pool.connect()` gets a connection from the correct branch pool |

### Concurrency Guarantees

- **15 users across 4 branches** → Each branch has its own pool → No cross-branch data mixing
- **Same user, same branch, multiple requests** → Each request is isolated → No race conditions
- **PostgreSQL MVCC** → Transactions are properly isolated per connection

### Pool Sizing

Branch pools are created with `max: 20` connections each.  
For 15 concurrent users across 4 branches (average ~4 users/branch), each branch
pool has more than enough capacity (20 connections >> 4 concurrent users).

---

## 6. Summary — The Golden Rules

```
┌─────────────────────────────────────────────────────────────────┐
│                    BRANCH ISOLATION RULES                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  1. ✅ ALL data operations → send X-Branch-Code header           │
│  2. ✅ ALL branch reads → use getBranchCode() from utils         │
│  3. ✅ ALL branch writes → use setBranchCode() from utils        │
│  4. ✅ Login pages → store branch code in sessionStorage         │
│  5. ❌ NEVER read localStorage.getItem('branchCode') directly    │
│  6. ❌ NEVER hardcode API URLs with localhost:5052               │
│  7. ❌ NEVER skip validateBranchCode on branch-data routes       │
│  8. ❌ NEVER save branch data to the master database             │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```
