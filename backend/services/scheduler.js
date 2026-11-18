const { checkAllServers } = require('./healthCheck');

let schedulerInterval = null;
let isChecking = false;
const INTERVAL_MS = 30 * 1000; // 30 seconds

/**
 * Triggers a check cycle with overlap prevention
 */
async function runScheduledCycle() {
  if (isChecking) {
    console.log('[Scheduler] Health check cycle already in progress. Skipping overlapping tick.');
    return;
  }

  isChecking = true;
  console.log(`[Scheduler] [${new Date().toLocaleTimeString()}] Running automated 30s health check cycle...`);

  try {
    const results = await checkAllServers();
    console.log(`[Scheduler] Automated check finished for ${results.length} server(s).`);
  } catch (error) {
    console.error('[Scheduler] Error in automated health check cycle:', error.message);
  } finally {
    isChecking = false;
  }
}

/**
 * Starts the automatic periodic health check scheduler
 */
function startScheduler() {
  if (schedulerInterval) {
    console.log('[Scheduler] Scheduler is already active.');
    return;
  }

  console.log(`[Scheduler] Initializing automated health check every ${INTERVAL_MS / 1000}s`);
  // Run an initial cycle after 3 seconds to let backend and test servers initialize
  setTimeout(() => {
    runScheduledCycle();
  }, 3000);

  // Set recurring interval
  schedulerInterval = setInterval(runScheduledCycle, INTERVAL_MS);
}

/**
 * Stops the scheduler
 */
function stopScheduler() {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
    console.log('[Scheduler] Stopped automated health check scheduler.');
  }
}

/**
 * Gets scheduler status
 */
function getSchedulerStatus() {
  return {
    isActive: Boolean(schedulerInterval),
    isChecking,
    intervalSeconds: INTERVAL_MS / 1000
  };
}

module.exports = {
  startScheduler,
  stopScheduler,
  runScheduledCycle,
  getSchedulerStatus
};
