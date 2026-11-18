/**
 * Server Health Monitoring Dashboard - Client Logic
 * Finite State Machine Health Classification & Real-Time Monitoring
 */

// Global Application State
const AppState = {
  servers: [],
  history: [],
  stats: {
    totalServers: 0,
    healthyCount: 0,
    downCount: 0,
    unknownCount: 0,
    availability: 100,
    averageResponseTime: 0
  },
  activeFilter: 'ALL',
  searchQuery: '',
  activeTab: 'overview',
  autoRefreshEnabled: true,
  countdownSeconds: 5,
  countdownIntervalId: null,
  checkingServerIds: new Set(),
  isCheckingAll: false,
  charts: {
    responseTime: null,
    healthDistribution: null
  },
  serverToDelete: null,
  localTestServerHealthy: true
};

// API Base Endpoints
const API = {
  servers: '/api/servers',
  history: '/api/history',
  stats: '/api/history/stats',
  checkAll: '/api/servers/check-all',
  resetSample: '/api/servers/reset-sample',
  testServerToggle: '/health/toggle',
  testServerStatus: '/health/status'
};

/* ==========================================================================
   Initialization
   ========================================================================== */
document.addEventListener('DOMContentLoaded', () => {
  initNavigation();
  initModals();
  initFilterAndSearch();
  initActionButtons();
  initSimulatorWidget();

  // Initial Data Fetch
  loadAllData();

  // Start 5-second auto-refresh countdown
  startAutoRefreshTimer();
});

/* ==========================================================================
   Data Fetching & Synchronization
   ========================================================================== */
async function loadAllData() {
  await Promise.all([
    fetchServers(),
    fetchStats(),
    fetchHistory(),
    fetchTestServerStatus()
  ]);
  renderAllViews();
}

async function fetchServers() {
  try {
    const res = await fetch(API.servers);
    const data = await res.json();
    if (data.success) {
      AppState.servers = data.data;
      updateServerCountBadge();
    }
  } catch (err) {
    console.error('Failed to fetch servers:', err);
  }
}

async function fetchStats() {
  try {
    const res = await fetch(API.stats);
    const data = await res.json();
    if (data.success) {
      AppState.stats = data.data;
    }
  } catch (err) {
    console.error('Failed to fetch stats:', err);
  }
}

async function fetchHistory() {
  try {
    const serverFilter = document.getElementById('history-filter-server')?.value || '';
    const statusFilter = document.getElementById('history-filter-status')?.value || '';
    
    let url = `${API.history}?limit=50`;
    if (serverFilter) url += `&serverId=${encodeURIComponent(serverFilter)}`;
    if (statusFilter) url += `&status=${encodeURIComponent(statusFilter)}`;

    const res = await fetch(url);
    const data = await res.json();
    if (data.success) {
      AppState.history = data.data;
    }
  } catch (err) {
    console.error('Failed to fetch history:', err);
  }
}

async function fetchTestServerStatus() {
  try {
    const res = await fetch(API.testServerStatus);
    const data = await res.json();
    AppState.localTestServerHealthy = data.isHealthy;
    updateSimulatorUI();
  } catch (err) {
    // If backend is still warming up, ignore quietly
  }
}

/* ==========================================================================
   Rendering Core Views
   ========================================================================== */
function renderAllViews() {
  renderSummaryCards();
  renderOverviewCards();
  renderServersTable();
  renderHistoryTable();
  populateHistoryServerFilter();
  renderAnalyticsCharts();
}

// 1. Summary Cards
function renderSummaryCards() {
  const { totalServers, healthyCount, downCount, unknownCount, availability, averageResponseTime } = AppState.stats;

  document.getElementById('stat-total').textContent = totalServers || 0;
  document.getElementById('stat-healthy').textContent = healthyCount || 0;
  document.getElementById('stat-down').textContent = downCount || 0;
  document.getElementById('stat-unknown').textContent = unknownCount || 0;
  document.getElementById('stat-availability').textContent = `${availability || 0}%`;
  document.getElementById('stat-avg-latency').textContent = `Avg Latency: ${averageResponseTime || 0}ms`;

  // Analytics Deep Metrics
  const metricAvg = document.getElementById('metric-avg-latency');
  if (metricAvg) metricAvg.textContent = `${averageResponseTime || 0} ms`;

  const metricHealthRate = document.getElementById('metric-health-rate');
  if (metricHealthRate) {
    const rate = totalServers > 0 ? Math.round((healthyCount / totalServers) * 100) : 0;
    metricHealthRate.textContent = `${rate}%`;
  }
}

