import express from 'express';
import rateLimit from 'express-rate-limit';
import { SignJWT } from 'jose';

// Validate environment variables
const PORT = process.env.PORT || 3000;
const N8N_WEBHOOK_URL = process.env.N8N_WEBHOOK_URL;
const JWT_SECRET = process.env.JWT_SECRET;

if (!N8N_WEBHOOK_URL || !JWT_SECRET) {
  console.error('Error: Missing required environment variables');
  console.error('Required: N8N_WEBHOOK_URL, JWT_SECRET');
  process.exit(1);
}

// Create JWT secret key
const jwtSecret = new TextEncoder().encode(JWT_SECRET);

const app = express();

// Middleware
app.use(express.json());

// Helper function to extract IP address
function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    // x-forwarded-for can contain multiple IPs, take the first one
    return forwarded.split(',')[0].trim();
  }
  return req.socket.remoteAddress || 'unknown';
}

// Helper function to validate contact form body
function validateContactBody(body) {
  const errors = [];

  // Check honeypot
  if (body.honeypot && body.honeypot.trim() !== '') {
    errors.push('Spam detected');
    return { valid: false, errors };
  }

  // Check required fields
  if (!body.name || typeof body.name !== 'string' || body.name.trim() === '') {
    errors.push('Name is required');
  }

  if (!body.email || typeof body.email !== 'string' || body.email.trim() === '') {
    errors.push('Email is required');
  }

  if (!body.subject || typeof body.subject !== 'string' || body.subject.trim() === '') {
    errors.push('Subject is required');
  }

  if (!body.message || typeof body.message !== 'string' || body.message.trim() === '') {
    errors.push('Message is required');
  }

  // Check privacy consent
  if (body.privacyConsent !== true) {
    errors.push('Privacy consent is required');
  }

  // Check message length
  if (body.message && body.message.length > 5000) {
    errors.push('Message must be 5000 characters or less');
  }

  return {
    valid: errors.length === 0,
    errors: errors.length > 0 ? errors.join(', ') : null
  };
}

// Rate limiter for /contact endpoint
const contactRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 60 seconds
  max: 3, // 3 requests per window
  standardHeaders: true,
  message: { ok: false, error: 'Too many requests, please try again later' },
  handler: (req, res) => {
    res.status(429).json({ ok: false, error: 'Too many requests, please try again later' });
  }
});

// Routes
app.get('/health', (req, res) => {
  res.json({ ok: true });
});

app.post('/contact', contactRateLimiter, async (req, res) => {
  try {
    // Validate request body
    const validation = validateContactBody(req.body);
    if (!validation.valid) {
      return res.status(400).json({ ok: false, error: validation.errors });
    }

    // Build payload for n8n
    // Use userAgent from request body if provided, otherwise fall back to header
    const userAgent = req.body.userAgent || req.headers['user-agent'] || null;
    
    const payload = {
      // Required form fields
      name: req.body.name.trim(),
      email: req.body.email.trim(),
      subject: req.body.subject.trim(),
      message: req.body.message.trim(),
      // Optional form fields
      company: req.body.company ? req.body.company.trim() : null,
      phone: req.body.phone ? req.body.phone.trim() : null,
      // Metadata
      ip: getClientIp(req),
      userAgent: userAgent,
      language: req.body.language || null,
      createdAt: new Date().toISOString()
    };

    // Generate JWT token for n8n authentication
    const jwt = await new SignJWT({})
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('5m')
      .sign(jwtSecret);

    // Forward to n8n webhook
    try {
      const response = await fetch(N8N_WEBHOOK_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${jwt}`
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        console.error(`n8n webhook returned status ${response.status}`);
        return res.status(500).json({ ok: false, error: 'n8n error' });
      }

      res.json({ ok: true });
    } catch (fetchError) {
      console.error('Error forwarding to n8n:', fetchError.message);
      res.status(500).json({ ok: false, error: 'n8n error' });
    }
  } catch (error) {
    console.error('Unexpected error in /contact:', error.message);
    res.status(500).json({ ok: false, error: 'Server error' });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`Contact proxy server listening on port ${PORT}`);
});

