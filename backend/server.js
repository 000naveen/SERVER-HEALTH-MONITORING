const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const connectDB = require('./config/db');
const { router: serverRoutes, seedDefaultServersIfEmpty } = require('./routes/serverRoutes');
const historyRoutes = require('./routes/historyRoutes');
const { startScheduler, getSchedulerStatus } = require('./services/scheduler');
const { STATES } = require('./services/stateMachine');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// Serve static frontend files
const frontendPath = path.join(__dirname, '../frontend');
app.use(express.static(frontendPath));

// Local Test Server simulation state
let localTestServerHealthy = true;

/**
 * Built-in Test Server Endpoint: http://localhost:5000/health
 * Serves as sample server #5. Can be toggled to simulate outage/recovery for FSM demonstration.
 */
app.get('/health', (req, res) => {
  if (localTestServerHealthy) {
    return res.status(200).json({
      status: 'UP',
      state: 'HEALTHY',
      service: 'Sample Local Health Target',
      uptime: process.uptime(),
      timestamp: new Date().toISOString()
    });
  } else {
    return res.status(503).json({
      status: 'DOWN',
      state: 'UNAVAILABLE',
      service: 'Sample Local Health Target',
      error: 'Simulated 503 Service Outage for FSM Testing',
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * Endpoint to toggle local test server health for easy FSM testing/demo
 */
app.post('/health/toggle', (req, res) => {
  localTestServerHealthy = !localTestServerHealthy;
  console.log(`[TestServer] Local test endpoint health toggled. Now: ${localTestServerHealthy ? 'HEALTHY (200)' : 'DOWN (503)'}`);
  return res.json({
    success: true,
    isHealthy: localTestServerHealthy,
    expectedStatus: localTestServerHealthy ? 200 : 503,
    message: `Test server is now set to ${localTestServerHealthy ? 'HEALTHY (HTTP 200)' : 'DOWN (HTTP 503)'}`
  });
});

app.get('/health/status', (req, res) => {
  return res.json({
    isHealthy: localTestServerHealthy,
    expectedStatus: localTestServerHealthy ? 200 : 503
  });
});

// API Routes
app.use('/api/servers', serverRoutes);
app.use('/api/history', historyRoutes);

// FSM Metadata & Scheduler info endpoint
app.get('/api/fsm-info', (req, res) => {
  res.json({
    states: STATES,
    rules: [
      { from: 'UNKNOWN', to: 'HEALTHY', trigger: 'HTTP check returns 2xx status code' },
      { from: 'UNKNOWN', to: 'DOWN', trigger: 'HTTP check fails, times out, or returns non-2xx' },
      { from: 'HEALTHY', to: 'DOWN', trigger: 'HTTP check fails, times out, or returns non-2xx' },
      { from: 'DOWN', to: 'HEALTHY', trigger: 'HTTP check returns 2xx status code (recovery)' },
      { from: 'HEALTHY', to: 'HEALTHY', trigger: 'HTTP check continues returning 2xx' },
      { from: 'DOWN', to: 'DOWN', trigger: 'HTTP check continues failing/timing out' }
    ],
    scheduler: getSchedulerStatus()
  });
});

// Fallback to frontend index.html for SPA routing
app.get('*', (req, res) => {
  // If requesting an api route that didn't match, return 404 json
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ success: false, error: 'Endpoint not found' });
  }
  res.sendFile(path.join(frontendPath, 'index.html'));
});

// Start Server and connect to Database
async function startApp() {
  try {
    await connectDB();
    await seedDefaultServersIfEmpty();
    
    // Start automated 30s background scheduler
    startScheduler();

    app.listen(PORT, () => {
      console.log('====================================================');
      console.log(` Server Health Monitoring Dashboard running!`);
      console.log(` Dashboard UI   : http://localhost:${PORT}`);
      console.log(` API Endpoints  : http://localhost:${PORT}/api/servers`);
      console.log(` Test Server URL: http://localhost:${PORT}/health`);
      console.log('====================================================');
    });
  } catch (error) {
    console.error('Fatal startup error:', error);
    process.exit(1);
  }
}

startApp();
