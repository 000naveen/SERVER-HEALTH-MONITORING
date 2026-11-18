const mongoose = require('mongoose');

const serverSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Server name is required'],
      trim: true,
      maxlength: [100, 'Server name cannot exceed 100 characters']
    },
    url: {
      type: String,
      required: [true, 'Server URL is required'],
      trim: true
    },
    currentStatus: {
      type: String,
      enum: ['UNKNOWN', 'HEALTHY', 'DOWN'],
      default: 'UNKNOWN'
    },
    lastResponseTime: {
      type: Number,
      default: null
    },
    lastHttpStatus: {
      type: Number,
      default: null
    },
    lastCheckedAt: {
      type: Date,
      default: null
    },
    createdAt: {
      type: Date,
      default: Date.now
    }
  },
  {
    versionKey: false
  }
);

const MongooseServer = mongoose.model('Server', serverSchema);

// In-Memory Fallback Storage
const memoryServers = [];

class InMemoryServerDoc {
  constructor(data) {
    this._id = data._id ? String(data._id) : new mongoose.Types.ObjectId().toString();
    this.name = data.name;
    this.url = data.url;
    this.currentStatus = data.currentStatus || 'UNKNOWN';
    this.lastResponseTime = data.lastResponseTime !== undefined ? data.lastResponseTime : null;
    this.lastHttpStatus = data.lastHttpStatus !== undefined ? data.lastHttpStatus : null;
    this.lastCheckedAt = data.lastCheckedAt || null;
    this.createdAt = data.createdAt || new Date();
  }

  async save() {
    const idx = memoryServers.findIndex(s => String(s._id) === String(this._id));
    if (idx !== -1) {
      memoryServers[idx] = this;
    } else {
      memoryServers.push(this);
    }
    return this;
  }
}

const ServerProxy = {
  isMongooseActive() {
    return mongoose.connection.readyState === 1;
  },

  async countDocuments(query = {}) {
    if (this.isMongooseActive()) {
      return await MongooseServer.countDocuments(query);
    }
    return memoryServers.length;
  },

  async insertMany(docs) {
    if (this.isMongooseActive()) {
      return await MongooseServer.insertMany(docs);
    }
    const created = docs.map(d => new InMemoryServerDoc(d));
    memoryServers.push(...created);
    return created;
  },

  find(query = {}) {
    if (this.isMongooseActive()) {
      return MongooseServer.find(query);
    }

    const results = memoryServers.map(s => new InMemoryServerDoc(s));
    return {
      sort(sortOptions) {
        return Promise.resolve(results);
      },
      lean() {
        return Promise.resolve(results);
      },
      then(resolve, reject) {
        return Promise.resolve(results).then(resolve, reject);
      }
    };
  },

  async findOne(query = {}) {
    if (this.isMongooseActive()) {
      return await MongooseServer.findOne(query);
    }
    const found = memoryServers.find(s => {
      if (query.name && s.name !== query.name) return false;
      if (query._id && String(s._id) !== String(query._id)) return false;
      return true;
    });
    return found ? new InMemoryServerDoc(found) : null;
  },

  async findById(id) {
    if (this.isMongooseActive()) {
      return await MongooseServer.findById(id);
    }
    const found = memoryServers.find(s => String(s._id) === String(id));
    return found ? new InMemoryServerDoc(found) : null;
  },

  async create(data) {
    if (this.isMongooseActive()) {
      return await MongooseServer.create(data);
    }
    const doc = new InMemoryServerDoc(data);
    memoryServers.push(doc);
    return doc;
  },

  async findByIdAndDelete(id) {
    if (this.isMongooseActive()) {
      return await MongooseServer.findByIdAndDelete(id);
    }
    const idx = memoryServers.findIndex(s => String(s._id) === String(id));
    if (idx !== -1) {
      const removed = memoryServers.splice(idx, 1)[0];
      return new InMemoryServerDoc(removed);
    }
    return null;
  }
};

module.exports = ServerProxy;