// 2. Overview Preview Server Cards
function renderOverviewCards() {
  const container = document.getElementById('overview-server-cards');
  if (!container) return;

  if (AppState.servers.length === 0) {
    container.innerHTML = `
      <div class="empty-state" style="grid-column: 1 / -1;">
        <i class="fa-solid fa-server"></i>
        <p>No servers currently registered. Click <strong>Add Server</strong> or <strong>Restore Defaults</strong>.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = AppState.servers.map(server => {
    const statusClass = getStatusClass(server.currentStatus);
    const isChecking = AppState.checkingServerIds.has(server._id);
    const latencyBadge = getLatencyBadge(server.lastResponseTime);
    const httpBadge = getHttpCodeBadge(server.lastHttpStatus);
    const timeFormatted = formatRelativeTime(server.lastCheckedAt);

    return `
      <div class="server-item-card ${statusClass}">
        <div class="card-top">
          <div class="server-title-group">
            <h4>${escapeHtml(server.name)}</h4>
            <a href="${escapeHtml(server.url)}" target="_blank" rel="noopener noreferrer" class="server-url-link" title="${escapeHtml(server.url)}">
              <i class="fa-solid fa-arrow-up-right-from-square"></i> ${escapeHtml(server.url)}
            </a>
          </div>
          ${getStatusBadge(server.currentStatus)}
        </div>

        <div class="card-meta-row">
          <div class="meta-block">
            <span class="meta-lbl">HTTP Status</span>
            <span class="meta-val">${httpBadge}</span>
          </div>
          <div class="meta-block">
            <span class="meta-lbl">Latency</span>
            <span class="meta-val">${latencyBadge}</span>
          </div>
        </div>

        <div class="card-bottom-actions">
          <span class="last-checked-tag" title="${server.lastCheckedAt ? new Date(server.lastCheckedAt).toLocaleString() : 'Never'}">
            <i class="fa-regular fa-clock"></i> ${timeFormatted}
          </span>
          <button class="btn btn-xs ${isChecking ? 'btn-secondary' : 'btn-outline'}" 
                  onclick="triggerSingleCheck('${server._id}')" 
                  ${isChecking ? 'disabled' : ''}
                  title="Check health now">
            <i class="fa-solid ${isChecking ? 'fa-spinner fa-spin' : 'fa-rotate'}"></i>
            <span>${isChecking ? 'Checking...' : 'Check'}</span>
          </button>
        </div>
      </div>
    `;
  }).join('');
}

// 3. Servers Management Table
function renderServersTable() {
  const tbody = document.getElementById('servers-table-body');
  if (!tbody) return;

  // Filter & Search
  let filtered = AppState.servers.filter(server => {
    const matchesFilter = (AppState.activeFilter === 'ALL') || (server.currentStatus === AppState.activeFilter);
    const matchesSearch = !AppState.searchQuery || 
      server.name.toLowerCase().includes(AppState.searchQuery.toLowerCase()) ||
      server.url.toLowerCase().includes(AppState.searchQuery.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  updateFilterCounts();

  if (filtered.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" class="empty-state">
          <i class="fa-solid fa-filter"></i>
          <p>No servers match the selected criteria.</p>
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = filtered.map(server => {
    const isChecking = AppState.checkingServerIds.has(server._id);
    const statusBadge = getStatusBadge(server.currentStatus);
    const connectivityText = getConnectivityStatus(server.currentStatus, server.lastHttpStatus);
    const httpBadge = getHttpCodeBadge(server.lastHttpStatus);
    const latencyBadge = getLatencyBadge(server.lastResponseTime);
    const timeFormatted = formatRelativeTime(server.lastCheckedAt);

    return `
      <tr>
        <td>
          <div class="server-cell-title">${escapeHtml(server.name)}</div>
          <a href="${escapeHtml(server.url)}" target="_blank" rel="noopener noreferrer" class="server-cell-url">
            <i class="fa-solid fa-link"></i> ${escapeHtml(server.url)}
          </a>
        </td>
        <td>${statusBadge}</td>
        <td>${connectivityText}</td>
        <td>${httpBadge}</td>
        <td>${latencyBadge}</td>
        <td title="${server.lastCheckedAt ? new Date(server.lastCheckedAt).toLocaleString() : 'Never'}">
          ${timeFormatted}
        </td>
        <td class="text-right">
          <div class="actions-cell">
            <button class="btn-icon" 
                    title="Run Health Check" 
                    onclick="triggerSingleCheck('${server._id}')" 
                    ${isChecking ? 'disabled' : ''}>
              <i class="fa-solid ${isChecking ? 'fa-spinner fa-spin' : 'fa-play'}"></i>
            </button>
            <button class="btn-icon" 
                    title="Edit Server" 
                    onclick="openEditModal('${server._id}')">
              <i class="fa-solid fa-pen"></i>
            </button>
            <button class="btn-icon btn-icon-danger" 
                    title="Delete Server" 
                    onclick="confirmDeleteServer('${server._id}', '${escapeHtml(server.name)}')">
              <i class="fa-solid fa-trash-can"></i>
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

// 4. Monitoring History Table
function renderHistoryTable() {
  const tbody = document.getElementById('history-table-body');
  if (!tbody) return;

  if (AppState.history.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" class="empty-state">
          <i class="fa-solid fa-clock-rotate-left"></i>
          <p>No health check history recorded yet. Checks will populate here automatically every 30 seconds.</p>
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = AppState.history.map(item => {
    const transitionHtml = formatTransitionBadges(item.previousStatus, item.currentStatus);
    const httpBadge = getHttpCodeBadge(item.httpStatusCode);
    const latencyBadge = getLatencyBadge(item.responseTime);
    const checkDate = new Date(item.checkedAt);
    const timeString = checkDate.toLocaleTimeString();
    const dateString = checkDate.toLocaleDateString();

    const detailText = item.success
      ? '<span class="text-success"><i class="fa-solid fa-check"></i> Connection 2xx OK</span>'
      : `<span class="text-danger"><i class="fa-solid fa-triangle-exclamation"></i> ${escapeHtml(item.errorMessage || 'Request Failed')}</span>`;

    return `
      <tr>
        <td style="white-space: nowrap;">
          <span style="font-family: var(--font-mono); font-weight: 600;">${timeString}</span>
          <div style="font-size: 10px; color: var(--text-subtle);">${dateString}</div>
        </td>
        <td><strong>${escapeHtml(item.serverName || 'Unknown Server')}</strong></td>
        <td>${transitionHtml}</td>
        <td>${httpBadge}</td>
        <td>${latencyBadge}</td>
        <td>${detailText}</td>
      </tr>
    `;
  }).join('');
}

// 5. Populate History Server Filter Dropdown
function populateHistoryServerFilter() {
  const select = document.getElementById('history-filter-server');
  if (!select) return;

  const currentVal = select.value;
  const options = ['<option value="">All Monitored Servers</option>'];

  AppState.servers.forEach(server => {
    options.push(`<option value="${server._id}" ${currentVal === server._id ? 'selected' : ''}>${escapeHtml(server.name)}</option>`);
  });

  select.innerHTML = options.join('');
}

/* ==========================================================================
   Analytics Charts (Chart.js Integration)
   ========================================================================== */
function renderAnalyticsCharts() {
  renderResponseTimeChart();
  renderHealthDistributionChart();
}

function renderResponseTimeChart() {
  const ctx = document.getElementById('responseTimeChart');
  if (!ctx) return;

  // Group recent history by timestamp/index
  const recentHistory = AppState.stats.recentHistory || AppState.history.slice(0, 20).reverse();
  
  const labels = recentHistory.map((h, i) => {
    const d = new Date(h.checkedAt);
    return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')}`;
  });

  const responseTimes = recentHistory.map(h => h.responseTime || 0);

  if (AppState.charts.responseTime) {
    AppState.charts.responseTime.data.labels = labels;
    AppState.charts.responseTime.data.datasets[0].data = responseTimes;
    AppState.charts.responseTime.update('none');
    return;
  }

  AppState.charts.responseTime = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels.length ? labels : ['0s'],
      datasets: [{
        label: 'Response Latency (ms)',
        data: responseTimes.length ? responseTimes : [0],
        borderColor: '#3b82f6',
        backgroundColor: 'rgba(59, 130, 246, 0.1)',
        borderWidth: 2,
        tension: 0.35,
        fill: true,
        pointBackgroundColor: '#3b82f6',
        pointRadius: 3,
        pointHoverRadius: 6
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: false
        },
        tooltip: {
          backgroundColor: '#0f172a',
          titleColor: '#ffffff',
          bodyColor: '#cbd5e1',
          borderColor: '#1e293b',
          borderWidth: 1,
          padding: 10,
          displayColors: false,
          callbacks: {
            label: (ctx) => ` Latency: ${ctx.parsed.y} ms`
          }
        }
      },
      scales: {
        x: {
          grid: { color: 'rgba(255, 255, 255, 0.05)' },
          ticks: { color: '#64748b', font: { family: 'JetBrains Mono', size: 10 } }
        },
        y: {
          beginAtZero: true,
          grid: { color: 'rgba(255, 255, 255, 0.05)' },
          ticks: { color: '#64748b', font: { family: 'JetBrains Mono', size: 10 }, callback: v => `${v}ms` }
        }
      }
    }
  });
}

