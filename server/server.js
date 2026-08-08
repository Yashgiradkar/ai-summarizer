import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import aiRoutes from './routes/ai.js';

const app = express();
const PORT = process.env.PORT || 5001;

if (!process.env.GROQ_API_KEY) {
  console.error('❌ GROQ_API_KEY is not configured.');
  console.error('Please add GROQ_API_KEY to your .env file.');
  process.exit(1);
}

console.log(
  `Groq model: ${process.env.GROQ_MODEL || 'llama-3.3-70b-versatile'
  }`
);

// Middleware
app.use(
  cors({
    origin: true,
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);

app.use(express.json({ limit: '2mb' }));


// API routes
app.use('/api', aiRoutes);

// 404 handler
app.use((_req, res) => {
  res.status(404).json({
    error: 'Route not found',
  });
});

// Global error handler
app.use((err, _req, res, _next) => {
  console.error('[Global Error]', err);

  res.status(err.status || 500).json({
    error: err.status
      ? err.message
      : 'Internal server error',
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});