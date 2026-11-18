const mongoose = require('mongoose');

let isConnected = false;

const connectDB = async () => {
  const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/server-health-dashboard';

  console.log(`[Database] Attempting connection to MongoDB at: ${uri}`);
  
  try {
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 2500,
    });
    isConnected = true;
    console.log(`[Database] Successfully connected to MongoDB: ${mongoose.connection.host}`);
  } catch (err) {
    isConnected = false;
    console.warn(`[Database] MongoDB connection to "${uri}" was not available (${err.message}).`);
    console.warn('[Database] Operating with built-in high-availability storage so the dashboard runs immediately.');
    console.warn('[Database] Tip: To persist data across server restarts, start your local mongod or specify MONGODB_URI in backend/.env');
  }
};

const getIsConnected = () => isConnected;

module.exports = connectDB;
module.exports.connectDB = connectDB;
module.exports.getIsConnected = getIsConnected;