function renderHealthDistributionChart() {
  const ctx = document.getElementById('healthDistributionChart');
  if (!ctx) return;

  const healthy = AppState.stats.healthyCount || 0;
  const down = AppState.stats.downCount || 0;
  const unknown = AppState.stats.unknownCount || 0;

  const chartData = [healthy, down, unknown];

  if (AppState.charts.healthDistribution) {
    AppState.charts.healthDistribution.data.datasets[0].data = chartData;
    AppState.charts.healthDistribution.update('none');
    return;
  }

  AppState.charts.healthDistribution = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: ['Healthy (2xx)', 'Down (Error/Timeout)', 'Unknown (Unchecked)'],
      datasets: [{
        data: chartData,
        backgroundColor: [
          '#10b981', // green
          '#ef4444', // red
          '#64748b'  // gray
        ],
        borderWidth: 0,
        hoverOffset: 4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '72%',
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            color: '#94a3b8',
            font: { family: 'Inter', size: 11 },
            padding: 14,
            boxWidth: 10,
            usePointStyle: true
          }
        },
        tooltip: {
          backgroundColor: '#0f172a',
          borderColor: '#1e293b',
          borderWidth: 1,
          padding: 8
        }
      }
    }
  });
}

/* ==========================================================================
   Actions: Health Checks, Server Management
   ========================================================================== */

