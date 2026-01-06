const express = require('express');
const cookieParser = require('cookie-parser');
const path = require('path');
const cors = require('cors');

// Import configuration
const config = require('./config');

// Import middleware
const { apiLimiter } = require('./middleware/rateLimiter');
const { errorHandler, notFound } = require('./middleware/errorHandler');

// Import routes
const routes = require('./routes');

// Initialize Express app
const app = express();

// Trust proxy for rate limiting behind reverse proxy
app.set('trust proxy', 1);

// CORS configuration
app.use(cors({
  origin: config.CORS_ORIGIN,
  credentials: true
}));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Cookie parser
app.use(cookieParser(config.COOKIE_SECRET));

// Rate limiting
app.use(apiLimiter);

// Handle common browser requests that cause 404s
app.get('/favicon.ico', (req, res) => {
  res.status(204).end();
});

app.get('/.well-known/*', (req, res) => {
  res.status(204).end();
});

// Mount all routes
app.use('/', routes);

// 404 handler
app.use(notFound);

// Global error handler
app.use(errorHandler);

module.exports = app;