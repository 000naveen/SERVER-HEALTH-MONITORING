# Server Health Monitoring Dashboard

A modern, responsive, full-stack web application that monitors server health, measures HTTP latency, tracks connectivity states using a **Finite State Machine (FSM)**, and logs real-time health transitions in **MongoDB**.

Designed for production-readiness, educational demonstrations, and college mini-project presentations.

---

## 🌟 Key Features

- **Finite State Machine (FSM) Engine**:
  - Automatically classifies servers into `UNKNOWN`, `HEALTHY`, and `DOWN`.
  - Enforces formal state transition rules with complete transition logging (`previousStatus` → `currentStatus`).
- **Real-Time HTTP Health Checking**:
  - Measures response time using high-precision performance timing (`perf_hooks.performance.now()`).
  - Strict timeout handling (5000 ms) and error categorization (`ECONNREFUSED`, `ETIMEDOUT`, DNS `ENOTFOUND`, HTTP 4xx/5xx).
- **Automated Background Scheduler**:
  - Runs automated health-check cycles every 30 seconds.
  - Built-in overlap protection to prevent race conditions during long-running network checks.
- **Modern Dark-Themed Dashboard**:
  - Sleek Cyberpunk/DevOps dark palette with glowing status indicators.
  - **Summary Cards**: Total Servers, Healthy, Down, Unknown, and Overall Availability Percentage.
  - **Fleet Grid & Management Table**: Search by name/URL, filter by status, manual individual checks with loading spinners.
  - **Analytics**: Real-time response-time line charts (Chart.js) and health distribution doughnut charts.
  - **Monitoring History**: Comprehensive audit log of every health check with state transition badges.
  - **Built-in Local Test Server Simulator**: Interactive widget to toggle `:5000/health` between `200 OK` and `503 Service Outage` for live demonstration of FSM transitions!
- **Auto-Refresh Engine**:
  - Automatically polls and refreshes dashboard statistics every 5 seconds without full page reload.

---

## 📐 Finite State Machine (FSM) Architecture

The core of the monitoring engine is modeled as a 3-state Finite State Machine:

```
                [ New Server Registered ]
                            │
                            ▼
                    ┌───────────────┐
                    │    UNKNOWN    │ (Initial State)
                    └───────┬───────┘
                            │
          ┌─────────────────┴─────────────────┐
          │ HTTP 2xx                          │ HTTP 4xx/5xx, Timeout, Fail
          ▼                                   ▼
  ┌───────────────┐                   ┌───────────────┐
  │    HEALTHY    │◄─────────────────►│     DOWN      │
  └───────────────┘   Recovery (2xx)  └───────────────┘
          │           Outage/Timeout          │
          │ (2xx continues)                   │ (Fail continues)
          ▼                                   ▼
     [ HEALTHY ]                           [ DOWN ]
```

### Transition Matrix

| Previous State | Next State | Trigger Condition | Description |
| :--- | :--- | :--- | :--- |
| `UNKNOWN` | `HEALTHY` | HTTP check yields `2xx` status code | Initial connectivity verified |
| `UNKNOWN` | `DOWN` | HTTP check fails, times out, or yields non-`2xx` | Initial check failed |
| `HEALTHY` | `DOWN` | Connection drop, timeout, or HTTP 4xx/5xx | Server degradation detected |
| `DOWN` | `HEALTHY` | Server returns successful `2xx` response | Server recovery detected |
| `HEALTHY` | `HEALTHY` | Subsequent check continues returning `2xx` | Health maintained |
| `DOWN` | `DOWN` | Subsequent check continues failing or timing out | Outage persists |

---

## 🛠️ Technology Stack

