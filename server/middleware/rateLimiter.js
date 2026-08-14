import rateLimit from 'express-rate-limit';

// Rate limiter for general AI routes to protect Groq API quota.
// Limits each IP to 30 requests per minute.
export const aiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30, // Limit each IP to 30 requests per windowMs
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  message: {
    error: 'Too many requests. Please wait a minute before making more AI requests.',
    code: 'RATE_LIMIT_EXCEEDED',
  },
});