// Trigger single manual health check
async function triggerSingleCheck(serverId) {
  if (AppState.checkingServerIds.has(serverId)) return;

  AppState.checkingServerIds.add(serverId);
  renderOverviewCards();
  renderServersTable();

  try {
    const res = await fetch(`/api/servers/${serverId}/health`, { method: 'POST' });
    const data = await res.json();

    if (data.success) {
      const server = data.data.server;
      const transition = data.data.transition;
      
      showToast(
        `${server.name}: ${transition.transitionDescription}`,
        server.currentStatus === 'HEALTHY' ? 'success' : 'error',
        'Health Check Completed'
      );
    } else {
      showToast(data.error || 'Check failed', 'error');
    }
  } catch (err) {
    showToast(`Network error checking server: ${err.message}`, 'error');
  } finally {
    AppState.checkingServerIds.delete(serverId);
    await loadAllData();
  }
}

// Check All Servers button
async function triggerCheckAll() {
  if (AppState.isCheckingAll) return;

  const btn = document.getElementById('btn-check-all');
  AppState.isCheckingAll = true;
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> <span>Checking All...</span>';
  }

  showToast('Initiating health checks across all servers...', 'info', 'Check All Started');

  try {
    const res = await fetch(API.checkAll, { method: 'POST' });
    const data = await res.json();

    if (data.success) {
      showToast(`Completed health check for ${data.data.length} servers`, 'success', 'Batch Check Done');
    } else {
      showToast(data.error || 'Batch check failed', 'error');
    }
  } catch (err) {
    showToast(`Error running batch check: ${err.message}`, 'error');
  } finally {
    AppState.isCheckingAll = false;
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<i class="fa-solid fa-rotate"></i> <span>Check All Now</span>';
    }
    await loadAllData();
  }
}

