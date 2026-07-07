const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { Pool } = require('pg');
const helmet = require('helmet');
require('dotenv').config();

const app = express();
// OWASP A05: Disable X-Powered-By to prevent technology fingerprinting
app.disable('x-powered-by');

// Middleware to generate a cryptographically secure random nonce per-request for Content Security Policy (CSP)
app.use((req, res, next) => {
    // Generate 16 bytes base64 nonce
    const nonce = crypto.randomBytes(16).toString('base64');
    res.locals.nonce = nonce;

    // Execute helmet dynamically with the generated nonce injected into scriptSrc and scriptSrcElem
    helmet({
        contentSecurityPolicy: {
            directives: {
                defaultSrc: ["'self'"],
                // scriptSrc acts as fallback for older browsers
                scriptSrc: ["'self'", `'nonce-${nonce}'`, "https://accounts.google.com"],
                // scriptSrcElem blocks inline script injections (<script>...) in modern browsers
                scriptSrcElem: ["'self'", `'nonce-${nonce}'`, "https://accounts.google.com"],
                // scriptSrcAttr blocks inline event attributes (onclick...) for absolute XSS security
                scriptSrcAttr: ["'self'"],
                styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://fonts.googleapis.com/css2"],
                fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"],
                imgSrc: ["'self'", "data:", "https://api.dicebear.com", "https://*.googleusercontent.com", "https://accounts.google.com"],
                connectSrc: ["'self'", "https://accounts.google.com", "https://play.google.com/log"],
                frameSrc: ["'self'", "https://accounts.google.com"]
            }
        },
        crossOriginEmbedderPolicy: false
    })(req, res, next);
});

// Remove the 'Server' header that leaks Node.js/Express version information
app.use((req, res, next) => { res.removeHeader('Server'); next(); });
const PORT = process.env.PORT || 3000;

// Trust exactly 1 proxy hop (e.g. Nginx/load balancer in front of Node).
// Using 'true' would trust ALL X-Forwarded-For values, allowing IP spoofing to bypass rate limits.
app.set('trust proxy', 1);

// Retrieve signed session verification key. In production, REQUIRE the env var (fail-closed).
// In development, fall back to a per-process random key (sessions invalidate on restart).
const JWT_SECRET = (() => {
    if (process.env.JWT_SECRET && process.env.JWT_SECRET.length >= 32) {
        return process.env.JWT_SECRET;
    }
    if (process.env.NODE_ENV === 'production') {
        console.error('FATAL: JWT_SECRET environment variable is required in production (min 32 chars).');
        process.exit(1);
    }
    console.warn('WARNING: JWT_SECRET not set — using ephemeral random key (development only).');
    return crypto.randomBytes(32).toString('hex');
})();

