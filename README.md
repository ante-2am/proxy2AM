# Contact Form Proxy

A small, secure Node.js/Express proxy service that sits between a contact form frontend and an n8n webhook. This service provides validation, spam protection, and rate limiting before forwarding contact form submissions to n8n.

## Features

- **Security**: Honeypot spam protection and rate limiting
- **Privacy**: GDPR-friendly logging (no unnecessary personal data in logs)
- **Validation**: Input validation before forwarding requests
- **Health checks**: Built-in health check endpoint for monitoring

## Requirements

- Node.js 20+
- npm

## Environment Variables

The following environment variables are required:

- `PORT` (optional, default: `3000`) - Port the server listens on
- `N8N_WEBHOOK_URL` (required) - Full URL of the n8n webhook endpoint
- `JWT_SECRET` (required) - Secret key for signing JWT tokens used to authenticate with n8n

Copy `.env.example` to `.env` and fill in the values:

```bash
cp .env.example .env
```

## Local Development

1. Install dependencies:
```bash
npm install
```

2. Set environment variables (copy `.env.example` to `.env` and update values)

3. Start the server:
```bash
npm start
```

The server will start on port 3000 (or the port specified in `PORT`).

## API Endpoints

### GET /health

Health check endpoint for monitoring.

**Response:**
```json
{
  "ok": true
}
```

### POST /contact

Submit a contact form message. This endpoint is rate-limited to 3 requests per 60 seconds per IP address.

**Request Body:**
```json
{
  "name": "John Doe",
  "email": "john@example.com",
  "subject": "Contact Form Inquiry",
  "message": "Hello, this is my message",
  "company": "Example Corp",
  "phone": "+49 123 456789",
  "honeypot": "",
  "privacyConsent": true,
  "whatsappConsent": true,
  "userAgent": "Mozilla/5.0...",
  "language": "de-DE",
  "timestamp": "2024-11-17T10:30:00.000Z"
}
```

**Fields:**
- `name` (string, required) - Contact name
- `email` (string, required) - Contact email address
- `subject` (string, required) - Message subject
- `message` (string, required) - Message content (max 5000 characters)
- `privacyConsent` (boolean, required) - Must be `true` to indicate privacy policy consent
- `company` (string, optional) - Company name
- `phone` (string, optional) - Phone number
- `whatsappConsent` (boolean, optional) - Indicates if the user wants follow-up via WhatsApp
- `honeypot` (string, optional) - Spam protection field. If this field is filled, the request will be rejected as spam. The frontend should include this field but leave it empty.
- `userAgent` (string, optional) - Browser user agent (will fall back to request header if not provided)
- `language` (string, optional) - Browser language preference
- `timestamp` (string, optional) - Client-side timestamp when the form was submitted (ISO format)

**Success Response (200):**
```json
{
  "ok": true
}
```

**Error Responses:**

- `400 Bad Request` - Validation error
```json
{
  "ok": false,
  "error": "Name is required, Email is required"
}
```

- `429 Too Many Requests` - Rate limit exceeded
```json
{
  "ok": false,
  "error": "Too many requests, please try again later"
}
```

- `500 Internal Server Error` - Server or n8n error
```json
{
  "ok": false,
  "error": "n8n error"
}
```

## Deployment with Docker / Coolify

1. Build the Docker image from the included `Dockerfile`

2. Ensure the following environment variables are set in Coolify:
   - `PORT` (optional, defaults to 3000)
   - `N8N_WEBHOOK_URL` (required)
   - `JWT_SECRET` (required)

3. The container will listen on the port specified by the `PORT` environment variable

4. Coolify will handle HTTPS termination and routing to your subdomain

## How It Works

1. The frontend submits contact form data to this proxy service
2. The proxy validates the request (required fields, privacy consent, honeypot check, message length)
3. If validation passes, the proxy generates a JWT token and forwards the request to the n8n webhook with:
   - Original form data (name, email, subject, message, company, phone)
   - Additional metadata (IP address, user agent, language, timestamp)
   - JWT authentication token in the `Authorization: Bearer <token>` header
4. The proxy returns a success or error response to the frontend

## Security Features

- **Honeypot**: The `honeypot` field should be included in the form but left empty. Bots often fill all fields, so a filled honeypot indicates spam.
- **Rate Limiting**: Prevents abuse by limiting requests to 3 per minute per IP address
- **JWT Authentication**: Uses JWT tokens signed with `JWT_SECRET` to authenticate requests between the proxy and n8n. Tokens are valid for 5 minutes.