- **Frontend**:
  - HTML5, CSS3 (Modern responsive dark theme, CSS grid, glassmorphism)
  - Vanilla JavaScript (Async/Await, DOM manipulation, custom state store)
  - [Chart.js](https://www.chartjs.org/) for interactive trend charts
  - [FontAwesome 6](https://fontawesome.com/) for iconography
  - Google Fonts (*Inter* & *JetBrains Mono*)
- **Backend**:
  - Node.js (v18+)
  - Express.js (REST API, static file hosting, test endpoints)
  - Axios (HTTP client with timeout and redirect handling)
  - Native `perf_hooks` (High-precision response time calculation)
- **Database**:
  - MongoDB with Mongoose ODM
  - Dual-mode architecture: connects to local MongoDB/Atlas; includes seamless in-memory fallback for immediate zero-config testing!

---

## 📁 Project Folder Structure

```
server-health-dashboard/
├── frontend/
│   ├── index.html        # Main dashboard UI structure & modal templates
│   ├── style.css         # Modern dark-theme stylesheet
│   └── script.js         # Client-side state manager, API caller & Chart.js renderer
├── backend/
│   ├── server.js         # Express server, test endpoints & startup logic
│   ├── config/
│   │   └── db.js         # MongoDB connection & fallback configuration
│   ├── models/
│   │   ├── Server.js         # Mongoose schema for Monitored Servers
│   │   └── HealthHistory.js  # Mongoose schema for Health Check logs
│   ├── routes/
│   │   ├── serverRoutes.js   # Server CRUD & manual check endpoints
│   │   └── historyRoutes.js  # History retrieval & stats endpoints
│   ├── services/
│   │   ├── stateMachine.js   # Formal Finite State Machine implementation
│   │   ├── healthCheck.js    # HTTP check executor & response time measurement
│   │   └── scheduler.js      # 30-second automated check scheduler
│   ├── .env.example      # Sample environment variables
│   ├── .env              # Environment configuration
│   └── package.json      # Node.js dependencies
└── README.md             # Project documentation
```

---

## 🗄️ Database Schemas

### 1. `Servers` Collection
| Field | Type | Description |
| :--- | :--- | :--- |
| `_id` | ObjectId | Unique identifier |
| `name` | String | Server identifier name |
| `url` | String | HTTP/HTTPS target endpoint URL |
| `currentStatus` | String | FSM state (`UNKNOWN`, `HEALTHY`, `DOWN`) |
| `lastResponseTime`| Number | Last measured latency in milliseconds |
| `lastHttpStatus` | Number | Last received HTTP status code (e.g., 200, 503) |
| `lastCheckedAt` | Date | Timestamp of most recent check |
| `createdAt` | Date | Registration timestamp |

### 2. `HealthHistory` Collection
| Field | Type | Description |
| :--- | :--- | :--- |
| `_id` | ObjectId | Unique log identifier |
| `serverId` | ObjectId | Reference to `Servers` collection |
| `serverName` | String | Server name at time of check |
| `previousStatus`| String | State prior to health check |
| `currentStatus` | String | State after evaluating FSM rules |
| `responseTime` | Number | Round-trip latency in milliseconds |
| `httpStatusCode`| Number | HTTP response code |
| `success` | Boolean | `true` if HTTP 2xx, `false` otherwise |
| `errorMessage` | String | Detailed error or timeout description |
| `checkedAt` | Date | Timestamp of the check |

---

## 🚀 Quick Start Guide

### Step 1: Prerequisites
- **Node.js** (v18.0.0 or higher)
- **MongoDB** (Local Community Server, MongoDB Atlas, or Docker)
  - *Note: If MongoDB is not running, the application automatically runs with a built-in memory store so you can test immediately without any errors!*

### Step 2: Install Backend Dependencies
Open PowerShell or your preferred terminal:

```powershell
cd server-health-dashboard/backend
npm install
```

### Step 3: Configure Environment Variables
A default `.env` file is included in `backend/`:
```env
PORT=5000
MONGODB_URI=mongodb://127.0.0.1:27017/server-health-dashboard
CHECK_INTERVAL_SECONDS=30
HTTP_TIMEOUT_MS=5000
```
*(If using MongoDB Atlas, replace `MONGODB_URI` with your connection string).*

### Step 4: Start the Application
Run the backend server:

```powershell
npm start
```

You will see:
```
====================================================
 Server Health Monitoring Dashboard running!
 Dashboard UI   : http://localhost:5000
 API Endpoints  : http://localhost:5000/api/servers
 Test Server URL: http://localhost:5000/health
====================================================
```

### Step 5: Open the Dashboard
Open your browser and navigate to:
👉 **[http://localhost:5000](http://localhost:5000)**

---

## 🧪 Testing Server Connectivity & Demonstrating FSM

### 5 Pre-configured Sample Test Servers
When the application starts for the first time, it automatically registers 5 sample endpoints:
1. **Google** – `https://www.google.com`
2. **GitHub** – `https://github.com`
3. **Example Domain** – `https://example.com`
4. **Cloudflare** – `https://www.cloudflare.com`
5. **Local Test Server** – `http://localhost:5000/health`

### Live FSM Demo using the Built-in Test Server
The dashboard includes an interactive simulator for testing state transitions:
1. Locate the **Local Test Server** widget in the left sidebar or the server list.
2. Initially, it responds with **HTTP 200 OK** (State: `HEALTHY`).
3. Click the **"Simulate Outage"** button in the sidebar. This switches the test endpoint to return **HTTP 503 Service Unavailable**.
4. Click **"Check"** on the Local Test Server card (or wait for the 30s auto-check).
5. Watch the FSM transition immediately:
   - State changes from **`HEALTHY` → `DOWN`**
   - The status badge turns **RED**
   - A degradation alert toast appears
   - The transition is recorded in the **Monitoring History** tab!
6. Click **"Recover Server (200)"** and check again:
   - State changes from **`DOWN` → `HEALTHY`**
   - The status badge turns **GREEN**
   - Server recovery is logged!

---

## 📡 REST API Reference

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/servers` | Retrieve all registered servers |
| `POST`| `/api/servers` | Register a new server (`{ name, url }`) |
| `PUT` | `/api/servers/:id` | Update server details |
| `DELETE` | `/api/servers/:id` | Delete server and associated logs |
| `GET` / `POST` | `/api/servers/:id/health` | Perform immediate health check on single server |
| `POST`| `/api/servers/check-all` | Run health checks on all registered servers |
| `POST`| `/api/servers/reset-sample` | Restore default 5 sample servers |
| `GET` | `/api/history` | Retrieve health check history logs |
| `GET` | `/api/history/stats` | Retrieve aggregate stats (healthy/down counts, availability %, avg latency) |
| `DELETE` | `/api/history/clear` | Clear historical logs |
| `GET` | `/health` | Sample test endpoint (returns 200 OK or 503) |
| `POST`| `/health/toggle` | Toggle test endpoint between 200 OK and 503 |
| `GET` | `/health/status` | Get current simulation state of test endpoint |
| `GET` | `/api/fsm-info` | Get FSM metadata and transition rules |

---

## 🎓 College Mini-Project Viva & Presentation Tips

1. **Why Finite State Machine?**
   - Rather than relying on simple boolean flags, an FSM formalizes state transitions, guarantees that newly registered endpoints start safely in `UNKNOWN`, and produces deterministic state history for audits and SLAs.
2. **How is Latency Measured?**
   - Measured using Node.js `perf_hooks.performance.now()` before and after the Axios HTTP request, ensuring millisecond precision.
3. **How is Overlap Prevented?**
   - The scheduler uses an atomic boolean lock (`isChecking`) so that if network latency exceeds the 30-second interval, overlapping cycles are skipped cleanly.
4. **Resilience & Storage**:
   - The application demonstrates standard MongoDB operations using Mongoose schemas and provides a graceful in-memory storage fallback when external MongoDB services are paused.