// SECURITY: AES-256-CBC encryption/decryption helpers for Zoom meeting URLs at rest
function encryptText(text) {
    if (!text) return '';
    try {
        const key = crypto.createHash('sha256').update(JWT_SECRET).digest(); // 32 bytes key
        const iv = crypto.randomBytes(16);
        const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
        let encrypted = cipher.update(text, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        return iv.toString('hex') + ':' + encrypted;
    } catch (e) {
        console.error('Encryption failed:', e);
        return text;
    }
}

function decryptText(encryptedText) {
    if (!encryptedText) return '';
    try {
        const parts = encryptedText.split(':');
        if (parts.length !== 2) return encryptedText; // Fallback if plain text
        const iv = Buffer.from(parts[0], 'hex');
        const encrypted = parts[1];
        const key = crypto.createHash('sha256').update(JWT_SECRET).digest();
        const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
        let decrypted = decipher.update(encrypted, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
    } catch (e) {
        return encryptedText; // Fallback to plain text if decryption fails
    }
}

// Retrieve Zoom Meeting URL from env. Fail-closed: empty string if not set (no fake placeholder).
const ZOOM_MEETING_URL = process.env.ZOOM_MEETING_URL || "";

// Google OAuth 2.0 Client ID for Sign in with Google (configured in Google Cloud Console)
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';

// Build the Content Security Policy header string.
// When a per-request nonce is provided, script-src and script-src-elem use the nonce
// instead of the broad 'unsafe-inline', providing the strongest XSS protection.
function buildContentSecurityPolicy(nonce) {
    const scriptSrcParts = ["'self'", "https://accounts.google.com", "https://accounts.google.com/gsi/client"];
    if (nonce) {
        scriptSrcParts.push(`'nonce-${nonce}'`);
    } else {
        // Fallback for API-only responses that skip HTML injection
        scriptSrcParts.push("'unsafe-inline'");
    }
    return [
        "default-src 'self'",
        `script-src ${scriptSrcParts.join(' ')}`,
        `script-src-elem ${scriptSrcParts.join(' ')}`,
        "script-src-attr 'self'",
        "style-src 'self' 'unsafe-inline' https://accounts.google.com/gsi/style",
        "style-src-elem 'self' 'unsafe-inline' https://accounts.google.com/gsi/style",
        "style-src-attr 'unsafe-inline'",
        "font-src 'self'",
        "img-src 'self' data: https://api.dicebear.com https://images.unsplash.com https://lh3.googleusercontent.com https://*.googleusercontent.com https://*.dicebear.com",
        "connect-src 'self' https://accounts.google.com https://accounts.google.com/gsi/",
        "frame-src 'self' https://accounts.google.com https://accounts.google.com/gsi/",
        "frame-ancestors 'none'",
        "form-action 'self' https://wa.me",
        "base-uri 'self'",
        "object-src 'none'"
    ].join('; ');
}

function applySecurityHeaders(req, res) {
    res.setHeader('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
    // SECURITY: Use CSP frame-ancestors instead of X-Frame-Options (avoids conflict).
    res.setHeader('X-Content-Type-Options', 'nosniff');
    // X-XSS-Protection is deprecated and ignored by modern browsers (removed).
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), interest-cohort=()');
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    // Pass the per-request nonce so the CSP header matches the injected script nonces
    res.setHeader('Content-Security-Policy', buildContentSecurityPolicy(res.locals.nonce));
    res.removeHeader('Server');
    res.removeHeader('X-Powered-By');
}
// Rate limiting state storage (IP/User-based maps)
const rateLimitStores = {
    general: new Map(),
    auth: new Map(),
    stats: new Map()
};

// Periodic pruning of expired rate-limit records (every 1 minute)
setInterval(() => {
    const now = Date.now();
    for (const storeType of ['general', 'auth', 'stats']) {
        const store = rateLimitStores[storeType];
        if (store) {
            for (const [key, data] of store.entries()) {
                if (now > data.resetTime) {
                    store.delete(key);
                }
            }
        }
    }
}, 60000);

// Helper for structured security event logging (JSON format to stdout)
function logSecurityEvent(level, event, req, metadata = {}) {
    const ip = req ? (req.ip || req.socket.remoteAddress || '127.0.0.1') : 'SYSTEM';
    const logObj = {
        timestamp: new Date().toISOString(),
        level: level.toUpperCase(),
        event: event,
        ip: ip,
        path: req ? req.originalUrl || req.path : undefined,
        method: req ? req.method : undefined,
        userId: req?.user?.id || null,
        userRole: req?.user?.role || null,
        ...metadata
    };
    console.log(JSON.stringify(logObj));
}

// Helper to record admin audit logs
async function logAuditTrail(client, actorId, action, targetId, details) {
    try {
        await executeClientQuery(
            client,
            'INSERT INTO audit_logs (actor_id, action, target_id, details) VALUES (?, ?, ?, ?)',
            [actorId, action, targetId, details]
        );
    } catch (err) {
        console.error('Audit trail logging failed:', err);
    }
}

// Helper function to create rate limit middleware (IP + user-based, graceful 429s)
function rateLimiter({ max, windowMs, storeType = 'general' }) {
    return async (req, res, next) => {
        const ip = req.ip || req.socket.remoteAddress || '127.0.0.1';
        let key = `ip:${ip}`;

        // IP + User-based composite rate limit checks
        let token = req.cookies?.ms_session_v2 || null;
        if (!token) {
            const authHeader = req.headers['authorization'];
            if (authHeader && authHeader.startsWith('Bearer ')) {
                token = authHeader.substring(7);
            }
        }
        if (token) {
            const decoded = verifySessionToken(token);
            if (decoded && decoded.id) {
                key = `user:${decoded.id}`;
            }
        }

        const now = Date.now();
        let count = 0;
        let resetTime = now + windowMs;

        if (redisClient && redisClient.isOpen) {
            try {
                const redisKey = `mindsquare:rate:${storeType}:${key}`;
                const multi = redisClient.multi();
                multi.incr(redisKey);
                multi.ttl(redisKey);
                const results = await multi.exec();
                
                count = results[0];
                const ttl = results[1];

                if (ttl === -1 || count === 1) {
                    await redisClient.expire(redisKey, Math.ceil(windowMs / 1000));
                    resetTime = now + windowMs;
                } else {
                    resetTime = now + (ttl * 1000);
                }
            } catch (e) {
                console.error('Redis rate limit increment failed, falling back to memory:', e);
                count = 0;
            }
        }

        // Memory fallback if Redis is down, not open, or error occurred
        if (count === 0) {
            const store = rateLimitStores[storeType];
            let clientData = store.get(key);
            if (!clientData || now > clientData.resetTime) {
                clientData = {
                    count: 0,
                    resetTime: now + windowMs
                };
            }
            clientData.count++;
            store.set(key, clientData);
            count = clientData.count;
            resetTime = clientData.resetTime;
        }

        res.setHeader('X-RateLimit-Limit', max);
        res.setHeader('X-RateLimit-Remaining', Math.max(0, max - count));
        res.setHeader('X-RateLimit-Reset', new Date(resetTime).toISOString());

        if (count > max) {
            logSecurityEvent('WARN', 'RATE_LIMIT_EXCEEDED', req, { storeType, count, max, rateLimitKey: key });
            return res.status(429).json({
                error: 'Too many requests. Please try again later.',
                retryAfter: Math.round((resetTime - now) / 1000)
            });
        }
        next();
    };
}

// Database-backed composite rate limiter specifically for auth endpoints (1.3 Brute-Force, IP + User-based)
async function dbAuthRateLimiter(req, res, next) {
    const ip = req.ip || req.socket.remoteAddress || '127.0.0.1';
    const email = req.body?.email || '';
    const now = new Date();
    const windowMs = 15 * 60 * 1000; // 15 minutes
    const max = 20;

    // Rate limit both by IP and by specific Email (prevent distributed brute force on single email)
    const keysToCheck = [`ip:${ip}`];
    if (email && typeof email === 'string') {
        keysToCheck.push(`email:${email.toLowerCase().trim()}`);
    }

    // Try Redis first to avoid DB transactional locks under auth storm events
    if (redisClient && redisClient.isOpen) {
        try {
            let rateLimitExceeded = false;
            let worstRemaining = max;
            let worstResetTime = new Date(Date.now() + windowMs);

            for (const key of keysToCheck) {
                const redisKey = `mindsquare:auth:${key}`;
                const multi = redisClient.multi();
                multi.incr(redisKey);
                multi.ttl(redisKey);
                const results = await multi.exec();

                const count = results[0];
                const ttl = results[1];

                const remaining = Math.max(0, max - count);
                if (remaining < worstRemaining) {
                    worstRemaining = remaining;
                    worstResetTime = ttl > 0 ? new Date(Date.now() + ttl * 1000) : new Date(Date.now() + windowMs);
                }

                if (ttl === -1 || count === 1) {
                    await redisClient.expire(redisKey, Math.ceil(windowMs / 1000));
                }

                if (count > max) {
                    rateLimitExceeded = true;
                }
            }

            res.setHeader('X-RateLimit-Limit', max);
            res.setHeader('X-RateLimit-Remaining', worstRemaining);
            res.setHeader('X-RateLimit-Reset', worstResetTime.toISOString());

            if (rateLimitExceeded) {
                logSecurityEvent('WARN', 'RATE_LIMIT_EXCEEDED', req, { storeType: 'auth_redis', keys: keysToCheck, max });
                return res.status(429).json({
                    error: 'Too many authentication attempts. Please try again later.',
                    retryAfter: Math.round((worstResetTime.getTime() - Date.now()) / 1000)
                });
            }
            return next();
        } catch (redisErr) {
            console.error('Redis auth rate limiter failed, falling back to DB/Memory:', redisErr);
        }
    }

    let client;
    try {
        client = await pool.connect();
        await client.query('BEGIN');

        let rateLimitExceeded = false;
        let worstRemaining = max;
        let worstResetTime = new Date(Date.now() + windowMs);

        for (const key of keysToCheck) {
            // Find existing rate limit record
            const rows = await executeClientQuery(client, 'SELECT * FROM auth_rate_limits WHERE ip = ?', [key]);
            let attempts = 0;
            let resetTime = new Date(Date.now() + windowMs);

            if (rows.length > 0) {
                const record = rows[0];
                const recordResetTime = new Date(record.reset_time);
                if (now < recordResetTime) {
                    attempts = record.attempts;
                    resetTime = recordResetTime;
                } else {
                    attempts = 0;
                    resetTime = new Date(Date.now() + windowMs);
                }
            }

            attempts++;

            if (rows.length > 0) {
                await executeClientQuery(client, 'UPDATE auth_rate_limits SET attempts = ?, reset_time = ? WHERE ip = ?', [attempts, resetTime.toISOString(), key]);
            } else {
                await executeClientQuery(client, 'INSERT INTO auth_rate_limits (ip, attempts, reset_time) VALUES (?, ?, ?)', [key, attempts, resetTime.toISOString()]);
            }

            const remaining = Math.max(0, max - attempts);
            if (remaining < worstRemaining) {
                worstRemaining = remaining;
                worstResetTime = resetTime;
            }

            if (attempts > max) {
                rateLimitExceeded = true;
            }
        }

        await client.query('COMMIT');

        res.setHeader('X-RateLimit-Limit', max);
        res.setHeader('X-RateLimit-Remaining', worstRemaining);
        res.setHeader('X-RateLimit-Reset', worstResetTime.toISOString());

        if (rateLimitExceeded) {
            logSecurityEvent('WARN', 'RATE_LIMIT_EXCEEDED', req, { storeType: 'auth_db', keys: keysToCheck, max });
            return res.status(429).json({
                error: 'Too many authentication attempts. Please try again later.',
                retryAfter: Math.round((worstResetTime.getTime() - Date.now()) / 1000)
            });
        }
        next();
    } catch (err) {
        if (client) {
            try { await client.query('ROLLBACK'); } catch (e) { }
        }
        console.error('DB auth rate limiter failed, falling back to memory-based limit:', err);
        // Fallback to memory rate limiting
        const memoryLimiter = rateLimiter({ max: 20, windowMs: 15 * 60 * 1000, storeType: 'auth' });
        return memoryLimiter(req, res, next);
    } finally {
        if (client) client.release();
    }
}


// Generate an HMAC-SHA256 signed session token (access token - 15 minutes expiration)
function generateSessionToken(userId, role) {
    const expiresAt = Date.now() + 15 * 60 * 1000; // 15 minutes expiration
    const payload = `${userId}.${role}.${expiresAt}`;
    const signature = crypto.createHmac('sha256', JWT_SECRET).update(payload).digest('hex');
    return `${payload}.${signature}`;
}

// Verify an HMAC-SHA256 signed session token
function verifySessionToken(token) {
    if (!token) return null;
    const parts = token.split('.');
    if (parts.length !== 4) return null;

    const [userId, role, expiresAtStr, signature] = parts;
    const expiresAt = parseInt(expiresAtStr, 10);
    if (isNaN(expiresAt) || expiresAt < Date.now()) {
        return null; // Expired
    }

    const payload = `${userId}.${role}.${expiresAtStr}`;
    const expectedSignature = crypto.createHmac('sha256', JWT_SECRET).update(payload).digest('hex');

    // SECURITY: Use constant-time comparison to prevent timing side-channel attacks.
    // Signatures must be equal length for timingSafeEqual; mismatched length means invalid.
    const sigBuf = Buffer.from(signature, 'hex');
    const expectedBuf = Buffer.from(expectedSignature, 'hex');
    if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
        return null; // Invalid signature
    }

    return { id: userId, role };
}

// Middleware: Authenticate user using the signed session token.
// SECURITY: Removed insecure X-Caller-Id header fallback (full auth bypass vulnerability).
// All authentication MUST go through the signed session token (cookie or Authorization Bearer).
function authenticate(req, res, next) {
    let token = req.cookies?.ms_session_v2 || null;

    if (!token) {
        const authHeader = req.headers['authorization'];
        if (authHeader && authHeader.startsWith('Bearer ')) {
            token = authHeader.substring(7);
        }
    }

    if (token) {
        const decoded = verifySessionToken(token);
        if (decoded) {
            req.user = decoded;
            return next();
        }
        logSecurityEvent('WARN', 'INVALID_SESSION_TOKEN', req);
    }

    logSecurityEvent('WARN', 'MISSING_AUTHENTICATION', req);
    return res.status(401).json({ error: 'Authentication required' });
}

// Strict schema validation and sanitization middleware
function validateBodySchema(schema) {
    return (req, res, next) => {
        const errors = [];
        const sanitized = {};

        for (const [key, rules] of Object.entries(schema)) {
            let val = req.body[key];

            // Required check
            if (rules.required && (val === undefined || val === null || val === '')) {
                errors.push(`Field '${key}' is required.`);
                continue;
            }

            if (val === undefined || val === null) {
                if (rules.default !== undefined) {
                    sanitized[key] = rules.default;
                }
                continue;
            }

            // Type validation
            if (rules.type === 'number') {
                const num = Number(val);
                if (isNaN(num)) {
                    errors.push(`Field '${key}' must be a valid number.`);
                    continue;
                }
                val = num;
            } else if (rules.type === 'boolean') {
                val = (val === 'true' || val === true);
            } else if (rules.type === 'string') {
                if (typeof val !== 'string') {
                    errors.push(`Field '${key}' must be a string.`);
                    continue;
                }
                val = val.trim();
                // Strip HTML tags to prevent XSS injection at database level (OWASP Best Practice)
                if (rules.stripHtml !== false) {
                    val = val.replace(/<[^>]*>/g, '');
                }
            } else if (rules.type === 'array') {
                if (!Array.isArray(val)) {
                    errors.push(`Field '${key}' must be an array.`);
                    continue;
                }
            }

            // String constraint validation
            if (rules.type === 'string') {
                if (rules.maxLength && val.length > rules.maxLength) {
                    errors.push(`Field '${key}' exceeds maximum length of ${rules.maxLength}.`);
                }
                if (rules.pattern && !rules.pattern.test(val)) {
                    errors.push(`Field '${key}' format is invalid.`);
                }
            }

            // Number range validation
            if (rules.type === 'number') {
                if (rules.min !== undefined && val < rules.min) {
                    errors.push(`Field '${key}' must be at least ${rules.min}.`);
                }
                if (rules.max !== undefined && val > rules.max) {
                    errors.push(`Field '${key}' cannot exceed ${rules.max}.`);
                }
            }

            sanitized[key] = val;
        }

        // Prevent parameter injection/mass-assignment
        const unexpectedFields = Object.keys(req.body).filter(k => !schema.hasOwnProperty(k));
        if (unexpectedFields.length > 0) {
            logSecurityEvent('WARN', 'UNEXPECTED_PARAMETERS', req, { unexpectedFields });
            return res.status(400).json({ error: `Unexpected parameter(s): ${unexpectedFields.join(', ')}` });
        }

        if (errors.length > 0) {
            logSecurityEvent('WARN', 'SCHEMA_VALIDATION_FAILURE', req, { errors });
            return res.status(400).json({ error: errors.join(' ') });
        }

        req.body = sanitized;
        next();
    };
}

// Define strict request validation schemas
const LOGIN_SCHEMA = {
    credential: { type: 'string', required: false, maxLength: 5000 },
    email: { type: 'string', required: false, maxLength: 254, pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/ },
    name: { type: 'string', required: false, maxLength: 100, pattern: /^[a-zA-Z0-9\s.\-_']{1,100}$/ },
    avatar: { type: 'string', required: false, maxLength: 200000, pattern: /^(https:\/\/|data:image\/(png|jpeg|jpg|gif|webp|svg\+xml);base64,)/ }
};

const UPDATE_NAME_SCHEMA = {
    name: { type: 'string', required: true, maxLength: 100, pattern: /^[a-zA-Z0-9\s.\-_']{1,100}$/ }
};

const UPDATE_AVATAR_SCHEMA = {
    // SECURITY: 200 KB cap (base64 ~133 KB image). Prevents large payload abuse.
    // Only accept HTTPS URLs or data:image/ URIs — blocks javascript: and other dangerous schemes.
    avatar: { type: 'string', required: true, maxLength: 200000, pattern: /^(https:\/\/|data:image\/(png|jpeg|jpg|gif|webp|svg\+xml);base64,)/ }
};

const UPDATE_DOB_SCHEMA = {
    dob: { type: 'string', required: true, maxLength: 20, pattern: /^\d{4}-\d{2}-\d{2}$/ }
};


const UPDATE_STATS_SCHEMA = {
    points: { type: 'number', required: true, min: 0, max: 1000000 },
    gamesPlayed: { type: 'number', required: true, min: 0, max: 100000 },
    winCount: { type: 'number', required: true, min: 0, max: 100000 },
    badges: { type: 'array', required: true },
    solvedPuzzles: { type: 'array', required: true }
};

// Configure secure CORS policies.
// In production, set ALLOWED_ORIGINS env var (comma-separated). Localhost is dev-only.
const envOrigins = (process.env.ALLOWED_ORIGINS || '')
    .split(',').map(o => o.trim()).filter(Boolean);
const devOrigins = [
    'http://localhost:3000',
    'http://localhost:5000',
    'http://127.0.0.1:3000',
    'http://127.0.0.1:5000',
    `http://localhost:${PORT}`,
    `http://127.0.0.1:${PORT}`
];
const whitelist = [...new Set([...envOrigins, ...devOrigins])];
const corsOptions = {
    origin: function (origin, callback) {
        // Allow same-origin requests (no Origin header).
        if (!origin) return callback(null, true);
        if (whitelist.includes(origin)) {
            return callback(null, true);
        }
        logSecurityEvent('WARN', 'CORS_REJECTED', null, { origin });
        return callback(null, false); // Reject gracefully (no CORS headers set).
    },
    credentials: true
};
app.use(cors(corsOptions));

// Lightweight Cookie Parser Helper
function parseCookies(cookieHeader) {
    const list = {};
    if (!cookieHeader) return list;
    cookieHeader.split(';').forEach(cookie => {
        let [name, ...rest] = cookie.split('=');
        name = name.trim();
        if (!name) return;
        const value = rest.join('=').trim();
        list[name] = decodeURIComponent(value);
    });
    return list;
}

// Cookie parser middleware
app.use((req, res, next) => {
    req.cookies = parseCookies(req.headers.cookie);
    next();
});

// Security response headers middleware — runs on EVERY response (API + static)
app.use((req, res, next) => {
    applySecurityHeaders(req, res);

    const pathLower = req.path.toLowerCase();
    if (pathLower.startsWith('/api/') || pathLower.endsWith('.html') || pathLower === '/' || !pathLower.includes('.')) {
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
    } else if (pathLower.endsWith('.js') || pathLower.endsWith('.css') || pathLower.endsWith('.png') || pathLower.endsWith('.jpg') || pathLower.endsWith('.jpeg') || pathLower.endsWith('.gif') || pathLower.endsWith('.svg')) {
        res.setHeader('Cache-Control', 'no-cache');
    } else {
        res.setHeader('Cache-Control', 'public, max-age=86400');
    }

    next();
});

// CSRF Validation Middleware for state-changing POST/PUT/DELETE
function validateCSRF(req, res, next) {
    const method = req.method.toUpperCase();
    if (['POST', 'PUT', 'DELETE'].includes(method)) {
        // Skip CSRF validation ONLY for login and refresh (token bootstrap endpoints).
        // SECURITY: Removed X-Caller-Id skip — that header is no longer trusted.
        if (req.path === '/api/students/login' || req.path === '/api/auth/refresh') {
            return next();
        }

        const csrfCookie = req.cookies['ms_csrf_v2'];
        const csrfHeader = req.headers['x-csrf-token'];

        if (!csrfCookie || !csrfHeader || csrfCookie !== csrfHeader) {
            logSecurityEvent('WARN', 'CSRF_VALIDATION_FAILED', req);
            return res.status(403).json({ error: 'CSRF token validation failed' });
        }
    }
    next();
}
app.use(validateCSRF);

app.use(express.json({ limit: '2mb' })); // Restricted maximum request body size from 10mb to 2mb to mitigate body parsing DoS

// Helper function to safely strip single and multi-line comments from JS to address Information Disclosure alerts
function stripJSComments(code) {
    let result = '';
    let inString = false;
    let stringChar = null;
    let inBlockComment = false;
    let inLineComment = false;
    let inRegex = false;

    for (let i = 0; i < code.length; i++) {
        const char = code[i];
        const nextChar = code[i + 1];

        if (inBlockComment) {
            if (char === '*' && nextChar === '/') {
                inBlockComment = false;
                i++;
            }
            continue;
        }

        if (inLineComment) {
            if (char === '\n' || char === '\r') {
                inLineComment = false;
                result += char;
            }
            continue;
        }

        if (inString) {
            result += char;
            if (char === stringChar && code[i - 1] !== '\\') {
                inString = false;
            }
            continue;
        }

        if (inRegex) {
            result += char;
            if (char === '/' && code[i - 1] !== '\\') {
                inRegex = false;
            }
            continue;
        }

        if (char === '/' && nextChar === '*') {
            inBlockComment = true;
            i++;
            continue;
        }

        if (char === '/' && nextChar === '/') {
            inLineComment = true;
            i++;
            continue;
        }

        if (char === '\'' || char === '"' || char === '`') {
            inString = true;
            stringChar = char;
            result += char;
            continue;
        }

        if (char === '/') {
            const before = result.trim();
            const lastChar = before[before.length - 1];
            if (['=', '(', ',', ';', ':', '[', '!', '&', '|', '?', '{', '}'].includes(lastChar) || before.endsWith('return')) {
                inRegex = true;
            }
        }

        result += char;
    }
    return result;
}

const BINARY_STATIC_EXTENSIONS = new Set(['.woff2', '.woff', '.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico']);
const BINARY_MIME_TYPES = {
    '.woff2': 'font/woff2',
    '.woff': 'font/woff',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon'
};

function shouldSkipCommentStrip(relativePath) {
    return relativePath.startsWith('vendor/');
}

function processStaticContent(relativePath, content) {
    const ext = path.extname(relativePath).toLowerCase();
    if (shouldSkipCommentStrip(relativePath)) {
        return content;
    }
    if (ext === '.html') {
        return content.replace(/<!--[\s\S]*?-->/g, '');
    }
    if (ext === '.css') {
        return content.replace(/\/\*[\s\S]*?\*\//g, '');
    }
    if (ext === '.js') {
        return stripJSComments(content);
    }
    return content;
}

const assetIntegrityCache = new Map();

function getAssetIntegrity(relativePath) {
    const normalized = relativePath.replace(/^\//, '');
    const filePath = path.resolve(__dirname, normalized);
    const rootDir = path.resolve(__dirname);
    if (!filePath.startsWith(rootDir)) {
        throw new Error('Invalid asset path');
    }
    const stats = fs.statSync(filePath);
    const cacheKey = `${filePath}:${stats.mtimeMs}`;
    if (assetIntegrityCache.has(cacheKey)) {
        return assetIntegrityCache.get(cacheKey);
    }
    const raw = fs.readFileSync(filePath, 'utf8');
    const processed = processStaticContent(normalized, raw);
    const integrity = `sha384-${crypto.createHash('sha384').update(processed).digest('base64')}`;
    const entry = { integrity, processed };
    assetIntegrityCache.set(cacheKey, entry);
    return entry;
}

function injectSriIntoHtml(html) {
    // Process scripts and styles (link/script) with integrity and version
    let processed = html.replace(/<(script|link)\b([^>]*?)(\/?)>/gi, (full, tag, attrs, selfClose) => {
        const srcMatch = attrs.match(/\bsrc=["']([^"']+)["']/i);
        const hrefMatch = attrs.match(/\bhref=["']([^"']+)["']/i);
        const url = (srcMatch || hrefMatch)?.[1];
        if (!url || /^https?:\/\//i.test(url)) {
            return full;
        }
        if (/\bintegrity=/i.test(attrs)) {
            return full;
        }
        const relMatch = attrs.match(/\brel=["']([^"']+)["']/i);
        if (tag.toLowerCase() === 'link' && relMatch && !/stylesheet/i.test(relMatch[1])) {
            return full;
        }
        try {
            const { integrity } = getAssetIntegrity(url);
            let newAttrs = attrs.trim();
            if (!/\bcrossorigin=/i.test(newAttrs)) {
                newAttrs += ' crossorigin="anonymous"';
            }
            newAttrs += ` integrity="${integrity}"`;
            
            // Add cache-busting version query parameter to avoid any caching/mismatch bugs
            const hashVal = integrity.replace(/^sha384-/, '');
            const cleanUrl = url.split('?')[0];
            const bustedUrl = `${cleanUrl}?v=${encodeURIComponent(hashVal)}`;
            if (srcMatch) {
                newAttrs = newAttrs.replace(srcMatch[0], `src="${bustedUrl}"`);
            } else if (hrefMatch) {
                newAttrs = newAttrs.replace(hrefMatch[0], `href="${bustedUrl}"`);
            }
            
            const closing = selfClose ? ' /' : '';
            return `<${tag} ${newAttrs}${closing}>`;
        } catch {
            return full;
        }
    });

    // Also cache-bust local image tags using file modification time to prevent browser caching of old/broken responses
    processed = processed.replace(/<img\b([^>]*?)(\/?)>/gi, (full, attrs, selfClose) => {
        const srcMatch = attrs.match(/\bsrc=["']([^"']+)["']/i);
        const url = srcMatch?.[1];
        if (!url || /^https?:\/\//i.test(url) || url.startsWith('data:')) {
            return full;
        }
        try {
            const normalized = url.replace(/^\//, '').split('?')[0];
            const filePath = path.resolve(__dirname, normalized);
            if (filePath.startsWith(path.resolve(__dirname))) {
                const stats = fs.statSync(filePath);
                const version = Math.round(stats.mtimeMs).toString();
                const cleanUrl = url.split('?')[0];
                const bustedUrl = `${cleanUrl}?v=${version}`;
                let newAttrs = attrs.replace(srcMatch[0], `src="${bustedUrl}"`);
                const closing = selfClose ? ' /' : '';
                return `<img ${newAttrs}${closing}>`;
            }
            return full;
        } catch {
            return full;
        }
    });

    return processed;
}

function serveProcessedHtml(content, res) {
    let processed = content.replace(/<!--[\s\S]*?-->/g, '');
    processed = injectSriIntoHtml(processed);

    // Inject the CSP nonce dynamically to all script tags
    const nonce = res.locals.nonce;
    if (nonce) {
        processed = processed.replace(/<script\b/g, `<script nonce="${nonce}"`);
    }

    res.setHeader('Content-Type', 'text/html');
    res.send(processed);
}

// OWASP: Block direct public access to sensitive backend/configuration files.
const BLOCKED_STATIC_FILES = new Set([
    '/server.js',
    '/package.json',
    '/package-lock.json',
    '/memory_db.json',
    '/.env',
    '/.env.example',
    '/tailwind.input.css',
    '/tailwind-config.js',
]);

const BLOCKED_PATH_PREFIXES = [
    '/node_modules',
    '/scratch',
    '/mindsquare-react',
    '/.git',
];

// On-the-fly Comment Stripping Middleware to completely resolve "Information Disclosure - Suspicious Comments"
const commentStrippedCache = new Map();
app.use((req, res, next) => {
    const p = req.path.toLowerCase();

    // Check blocked files first
    if (BLOCKED_STATIC_FILES.has(p)) {
        logSecurityEvent('WARN', 'SENSITIVE_FILE_ACCESS_BLOCKED', req, { path: req.path });
        return res.status(403).json({ error: 'Access forbidden' });
    }
    if (p.startsWith('/scratch/') || p === '/scratch') {
        logSecurityEvent('WARN', 'SENSITIVE_DIR_ACCESS_BLOCKED', req, { path: req.path });
        return res.status(403).json({ error: 'Access forbidden' });
    }
    if (BLOCKED_PATH_PREFIXES.some(prefix => p === prefix || p.startsWith(`${prefix}/`))) {
        logSecurityEvent('WARN', 'SENSITIVE_DIR_ACCESS_BLOCKED', req, { path: req.path });
        return res.status(403).json({ error: 'Access forbidden' });
    }

    const ext = path.extname(req.path).toLowerCase();
    const allowedExtensions = ['.html', '.js', '.css', '.woff2', '.woff', '.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico'];

    if (req.path.startsWith('/api') || (ext && !allowedExtensions.includes(ext))) {
        return next();
    }

    // Resolve static file path (default to 1.html for root path /)
    const relativePath = req.path === '/' ? '1.html' : req.path.substring(1);
    const filePath = path.resolve(__dirname, relativePath);
    if (!filePath.startsWith(path.resolve(__dirname))) {
        logSecurityEvent('WARN', 'PATH_TRAVERSAL_BLOCKED', req, { path: req.path });
        return res.status(403).json({ error: 'Access forbidden' });
    }

    fs.stat(filePath, (err, stats) => {
        if (err || !stats.isFile()) {
            const isNoisyPath = ['/apple-touch-icon.png', '/apple-touch-icon-precomposed.png'].includes(req.path);
            if (!isNoisyPath) {
                console.log('fs.stat failed or not a file for:', filePath, 'error:', err ? err.message : 'none');
            }
            return next();
        }

        const cacheKey = `${filePath}:${stats.mtimeMs}`;
        if (BINARY_STATIC_EXTENSIONS.has(ext)) {
            if (commentStrippedCache.has(cacheKey)) {
                res.setHeader('Content-Type', commentStrippedCache.get(cacheKey).mime);
                return res.send(commentStrippedCache.get(cacheKey).content);
            }
            return fs.readFile(filePath, (readErr, content) => {
                if (readErr) {
                    return next();
                }
                const mime = BINARY_MIME_TYPES[ext] || 'application/octet-stream';
                commentStrippedCache.set(cacheKey, { content, mime });
                res.setHeader('Content-Type', mime);
                res.send(content);
            });
        }

        if (commentStrippedCache.has(cacheKey)) {
            const cached = commentStrippedCache.get(cacheKey);
            res.setHeader('Content-Type', cached.mime);
            return res.send(cached.content);
        }

        fs.readFile(filePath, 'utf8', (readErr, content) => {
            if (readErr) {
                return next();
            }

            let processed = content;
            let mime = 'text/plain';
            const relativePath = req.path === '/' ? '1.html' : req.path.substring(1);

            if (ext === '.html' || req.path === '/') {
                return serveProcessedHtml(content, res);
            }
            if (ext === '.css') {
                mime = 'text/css';
                processed = processStaticContent(relativePath, content);
            } else if (ext === '.js') {
                mime = 'application/javascript';
                processed = processStaticContent(relativePath, content);
            }

            commentStrippedCache.set(cacheKey, { content: processed, mime });
            res.setHeader('Content-Type', mime);
            res.send(processed);
        });
    });
});

// Apply general API rate limiting to all requests
app.use('/api/', rateLimiter({ max: 150, windowMs: 15 * 60 * 1000, storeType: 'general' }));

const statsRateLimiter = rateLimiter({ max: 30, windowMs: 15 * 60 * 1000, storeType: 'stats' });


// PostgreSQL connection pool — sized for typical Express concurrency.
// max: caps simultaneous DB connections to avoid overwhelming PostgreSQL (default is 10, raised slightly).
// idleTimeoutMillis: release idle connections after 30 s to reclaim server resources.
// connectionTimeoutMillis: fail fast (5 s) rather than queuing indefinitely under load.
// keepAlive: send TCP keep-alive pings to prevent idle connections being dropped by cloud NAT.
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT || 5432,
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
    max: parseInt(process.env.DB_POOL_MAX || '20', 10),
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
    keepAlive: true,
    keepAliveInitialDelayMillis: 10000
});

// ─── Redis Connection & Configuration ──────────────────────────────────────
const redis = require('redis');
let redisClient = null;

if (process.env.REDIS_URL) {
    redisClient = redis.createClient({ url: process.env.REDIS_URL });
    redisClient.on('error', (err) => console.error('Redis Client Error', err));
    redisClient.connect().then(() => {
        console.log('Connected to Redis server.');
    }).catch(err => {
        console.error('Failed to connect to Redis, running with memory fallback:', err);
    });
}

// ─── Cache layer with Redis / In-Memory support ─────────────────────────────
const cache = {
    _store: new Map(),
    async get(key) {
        if (redisClient && redisClient.isOpen) {
            try {
                const val = await redisClient.get(key);
                return val ? JSON.parse(val) : null;
            } catch (e) {
                console.error('Redis cache get error:', e);
            }
        }
        const entry = this._store.get(key);
        if (!entry) return null;
        if (Date.now() > entry.expiresAt) {
            this._store.delete(key);
            return null;
        }
        return entry.value;
    },
    async set(key, value, ttlMs) {
        if (redisClient && redisClient.isOpen) {
            try {
                await redisClient.set(key, JSON.stringify(value), {
                    PX: ttlMs
                });
                return;
            } catch (e) {
                console.error('Redis cache set error:', e);
            }
        }
        this._store.set(key, { value, expiresAt: Date.now() + ttlMs });
    },
    async del(key) {
        if (redisClient && redisClient.isOpen) {
            try {
                await redisClient.del(key);
                return;
            } catch (e) {
                console.error('Redis cache del error:', e);
            }
        }
        this._store.delete(key);
    },
    // Invalidate a group of keys by prefix (e.g. 'students' clears all student caches)
    async invalidatePrefix(prefix) {
        if (redisClient && redisClient.isOpen) {
            try {
                const keys = await redisClient.keys(`${prefix}*`);
                if (keys.length > 0) {
                    await redisClient.del(keys);
                }
                return;
            } catch (e) {
                console.error('Redis cache invalidatePrefix error:', e);
            }
        }
        for (const key of this._store.keys()) {
            if (key.startsWith(prefix)) this._store.delete(key);
        }
    }
};

// Cache TTLs
const CACHE_TTL_STUDENTS = 30 * 1000;  // 30 s  — leaderboard / roster data
const CACHE_TTL_ANALYTICS = 60 * 1000;  // 60 s  — aggregate analytics

// Initialize connection (verify the pool can reach the DB)
async function initDatabaseConnection() {
    const client = await pool.connect();
    client.release();
    console.log('Connected to PostgreSQL database.');
}

// Query helper — converts '?' placeholders to '$1, $2...' for PostgreSQL.
// Side-effect: any DML statement (INSERT/UPDATE/DELETE) automatically evicts
// the student-list and analytics caches so stale data is never served.
async function executeQuery(sql, params = []) {
    let index = 1;
    const pgSql = sql.replace(/\?/g, () => `$${index++}`);
    const res = await pool.query(pgSql, params);
    const verb = sql.trim().slice(0, 6).toUpperCase();
    if (verb === 'INSERT' || verb === 'UPDATE' || verb === 'DELETE') {
        await cache.invalidatePrefix('students');
        await cache.del('analytics:overview');
    }
    return res.rows;
}

// Query helper for transaction clients — converts '?' placeholders to '$1, $2...' for PostgreSQL.
// Same cache-invalidation side-effect as executeQuery.
async function executeClientQuery(client, sql, params = []) {
    let index = 1;
    const pgSql = sql.replace(/\?/g, () => `$${index++}`);
    const res = await client.query(pgSql, params);
    const verb = sql.trim().slice(0, 6).toUpperCase();
    if (verb === 'INSERT' || verb === 'UPDATE' || verb === 'DELETE') {
        await cache.invalidatePrefix('students');
        await cache.del('analytics:overview');
    }
    return res.rows;
}

// Create schema and seed data
async function setupDatabaseSchema() {
    // 1. Create tables
    await executeQuery(`
        CREATE TABLE IF NOT EXISTS students (
            id           VARCHAR(50)  PRIMARY KEY,
            name         VARCHAR(255) NOT NULL,
            email        VARCHAR(255) UNIQUE NOT NULL,
            avatar       TEXT,
            points       INTEGER      DEFAULT 0,
            category     VARCHAR(50)  DEFAULT 'Beginner',
            games_played INTEGER      DEFAULT 0,
            win_count    INTEGER      DEFAULT 0,
            created_at   TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
        )
    `);

    await executeQuery(`
        CREATE TABLE IF NOT EXISTS student_badges (
            student_id VARCHAR(50),
            badge_id   VARCHAR(100),
            PRIMARY KEY (student_id, badge_id),
            FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
        )
    `);
    await executeQuery(`
        CREATE TABLE IF NOT EXISTS student_puzzles (
            student_id VARCHAR(50),
            puzzle_id  VARCHAR(100),
            solved_at  DATE DEFAULT CURRENT_DATE,
            PRIMARY KEY (student_id, puzzle_id),
            FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
        )
    `);
    await executeQuery(`
        ALTER TABLE student_puzzles ADD COLUMN IF NOT EXISTS solved_at DATE DEFAULT CURRENT_DATE
    `);

    // 1.5. Ensure columns exist for DOB, birthday rewards, role-based access control, coaching feedback, and decay tracking
    await executeQuery(`
        ALTER TABLE students 
        ADD COLUMN IF NOT EXISTS dob VARCHAR(20) DEFAULT NULL,
        ADD COLUMN IF NOT EXISTS last_birthday_reward_year INTEGER DEFAULT NULL,
        ADD COLUMN IF NOT EXISTS role VARCHAR(20) DEFAULT 'student',
        ADD COLUMN IF NOT EXISTS coaching_notes TEXT DEFAULT NULL,
        ADD COLUMN IF NOT EXISTS last_decay_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    `);

    // Ensure database-level default points constraint is 0
    try {
        await executeQuery(`ALTER TABLE students ALTER COLUMN points SET DEFAULT 0`);
    } catch (e) {
        console.error('Failed to set default points to 0 in schema update:', e);
    }


    // Create Homework Assignments table
    await executeQuery(`
        CREATE TABLE IF NOT EXISTS homework_assignments (
            id           SERIAL PRIMARY KEY,
            student_id   VARCHAR(50) REFERENCES students(id) ON DELETE CASCADE,
            puzzle_id    VARCHAR(50) NOT NULL,
            completed    BOOLEAN DEFAULT FALSE,
            assigned_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            completed_at TIMESTAMP DEFAULT NULL
        )
    `);

    // Create Class Schedules table
    await executeQuery(`
        CREATE TABLE IF NOT EXISTS class_schedules (
            id           VARCHAR(50) PRIMARY KEY,
            day          VARCHAR(20) NOT NULL,
            time         VARCHAR(20) NOT NULL,
            hour         INTEGER NOT NULL,
            minute       INTEGER NOT NULL,
            level        VARCHAR(50) NOT NULL,
            students     TEXT[] DEFAULT '{}',
            link         TEXT NOT NULL
        )
    `);

    // Create Audit Logs table for administrative tracing
    await executeQuery(`
        CREATE TABLE IF NOT EXISTS audit_logs (
            id         SERIAL PRIMARY KEY,
            actor_id   VARCHAR(50) NOT NULL,
            action     VARCHAR(100) NOT NULL,
            target_id  VARCHAR(50),
            details    TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // Create Refresh Tokens table
    await executeQuery(`
        CREATE TABLE IF NOT EXISTS refresh_tokens (
            id          SERIAL PRIMARY KEY,
            token       VARCHAR(255) UNIQUE NOT NULL,
            student_id  VARCHAR(50) NOT NULL,
            expires_at  TIMESTAMP NOT NULL,
            is_revoked  BOOLEAN DEFAULT FALSE,
            replaced_by VARCHAR(255),
            created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
        )
    `);

    // Create Auth Rate Limits table
    await executeQuery(`
        CREATE TABLE IF NOT EXISTS auth_rate_limits (
            ip         VARCHAR(100) PRIMARY KEY,
            attempts   INTEGER DEFAULT 0,
            reset_time TIMESTAMP NOT NULL
        )
    `);

    // Always upsert Class Schedules so changes here take effect on restart
    const defaultSchedules = [
        { id: "SCH-001", day: "Tuesday",   time: "7:15 PM",  hour: 19, minute: 15, level: "Super Intermediate",   students: ["Anay", "Avyukth", "Aarnav Ramesh", "Vishrija", "Ananya", "Neeketchar", "Shourya Vihaan", "Shiv Rishitha"], link: ZOOM_MEETING_URL },
        { id: "SCH-002", day: "Tuesday",   time: "9:00 PM",  hour: 21, minute: 0,  level: "Basic Beginner",        students: ["Agastya (1-2-1) USA"], link: ZOOM_MEETING_URL },
        { id: "SCH-003", day: "Wednesday", time: "7:15 PM",  hour: 19, minute: 15, level: "Advanced",              students: ["Suraj R Nair", "Alphonse", "Vihaan Choudhary", "Nived", "Darshan V S", "Nirupam", "Rudransh", "Rohan Krishna"], link: ZOOM_MEETING_URL },
        { id: "SCH-004", day: "Thursday",  time: "5:45 PM",  hour: 17, minute: 45, level: "Super Intermediate",   students: ["Anay", "Avyukth", "Aarnav Ramesh", "Urjit", "Ananya", "Shourya Vihaan"], link: ZOOM_MEETING_URL },
        { id: "SCH-005", day: "Thursday",  time: "7:45 PM",  hour: 19, minute: 45, level: "Intermediate",         students: ["Manas", "Ayaansh Jangale", "Taashi", "Advika", "Ananthashayan", "Ruhika", "Krishnav", "Abhiram"], link: ZOOM_MEETING_URL },
        { id: "SCH-006", day: "Thursday",  time: "9:00 PM",  hour: 21, minute: 0,  level: "Intermediate",         students: ["Nitaant (1-2-1) Germany"], link: ZOOM_MEETING_URL },
        { id: "SCH-007", day: "Friday",    time: "5:45 PM",  hour: 17, minute: 45, level: "Advanced",              students: ["Suraj R Nair", "Alphonse", "Vihaan Choudhary", "Nived", "Darshan V S", "Nirupam", "Rudransh", "Rohan Krishna"], link: ZOOM_MEETING_URL },
        { id: "SCH-008", day: "Saturday",  time: "7:15 AM",  hour: 7,  minute: 15, level: "Intermediate - TX",    students: ["Vedaang", "Sai Rishik", "Bhavesh", "Shlok Upponni", "Shiv Rishitha"], link: ZOOM_MEETING_URL },
        { id: "SCH-009", day: "Saturday",  time: "10:00 AM", hour: 10, minute: 0,  level: "Beginner",              students: ["Nyra", "Hayaan", "Aadhin"], link: ZOOM_MEETING_URL },
        { id: "SCH-010", day: "Saturday",  time: "3:00 PM",  hour: 15, minute: 0,  level: "Basic Beginner",        students: ["Ira (1-2-1) Australia"], link: ZOOM_MEETING_URL },
        { id: "SCH-011", day: "Saturday",  time: "5:00 PM",  hour: 17, minute: 0,  level: "Advanced",              students: ["Rishik"], link: ZOOM_MEETING_URL },
        { id: "SCH-012", day: "Saturday",  time: "7:15 PM",  hour: 19, minute: 15, level: "Intermediate",         students: ["Sanskriti Sarma", "Nitaant Sudhir", "Anvika Singhal", "Saatvik", "Amarashi", "Mandinu", "Ayaansh Gupta", "Achyuth"], link: ZOOM_MEETING_URL },
        { id: "SCH-013", day: "Sunday",    time: "10:00 AM", hour: 10, minute: 0,  level: "Beginner",              students: ["Hayaan", "Aadhin"], link: ZOOM_MEETING_URL },
        { id: "SCH-014", day: "Sunday",    time: "5:30 PM",  hour: 17, minute: 30, level: "Intermediate",         students: ["Manas", "Ayaansh Jangale", "Taashi", "Advika", "Ananthashayan", "Ruhika", "Krishnav"], link: ZOOM_MEETING_URL },
        { id: "SCH-015", day: "Sunday",    time: "7:00 PM",  hour: 19, minute: 0,  level: "Intermediate",         students: ["Sanskriti Sarma", "Nitaant Sudhir", "Anvika Singhal", "Saatvik", "Amarashi", "Mandinu", "Ayaansh Gupta", "Achyuth", "Urjit"], link: ZOOM_MEETING_URL },
        { id: "SCH-016", day: "Saturday",  time: "9:00 PM",  hour: 21, minute: 0,  level: "Basic Beginner",        students: ["Anvay (1-2-1) Canada"], link: ZOOM_MEETING_URL }
    ];
    for (const s of defaultSchedules) {
        await executeQuery(
            `INSERT INTO class_schedules (id, day, time, hour, minute, level, students, link)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
             ON CONFLICT (id) DO UPDATE SET
                day = EXCLUDED.day,
                time = EXCLUDED.time,
                hour = EXCLUDED.hour,
                minute = EXCLUDED.minute,
                level = EXCLUDED.level,
                students = EXCLUDED.students,
                link = EXCLUDED.link`,
            [s.id, s.day, s.time, s.hour, s.minute, s.level, s.students, encryptText(s.link)]
        );
    }
    console.log('Upserted 16 class schedules into class_schedules table.');

    // Create Announcements table (coach posts visible to all students)
    await executeQuery(`
        CREATE TABLE IF NOT EXISTS announcements (
            id         SERIAL PRIMARY KEY,
            author_id  VARCHAR(50) NOT NULL,
            title      VARCHAR(200) NOT NULL,
            body       TEXT NOT NULL,
            pinned     BOOLEAN DEFAULT FALSE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // Create Academy Tournaments table
    await executeQuery(`
        CREATE TABLE IF NOT EXISTS academy_tournaments (
            id          SERIAL PRIMARY KEY,
            title       VARCHAR(200) NOT NULL,
            description TEXT,
            start_date  VARCHAR(30),
            status      VARCHAR(20) DEFAULT 'upcoming',
            created_by  VARCHAR(50) NOT NULL,
            created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // Create Tournament Registrations table
    await executeQuery(`
        CREATE TABLE IF NOT EXISTS tournament_registrations (
            tournament_id INTEGER REFERENCES academy_tournaments(id) ON DELETE CASCADE,
            student_id    VARCHAR(50) REFERENCES students(id) ON DELETE CASCADE,
            registered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (tournament_id, student_id)
        )
    `);

    // Create Class Recordings table
    await executeQuery(`
        CREATE TABLE IF NOT EXISTS class_recordings (
            id            SERIAL PRIMARY KEY,
            schedule_id   VARCHAR(50) REFERENCES class_schedules(id) ON DELETE CASCADE,
            title         VARCHAR(200),
            recording_url TEXT NOT NULL,
            recorded_at   DATE DEFAULT CURRENT_DATE,
            added_by      VARCHAR(50)
        )
    `);

    // 2. Performance indexes for JOIN columns and email lookup (idempotent)
    await executeQuery('CREATE INDEX IF NOT EXISTS idx_student_badges_sid    ON student_badges(student_id)');

    await executeQuery('CREATE INDEX IF NOT EXISTS idx_student_puzzles_sid   ON student_puzzles(student_id)');
    await executeQuery('CREATE INDEX IF NOT EXISTS idx_students_lower_email  ON students(LOWER(email))');
    await executeQuery('CREATE INDEX IF NOT EXISTS idx_homework_assignments_student_puzzle ON homework_assignments(student_id, puzzle_id)');
    await executeQuery('CREATE INDEX IF NOT EXISTS idx_announcements_created ON announcements(created_at DESC)');
    await executeQuery('CREATE INDEX IF NOT EXISTS idx_tournaments_status    ON academy_tournaments(status)');


    // 3. Check if we should seed or migrate from memory_db.json
    const jsonDbPath = path.join(__dirname, 'memory_db.json');
    let useJsonSeeding = false;
    let jsonStudents = [];
    // eslint-disable-next-line security/detect-non-literal-fs-filename
    if (fs.existsSync(jsonDbPath)) {
        try {
            // eslint-disable-next-line security/detect-non-literal-fs-filename
            const data = JSON.parse(fs.readFileSync(jsonDbPath, 'utf8'));
            if (data && Array.isArray(data.students)) {
                jsonStudents = data.students;
                useJsonSeeding = true;
                console.log(`Found memory_db.json with ${jsonStudents.length} profiles.`);
            }
        } catch (err) {
            console.error('Error reading memory_db.json:', err);
        }
    }

    const existing = await executeQuery('SELECT COUNT(*) as count FROM students');
    const count = existing[0]?.count || 0;

    let needsReSeed = parseInt(count) === 0;
    if (!needsReSeed && useJsonSeeding) {
        // Check for student alignment mismatch between DB and memory_db.json
        const dbMs002 = await executeQuery("SELECT name FROM students WHERE id = 'MS-002'");
        const jsonMs002 = jsonStudents.find(s => s.id === 'MS-002');
        if (dbMs002.length > 0 && jsonMs002 && dbMs002[0].name !== jsonMs002.name) {
            console.log('Database student alignment mismatch detected. Re-aligning with memory_db.json...');
            needsReSeed = true;
        }
    }

    if (needsReSeed) {
        console.log('Seeding initial student profiles to PostgreSQL...');
        const initialStudents = useJsonSeeding ? jsonStudents.map(s => ({
            id: s.id,
            name: s.name,
            email: s.email,
            avatar: s.avatar,
            points: s.points ?? 0,
            category: s.category ?? 'Beginner',
            gamesPlayed: s.games_played ?? 0,
            winCount: s.win_count ?? 0,
            badges: s.badges ?? ['Beginner']
        })).filter(s => !s.email.toLowerCase().endsWith('@mindsquare.com')) : [];

        // Seed all profiles atomically in a single transaction
        const seedClient = await pool.connect();
        try {
            await seedClient.query('BEGIN');
            // Clear all student data atomically before seeding (CASCADE removes child rows)
            await seedClient.query('TRUNCATE students CASCADE');
            for (const s of initialStudents) {
                await executeClientQuery(
                    seedClient,
                    'INSERT INTO students (id, name, email, avatar, points, category, games_played, win_count) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                    [s.id, s.name, s.email, s.avatar, s.points, s.category, s.gamesPlayed, s.winCount]
                );
                if (s.badges.length > 0) {
                    await executeClientQuery(
                        seedClient,
                        'INSERT INTO student_badges (student_id, badge_id) SELECT ?, unnest(?::text[])',
                        [s.id, s.badges]
                    );
                }
            }
            await seedClient.query('COMMIT');
        } catch (err) {
            await seedClient.query('ROLLBACK');
            throw err;
        }
    }

    // Remove mock/dev accounts that were never created via real Google sign-in
    await removeMockStudents();
}

// Delete seed, mock-login, and test accounts (keep real email sign-ins like Gmail)
async function removeMockStudents() {
    try {
        const res = await pool.query(`
            DELETE FROM students
            WHERE LOWER(email) LIKE '%@mindsquare.com'
               OR LOWER(email) LIKE '%@test.com'
               OR LOWER(email) LIKE '%@example.com'
        `);
        if (res.rowCount > 0) {
            cache.invalidatePrefix('students');
            cache.del('analytics:overview');
            console.log(`Removed ${res.rowCount} mock/test student profile(s).`);
        }
    } catch (e) {
        console.error('Failed to remove mock student profiles:', e);
    }
}

// Shared row mapper — transforms an aggregated SQL row into the API StudentProfile shape
function mapStudentRow(row) {
    const solvedPuzzlesRaw = row.solved_puzzles || [];
    const solvedPuzzles = [];
    const solvedPuzzlesDetailed = [];
    
    for (const item of solvedPuzzlesRaw) {
        if (typeof item === 'string' && item.includes(':')) {
            const [puzzleId, solvedAt] = item.split(':');
            solvedPuzzles.push(puzzleId);
            solvedPuzzlesDetailed.push({ id: puzzleId, date: solvedAt });
        } else {
            solvedPuzzles.push(item);
            solvedPuzzlesDetailed.push({ id: item, date: '' });
        }
    }

    return {
        id: row.id,
        name: row.name,
        email: row.email,
        avatar: row.avatar,
        points: row.points,
        category: row.category,
        gamesPlayed: row.games_played,
        winCount: row.win_count,
        dob: row.dob,
        lastBirthdayRewardYear: row.last_birthday_reward_year,
        role: row.role || 'student',
        badges: row.badges || [],
        solvedPuzzles: solvedPuzzles,
        solvedPuzzlesDetailed: solvedPuzzlesDetailed,
        coachingNotes: row.coaching_notes || ''
    };
}

// Public leaderboard shape — no email, DOB, coaching notes, attendance history, or puzzles
function sanitizeStudentPublic(student) {
    let isBirthdayToday = false;
    if (student.dob) {
        try {
            const today = new Date();
            const currentMonthDay = `${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
            const dobParts = student.dob.split('-');
            if (dobParts.length === 3) {
                isBirthdayToday = `${dobParts[1]}-${dobParts[2]}` === currentMonthDay;
            }
        } catch (e) {
            console.error("Error checking student birthday sanitization:", e);
        }
    }
    return {
        id: student.id,
        name: student.name,
        avatar: student.avatar,
        points: student.points,
        category: student.category,
        gamesPlayed: student.gamesPlayed,
        winCount: student.winCount,
        badges: student.badges || [],
        isBirthdayToday: isBirthdayToday
    };
}

// Strip DB timestamps from homework API responses (prevents timestamp disclosure alerts)
function mapHomeworkRow(row) {
    return {
        id: row.id,
        student_id: row.student_id,
        puzzle_id: row.puzzle_id,
        completed: row.completed
    };
}

// Base SELECT — single query replacing the previous 4 separate queries + JS-level joins.
// Uses LEFT JOIN + array_agg so the entire student graph is returned in one DB round-trip.
const STUDENT_SELECT_SQL = `
    SELECT
        s.id, s.name, s.email, s.avatar, s.points, s.category,
        s.games_played, s.win_count, s.dob, s.last_birthday_reward_year, s.role, s.coaching_notes,
        COALESCE(array_agg(DISTINCT b.badge_id)    FILTER (WHERE b.badge_id  IS NOT NULL), '{}') AS badges,
        COALESCE(array_agg(DISTINCT p.puzzle_id || ':' || COALESCE(p.solved_at::text, '')) FILTER (WHERE p.puzzle_id IS NOT NULL), '{}') AS solved_puzzles
    FROM students s
    LEFT JOIN student_badges     b ON b.student_id = s.id
    LEFT JOIN student_puzzles    p ON p.student_id = s.id
`;
// Perform monthly points decay (decrease points of students by 100 for each elapsed month)
async function performMonthlyPointsDecay() {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // 1. Identify and update students whose points decay in a single transaction
        const updatedRows = await executeClientQuery(client, `
            WITH decay_eligible AS (
                SELECT 
                    id, 
                    points, 
                    COALESCE(last_decay_date, created_at) AS last_decay,
                    FLOOR(EXTRACT(epoch FROM (NOW() - COALESCE(last_decay_date, created_at))) / 2592000)::integer AS elapsed_months
                FROM students
            ),
            decay_calculations AS (
                SELECT
                    id,
                    elapsed_months,
                    GREATEST(0, points - (100 * elapsed_months)) AS new_points,
                    (last_decay + (elapsed_months * INTERVAL '30 days')) AS new_decay_date
                FROM decay_eligible
                WHERE elapsed_months > 0
            )
            UPDATE students s
            SET 
                points = c.new_points,
                last_decay_date = c.new_decay_date,
                category = CASE
                    WHEN c.new_points >= 10000 THEN 'Grandmaster'
                    WHEN c.new_points >= 5000 THEN 'Super Advanced'
                    WHEN c.new_points >= 3500 THEN 'Advanced'
                    WHEN c.new_points >= 2500 THEN 'Super Intermediate'
                    WHEN c.new_points >= 1500 THEN 'Intermediate'
                    ELSE 'Beginner'
                END
            FROM decay_calculations c
            WHERE s.id = c.id
            RETURNING s.id
        `);

        // 2. Delete milestone badges if points decay below corresponding levels
        await executeClientQuery(client, `
            DELETE FROM student_badges sb
            USING students s
            WHERE sb.student_id = s.id
              AND (
                  (sb.badge_id = 'Grandmaster' AND s.points < 10000) OR
                  (sb.badge_id = 'Super Advanced' AND s.points < 5000) OR
                  (sb.badge_id = 'Advanced' AND s.points < 3500) OR
                  (sb.badge_id = 'Super Intermediate' AND s.points < 2500) OR
                  (sb.badge_id = 'Intermediate' AND s.points < 1500)
              )
        `);

        await client.query('COMMIT');
        if (updatedRows && updatedRows.length > 0) {
            console.log(`Monthly ELO Decay: Batch updated ${updatedRows.length} student profile(s).`);
        }
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Failed to perform monthly points decay:', err);
    } finally {
        client.release();
    }
}

const STUDENT_GROUP_BY = 'GROUP BY s.id, s.name, s.email, s.avatar, s.points, s.category, s.games_played, s.win_count, s.dob, s.last_birthday_reward_year, s.role, s.coaching_notes';

// Load students — supporting pagination & search, using cache for standard leaderboard requests
async function getStudentsDetailedList({ limit = 100, offset = 0, search = '' } = {}) {
    const isDefaultLeaderboard = limit === 100 && offset === 0 && !search;
    if (isDefaultLeaderboard) {
        const cached = await cache.get('students:leaderboard');
        if (cached) return cached;
    }

    let query = STUDENT_SELECT_SQL;
    const params = [];

    if (search) {
        // ILIKE performs case-insensitive pattern matching.
        query += ` WHERE (s.name ILIKE ? OR s.email ILIKE ? OR s.id ILIKE ?) `;
        const searchParam = `%${search}%`;
        params.push(searchParam, searchParam, searchParam);
    }

    query += ` ${STUDENT_GROUP_BY} ORDER BY s.points DESC LIMIT ? OFFSET ?`;
    params.push(limit, offset);

    const rows = await executeQuery(query, params);
    // Exclude the academy owner account from the public leaderboard
    const ADMIN_EMAIL = 'mindsquarechessclass@gmail.com';
    const result = rows.map(mapStudentRow).filter(s => s.email?.toLowerCase() !== ADMIN_EMAIL);

    if (isDefaultLeaderboard) {
        await cache.set('students:leaderboard', result, CACHE_TTL_STUDENTS);
    }
    return result;
}

// Load a single student by ID — used after write operations (1 DB round-trip)
async function getStudentById(id) {
    const rows = await executeQuery(
        `${STUDENT_SELECT_SQL} WHERE s.id = ? ${STUDENT_GROUP_BY}`,
        [id]
    );
    return rows.length > 0 ? mapStudentRow(rows[0]) : null;
}

// API Routes

// Public app configuration (non-sensitive client-side settings)
app.get('/api/config', (req, res) => {
    res.json({
        googleClientId: GOOGLE_CLIENT_ID,
        isProduction: process.env.NODE_ENV === 'production'
    });
});

// Get all class schedules (guests receive sanitized list, authenticated users get Zoom details and PII)
app.get('/api/schedules', async (req, res) => {
    try {
        let token = req.cookies?.ms_session_v2 || null;
        if (!token) {
            const authHeader = req.headers['authorization'];
            if (authHeader && authHeader.startsWith('Bearer ')) {
                token = authHeader.substring(7);
            }
        }

        let isAuthenticated = false;
        if (token) {
            const decoded = verifySessionToken(token);
            if (decoded) {
                isAuthenticated = true;
            }
        }

        const schedules = await executeQuery('SELECT * FROM class_schedules');

        if (isAuthenticated) {
            const decryptedSchedules = schedules.map(s => ({
                ...s,
                studentCount: s.students ? s.students.length : 0,
                link: decryptText(s.link)
            }));
            res.json(decryptedSchedules);
        } else {
            // guest gets sanitized schedules (protect PII and Zoom links)
            const sanitized = schedules.map(s => ({
                id: s.id,
                day: s.day,
                time: s.time,
                hour: s.hour,
                minute: s.minute,
                level: s.level,
                students: [], 
                studentCount: s.students ? s.students.length : 0,
                link: '#'
            }));
            res.json(sanitized);
        }
    } catch (err) {
        console.error('Failed to retrieve class schedules:', err);
        res.status(500).json({ error: 'Failed to retrieve schedules' });
    }
});

// Get all students (Leaderboard with search & pagination)
app.get('/api/students', async (req, res) => {
    try {
        // SECURITY: Cap search string to 100 chars to prevent oversized query parameters
        let search = req.query.search ? String(req.query.search).trim() : '';
        if (search.length > 100) search = search.substring(0, 100);
        
        let limit = parseInt(req.query.limit, 10);
        if (isNaN(limit) || limit <= 0) {
            limit = 100;
        }
        
        let offset = parseInt(req.query.offset, 10);
        if (isNaN(offset) || offset < 0) {
            offset = 0;
        }

        // Safety limit to prevent abuse
        if (limit > 500) {
            limit = 500;
        }

        const students = await getStudentsDetailedList({ limit, offset, search });

        // Everyone gets public leaderboard fields only
        const sanitizedStudents = students.map(student => sanitizeStudentPublic(student));
        res.json(sanitizedStudents);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to retrieve students data' });
    }
});

// Authenticated user's own full profile (PII only for the signed-in user)
app.get('/api/students/me', authenticate, async (req, res) => {
    try {
        const profile = await getStudentById(req.user.id);
        if (!profile) {
            return res.status(404).json({ error: 'Profile not found' });
        }
        // SECURITY: Strip coaching_notes — these are confidential coach-only observations.
        // Students should not be able to read notes their coach has written about them.
        const { coachingNotes: _stripped, ...safeProfile } = profile;
        res.json(safeProfile);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to retrieve profile' });
    }
});

// Login / Register Google or Mock profile
app.post('/api/students/login', dbAuthRateLimiter, validateBodySchema(LOGIN_SCHEMA), async (req, res) => {
    let { credential, email, name, avatar } = req.body;

    if (credential) {
        try {
            const { OAuth2Client } = require('google-auth-library');
            const googleClient = new OAuth2Client(GOOGLE_CLIENT_ID);
            const ticket = await googleClient.verifyIdToken({
                idToken: credential,
                audience: GOOGLE_CLIENT_ID
            });
            const payload = ticket.getPayload();
            email = payload.email;
            name = payload.name;
            avatar = payload.picture;
        } catch (authErr) {
            logSecurityEvent('WARN', 'GOOGLE_AUTH_FAILED', req, { error: authErr.message });
            return res.status(401).json({ error: 'Invalid Google login credentials' });
        }
    } else {
        // Block passwordless mock logins when explicitly disabled (use DISABLE_MOCK_LOGIN=true in .env)
        if (process.env.DISABLE_MOCK_LOGIN === 'true') {
            logSecurityEvent('WARN', 'MOCK_LOGIN_ATTEMPT_BLOCKED', req);
            return res.status(400).json({ error: 'Direct email login is disabled.' });
        }
        if (!email || !name) {
            return res.status(400).json({ error: 'Email and Name are required for development mock login.' });
        }
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Exclusively lock the table to ensure we do not hit race conditions when counting and creating studentIds
        await client.query('LOCK TABLE students IN SHARE ROW EXCLUSIVE MODE');

        // Check if student already exists
        const rows = await executeClientQuery(client, 'SELECT id FROM students WHERE LOWER(email) = LOWER(?)', [email]);

        // Teacher role for the designated teacher email; everyone else is a student
        const teacherEmail = (process.env.TEACHER_EMAIL || '').toLowerCase();
        const role = email.toLowerCase() === teacherEmail ? 'teacher' : 'student';

        let studentId;
        if (rows.length > 0) {
            studentId = rows[0].id;
            // Update role on login to stay in sync with configuration changes
            await executeClientQuery(client, 'UPDATE students SET role = ? WHERE id = ?', [role, studentId]);
        } else {
            // Whitelist verification for new student registrations
            const allowedEmailsStr = process.env.ALLOWED_EMAILS || '';
            const allowedDomainsStr = process.env.ALLOWED_EMAIL_DOMAINS || '';

            const allowedEmails = allowedEmailsStr.split(',').map(e => e.trim().toLowerCase()).filter(Boolean);
            const allowedDomains = allowedDomainsStr.split(',').map(d => d.trim().toLowerCase()).filter(Boolean);

            const emailLower = email.toLowerCase();
            const emailDomain = emailLower.split('@')[1] || '';

            const isAllowedEmail = allowedEmails.length === 0 || allowedEmails.includes(emailLower);
            const isAllowedDomain = allowedDomains.length === 0 || allowedDomains.includes(emailDomain);

            if (!isAllowedEmail && !isAllowedDomain) {
                await client.query('ROLLBACK');
                logSecurityEvent('WARN', 'REGISTRATION_BLOCKED_BY_WHITELIST', req, { email });
                return res.status(403).json({ error: 'Registration is restricted. Contact administrator to whitelist your email.' });
            }

            // Register new student - find the maximum existing MS-XXX ID to prevent key duplication
            const maxIdRows = await executeClientQuery(
                client,
                "SELECT id FROM students WHERE id LIKE 'MS-%' ORDER BY id DESC LIMIT 1"
            );
            let nextNum = 1;
            if (maxIdRows.length > 0) {
                const maxIdStr = maxIdRows[0].id;
                const numPart = parseInt(maxIdStr.substring(3));
                if (!isNaN(numPart)) {
                    nextNum = numPart + 1;
                }
            }
            studentId = `MS-${String(nextNum).padStart(3, '0')}`;
            const defaultAvatar = avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(name)}`;

            await executeClientQuery(
                client,
                'INSERT INTO students (id, name, email, avatar, points, category, games_played, win_count, role) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
                [studentId, name, email, defaultAvatar, 0, 'Beginner', 0, 0, role]
            );

            // Insert default 'Beginner' badge
            await executeClientQuery(client, 'INSERT INTO student_badges (student_id, badge_id) VALUES (?, ?)', [studentId, 'Beginner']);
        }

        await client.query('COMMIT');

        const profile = await getStudentById(studentId);
        const token = generateSessionToken(profile.id, profile.role);

        // Generate refresh token and CSRF token
        const refreshToken = crypto.randomBytes(40).toString('hex');
        const refreshTokenExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
        const csrfToken = crypto.randomBytes(32).toString('hex');

        // Store refresh token
        await executeQuery(
            'INSERT INTO refresh_tokens (token, student_id, expires_at) VALUES (?, ?, ?)',
            [refreshToken, profile.id, refreshTokenExpiry.toISOString()]
        );

        // Clean up expired refresh tokens for clean DB
        await executeQuery('DELETE FROM refresh_tokens WHERE student_id = ? AND expires_at < NOW()', [profile.id]);

        // Set secure cookies — use COOKIE_SECURE=true only when served over HTTPS
        const isProd = process.env.COOKIE_SECURE === 'true';
        res.cookie('ms_session_v2', token, {
            httpOnly: true,
            sameSite: 'Strict',
            secure: isProd,
            path: '/',
            maxAge: 15 * 60 * 1000 // 15 mins
        });
        res.cookie('ms_refresh', refreshToken, {
            httpOnly: true,
            sameSite: 'Strict',
            secure: isProd,
            path: '/api/auth/refresh',
            maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
        });
        res.cookie('ms_csrf_v2', csrfToken, {
            httpOnly: false,
            sameSite: 'Strict',
            secure: isProd,
            path: '/',
            maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
        });

        res.json(profile);
    } catch (err) {
        await client.query('ROLLBACK');
        console.error(err);
        res.status(500).json({ error: 'Authentication failed' });
    } finally {
        client.release();
    }
});

// POST /api/auth/refresh - Refresh access token and rotate refresh token (1.2 Refresh Token Rotation)
app.post('/api/auth/refresh', async (req, res) => {
    const csrfCookie = req.cookies['ms_csrf_v2'];
    const csrfHeader = req.headers['x-csrf-token'];
    if (!csrfCookie || !csrfHeader || csrfCookie !== csrfHeader) {
        logSecurityEvent('WARN', 'REFRESH_CSRF_FAILED', req);
        return res.status(403).json({ error: 'CSRF token validation failed for refresh' });
    }

    const refreshToken = req.cookies['ms_refresh'];
    if (!refreshToken) {
        logSecurityEvent('WARN', 'REFRESH_TOKEN_MISSING', req);
        return res.status(401).json({ error: 'Refresh token required' });
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Find refresh token in DB
        const rows = await executeClientQuery(client, 'SELECT * FROM refresh_tokens WHERE token = ?', [refreshToken]);
        if (rows.length === 0) {
            logSecurityEvent('WARN', 'REFRESH_TOKEN_NOT_FOUND', req, { token: refreshToken });
            await client.query('COMMIT');
            return res.status(401).json({ error: 'Invalid refresh token' });
        }

        const rt = rows[0];
        const studentId = rt.student_id;

        // Check if token is revoked or has been replaced (reuse detection)
        if (rt.is_revoked || rt.replaced_by) {
            logSecurityEvent('CAUTION', 'REFRESH_TOKEN_REUSE_DETECTED', req, { studentId, token: refreshToken });
            // Revoke all refresh tokens for this user as a safety measure
            await executeClientQuery(client, 'UPDATE refresh_tokens SET is_revoked = TRUE WHERE student_id = ?', [studentId]);
            await client.query('COMMIT');

            // Clear all cookies
            res.clearCookie('ms_session_v2', { path: '/' });
            res.clearCookie('ms_refresh', { path: '/api/auth/refresh' });
            res.clearCookie('ms_csrf_v2', { path: '/' });

            return res.status(401).json({ error: 'Security breach detected. All sessions revoked.' });
        }

        // Check expiration
        const expiresAt = new Date(rt.expires_at);
        if (expiresAt < new Date()) {
            logSecurityEvent('WARN', 'REFRESH_TOKEN_EXPIRED', req, { studentId });
            await executeClientQuery(client, 'DELETE FROM refresh_tokens WHERE token = ?', [refreshToken]);
            await client.query('COMMIT');
            return res.status(401).json({ error: 'Refresh token expired' });
        }

        // Token is valid! Fetch user profile
        const profile = await getStudentById(studentId);
        if (!profile) {
            await client.query('COMMIT');
            return res.status(401).json({ error: 'User profile not found' });
        }

        // Generate new tokens
        const newAccessToken = generateSessionToken(profile.id, profile.role);
        const newRefreshToken = crypto.randomBytes(40).toString('hex');
        const newRefreshTokenExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
        const newCsrfToken = crypto.randomBytes(32).toString('hex');

        // Mark old token as replaced by new token and revoked
        await executeClientQuery(client,
            'UPDATE refresh_tokens SET is_revoked = TRUE, replaced_by = ? WHERE token = ?',
            [newRefreshToken, refreshToken]
        );

        // Store new refresh token
        await executeClientQuery(client,
            'INSERT INTO refresh_tokens (token, student_id, expires_at) VALUES (?, ?, ?)',
            [newRefreshToken, studentId, newRefreshTokenExpiry.toISOString()]
        );

        await client.query('COMMIT');

        // Set cookies
        const isProd = process.env.COOKIE_SECURE === 'true';
        res.cookie('ms_session_v2', newAccessToken, {
            httpOnly: true,
            sameSite: 'Strict',
            secure: isProd,
            path: '/',
            maxAge: 15 * 60 * 1000 // 15 mins
        });
        res.cookie('ms_refresh', newRefreshToken, {
            httpOnly: true,
            sameSite: 'Strict',
            secure: isProd,
            path: '/api/auth/refresh',
            maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
        });
        res.cookie('ms_csrf_v2', newCsrfToken, {
            httpOnly: false,
            sameSite: 'Strict',
            secure: isProd,
            path: '/',
            maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
        });

        res.json({ success: true });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Token refresh error:', err);
        res.status(500).json({ error: 'Token refresh failed' });
    } finally {
        client.release();
    }
});

// POST /api/auth/logout - Clear all cookies
// SECURITY: CSRF validation added — prevents forced-logout attacks via cross-site form submissions.
app.post('/api/auth/logout', validateCSRF, async (req, res) => {
    const refreshToken = req.cookies['ms_refresh'];
    if (refreshToken) {
        try {
            await executeQuery('DELETE FROM refresh_tokens WHERE token = ?', [refreshToken]);
        } catch (e) {
            console.error('Failed to delete refresh token on logout:', e);
        }
    }

    res.clearCookie('ms_session_v2', { path: '/' });
    res.clearCookie('ms_refresh', { path: '/api/auth/refresh' });
    res.clearCookie('ms_csrf_v2', { path: '/' });
    res.json({ success: true });
});

// Update display name
app.put('/api/students/:id/name', authenticate, validateBodySchema(UPDATE_NAME_SCHEMA), async (req, res) => {
    const { id } = req.params;
    const { name } = req.body;
    if (req.user.id !== id) {
        return res.status(403).json({ error: 'Forbidden: You cannot modify other student profiles' });
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await executeClientQuery(client, 'UPDATE students SET name = ? WHERE id = ?', [name, id]);
        await client.query('COMMIT');

        const profile = await getStudentById(id);
        res.json(profile);
    } catch (err) {
        await client.query('ROLLBACK');
        console.error(err);
        res.status(500).json({ error: 'Failed to update account name' });
    } finally {
        client.release();
    }
});

// Update profile photo
app.put('/api/students/:id/avatar', authenticate, validateBodySchema(UPDATE_AVATAR_SCHEMA), async (req, res) => {
    const { id } = req.params;
    const { avatar } = req.body;
    if (req.user.id !== id) {
        return res.status(403).json({ error: 'Forbidden: You cannot modify other student profiles' });
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await executeClientQuery(client, 'UPDATE students SET avatar = ? WHERE id = ?', [avatar, id]);
        await client.query('COMMIT');

        const profile = await getStudentById(id);
        res.json(profile);
    } catch (err) {
        await client.query('ROLLBACK');
        console.error(err);
        res.status(500).json({ error: 'Failed to update profile photo' });
    } finally {
        client.release();
    }
});

// DELETE /api/students/:id - Secure data deletion endpoint (6. Privacy / GDPR)
app.delete('/api/students/:id', authenticate, async (req, res) => {
    const { id } = req.params;
    if (req.user.id !== id) {
        return res.status(403).json({ error: 'Forbidden: You can only delete your own account data' });
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Log audit trail for record deletion
        await logAuditTrail(client, req.user.id, 'DELETE_STUDENT_ACCOUNT', id, `Student account and all associated data deleted.`);

        // Delete student (cascades to badges, puzzles, schedules, refresh tokens, homework due to ON DELETE CASCADE constraints)
        await executeClientQuery(client, 'DELETE FROM students WHERE id = ?', [id]);

        await client.query('COMMIT');

        // Clear auth cookies on the response so they are logged out
        res.clearCookie('ms_session_v2', { path: '/' });
        res.clearCookie('ms_refresh', { path: '/api/auth/refresh' });
        res.clearCookie('ms_csrf_v2', { path: '/' });

        res.json({ success: true });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Failed to delete student account:', err);
        res.status(500).json({ error: 'Failed to delete student account' });
    } finally {
        client.release();
    }
});



// Update points, category, badges, gameplay statistics & solved puzzles
app.post('/api/students/:id/stats', statsRateLimiter, authenticate, validateBodySchema(UPDATE_STATS_SCHEMA), async (req, res) => {
    const { id } = req.params;
    if (req.user.id !== id) {
        return res.status(403).json({ error: 'Forbidden: You cannot modify another student\'s statistics' });
    }
    const { points, gamesPlayed, winCount, badges, solvedPuzzles } = req.body;

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Fetch current profile to validate increments (data integrity check)
        // Lock the row to prevent concurrent race conditions
        const currentRows = await executeClientQuery(client, 'SELECT points, games_played, win_count FROM students WHERE id = ? FOR UPDATE', [id]);
        if (currentRows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Student not found' });
        }
        const current = currentRows[0];

        // Sanity validations:
        const pointsDiff = points - current.points;
        const gamesDiff = gamesPlayed - current.games_played;
        const winDiff = winCount - current.win_count;

        // Prevent tampering: stats can never decrease, and points/win gains must be proportional to games played
        if (gamesDiff < 0 || winDiff < 0) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'Data integrity violation: Statistics cannot decrease.' });
        }
        if (winDiff > gamesDiff) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'Data integrity violation: Win count increase cannot exceed games played increase.' });
        }
        // Limit maximum points earned per game/puzzle solving to prevent massive score manipulation
        // (A single puzzle/game awards at most 50-100 points, so any gain > 200 per game is highly suspicious/tampered)
        if (pointsDiff > 0 && gamesDiff === 0 && pointsDiff > 100) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'Data integrity violation: Unreasonable point increment without game completion.' });
        }
        if (pointsDiff > 0 && gamesDiff > 0 && pointsDiff > gamesDiff * 150) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'Data integrity violation: Points increment exceeds maximum allowance per game.' });
        }

        // Update basic metrics
        let category = 'Beginner';
        if (points < 1500) category = 'Beginner';
        else if (points < 2500) category = 'Intermediate';
        else if (points < 3500) category = 'Super Intermediate';
        else if (points < 5000) category = 'Advanced';
        else if (points < 10000) category = 'Super Advanced';
        else category = 'Grandmaster';

        await executeClientQuery(
            client,
            'UPDATE students SET points = ?, category = ?, games_played = ?, win_count = ? WHERE id = ?',
            [points, category, gamesPlayed, winCount, id]
        );

        // Batch insert badges using unnest
        if (Array.isArray(badges) && badges.length > 0) {
            await executeClientQuery(
                client,
                'INSERT INTO student_badges (student_id, badge_id) SELECT ?, unnest(?::text[]) ON CONFLICT(student_id, badge_id) DO NOTHING',
                [id, badges]
            );
        }

        // Batch insert solved puzzles using unnest
        if (Array.isArray(solvedPuzzles) && solvedPuzzles.length > 0) {
            await executeClientQuery(
                client,
                'INSERT INTO student_puzzles (student_id, puzzle_id) SELECT ?, unnest(?::text[]) ON CONFLICT(student_id, puzzle_id) DO NOTHING',
                [id, solvedPuzzles]
            );
        }

        await client.query('COMMIT');

        const profile = await getStudentById(id);
        res.json(profile);
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Failed to update stats:', err);
        res.status(500).json({ error: 'Failed to update game stats' });
    } finally {
        client.release();
    }
});

// Update Date of Birth and trigger immediate birthday check
app.put('/api/students/:id/dob', authenticate, validateBodySchema(UPDATE_DOB_SCHEMA), async (req, res) => {
    const { id } = req.params;
    if (req.user.id !== id) {
        return res.status(403).json({ error: 'Forbidden: You cannot update another student\'s Date of Birth' });
    }
    const { dob } = req.body;

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Lock the row to prevent updates and verify if DOB is already set (DOB locking)
        const checkRows = await executeClientQuery(client, 'SELECT points, dob, last_birthday_reward_year FROM students WHERE id = ? FOR UPDATE', [id]);
        if (checkRows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Student profile not found' });
        }
        const student = checkRows[0];
        if (student.dob) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'Date of Birth is already set and locked.' });
        }

        // Update DOB
        await executeClientQuery(client, 'UPDATE students SET dob = ? WHERE id = ?', [dob, id]);

        let rewarded = false;
        let updatedPoints = student.points;

        const today = new Date();
        const currentYear = today.getFullYear();
        const currentMonthDay = `${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

        const dobParts = dob.split('-');
        const dobMonthDay = `${dobParts[1]}-${dobParts[2]}`;

        if (dobMonthDay === currentMonthDay) {
            if (student.last_birthday_reward_year !== currentYear) {
                updatedPoints += 1000;
                await executeClientQuery(
                    client,
                    'UPDATE students SET points = ?, last_birthday_reward_year = ? WHERE id = ?',
                    [updatedPoints, currentYear, id]
                );
                rewarded = true;
            }
        }

        await client.query('COMMIT');

        const profile = await getStudentById(id);
        res.json({ profile, rewarded });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Failed to update DOB:', err);
        res.status(500).json({ error: 'Failed to update date of birth' });
    } finally {
        client.release();
    }
});

// Get student's homework assignments
app.get('/api/students/:id/homework', authenticate, async (req, res) => {
    const { id } = req.params;
    if (req.user.id !== id && req.user.role !== 'coach') {
        return res.status(403).json({ error: 'Forbidden: You cannot access this student\'s homework' });
    }
    try {
        const rows = await executeQuery('SELECT * FROM homework_assignments WHERE student_id = ?', [id]);
        const homework = rows.map(mapHomeworkRow);
        res.json(homework);
    } catch (err) {
        console.error('Failed to get homework:', err);
        res.status(500).json({ error: 'Failed to retrieve homework assignments' });
    }
});

// Complete homework assignment
app.put('/api/students/:id/homework/:assignmentId/complete', authenticate, async (req, res) => {
    const { id, assignmentId } = req.params;
    if (req.user.id !== id) {
        return res.status(403).json({ error: 'Forbidden: You cannot complete another student\'s homework' });
    }
    try {
        await executeQuery('UPDATE homework_assignments SET completed = TRUE WHERE id = ? AND student_id = ?', [assignmentId, id]);
        const rows = await executeQuery('SELECT * FROM homework_assignments WHERE id = ?', [assignmentId]);
        if (rows.length === 0) {
            return res.status(404).json({ error: 'Homework assignment not found' });
        }
        res.json(mapHomeworkRow(rows[0]));
    } catch (err) {
        console.error('Failed to complete homework:', err);
        res.status(500).json({ error: 'Failed to complete homework assignment' });
    }
});

// Check and apply annual birthday reward (points)
app.post('/api/students/:id/check-birthday', authenticate, async (req, res) => {
    const { id } = req.params;
    if (req.user.id !== id) {
        return res.status(403).json({ error: 'Forbidden: You cannot check another student\'s birthday reward' });
    }
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Lock the row to prevent race conditions during reward checks
        const rows = await executeClientQuery(client, 'SELECT points, dob, last_birthday_reward_year, name FROM students WHERE id = ? FOR UPDATE', [id]);
        if (rows.length === 0) {
            await client.query('COMMIT');
            return res.status(404).json({ error: 'Student not found' });
        }

        const student = rows[0];
        let rewarded = false;
        let updatedPoints = student.points;

        if (student.dob) {
            const today = new Date();
            const currentYear = today.getFullYear();
            const currentMonthDay = `${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

            const dobParts = student.dob.split('-');
            if (dobParts.length === 3) {
                const dobMonthDay = `${dobParts[1]}-${dobParts[2]}`;

                if (dobMonthDay === currentMonthDay) {
                    if (student.last_birthday_reward_year !== currentYear) {
                        updatedPoints += 1000;
                        await executeClientQuery(
                            client,
                            'UPDATE students SET points = ?, last_birthday_reward_year = ? WHERE id = ?',
                            [updatedPoints, currentYear, id]
                        );
                        rewarded = true;
                    }
                }
            }
        }

        await client.query('COMMIT');

        const profile = await getStudentById(id);
        res.json({ profile, rewarded });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Failed to check birthday:', err);
        res.status(500).json({ error: 'Failed to check birthday reward' });
    } finally {
        client.release();
    }
});


// ============================================================
// ANNOUNCEMENTS API
// ============================================================

// GET /api/announcements — public, returns recent + pinned
app.get('/api/announcements', async (req, res) => {
    try {
        const rows = await executeQuery(
            `SELECT a.id, a.title, a.body, a.pinned, a.created_at, s.name as author_name, s.avatar as author_avatar
             FROM announcements a
             JOIN students s ON s.id = a.author_id
             ORDER BY a.pinned DESC, a.created_at DESC
             LIMIT 20`
        );
        res.json(rows);
    } catch (err) {
        console.error('Failed to fetch announcements:', err);
        res.status(500).json({ error: 'Failed to fetch announcements' });
    }
});

// POST /api/announcements — teacher only
app.post('/api/announcements', authenticate, async (req, res) => {
    if (req.user.role !== 'teacher') {
        return res.status(403).json({ error: 'Only the teacher can post announcements.' });
    }
    const { title, body, pinned } = req.body;
    if (!title || !body) return res.status(400).json({ error: 'Title and body are required.' });
    try {
        const rows = await executeQuery(
            'INSERT INTO announcements (author_id, title, body, pinned) VALUES (?, ?, ?, ?) RETURNING *',
            [req.user.id, title.substring(0, 200), body.substring(0, 2000), !!pinned]
        );
        res.json(rows[0]);
    } catch (err) {
        console.error('Failed to create announcement:', err);
        res.status(500).json({ error: 'Failed to create announcement' });
    }
});

// DELETE /api/announcements/:id — teacher only
app.delete('/api/announcements/:id', authenticate, async (req, res) => {
    if (req.user.role !== 'teacher') {
        return res.status(403).json({ error: 'Only the teacher can delete announcements.' });
    }
    try {
        await executeQuery('DELETE FROM announcements WHERE id = ?', [req.params.id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Failed to delete announcement' });
    }
});

// ============================================================
// ACADEMY TOURNAMENTS API
// ============================================================

// GET /api/tournaments/academy — all academy tournaments with registration count
app.get('/api/tournaments/academy', async (req, res) => {
    try {
        let token = req.cookies?.ms_session_v2 || null;
        if (!token) {
            const authHeader = req.headers['authorization'];
            if (authHeader && authHeader.startsWith('Bearer ')) {
                token = authHeader.substring(7);
            }
        }

        let authenticatedUserId = null;
        if (token) {
            const decoded = verifySessionToken(token);
            if (decoded) {
                authenticatedUserId = decoded.id;
            }
        }

        let query = `
            SELECT t.*, s.name as creator_name,
                   (SELECT COUNT(*) FROM tournament_registrations WHERE tournament_id = t.id) as registrations,
                   0 as is_registered
            FROM academy_tournaments t
            JOIN students s ON s.id = t.created_by
            ORDER BY t.created_at DESC
        `;

        if (authenticatedUserId) {
            query = `
                SELECT t.*, s.name as creator_name,
                       (SELECT COUNT(*) FROM tournament_registrations WHERE tournament_id = t.id) as registrations,
                       (SELECT COUNT(*) FROM tournament_registrations WHERE tournament_id = t.id AND student_id = ?) as is_registered
                FROM academy_tournaments t
                JOIN students s ON s.id = t.created_by
                ORDER BY t.created_at DESC
            `;
        }

        const params = authenticatedUserId ? [authenticatedUserId] : [];
        const rows = await executeQuery(query, params);

        const mapped = rows.map(r => ({
            ...r,
            isRegistered: parseInt(r.is_registered, 10) > 0
        }));

        res.json(mapped);
    } catch (err) {
        console.error('Failed to fetch academy tournaments:', err);
        res.status(500).json({ error: 'Failed to fetch tournaments' });
    }
});

// POST /api/tournaments/academy — teacher only
app.post('/api/tournaments/academy', authenticate, async (req, res) => {
    if (req.user.role !== 'teacher') {
        return res.status(403).json({ error: 'Only the teacher can create academy tournaments.' });
    }
    const { title, description, start_date } = req.body;
    if (!title) return res.status(400).json({ error: 'Title is required.' });
    try {
        const rows = await executeQuery(
            'INSERT INTO academy_tournaments (title, description, start_date, created_by) VALUES (?, ?, ?, ?) RETURNING *',
            [title.substring(0, 200), (description || '').substring(0, 1000), start_date || null, req.user.id]
        );
        broadcastToAll({ type: 'tournaments_updated' });
        res.json(rows[0]);
    } catch (err) {
        console.error('Failed to create tournament:', err);
        res.status(500).json({ error: 'Failed to create tournament' });
    }
});

// POST /api/tournaments/academy/:id/register — student registers
app.post('/api/tournaments/academy/:id/register', authenticate, async (req, res) => {
    const tournamentId = parseInt(req.params.id);
    try {
        await executeQuery(
            'INSERT INTO tournament_registrations (tournament_id, student_id) VALUES (?, ?) ON CONFLICT DO NOTHING',
            [tournamentId, req.user.id]
        );
        broadcastToAll({ type: 'tournaments_updated' });
        res.json({ success: true });
    } catch (err) {
        console.error('Failed to register for tournament:', err);
        res.status(500).json({ error: 'Failed to register' });
    }
});

// DELETE /api/tournaments/academy/:id — teacher only
app.delete('/api/tournaments/academy/:id', authenticate, async (req, res) => {
    if (req.user.role !== 'teacher') {
        return res.status(403).json({ error: 'Only the teacher can delete tournaments.' });
    }
    try {
        await executeQuery('DELETE FROM academy_tournaments WHERE id = ?', [req.params.id]);
        broadcastToAll({ type: 'tournaments_updated' });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Failed to delete tournament' });
    }
});

// PATCH /api/tournaments/academy/:id/status — teacher only (start/complete tournament)
app.patch('/api/tournaments/academy/:id/status', authenticate, async (req, res) => {
    if (req.user.role !== 'teacher') {
        return res.status(403).json({ error: 'Only the teacher can update tournament status.' });
    }
    const { status } = req.body;
    const validStatuses = ['upcoming', 'ongoing', 'completed'];
    if (!validStatuses.includes(status)) return res.status(400).json({ error: 'Invalid status.' });
    try {
        await executeQuery('UPDATE academy_tournaments SET status = ? WHERE id = ?', [status, req.params.id]);
        broadcastToAll({ type: 'tournaments_updated' });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Failed to update tournament status' });
    }
});

// GET /api/tournaments/academy/:id/registrations — get registered students
app.get('/api/tournaments/academy/:id/registrations', authenticate, async (req, res) => {
    try {
        const rows = await executeQuery(
            `SELECT s.id, s.name, s.avatar, s.points, s.category
             FROM tournament_registrations r
             JOIN students s ON s.id = r.student_id
             WHERE r.tournament_id = ?
             ORDER BY s.points DESC`,
            [req.params.id]
        );
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch registrations' });
    }
});

// Active live games registry (accessible to WS server and HTTP routes)
const activeGames = new Map();

// GET /api/games/active — returns all active challenge matches
app.get('/api/games/active', (req, res) => {
    res.json(Array.from(activeGames.values()));
});

// ============================================================
// CLASS RECORDINGS API
// ============================================================

// GET /api/schedules/:id/recordings
app.get('/api/schedules/:id/recordings', async (req, res) => {
    try {
        const rows = await executeQuery(
            'SELECT * FROM class_recordings WHERE schedule_id = ? ORDER BY recorded_at DESC',
            [req.params.id]
        );
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch recordings' });
    }
});

// POST /api/schedules/:id/recordings — teacher only
app.post('/api/schedules/:id/recordings', authenticate, async (req, res) => {
    if (req.user.role !== 'teacher') {
        return res.status(403).json({ error: 'Only the teacher can add recordings.' });
    }
    const { title, recording_url, recorded_at } = req.body;
    if (!recording_url) return res.status(400).json({ error: 'Recording URL is required.' });
    try {
        const rows = await executeQuery(
            'INSERT INTO class_recordings (schedule_id, title, recording_url, recorded_at, added_by) VALUES (?, ?, ?, ?, ?) RETURNING *',
            [req.params.id, title || 'Class Recording', recording_url, recorded_at || new Date().toISOString().split('T')[0], req.user.id]
        );
        res.json(rows[0]);
    } catch (err) {
        console.error('Failed to add recording:', err);
        res.status(500).json({ error: 'Failed to add recording' });
    }
});

// DELETE /api/schedules/recordings/:id — teacher only
app.delete('/api/schedules/recordings/:id', authenticate, async (req, res) => {
    if (req.user.role !== 'teacher') {
        return res.status(403).json({ error: 'Only the teacher can delete recordings.' });
    }
    try {
        await executeQuery('DELETE FROM class_recordings WHERE id = ?', [req.params.id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Failed to delete recording' });
    }
});

// ============================================================
// TEACHER INFO API (client-side teacher check)
// ============================================================
app.get('/api/me/role', authenticate, (req, res) => {
    res.json({ role: req.user.role, id: req.user.id });
});

// Catch-all route to serve 1.html for any frontend client-side routes (SPA redirect support)
app.get('/*splat', (req, res) => {
    // If it's an API route that wasn't matched, send 404
    if (req.path.startsWith('/api')) {
        return res.status(404).json({ error: 'API endpoint not found' });
    }
    // Security: Do NOT serve 1.html for missing static files.
    // If the request is for an asset (e.g. has a file extension like .png, .js, .css, .woff2, .ico), send 404.
    const ext = path.extname(req.path).toLowerCase();
    if (ext && ext !== '.html') {
        return res.status(404).send('Not Found');
    }
    const filePath = path.join(__dirname, '1.html');
    fs.readFile(filePath, 'utf8', (readErr, content) => {
        if (readErr) {
            return res.status(500).send('Failed to load application');
        }
        serveProcessedHtml(content, res);
    });
});

// Schedule points decay to run in the background on startup, and then every 24 hours.
function schedulePointsDecay() {
    // Run initially in the background after boot (with a 5 second delay to not block startup)
    setTimeout(async () => {
        console.log('Running initial background points decay check...');
        try {
            await performMonthlyPointsDecay();
        } catch (err) {
            console.error('Error during initial background points decay:', err);
        }
    }, 5000);

    // Run every 24 hours
    setInterval(async () => {
        console.log('Running scheduled background points decay check...');
        try {
            await performMonthlyPointsDecay();
        } catch (err) {
            console.error('Error during scheduled background points decay:', err);
        }
    }, 24 * 60 * 60 * 1000);
}

// ============================================================
// WEBSOCKET CHESS SERVER FOR STUDENT VS STUDENT LIVE PLAY
// ============================================================
const { WebSocketServer } = require('ws');

let wssInstance = null;
function broadcastToAll(messageObj) {
    if (wssInstance) {
        const msgStr = JSON.stringify(messageObj);
        wssInstance.clients.forEach(client => {
            if (client.readyState === 1) { // WebSocket.OPEN
                client.send(msgStr);
            }
        });
    }
}

function initWebSocketServer(httpServer) {
    const wss = new WebSocketServer({ server: httpServer });
    wssInstance = wss;
    const clients = new Map();       // userId  -> ws
    const spectatorRooms = new Map(); // gameId  -> Set<ws>

    wss.on('connection', (ws, req) => {
        // Authenticate WebSocket connection using the HTTP session cookie at handshake time
        const cookies = parseCookies(req?.headers?.cookie);
        const handshakeToken = cookies?.ms_session_v2;
        const decoded = verifySessionToken(handshakeToken);
        if (!decoded) {
            ws.close(4001, 'Unauthorized Handshake');
            return;
        }

        let authenticatedUserId = decoded.id;

        // Periodically verify session status in the database (every 5 minutes)
        const checkInterval = setInterval(async () => {
            try {
                if (ws.userId) {
                    const activeSession = await executeQuery(
                        'SELECT id FROM refresh_tokens WHERE student_id = ? AND is_revoked = FALSE AND expires_at > NOW() LIMIT 1',
                        [ws.userId]
                    );
                    if (activeSession.length === 0) {
                        ws.close(4001, 'Session Revoked');
                        clearInterval(checkInterval);
                    }
                }
            } catch (err) {
                console.error('Error during WS session verification:', err);
            }
        }, 5 * 60 * 1000);

        ws.on('message', async (message) => {
            try {
                const data = JSON.parse(message);
                
                switch (data.type) {
                    case 'register':
                        authenticatedUserId = data.userId;
                        ws.userId = data.userId;
                        ws.userName = data.userName;
                        clients.set(data.userId, ws);
                        broadcastOnlineUsers();
                        
                        // Check if this registering user has any ongoing live games in our registry
                        for (const [gId, game] of activeGames.entries()) {
                            if (game.whitePlayerId === data.userId || game.blackPlayerId === data.userId) {
                                // Resume game for the reconnected player
                                ws.send(JSON.stringify({
                                    type: 'game_resume',
                                    gameId: game.gameId,
                                    whitePlayerId: game.whitePlayerId,
                                    blackPlayerId: game.blackPlayerId,
                                    whitePlayerName: game.whitePlayerName,
                                    blackPlayerName: game.blackPlayerName,
                                    fen: game.fen,
                                    clockLimit: game.clockLimit
                                }));
                                
                                // Notify opponent of reconnection
                                const opponentId = game.whitePlayerId === data.userId ? game.blackPlayerId : game.whitePlayerId;
                                const opponentWs = clients.get(opponentId);
                                if (opponentWs) {
                                    opponentWs.send(JSON.stringify({
                                        type: 'opponent_reconnected',
                                        gameId: game.gameId
                                    }));
                                }
                                break;
                            }
                        }
                        break;
                        
                    case 'get_online_users':
                        ws.send(JSON.stringify({
                            type: 'online_users',
                            users: getOnlineUsersList()
                        }));
                        break;
                        
                    case 'challenge_invite':
                        {
                            const targetWs = clients.get(data.targetUserId);
                            if (targetWs) {
                                targetWs.send(JSON.stringify({
                                    type: 'challenge_invited',
                                    senderId: ws.userId,
                                    senderName: ws.userName,
                                    clockLimit: data.clockLimit
                                }));
                            }
                        }
                        break;
                        
                    case 'challenge_accept':
                        {
                            const senderWs = clients.get(data.senderId);
                            if (senderWs) {
                                const gameId = `GAME-${Date.now()}`;
                                const msg = JSON.stringify({
                                    type: 'challenge_accepted',
                                    gameId,
                                    whitePlayerId: data.senderId,
                                    blackPlayerId: ws.userId,
                                    whitePlayerName: senderWs.userName,
                                    blackPlayerName: ws.userName,
                                    clockLimit: data.clockLimit
                                });
                                ws.send(msg);
                                senderWs.send(msg);

                                // Save the live game in our active registry for spectators
                                activeGames.set(gameId, {
                                    gameId,
                                    whitePlayerId: data.senderId,
                                    whitePlayerName: senderWs.userName,
                                    blackPlayerId: ws.userId,
                                    blackPlayerName: ws.userName,
                                    fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
                                });
                            }
                        }
                        break;

                    case 'challenge_decline':
                        {
                            const senderWs = clients.get(data.senderId);
                            if (senderWs) {
                                senderWs.send(JSON.stringify({
                                    type: 'challenge_declined',
                                    declinedByName: ws.userName
                                }));
                            }
                        }
                        break;

                    case 'game_move':
                        {
                            const opponentWs = clients.get(data.opponentId);
                            if (opponentWs) {
                                opponentWs.send(JSON.stringify({
                                    type: 'opponent_move',
                                    gameId: data.gameId,
                                    move: data.move,
                                    fen: data.fen
                                }));
                            }
                            // Broadcast to all spectators watching this game
                            const room = spectatorRooms.get(data.gameId);
                            if (room && room.size > 0) {
                                const spectatorPayload = JSON.stringify({
                                    type: 'spectator_move',
                                    gameId: data.gameId,
                                    move: data.move,
                                    fen: data.fen,
                                    san: data.san || null
                                });
                                for (const specWs of room) {
                                    try { specWs.send(spectatorPayload); } catch (e) {}
                                }
                            }

                            // Keep the latest FEN in the active games list
                            const activeG = activeGames.get(data.gameId);
                            if (activeG) {
                                activeG.fen = data.fen;
                            }
                        }
                        break;

                    case 'game_resign':
                        {
                            const opponentWs = clients.get(data.opponentId);
                            if (opponentWs) {
                                opponentWs.send(JSON.stringify({
                                    type: 'opponent_resigned',
                                    gameId: data.gameId
                                }));
                            }
                            // Notify spectators that game ended
                            const resignRoom = spectatorRooms.get(data.gameId);
                            if (resignRoom) {
                                const payload = JSON.stringify({ type: 'spectator_game_over', gameId: data.gameId, result: `${ws.userName || 'A player'} resigned` });
                                for (const specWs of resignRoom) { try { specWs.send(payload); } catch (e) {} }
                            }

                            // Remove game from active games list
                            activeGames.delete(data.gameId);
                        }
                        break;

                    case 'game_draw_offer':
                        {
                            const opponentWs = clients.get(data.opponentId);
                            if (opponentWs) {
                                opponentWs.send(JSON.stringify({
                                    type: 'opponent_draw_offered',
                                    gameId: data.gameId
                                }));
                            }
                        }
                        break;

                    case 'game_draw_accept':
                        {
                            const opponentWs = clients.get(data.opponentId);
                            if (opponentWs) {
                                opponentWs.send(JSON.stringify({
                                    type: 'opponent_draw_accepted',
                                    gameId: data.gameId
                                }));
                            }

                            // Notify spectators that game ended in a draw
                            const drawRoom = spectatorRooms.get(data.gameId);
                            if (drawRoom) {
                                const payload = JSON.stringify({ type: 'spectator_game_over', gameId: data.gameId, result: "Game ended in a draw 🤝" });
                                for (const specWs of drawRoom) { try { specWs.send(payload); } catch (e) {} }
                            }

                            // Remove from active games list
                            activeGames.delete(data.gameId);
                        }
                        break;

                    case 'chat_message':
                        {
                            const opponentWs = clients.get(data.opponentId);
                            if (opponentWs) {
                                opponentWs.send(JSON.stringify({
                                    type: 'chat',
                                    gameId: data.gameId,
                                    senderName: ws.userName,
                                    text: data.text
                                }));
                            }
                        }
                        break;

                    case 'spectate_join':
                        {
                            const gId = data.gameId;
                            if (gId) {
                                if (!spectatorRooms.has(gId)) spectatorRooms.set(gId, new Set());
                                spectatorRooms.get(gId).add(ws);
                                ws.spectatingGameId = gId;
                                // Notify this spectator of the count
                                const count = spectatorRooms.get(gId).size;
                                ws.send(JSON.stringify({ type: 'spectator_count', gameId: gId, count }));
                                // Broadcast updated count to all in room
                                const countPayload = JSON.stringify({ type: 'spectator_count', gameId: gId, count });
                                for (const specWs of spectatorRooms.get(gId)) { try { specWs.send(countPayload); } catch (e) {} }
                            }
                        }
                        break;

                    case 'spectate_leave':
                        {
                            const gId = data.gameId || ws.spectatingGameId;
                            if (gId && spectatorRooms.has(gId)) {
                                spectatorRooms.get(gId).delete(ws);
                                ws.spectatingGameId = null;
                                if (spectatorRooms.get(gId).size === 0) spectatorRooms.delete(gId);
                            }
                        }
                        break;
                }
            } catch (err) {
                console.error('WS Error:', err);
            }
        });

        ws.on('close', () => {
            clearInterval(checkInterval);
            if (authenticatedUserId) {
                // Prevent race conditions where a quick page refresh triggers a close event on the old connection
                // that mistakenly deletes the active reconnected socket from our clients map.
                if (clients.get(authenticatedUserId) === ws) {
                    clients.delete(authenticatedUserId);
                    broadcastOnlineUsers();

                    // Clean up active games involving this user after a 45-second grace period
                    for (const [gId, game] of activeGames.entries()) {
                        if (game.whitePlayerId === authenticatedUserId || game.blackPlayerId === authenticatedUserId) {
                            // Notify opponent immediately that their rival went offline and has a 45s grace period to return
                            const immediateOpponentId = game.whitePlayerId === authenticatedUserId ? game.blackPlayerId : game.whitePlayerId;
                            const immediateOpponentWs = clients.get(immediateOpponentId);
                            if (immediateOpponentWs) {
                                immediateOpponentWs.send(JSON.stringify({
                                    type: 'opponent_disconnected',
                                    gameId: gId,
                                    graceSeconds: 45
                                }));
                            }

                            setTimeout(() => {
                                // Verify if the user is still offline before deleting
                                if (!clients.has(authenticatedUserId)) {
                                    activeGames.delete(gId);
                                    
                                    // Notify opponent of disconnection timeout
                                    const opponentId = game.whitePlayerId === authenticatedUserId ? game.blackPlayerId : game.whitePlayerId;
                                    const opponentWs = clients.get(opponentId);
                                    if (opponentWs) {
                                        opponentWs.send(JSON.stringify({ type: 'opponent_disconnected_timeout', gameId: gId }));
                                    }

                                    // Notify spectators
                                    const room = spectatorRooms.get(gId);
                                    if (room) {
                                        const payload = JSON.stringify({ type: 'spectator_game_over', gameId: gId, result: 'Opponent disconnected' });
                                        for (const specWs of room) { try { specWs.send(payload); } catch (e) {} }
                                    }
                                }
                            }, 45000);
                        }
                    }
                }
            }
            // Clean up any spectator room membership
            if (ws.spectatingGameId && spectatorRooms.has(ws.spectatingGameId)) {
                spectatorRooms.get(ws.spectatingGameId).delete(ws);
                if (spectatorRooms.get(ws.spectatingGameId).size === 0) {
                    spectatorRooms.delete(ws.spectatingGameId);
                }
            }
        });

        function getOnlineUsersList() {
            const list = [];
            for (const [uid, clientWs] of clients.entries()) {
                if (uid !== authenticatedUserId) {
                    list.push({ id: uid, name: clientWs.userName });
                }
            }
            return list;
        }

        function broadcastOnlineUsers() {
            const list = [];
            for (const [uid, clientWs] of clients.entries()) {
                list.push({ id: uid, name: clientWs.userName });
            }
            const payload = JSON.stringify({
                type: 'online_users',
                users: list
            });
            for (const clientWs of clients.values()) {
                try {
                    clientWs.send(payload);
                } catch (e) {}
            }
        }
    });
}

// Boot the server
const cluster = require('cluster');
const os = require('os');

if (process.env.ENABLE_CLUSTER === 'true' && cluster.isPrimary) {
    const numCPUs = os.cpus().length || 1;
    console.log(`Primary cluster process ${process.pid} is running. Forking ${numCPUs} workers...`);

    // Fork workers
    for (let i = 0; i < numCPUs; i++) {
        cluster.fork();
    }

    cluster.on('exit', (worker, code, signal) => {
        console.log(`Worker process ${worker.process.pid} died. Spawning a replacement worker...`);
        cluster.fork();
    });
} else {
    initDatabaseConnection().then(() => {
        setupDatabaseSchema().then(() => {
            const serverInstance = app.listen(PORT, () => {
                const workerPrefix = cluster.isWorker ? `[Worker ${cluster.worker.id}] ` : '';
                console.log(`${workerPrefix}Server is running on port ${PORT}`);
                
                // Only run background scheduler on worker 1 (or single server mode)
                if (!cluster.isWorker || cluster.worker.id === 1) {
                    schedulePointsDecay();
                }
            });
            initWebSocketServer(serverInstance);
        }).catch(err => {
            console.error('Schema initialization failed:', err);
            process.exit(1);
        });
    }).catch(err => {
        console.error('PostgreSQL connection failed:', err);
        process.exit(1);
    });
}