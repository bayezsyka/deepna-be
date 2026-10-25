require('dotenv').config();
const express = require('express');
const cors = require('cors');

const authRoutes = require('./routes/auth');
const catalogRoutes = require('./routes/catalog');
const adminRoutes = require('./routes/admin');

const app = express();
const port = process.env.PORT || 5000;

// Middleware
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(express.json());

// Request logger sederhana
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl} ${res.statusCode} - ${duration}ms`);
  });
  next();
});

// Health check (sekaligus ping database Neon agar selalu fresh)
app.get('/health', async (req, res) => {
  try {
    await db.query('SELECT 1 AS alive');
    res.json({
      status: 'ok',
      service: 'deepna-be',
      database: 'connected',
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    res.status(500).json({
      status: 'error',
      service: 'deepna-be',
      database: 'disconnected',
      error: err.message,
      timestamp: new Date().toISOString(),
    });
  }
});

app.get('/', (req, res) => {
  res.json({
    service: 'Deepna Store Backend API',
    status: 'running',
    endpoints: {
      health: '/health',
      catalog: '/api/catalog',
      auth: {
        login: 'POST /api/auth/login',
        me: 'GET /api/auth/me',
      },
      admin: {
        products: 'GET /api/admin/products',
        updatePrice: 'PUT /api/admin/products/:id',
      },
    },
  });
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/catalog', catalogRoutes);
app.use('/api/admin', adminRoutes);

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled server error:', err);
  res.status(500).json({ error: 'Internal Server Error' });
});

// Start server
if (require.main === module) {
  app.listen(port, () => {
    console.log(`🚀 Deepna Store Backend API berjalan di port ${port}`);
  });
}

module.exports = app;