// Add Server
async function handleAddServer(e) {
  e.preventDefault();
  const nameInput = document.getElementById('add-server-name');
  const urlInput = document.getElementById('add-server-url');
  const submitBtn = document.getElementById('btn-submit-add');

  const name = nameInput.value.trim();
  const url = urlInput.value.trim();

  if (!name || !url) {
    showToast('Please enter both name and URL', 'error');
    return;
  }

  submitBtn.disabled = true;
  submitBtn.textContent = 'Adding...';

  try {
    const res = await fetch(API.servers, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, url })
    });
    const data = await res.json();

    if (data.success) {
      showToast(`Server "${name}" added with initial state UNKNOWN`, 'success', 'Server Created');
      closeModal('add-server-modal');
      nameInput.value = '';
      urlInput.value = '';
      await loadAllData();
      
      // Optionally run immediate check
      triggerSingleCheck(data.data._id);
    } else {
      showToast(data.error || 'Failed to add server', 'error');
    }
  } catch (err) {
    showToast(`Request failed: ${err.message}`, 'error');
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Add Server';
  }
}

// Edit Server Modal Open & Submit
function openEditModal(serverId) {
  const server = AppState.servers.find(s => s._id === serverId);
  if (!server) return;

  document.getElementById('edit-server-id').value = server._id;
  document.getElementById('edit-server-name').value = server.name;
  document.getElementById('edit-server-url').value = server.url;

  openModal('edit-server-modal');
}

