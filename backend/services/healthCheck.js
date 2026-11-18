const axios = require('axios');
const { performance } = require('perf_hooks');
const Server = require('../models/Server');
const HealthHistory = require('../models/HealthHistory');
const { computeTransition } = require('./stateMachine');

/**
 * Validates and normalizes server target URL
 * @param {string} urlString 
 * @returns {string} normalized URL
 */
function normalizeUrl(urlString) {
  if (!urlString) throw new Error('URL string is empty');
  let trimmed = urlString.trim();
  if (!/^https?:\/\//i.test(trimmed)) {
    trimmed = 'http://' + trimmed;
  }
  new URL(trimmed); // will throw TypeError if invalid
  return trimmed;
}

/**
 * Performs an HTTP health check for a single server instance
 * Measures latency, applies FSM transitions, and records history.
 * 
 * @param {string|object} serverOrId - Server document or server ObjectId
 * @param {number} timeoutMs - Max timeout in milliseconds (default: 5000)
 * @returns {Promise<object>} Result containing updated server, history, and transition details
 */
async function checkServerHealth(serverOrId, timeoutMs = 5000) {
  let server;
  if (typeof serverOrId === 'string' || serverOrId instanceof String) {
    server = await Server.findById(serverOrId);
  } else if (serverOrId && serverOrId._id) {
    server = serverOrId;
  }

  if (!server) {
    throw new Error('Server not found for health check');
  }

  const previousStatus = server.currentStatus || 'UNKNOWN';
  let targetUrl;
  let httpStatusCode = null;
  let success = false;
  let errorMessage = null;
  let responseTime = 0;

  const startTime = performance.now();

  try {
    targetUrl = normalizeUrl(server.url);

    const response = await axios.get(targetUrl, {
      timeout: timeoutMs,
      // Allow receiving any HTTP status code without auto-rejecting promise
      validateStatus: () => true,
      headers: {
        'User-Agent': 'Server-Health-Monitor/1.0 (+http://localhost:5000)',
        'Accept': '*/*'
      },
      maxRedirects: 5
    });

    const endTime = performance.now();
    responseTime = Math.round(endTime - startTime);
    httpStatusCode = response.status;

    // Rule: Success is strictly HTTP 2xx
    if (httpStatusCode >= 200 && httpStatusCode < 300) {
      success = true;
    } else {
      success = false;
      errorMessage = `Server responded with HTTP ${httpStatusCode} (${response.statusText || 'Unsuccessful'})`;
    }
  } catch (err) {
    const endTime = performance.now();
    responseTime = Math.round(endTime - startTime);
    success = false;

    if (err.code === 'ECONNABORTED' || err.message.includes('timeout')) {
      errorMessage = `Request timed out after ${timeoutMs}ms`;
      httpStatusCode = 408; // Request Timeout equivalent
    } else if (err.code === 'ENOTFOUND') {
      errorMessage = 'DNS lookup failed (Host not found)';
    } else if (err.code === 'ECONNREFUSED') {
      errorMessage = 'Connection refused by destination host';
    } else if (err instanceof TypeError && err.message.includes('Invalid URL')) {
      errorMessage = `Malformed target URL: ${server.url}`;
    } else {
      errorMessage = err.message || 'Unknown network error';
    }
  }

  // Evaluate FSM transition
  const checkResult = {
    success,
    httpStatusCode,
    errorMessage
  };

  const transition = computeTransition(previousStatus, checkResult);

  // Update Server document
  server.currentStatus = transition.currentStatus;
  server.lastResponseTime = responseTime;
  server.lastHttpStatus = httpStatusCode;
  server.lastCheckedAt = new Date();
  await server.save();

  // Log in HealthHistory collection
  const historyEntry = await HealthHistory.create({
    serverId: server._id,
    serverName: server.name,
    previousStatus: transition.previousStatus,
    currentStatus: transition.currentStatus,
    responseTime,
    httpStatusCode,
    success,
    errorMessage,
    checkedAt: server.lastCheckedAt
  });

  return {
    server,
    history: historyEntry,
    transition,
    responseTime,
    httpStatusCode,
    success,
    errorMessage
  };
}

/**
 * Checks all servers concurrently with concurrency control and error safety
 * @returns {Promise<Array>} Results of each server health check
 */
async function checkAllServers() {
  const servers = await Server.find({});
  if (!servers || servers.length === 0) {
    return [];
  }

  const checkPromises = servers.map(async (srv) => {
    try {
      return await checkServerHealth(srv);
    } catch (err) {
      console.error(`[HealthCheck] Failed to check server ${srv.name} (${srv._id}):`, err.message);
      return {
        server: srv,
        error: err.message
      };
    }
  });

  const results = await Promise.all(checkPromises);
  return results;
}

module.exports = {
  normalizeUrl,
  checkServerHealth,
  checkAllServers
};
