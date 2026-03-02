const OfflineSync = {
  STORAGE_KEY: 'pos.offlineSalesQueue',
  syncing: false,
  intervalId: null,

  init() {
    this.ensureStatusChip();
    this.updateStatusChip();

    window.addEventListener('online', () => {
      this.toast('Back online. Syncing pending sales...', 'success');
      this.flushQueue();
      this.updateStatusChip();
    });

    window.addEventListener('offline', () => {
      this.toast('You are offline. Sales will be queued.', 'warning');
      this.updateStatusChip();
    });

    this.intervalId = setInterval(() => {
      this.flushQueue();
      this.updateStatusChip();
    }, 20000);
  },

  readQueue() {
    try {
      const raw = localStorage.getItem(this.STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  },

  writeQueue(queue) {
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(Array.isArray(queue) ? queue : []));
    this.updateStatusChip();
  },

  getQueueCount() {
    return this.readQueue().length;
  },

  enqueueSale(payload) {
    const queue = this.readQueue();
    const entry = {
      id: String(payload?.clientSaleRef || `offline-${Date.now()}`),
      createdAt: new Date().toISOString(),
      payload
    };
    queue.push(entry);
    this.writeQueue(queue);
    this.toast(`Sale queued offline. Pending sync: ${queue.length}`, 'warning');
    return entry;
  },

  async flushQueue() {
    if (this.syncing || !navigator.onLine || !window.API || typeof API.completeSale !== 'function') return;

    const queue = this.readQueue();
    if (!queue.length) return;

    this.syncing = true;
    this.updateStatusChip();

    const remaining = [];
    let syncedCount = 0;

    for (const item of queue) {
      try {
        const result = await API.completeSale(item.payload);
        syncedCount += 1;
        window.dispatchEvent(new CustomEvent('offline-sale-synced', {
          detail: {
            queueId: item.id,
            saleId: result?.id,
            alreadySynced: Boolean(result?.alreadySynced)
          }
        }));
      } catch (error) {
        const isNetworkError = (typeof API.isConnectionError === 'function' && API.isConnectionError(error)) || !navigator.onLine;
        if (isNetworkError) {
          remaining.push(item, ...queue.slice(queue.indexOf(item) + 1));
          break;
        }

        remaining.push({
          ...item,
          lastError: error?.message || 'Unknown sync error'
        });
      }
    }

    this.writeQueue(remaining);
    this.syncing = false;
    this.updateStatusChip();

    if (syncedCount > 0) {
      this.toast(`Synced ${syncedCount} queued sale(s).`, 'success');
    }
  },

  ensureStatusChip() {
    if (document.getElementById('offlineSyncChip')) return;
    const chip = document.createElement('div');
    chip.id = 'offlineSyncChip';
    chip.className = 'offline-sync-chip';
    document.body.appendChild(chip);
  },

  updateStatusChip() {
    const chip = document.getElementById('offlineSyncChip');
    if (!chip) return;

    const queueCount = this.getQueueCount();
    const offline = !navigator.onLine;

    if (offline) {
      chip.textContent = `Offline • Pending: ${queueCount}`;
      chip.className = 'offline-sync-chip offline';
      return;
    }

    if (this.syncing) {
      chip.textContent = `Online • Syncing ${queueCount}...`;
      chip.className = 'offline-sync-chip syncing';
      return;
    }

    chip.textContent = queueCount > 0 ? `Online • Pending: ${queueCount}` : 'Online';
    chip.className = `offline-sync-chip ${queueCount > 0 ? 'pending' : 'online'}`;
  },

  toast(message, type = 'loading') {
    const toast = document.createElement('div');
    toast.className = `offline-sync-toast ${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3200);
  }
};

window.OfflineSync = OfflineSync;