async function handleEditServer(e) {
  e.preventDefault();
  const id = document.getElementById('edit-server-id').value;
  const name = document.getElementById('edit-server-name').value.trim();
  const url = document.getElementById('edit-server-url').value.trim();
  const submitBtn = document.getElementById('btn-submit-edit');

  submitBtn.disabled = true;
  submitBtn.textContent = 'Saving...';

  try {
    const res = await fetch(`${API.servers}/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, url })
    });
    const data = await res.json();

    if (data.success) {
      showToast(`Server updated successfully`, 'success', 'Saved');
      closeModal('edit-server-modal');
      await loadAllData();
    } else {
      showToast(data.error || 'Update failed', 'error');
    }
  } catch (err) {
    showToast(`Error updating server: ${err.message}`, 'error');
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Save Changes';
  }
}

// Delete Server Confirmation
function confirmDeleteServer(serverId, serverName) {
  AppState.serverToDelete = serverId;
  const label = document.getElementById('delete-server-name-label');
  if (label) label.textContent = `"${serverName}"`;
  openModal('delete-server-modal');
}

async function handleDeleteServer() {
  const serverId = AppState.serverToDelete;
  if (!serverId) return;

  const confirmBtn = document.getElementById('btn-confirm-delete');
  confirmBtn.disabled = true;
  confirmBtn.textContent = 'Deleting...';

  try {
    const res = await fetch(`${API.servers}/${serverId}`, { method: 'DELETE' });
    const data = await res.json();

    if (data.success) {
      showToast(data.message, 'success', 'Server Removed');
      closeModal('delete-server-modal');
      await loadAllData();
    } else {
      showToast(data.error || 'Failed to delete server', 'error');
    }
  } catch (err) {
    showToast(`Delete failed: ${err.message}`, 'error');
  } finally {
    confirmBtn.disabled = false;
    confirmBtn.textContent = 'Delete Server';
    AppState.serverToDelete = null;
  }
}

// Seed / Restore Default Sample Servers
async function restoreSampleServers() {
  try {
    const res = await fetch(API.resetSample, { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      showToast('Sample servers restored successfully', 'success', 'Defaults Restored');
      await loadAllData();
    }
  } catch (err) {
    showToast('Failed to restore sample servers', 'error');
  }
}

// Clear History
async function clearHistory() {
  if (!confirm('Are you sure you want to clear all monitoring history logs?')) return;

  try {
    const res = await fetch('/api/history/clear', { method: 'DELETE' });
    const data = await res.json();
    if (data.success) {
      showToast(data.message, 'success', 'History Cleared');
      await loadAllData();
    }
  } catch (err) {
    showToast('Failed to clear history', 'error');
  }
}

/* ==========================================================================
   Local Test Server Simulation Control
   ========================================================================== */
function initSimulatorWidget() {
  const btn = document.getElementById('btn-toggle-test-server');
  if (btn) {
    btn.addEventListener('click', async () => {
      try {
        const res = await fetch(API.testServerToggle, { method: 'POST' });
        const data = await res.json();
        if (data.success) {
          AppState.localTestServerHealthy = data.isHealthy;
          updateSimulatorUI();
          showToast(data.message, data.isHealthy ? 'success' : 'error', 'Local Server Simulator');
          
          // Find local test server if registered and check it immediately to reflect in FSM
          const localServer = AppState.servers.find(s => s.url.includes(':5000/health'));
          if (localServer) {
            triggerSingleCheck(localServer._id);
          }
        }
      } catch (err) {
        showToast('Could not reach simulator endpoint', 'error');
      }
    });
  }
}

function updateSimulatorUI() {
  const indicator = document.getElementById('sim-indicator');
  const btnText = document.getElementById('sim-btn-text');
  const isHealthy = AppState.localTestServerHealthy;

  if (indicator) {
    indicator.className = `status-indicator-dot ${isHealthy ? 'healthy' : 'down'}`;
  }
  if (btnText) {
    btnText.textContent = isHealthy ? 'Simulate Outage (503)' : 'Recover Server (200)';
  }
}

/* ==========================================================================
   Auto-Refresh Countdown Engine (5 Seconds)
   ========================================================================== */
function startAutoRefreshTimer() {
  if (AppState.countdownIntervalId) clearInterval(AppState.countdownIntervalId);

  AppState.countdownSeconds = 5;
  updateCountdownDisplay();

  AppState.countdownIntervalId = setInterval(async () => {
    if (!AppState.autoRefreshEnabled) return;

    AppState.countdownSeconds -= 1;
    if (AppState.countdownSeconds <= 0) {
      AppState.countdownSeconds = 5;
      // Refresh dashboard data quietly without disrupting user focus or open modals
      await loadAllData();
    }
    updateCountdownDisplay();
  }, 1000);
}

function updateCountdownDisplay() {
  const cd = document.getElementById('refresh-countdown');
  if (cd) cd.textContent = `${AppState.countdownSeconds}s`;
}

function toggleAutoRefresh() {
  AppState.autoRefreshEnabled = !AppState.autoRefreshEnabled;
  const icon = document.getElementById('auto-refresh-icon');
  if (icon) {
    icon.className = AppState.autoRefreshEnabled ? 'fa-solid fa-pause' : 'fa-solid fa-play';
  }
  showToast(
    AppState.autoRefreshEnabled ? '5s Auto-refresh active' : 'Auto-refresh paused',
    'info'
  );
}

/* ==========================================================================
   Navigation, Tabs, Filters, Modals
   ========================================================================== */
function initNavigation() {
  const links = document.querySelectorAll('.nav-link, [data-tab]');
  links.forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const tab = link.getAttribute('data-tab');
      if (tab) switchTab(tab);
    });
  });

  // Mobile sidebar toggle
  const toggleBtn = document.getElementById('sidebar-toggle');
  const sidebar = document.querySelector('.sidebar');
  if (toggleBtn && sidebar) {
    toggleBtn.addEventListener('click', () => {
      sidebar.classList.toggle('open');
    });
  }
}

function switchTab(tabName) {
  AppState.activeTab = tabName;

  document.querySelectorAll('.tab-section').forEach(sec => sec.classList.remove('active'));
  document.querySelectorAll('.nav-link').forEach(link => {
    link.classList.toggle('active', link.getAttribute('data-tab') === tabName);
  });

  const activeSection = document.getElementById(`section-${tabName}`);
  if (activeSection) {
    activeSection.classList.add('active');
  }

  // If opening analytics, resize chart
  if (tabName === 'analytics' && AppState.charts.responseTime) {
    setTimeout(() => {
      AppState.charts.responseTime.resize();
      if (AppState.charts.healthDistribution) AppState.charts.healthDistribution.resize();
    }, 100);
  }
}

function initFilterAndSearch() {
  // Search input
  const searchInput = document.getElementById('search-input');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      AppState.searchQuery = e.target.value.trim();
      renderServersTable();
    });
  }

  // Status Filter pills
  const pills = document.querySelectorAll('.filter-pill');
  pills.forEach(pill => {
    pill.addEventListener('click', () => {
      pills.forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      AppState.activeFilter = pill.getAttribute('data-filter') || 'ALL';
      renderServersTable();
    });
  });

  // History filters
  const historyServerFilter = document.getElementById('history-filter-server');
  if (historyServerFilter) {
    historyServerFilter.addEventListener('change', () => fetchHistory().then(renderHistoryTable));
  }

  const historyStatusFilter = document.getElementById('history-filter-status');
  if (historyStatusFilter) {
    historyStatusFilter.addEventListener('change', () => fetchHistory().then(renderHistoryTable));
  }
}

function updateFilterCounts() {
  const counts = {
    ALL: AppState.servers.length,
    HEALTHY: 0,
    DOWN: 0,
    UNKNOWN: 0
  };

  AppState.servers.forEach(s => {
    if (counts[s.currentStatus] !== undefined) counts[s.currentStatus]++;
  });

  document.getElementById('filter-count-all').textContent = counts.ALL;
  document.getElementById('filter-count-healthy').textContent = counts.HEALTHY;
  document.getElementById('filter-count-down').textContent = counts.DOWN;
  document.getElementById('filter-count-unknown').textContent = counts.UNKNOWN;
}

function updateServerCountBadge() {
  const navBadge = document.getElementById('nav-server-count');
  if (navBadge) navBadge.textContent = AppState.servers.length;
}

function initActionButtons() {
  // Check All Button
  document.getElementById('btn-check-all')?.addEventListener('click', triggerCheckAll);

  // Auto-refresh pause toggle
  document.getElementById('btn-toggle-auto-refresh')?.addEventListener('click', toggleAutoRefresh);

  // Restore defaults
  document.getElementById('btn-seed-sample')?.addEventListener('click', restoreSampleServers);

  // Refresh history
  document.getElementById('btn-refresh-history')?.addEventListener('click', () => fetchHistory().then(renderHistoryTable));

  // Clear history
  document.getElementById('btn-clear-history')?.addEventListener('click', clearHistory);

  // Add Server Buttons (Header & Server Tab)
  document.getElementById('btn-open-add-modal')?.addEventListener('click', () => openModal('add-server-modal'));
  document.getElementById('btn-open-add-modal-2')?.addEventListener('click', () => openModal('add-server-modal'));

  // Form submits
  document.getElementById('add-server-form')?.addEventListener('submit', handleAddServer);
  document.getElementById('edit-server-form')?.addEventListener('submit', handleEditServer);
  document.getElementById('btn-confirm-delete')?.addEventListener('click', handleDeleteServer);
}

function initModals() {
  // Close buttons
  document.querySelectorAll('[data-close-modal]').forEach(btn => {
    btn.addEventListener('click', () => {
      const modalId = btn.getAttribute('data-close-modal');
      closeModal(modalId);
    });
  });

  // Click outside modal
  document.querySelectorAll('.modal-overlay').forEach(modal => {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        closeModal(modal.id);
      }
    });
  });

  // ESC key to close modal
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      document.querySelectorAll('.modal-overlay.active').forEach(m => closeModal(m.id));
    }
  });
}

function openModal(id) {
  const modal = document.getElementById(id);
  if (modal) modal.classList.add('active');
}

function closeModal(id) {
  const modal = document.getElementById(id);
  if (modal) modal.classList.remove('active');
}

/* ==========================================================================
   Toast Notification Utility
   ========================================================================== */
function showToast(message, type = 'info', title = '') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;

  let iconClass = 'fa-info-circle';
  if (type === 'success') iconClass = 'fa-circle-check';
  if (type === 'error') iconClass = 'fa-circle-exclamation';

  toast.innerHTML = `
    <i class="fa-solid ${iconClass} toast-icon"></i>
    <div class="toast-content">
      ${title ? `<div class="toast-title">${escapeHtml(title)}</div>` : ''}
      <div class="toast-msg">${escapeHtml(message)}</div>
    </div>
  `;

  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(40px)';
    setTimeout(() => toast.remove(), 250);
  }, 4000);
}

/* ==========================================================================
   Helper & Formatter Functions
   ========================================================================== */
function getStatusClass(status) {
  switch (status) {
    case 'HEALTHY': return 'state-healthy';
    case 'DOWN': return 'state-down';
    default: return 'state-unknown';
  }
}

function getStatusBadge(status) {
  switch (status) {
    case 'HEALTHY':
      return `<span class="status-badge green-badge"><span class="status-indicator-dot healthy"></span> HEALTHY</span>`;
    case 'DOWN':
      return `<span class="status-badge red-badge"><span class="status-indicator-dot down"></span> DOWN</span>`;
    default:
      return `<span class="status-badge gray-badge"><span class="status-indicator-dot unknown"></span> UNKNOWN</span>`;
  }
}

function getConnectivityStatus(status, statusCode) {
  if (status === 'HEALTHY') {
    return `<span class="text-success" style="font-weight: 600;"><i class="fa-solid fa-signal"></i> Connected</span>`;
  }
  if (status === 'DOWN') {
    return `<span class="text-danger" style="font-weight: 600;"><i class="fa-solid fa-triangle-exclamation"></i> Disconnected</span>`;
  }
  return `<span class="text-muted"><i class="fa-solid fa-ellipsis"></i> Not Checked</span>`;
}

function getHttpCodeBadge(code) {
  if (!code) return `<span class="http-code-badge code-null">---</span>`;
  if (code >= 200 && code < 300) {
    return `<span class="http-code-badge code-2xx">${code} OK</span>`;
  }
  return `<span class="http-code-badge code-${Math.floor(code / 100)}xx">${code} ERR</span>`;
}

function getLatencyBadge(ms) {
  if (ms === null || ms === undefined || ms <= 0) {
    return `<span class="latency-badge" style="color: var(--text-subtle);">---</span>`;
  }
  if (ms < 250) {
    return `<span class="latency-badge latency-fast">${ms} ms</span>`;
  }
  if (ms < 800) {
    return `<span class="latency-badge latency-medium">${ms} ms</span>`;
  }
  return `<span class="latency-badge latency-slow">${ms} ms</span>`;
}

function formatTransitionBadges(prev, curr) {
  const getMiniBadge = (s) => {
    if (s === 'HEALTHY') return '<span class="status-badge green-badge" style="padding: 2px 7px; font-size: 10px;">HEALTHY</span>';
    if (s === 'DOWN') return '<span class="status-badge red-badge" style="padding: 2px 7px; font-size: 10px;">DOWN</span>';
    return '<span class="status-badge gray-badge" style="padding: 2px 7px; font-size: 10px;">UNKNOWN</span>';
  };

  const isChanged = prev !== curr;
  const arrowColor = curr === 'HEALTHY' ? 'var(--state-healthy)' : 'var(--state-down)';

  return `
    <div style="display: flex; align-items: center; gap: 6px;">
      ${getMiniBadge(prev)}
      <i class="fa-solid fa-arrow-right-long" style="font-size: 12px; color: ${isChanged ? arrowColor : 'var(--text-subtle)'};"></i>
      ${getMiniBadge(curr)}
    </div>
  `;
}

function formatRelativeTime(dateString) {
  if (!dateString) return 'Never checked';
  const date = new Date(dateString);
  const now = new Date();
  const diffSeconds = Math.floor((now - date) / 1000);

  if (diffSeconds < 5) return 'Just now';
  if (diffSeconds < 60) return `${diffSeconds}s ago`;
  const diffMinutes = Math.floor(diffSeconds / 60);
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${Math.floor(diffHours / 24)}d ago`;
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
