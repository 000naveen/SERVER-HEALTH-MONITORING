const mongoose = require('mongoose');

const healthHistorySchema = new mongoose.Schema(
  {
    serverId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Server',
      required: true,
      index: true
    },
    serverName: {
      type: String,
      default: ''
    },
    previousStatus: {
      type: String,
      enum: ['UNKNOWN', 'HEALTHY', 'DOWN'],
      required: true
    },
    currentStatus: {
      type: String,
      enum: ['UNKNOWN', 'HEALTHY', 'DOWN'],
      required: true
    },
    responseTime: {
      type: Number,
      default: null
    },
    httpStatusCode: {
      type: Number,
      default: null
    },
    success: {
      type: Boolean,
      required: true
    },
    errorMessage: {
      type: String,
      default: null
    },
    checkedAt: {
      type: Date,
      default: Date.now,
      index: true
    }
  },
  {
    versionKey: false
  }
);

const MongooseHealthHistory = mongoose.model('HealthHistory', healthHistorySchema);

// In-Memory Fallback Storage
const memoryHistory = [];

const HealthHistoryProxy = {
  isMongooseActive() {
    return mongoose.connection.readyState === 1;
  },

  async create(data) {
    if (this.isMongooseActive()) {
      return await MongooseHealthHistory.create(data);
    }
    const doc = {
      _id: new mongoose.Types.ObjectId().toString(),
      serverId: String(data.serverId),
      serverName: data.serverName || '',
      previousStatus: data.previousStatus,
      currentStatus: data.currentStatus,
      responseTime: data.responseTime !== undefined ? data.responseTime : null,
      httpStatusCode: data.httpStatusCode !== undefined ? data.httpStatusCode : null,
      success: Boolean(data.success),
      errorMessage: data.errorMessage || null,
      checkedAt: data.checkedAt || new Date()
    };
    memoryHistory.unshift(doc);
    // Keep max 500 records in memory
    if (memoryHistory.length > 500) {
      memoryHistory.pop();
    }
    return doc;
  },

  find(query = {}) {
    if (this.isMongooseActive()) {
      return MongooseHealthHistory.find(query);
    }

    let filtered = memoryHistory.filter(h => {
      if (query.serverId && String(h.serverId) !== String(query.serverId)) return false;
      if (query.currentStatus && h.currentStatus !== query.currentStatus) return false;
      return true;
    });

    const chain = {
      _items: filtered,
      sort(sortOptions) {
        // default already newest first
        return chain;
      },
      limit(n) {
        chain._items = chain._items.slice(0, n);
        return chain;
      },
      lean() {
        return Promise.resolve(chain._items.map(i => ({ ...i })));
      },
      then(resolve, reject) {
        return Promise.resolve(chain._items).then(resolve, reject);
      }
    };
    return chain;
  },

  async deleteMany(query = {}) {
    if (this.isMongooseActive()) {
      return await MongooseHealthHistory.deleteMany(query);
    }
    let deletedCount = 0;
    if (query.serverId) {
      const initialLen = memoryHistory.length;
      const targetId = String(query.serverId);
      for (let i = memoryHistory.length - 1; i >= 0; i--) {
        if (String(memoryHistory[i].serverId) === targetId) {
          memoryHistory.splice(i, 1);
          deletedCount++;
        }
      }
    } else {
      deletedCount = memoryHistory.length;
      memoryHistory.length = 0;
    }
    return { deletedCount };
  }
};

module.exports = HealthHistoryProxy;
