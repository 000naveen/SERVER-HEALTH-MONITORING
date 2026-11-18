const express = require('express');
const router = express.Router();
const Server = require('../models/Server');
const HealthHistory = require('../models/HealthHistory');
const { checkServerHealth, checkAllServers, normalizeUrl } = require('../services/healthCheck');

const SAMPLE_SERVERS = [
  { name: 'Google', url: 'https://www.google.com' },
  { name: 'GitHub', url: 'https://github.com' },
  { name: 'Example Domain', url: 'https://example.com' },
  { name: 'Cloudflare', url: 'https://www.cloudflare.com' },
  { name: 'Local Test Server', url: 'http://localhost:5000/health' }
];

/**
 * Seed sample servers if database is empty
 */
async function seedDefaultServersIfEmpty() {
  const count = await Server.countDocuments();
  if (count === 0) {
    console.log('[Seed] Populating default 5 sample test servers...');
    await Server.insertMany(SAMPLE_SERVERS.map(s => ({
      name: s.name,
      url: s.url,
      currentStatus: 'UNKNOWN'
    })));
    console.log('[Seed] 5 sample servers seeded successfully.');
  }
}

/**
 * GET /api/servers
 * Retrieve all registered servers
 */
router.get('/', async (req, res) => {
  try {
    const servers = await Server.find().sort({ createdAt: 1 });
    return res.json({
      success: true,
      count: servers.length,
      data: servers
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/servers
 * Register a new server
 */
router.post('/', async (req, res) => {
  try {
    const { name, url } = req.body;
    if (!name || !url) {
      return res.status(400).json({
        success: false,
        error: 'Please provide both server name and valid URL.'
      });
    }

    let normalized;
    try {
      normalized = normalizeUrl(url);
    } catch (urlErr) {
      return res.status(400).json({
        success: false,
        error: `Invalid URL format: ${url}. Please provide a valid HTTP/HTTPS address.`
      });
    }

    const newServer = await Server.create({
      name: name.trim(),
      url: normalized,
      currentStatus: 'UNKNOWN'
    });

    return res.status(201).json({
      success: true,
      message: 'Server registered successfully.',
      data: newServer
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * PUT /api/servers/:id
 * Update existing server details
 */
router.put('/:id', async (req, res) => {
  try {
    const { name, url } = req.body;
    const server = await Server.findById(req.params.id);

    if (!server) {
      return res.status(404).json({ success: false, error: 'Server not found.' });
    }

    if (name) server.name = name.trim();
    if (url) {
      try {
        server.url = normalizeUrl(url);
      } catch (urlErr) {
        return res.status(400).json({ success: false, error: 'Invalid URL format.' });
      }
    }

    await server.save();

    return res.json({
      success: true,
      message: 'Server updated successfully.',
      data: server
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * DELETE /api/servers/:id
 * Delete a server and its historical health logs
 */
router.delete('/:id', async (req, res) => {
  try {
    const server = await Server.findById(req.params.id);
    if (!server) {
      return res.status(404).json({ success: false, error: 'Server not found.' });
    }

    await Server.findByIdAndDelete(req.params.id);
    await HealthHistory.deleteMany({ serverId: req.params.id });

    return res.json({
      success: true,
      message: `Server "${server.name}" and associated health logs were deleted.`
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/servers/:id/health
 * POST /api/servers/:id/health
 * Perform an immediate manual health check on a specific server
 */
const handleSingleHealthCheck = async (req, res) => {
  try {
    const server = await Server.findById(req.params.id);
    if (!server) {
      return res.status(404).json({ success: false, error: 'Server not found.' });
    }

    const checkResult = await checkServerHealth(server);

    return res.json({
      success: true,
      message: `Health check completed for ${server.name}`,
      data: checkResult
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
};

router.get('/:id/health', handleSingleHealthCheck);
router.post('/:id/health', handleSingleHealthCheck);

/**
 * POST /api/servers/check-all
 * Perform immediate health checks on all registered servers
 */
router.post('/check-all', async (req, res) => {
  try {
    const results = await checkAllServers();
    return res.json({
      success: true,
      message: `Checked ${results.length} server(s)`,
      data: results
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/servers/reset-sample
 * Restore default 5 sample servers
 */
router.post('/reset-sample', async (req, res) => {
  try {
    for (const sample of SAMPLE_SERVERS) {
      const existing = await Server.findOne({ name: sample.name });
      if (!existing) {
        await Server.create({
          name: sample.name,
          url: sample.url,
          currentStatus: 'UNKNOWN'
        });
      }
    }
    const servers = await Server.find().sort({ createdAt: 1 });
    return res.json({
      success: true,
      message: 'Sample servers refreshed.',
      data: servers
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = {
  router,
  seedDefaultServersIfEmpty,
  SAMPLE_SERVERS
};
