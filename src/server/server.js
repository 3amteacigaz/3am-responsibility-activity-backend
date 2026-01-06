const app = require('./app');
const config = require('./config');

// Import Firebase configuration
require('./config/firebase'); // Initialize Firebase

// Start server
const PORT = config.PORT;

const server = app.listen(PORT, () => {
  console.log(`🚀 3AM Core Responsibility Management Server running on port ${PORT}`);
  console.log(`📱 Environment: ${config.NODE_ENV}`);
  console.log(`🔥 Firebase Project: ${config.FIREBASE_PROJECT_ID}`);
  console.log(`📊 Database: Firebase Firestore Only`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received. Shutting down gracefully...');
  server.close(() => {
    console.log('Process terminated');
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT received. Shutting down gracefully...');
  server.close(() => {
    console.log('Process terminated');
  });
});

module.exports = server;