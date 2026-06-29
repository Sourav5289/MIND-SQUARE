const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { Pool } = require('pg');
require('dotenv').config();

const app = express();
// OWASP A05: Disable X-Powered-By to prevent technology fingerprinting
app.disable('x-powered-by');
// Remove the 'Server' header that leaks Node.js/Express version information
app.use((req, res, next) => { res.removeHeader('Server'); next(); });
const PORT = process.env.PORT || 3000;

// Trust proxies (Harden IP resolving against header spoofing behind load balancers/proxies)
app.set('trust proxy', true);

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

// Retrieve Zoom Meeting URL from env. Fail-closed: empty string if not set (no fake placeholder).
const ZOOM_MEETING_URL = process.env.ZOOM_MEETING_URL || "";

// Google OAuth 2.0 Client ID for Sign in with Google (configured in Google Cloud Console)
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';

function buildContentSecurityPolicy() {
    return [
        "default-src 'self'",
        "script-src 'self' https://accounts.google.com https://accounts.google.com/gsi/client",
        "script-src-attr 'unsafe-inline'",
        "style-src 'self' 'unsafe-inline' https://accounts.google.com/gsi/style",
        "style-src-elem 'self' 'unsafe-inline' https://accounts.google.com/gsi/style",
        "style-src-attr 'unsafe-inline'",
        "font-src 'self'",
        "img-src 'self' data: https://api.dicebear.com https://images.unsplash.com https://lh3.googleusercontent.com https://*.googleusercontent.com https://*.dicebear.com",
        "connect-src 'self' https://accounts.google.com https://accounts.google.com/gsi/",
        "frame-src 'self' https://accounts.google.com https://accounts.google.com/gsi/",
        "frame-ancestors 'none'",
        "form-action 'self'",
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
    res.setHeader('Content-Security-Policy', buildContentSecurityPolicy());
    res.removeHeader('Server');
    res.removeHeader('X-Powered-By');
}

// Rate limiting state storage (IP/User-based maps)
const rateLimitStores = {
    general: new Map(),
    auth: new Map()
};

// Periodic pruning of expired rate-limit records (every 1 minute)
setInterval(() => {
    const now = Date.now();
    for (const storeType of ['general', 'auth']) {
        const store = rateLimitStores[storeType];
        for (const [key, data] of store.entries()) {
            if (now > data.resetTime) {
                store.delete(key);
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
    return (req, res, next) => {
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
        // SECURITY: Removed X-Caller-Id composite key (header was untrusted).

        const now = Date.now();
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

        res.setHeader('X-RateLimit-Limit', max);
        res.setHeader('X-RateLimit-Remaining', Math.max(0, max - clientData.count));
        res.setHeader('X-RateLimit-Reset', new Date(clientData.resetTime).toISOString());

        if (clientData.count > max) {
            logSecurityEvent('WARN', 'RATE_LIMIT_EXCEEDED', req, { storeType, count: clientData.count, max, rateLimitKey: key });
            return res.status(429).json({
                error: 'Too many requests. Please try again later.',
                retryAfter: Math.round((clientData.resetTime - now) / 1000)
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
    email: { type: 'string', required: true, maxLength: 254, pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/ },
    name: { type: 'string', required: true, maxLength: 100 },
    avatar: { type: 'string', required: false, maxLength: 2000 }
};

const UPDATE_NAME_SCHEMA = {
    name: { type: 'string', required: true, maxLength: 100 }
};

const UPDATE_AVATAR_SCHEMA = {
    avatar: { type: 'string', required: true, maxLength: 2000 }
};

const UPDATE_DOB_SCHEMA = {
    dob: { type: 'string', required: true, maxLength: 20, pattern: /^\d{4}-\d{2}-\d{2}$/ }
};

const ATTENDANCE_LOG_SCHEMA = {
    date: { type: 'string', required: true, maxLength: 20, pattern: /^\d{4}-\d{2}-\d{2}$/ }
};

const UPDATE_STATS_SCHEMA = {
    points: { type: 'number', required: true, min: 0, max: 1000000 },
    gamesPlayed: { type: 'number', required: true, min: 0, max: 100000 },
    winCount: { type: 'number', required: true, min: 0, max: 100000 },
    badges: { type: 'array', required: true },
    solvedPuzzles: { type: 'array', required: true }
};

const TEACHER_EDIT_POINTS_SCHEMA = {
    points: { type: 'number', required: true, min: 0, max: 1000000 }
};

const ADD_BADGE_SCHEMA = {
    badgeId: { type: 'string', required: true, maxLength: 50 }
};

const ASSIGN_HOMEWORK_SCHEMA = {
    studentId: { type: 'string', required: true, maxLength: 50 },
    puzzleId: { type: 'string', required: true, maxLength: 50 }
};

const ASSIGN_HOMEWORK_ALL_SCHEMA = {
    puzzleId: { type: 'string', required: true, maxLength: 50 }
};

const COACHING_NOTES_SCHEMA = {
    notes: { type: 'string', required: true, maxLength: 5000 }
};

const UPDATE_SCHEDULE_SCHEMA = {
    day: { type: 'string', required: true, maxLength: 20 },
    time: { type: 'string', required: true, maxLength: 20 },
    hour: { type: 'number', required: true, min: 0, max: 23 },
    minute: { type: 'number', required: true, min: 0, max: 59 },
    level: { type: 'string', required: true, maxLength: 50 },
    students: { type: 'array', required: true },
    link: { type: 'string', required: true, maxLength: 2000 }
};

// Configure secure CORS policies.
// In production, set ALLOWED_ORIGINS env var (comma-separated). Localhost is dev-only.
const envOrigins = (process.env.ALLOWED_ORIGINS || '')
    .split(',').map(o => o.trim()).filter(Boolean);
const devOrigins = process.env.NODE_ENV === 'production'
    ? []
    : ['http://localhost:3000', 'http://localhost:5000', 'http://127.0.0.1:3000', 'http://127.0.0.1:5000'];
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

const BINARY_STATIC_EXTENSIONS = new Set(['.woff2', '.woff', '.png', '.jpg', '.jpeg', '.gif', '.svg']);
const BINARY_MIME_TYPES = {
    '.woff2': 'font/woff2',
    '.woff': 'font/woff',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml'
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
    const allowedExtensions = ['.html', '.js', '.css', '.woff2', '.woff', '.png', '.jpg', '.jpeg', '.gif', '.svg'];

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

// Configured Teacher Emails (10 specific emails)
const TEACHER_EMAILS = [
    's41026143@gmail.com',
    'teacher2@mindsquare.com',
    'teacher3@mindsquare.com',
    'teacher4@mindsquare.com',
    'teacher5@mindsquare.com',
    'teacher6@mindsquare.com',
    'teacher7@mindsquare.com',
    'teacher8@mindsquare.com',
    'teacher9@mindsquare.com',
    'teacher10@mindsquare.com'
];

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

// ─── In-Memory Cache ────────────────────────────────────────────────────────
// A lightweight TTL cache so the two most-read endpoints (student list &
// analytics) don't hit the DB on every request. Each entry expires after its
// TTL (ms) and is evicted lazily on the next read.
const cache = {
    _store: new Map(),
    get(key) {
        const entry = this._store.get(key);
        if (!entry) return null;
        if (Date.now() > entry.expiresAt) {
            this._store.delete(key);
            return null;
        }
        return entry.value;
    },
    set(key, value, ttlMs) {
        this._store.set(key, { value, expiresAt: Date.now() + ttlMs });
    },
    del(key) {
        this._store.delete(key);
    },
    // Invalidate a group of keys by prefix (e.g. 'students' clears all student caches)
    invalidatePrefix(prefix) {
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
        cache.invalidatePrefix('students');
        cache.del('analytics:overview');
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
        cache.invalidatePrefix('students');
        cache.del('analytics:overview');
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
        CREATE TABLE IF NOT EXISTS attendance_history (
            student_id VARCHAR(50),
            date       VARCHAR(20),
            PRIMARY KEY (student_id, date),
            FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
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
            PRIMARY KEY (student_id, puzzle_id),
            FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
        )
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

    // Seed Class Schedules if table is empty
    const scheduleCount = await executeQuery('SELECT COUNT(*) as count FROM class_schedules');
    if (parseInt(scheduleCount[0]?.count || 0) === 0) {
        const defaultSchedules = [
            { id: "SCH-001", day: "Tuesday", time: "7:15 PM", hour: 19, minute: 15, level: "Super Intermediate", students: ["Anay", "Avyukth", "Aarnav Ramesh", "Vishrija", "Ananya", "Neeketchar", "Shourya Vihaan", "Shiv Rishitha"], link: ZOOM_MEETING_URL },
            { id: "SCH-002", day: "Tuesday", time: "9:00 PM", hour: 21, minute: 0, level: "Basic Beginner", students: ["Agastya (1-2-1) USA"], link: ZOOM_MEETING_URL },
            { id: "SCH-003", day: "Wednesday", time: "7:15 PM", hour: 19, minute: 15, level: "Advanced", students: ["Suraj R Nair", "Alphonse", "Vihaan Choudhary", "Nived", "Darshan V S", "Nirupam", "Rudransh", "Rohan Krishna"], link: ZOOM_MEETING_URL },
            { id: "SCH-004", day: "Thursday", time: "5:45 PM", hour: 17, minute: 45, level: "Super Intermediate", students: ["Anay", "Avyukth", "Aarnav Ramesh", "Urjit", "Ananya", "Shourya Vihaan"], link: ZOOM_MEETING_URL },
            { id: "SCH-005", day: "Thursday", time: "7:45 PM", hour: 19, minute: 45, level: "Intermediate", students: ["Manas", "Ayaansh Jangale", "Taashi", "Advika", "Ananthashayan", "Ruhika", "Krishnav", "Abhiram"], link: ZOOM_MEETING_URL },
            { id: "SCH-006", day: "Thursday", time: "9:00 PM", hour: 21, minute: 0, level: "Intermediate", students: ["Nitaant (1-2-1) Germany"], link: ZOOM_MEETING_URL },
            { id: "SCH-007", day: "Friday", time: "5:45 PM", hour: 17, minute: 45, level: "Advanced", students: ["Suraj R Nair", "Alphonse", "Vihaan Choudhary", "Nived", "Darshan V S", "Nirupam", "Rudransh", "Rohan Krishna"], link: ZOOM_MEETING_URL },
            { id: "SCH-008", day: "Saturday", time: "7:15 AM", hour: 7, minute: 15, level: "Intermediate - TX", students: ["Vedaang", "Sai Rishik", "Bhavesh", "Shlok Upponni", "Shiv Rishitha"], link: ZOOM_MEETING_URL },
            { id: "SCH-009", day: "Saturday", time: "10:00 AM", hour: 10, minute: 0, level: "Beginner", students: ["Nyra", "Hayaan", "Aadhin"], link: ZOOM_MEETING_URL },
            { id: "SCH-010", day: "Saturday", time: "3:00 PM", hour: 15, minute: 0, level: "Basic Beginner", students: ["Ira (1-2-1) Australia"], link: ZOOM_MEETING_URL },
            { id: "SCH-011", day: "Saturday", time: "5:00 PM", hour: 17, minute: 0, level: "Advanced", students: ["Rishik"], link: ZOOM_MEETING_URL },
            { id: "SCH-012", day: "Saturday", time: "7:15 PM", hour: 19, minute: 15, level: "Intermediate", students: ["Sanskriti Sarma", "Nitaant Sudhir", "Anvika Singhal", "Saatvik", "Amarashi", "Mandinu", "Ayaansh Gupta", "Achyuth"], link: ZOOM_MEETING_URL },
            { id: "SCH-013", day: "Sunday", time: "10:00 AM", hour: 10, minute: 0, level: "Beginner", students: ["Hayaan", "Aadhin"], link: ZOOM_MEETING_URL },
            { id: "SCH-014", day: "Sunday", time: "5:30 PM", hour: 17, minute: 30, level: "Intermediate", students: ["Manas", "Ayaansh Jangale", "Taashi", "Advika", "Ananthashayan", "Ruhika", "Krishnav"], link: ZOOM_MEETING_URL },
            { id: "SCH-015", day: "Sunday", time: "7:00 PM", hour: 19, minute: 0, level: "Intermediate", students: ["Sanskriti Sarma", "Nitaant Sudhir", "Anvika Singhal", "Saatvik", "Amarashi", "Mandinu", "Ayaansh Gupta", "Achyuth", "Urjit"], link: ZOOM_MEETING_URL },
            { id: "SCH-016", day: "Saturday", time: "9:00 PM", hour: 21, minute: 0, level: "Basic Beginner", students: ["Anvay (1-2-1) Canada"], link: ZOOM_MEETING_URL }
        ];
        for (const s of defaultSchedules) {
            await executeQuery(
                'INSERT INTO class_schedules (id, day, time, hour, minute, level, students, link) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                [s.id, s.day, s.time, s.hour, s.minute, s.level, s.students, s.link]
            );
        }
        console.log('Seeded 16 class schedules into class_schedules table.');
    }

    // 2. Performance indexes for JOIN columns and email lookup (idempotent)
    await executeQuery('CREATE INDEX IF NOT EXISTS idx_student_badges_sid    ON student_badges(student_id)');
    await executeQuery('CREATE INDEX IF NOT EXISTS idx_attendance_history_sid ON attendance_history(student_id)');
    await executeQuery('CREATE INDEX IF NOT EXISTS idx_student_puzzles_sid   ON student_puzzles(student_id)');
    await executeQuery('CREATE INDEX IF NOT EXISTS idx_students_lower_email  ON students(LOWER(email))');

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
            badges: s.badges ?? ['Beginner'],
            attendance: s.attendance ?? []
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
                if (s.attendance.length > 0) {
                    await executeClientQuery(
                        seedClient,
                        'INSERT INTO attendance_history (student_id, date) SELECT ?, unnest(?::text[])',
                        [s.id, s.attendance]
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
    const attendanceHistory = row.attendance_history || [];
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
        solvedPuzzles: row.solved_puzzles || [],
        coachingNotes: row.coaching_notes || '',
        attendance: {
            attended: attendanceHistory.length,
            total: 20,
            history: attendanceHistory
        }
    };
}

// Public leaderboard shape — no email, DOB, coaching notes, attendance history, or puzzles
function sanitizeStudentPublic(student) {
    return {
        id: student.id,
        name: student.name,
        avatar: student.avatar,
        points: student.points,
        category: student.category,
        gamesPlayed: student.gamesPlayed,
        winCount: student.winCount,
        badges: student.badges || []
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
        COALESCE(array_agg(DISTINCT p.puzzle_id)   FILTER (WHERE p.puzzle_id IS NOT NULL), '{}') AS solved_puzzles,
        COALESCE(array_agg(a.date ORDER BY a.date) FILTER (WHERE a.date      IS NOT NULL), '{}') AS attendance_history
    FROM students s
    LEFT JOIN student_badges     b ON b.student_id = s.id
    LEFT JOIN student_puzzles    p ON p.student_id = s.id
    LEFT JOIN attendance_history a ON a.student_id = s.id
`;
// Perform monthly points decay (decrease points of non-teacher students by 100 for each elapsed month)
async function performMonthlyPointsDecay() {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Retrieve non-teacher profiles to check decay eligibility
        const students = await executeClientQuery(client, `
            SELECT id, points, created_at, COALESCE(last_decay_date, created_at) as last_decay
            FROM students 
            WHERE role != 'teacher'
        `);

        const now = new Date();
        for (const s of students) {
            const lastDecay = s.last_decay ? new Date(s.last_decay) : new Date(s.created_at);
            const diffMs = now.getTime() - lastDecay.getTime();
            // 30 days = 30 * 24 * 60 * 60 * 1000 ms
            const elapsedMonths = Math.floor(diffMs / (30 * 24 * 60 * 60 * 1000));

            if (elapsedMonths > 0) {
                let newPoints = s.points - (100 * elapsedMonths);
                if (newPoints < 0) newPoints = 0;

                // Determine category tier
                let category = 'Beginner';
                if (newPoints >= 10000) category = 'Grandmaster';
                else if (newPoints >= 5000) category = 'Super Advanced';
                else if (newPoints >= 3500) category = 'Advanced';
                else if (newPoints >= 2500) category = 'Super Intermediate';
                else if (newPoints >= 1500) category = 'Intermediate';

                // Calculate new last_decay_date boundary
                const newDecayTime = lastDecay.getTime() + (elapsedMonths * 30 * 24 * 60 * 60 * 1000);
                const newDecayDate = new Date(newDecayTime);

                await executeClientQuery(client, `
                    UPDATE students 
                    SET points = ?, category = ?, last_decay_date = ?
                    WHERE id = ?
                `, [newPoints, category, newDecayDate, s.id]);

                // Delete milestone badges if points decay below corresponding levels
                if (newPoints < 10000) {
                    await executeClientQuery(client, "DELETE FROM student_badges WHERE student_id = ? AND badge_id = 'Grandmaster'", [s.id]);
                }
                if (newPoints < 5000) {
                    await executeClientQuery(client, "DELETE FROM student_badges WHERE student_id = ? AND badge_id = 'Super Advanced'", [s.id]);
                }
                if (newPoints < 3500) {
                    await executeClientQuery(client, "DELETE FROM student_badges WHERE student_id = ? AND badge_id = 'Advanced'", [s.id]);
                }
                if (newPoints < 2500) {
                    await executeClientQuery(client, "DELETE FROM student_badges WHERE student_id = ? AND badge_id = 'Super Intermediate'", [s.id]);
                }
                if (newPoints < 1500) {
                    await executeClientQuery(client, "DELETE FROM student_badges WHERE student_id = ? AND badge_id = 'Intermediate'", [s.id]);
                }

                console.log(`Monthly ELO Decay: Student ${s.id} reduced from ${s.points} to ${newPoints} points (${elapsedMonths} month(s) elapsed)`);
            }
        }
        await client.query('COMMIT');
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Failed to perform monthly points decay:', err);
    } finally {
        client.release();
    }
}

const STUDENT_GROUP_BY = 'GROUP BY s.id, s.name, s.email, s.avatar, s.points, s.category, s.games_played, s.win_count, s.dob, s.last_birthday_reward_year, s.role, s.coaching_notes';

// Load all students — 1 DB round-trip via aggregated JOIN query
async function getStudentsDetailedList() {
    const cached = cache.get('students:list');
    if (cached) return cached;
    const rows = await executeQuery(`${STUDENT_SELECT_SQL} ${STUDENT_GROUP_BY} ORDER BY s.points DESC`);
    const result = rows.map(mapStudentRow);
    cache.set('students:list', result, CACHE_TTL_STUDENTS);
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
    res.json({ googleClientId: GOOGLE_CLIENT_ID });
});

// Get all students (Leaderboard)
app.get('/api/students', async (req, res) => {
    try {
        await performMonthlyPointsDecay();
        const students = await getStudentsDetailedList();

        // Filter out teachers so they do not appear in any leaderboard datasets
        const nonTeacherStudents = students.filter(student => student.role !== 'teacher');

        // Check if caller is teacher to decide whether to include emails.
        // Prefer HttpOnly cookie (ms_session_v2) — consistent with cookie-based auth migration.
        let isTeacher = false;
        let token = req.cookies?.ms_session_v2 || null;
        if (!token) {
            const authHeader = req.headers['authorization'];
            if (authHeader && authHeader.startsWith('Bearer ')) {
                token = authHeader.substring(7);
            }
        }
        if (token) {
            const decoded = verifySessionToken(token);
            if (decoded && decoded.role === 'teacher') {
                isTeacher = true;
            }
        }
        // SECURITY: Removed X-Caller-Id teacher detection (was leaking PII to anyone setting the header).

        // Teachers receive full profiles; everyone else gets public leaderboard fields only
        const sanitizedStudents = nonTeacherStudents.map(student =>
            isTeacher ? student : sanitizeStudentPublic(student)
        );
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
        res.json(profile);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to retrieve profile' });
    }
});

// Login / Register Google or Mock profile
app.post('/api/students/login', dbAuthRateLimiter, validateBodySchema(LOGIN_SCHEMA), async (req, res) => {
    const { email, name, avatar } = req.body;

    // Process points decay before login check
    await performMonthlyPointsDecay();

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Exclusively lock the table to ensure we do not hit race conditions when counting and creating studentIds
        await client.query('LOCK TABLE students IN SHARE ROW EXCLUSIVE MODE');

        // Check if student already exists
        const rows = await executeClientQuery(client, 'SELECT id FROM students WHERE LOWER(email) = LOWER(?)', [email]);

        // Teacher role removed from the product — every account is a student.
        const role = 'student';

        let studentId;
        if (rows.length > 0) {
            studentId = rows[0].id;
            // Update role on login to stay in sync with configuration changes
            await executeClientQuery(client, 'UPDATE students SET role = ? WHERE id = ?', [role, studentId]);
        } else {
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

        // Set secure cookies
        const isProd = process.env.NODE_ENV === 'production';
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
        const isProd = process.env.NODE_ENV === 'production';
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
app.post('/api/auth/logout', async (req, res) => {
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
    if (req.user.role !== 'teacher' && req.user.id !== id) {
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
    if (req.user.role !== 'teacher' && req.user.id !== id) {
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
    if (req.user.role !== 'teacher' && req.user.id !== id) {
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

// Register attendance for today
app.post('/api/students/:id/attendance', authenticate, validateBodySchema(ATTENDANCE_LOG_SCHEMA), async (req, res) => {
    const { id } = req.params;
    const { date } = req.body; // YYYY-MM-DD
    if (req.user.role !== 'teacher' && req.user.id !== id) {
        return res.status(403).json({ error: 'Forbidden: You cannot modify other student profiles' });
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await executeClientQuery(
            client,
            'INSERT INTO attendance_history (student_id, date) VALUES (?, ?) ON CONFLICT(student_id, date) DO NOTHING',
            [id, date]
        );
        await client.query('COMMIT');

        const profile = await getStudentById(id);
        res.json(profile);
    } catch (err) {
        await client.query('ROLLBACK');
        console.error(err);
        res.status(500).json({ error: 'Failed to log attendance' });
    } finally {
        client.release();
    }
});

// Update points, category, badges, gameplay statistics & solved puzzles
app.post('/api/students/:id/stats', authenticate, validateBodySchema(UPDATE_STATS_SCHEMA), async (req, res) => {
    const { id } = req.params;
    if (req.user.id !== id && req.user.role !== 'teacher') {
        return res.status(403).json({ error: 'Forbidden: You cannot modify another student\'s statistics' });
    }
    const { points, gamesPlayed, winCount, badges, solvedPuzzles } = req.body;

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

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
    if (req.user.id !== id && req.user.role !== 'teacher') {
        return res.status(403).json({ error: 'Forbidden: You cannot update another student\'s Date of Birth' });
    }
    const { dob } = req.body;

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Lock the row to prevent updates during verification
        await executeClientQuery(client, 'SELECT points, last_birthday_reward_year FROM students WHERE id = ? FOR UPDATE', [id]);

        // Update DOB
        await executeClientQuery(client, 'UPDATE students SET dob = ? WHERE id = ?', [dob, id]);

        // Fetch current points and reward status
        const rows = await executeClientQuery(client, 'SELECT points, last_birthday_reward_year FROM students WHERE id = ?', [id]);
        const student = rows[0];
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

// Check and apply annual birthday reward (points)
app.post('/api/students/:id/check-birthday', authenticate, async (req, res) => {
    const { id } = req.params;
    if (req.user.id !== id && req.user.role !== 'teacher') {
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

// Middleware: teacher role removed.
// All /api/teachers/* endpoints now return 410 Gone (deprecated and intentionally disabled).
async function checkIsTeacher(req, res, next) {
    return res.status(410).json({ error: 'Teacher functionality has been removed from this product.' });
}

// Teacher endpoint: Award or adjust points of any student
app.put('/api/teachers/students/:id/points', checkIsTeacher, validateBodySchema(TEACHER_EDIT_POINTS_SCHEMA), async (req, res) => {
    const { id } = req.params;
    const { points } = req.body;
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Determine category based on points
        let category = 'Beginner';
        if (points >= 10000) {
            category = 'Grandmaster';
        } else if (points >= 5000) {
            category = 'Super Advanced';
        } else if (points >= 3500) {
            category = 'Advanced';
        } else if (points >= 2500) {
            category = 'Super Intermediate';
        } else if (points >= 1500) {
            category = 'Intermediate';
        }

        await executeClientQuery(client, 'UPDATE students SET points = ?, category = ? WHERE id = ?', [points, category, id]);

        // Insert badges dynamically corresponding to milestone levels
        if (points >= 1500) {
            await executeClientQuery(client, 'INSERT INTO student_badges (student_id, badge_id) VALUES (?, ?) ON CONFLICT (student_id, badge_id) DO NOTHING', [id, 'Intermediate']);
        }
        if (points >= 2500) {
            await executeClientQuery(client, 'INSERT INTO student_badges (student_id, badge_id) VALUES (?, ?) ON CONFLICT (student_id, badge_id) DO NOTHING', [id, 'Super Intermediate']);
        }
        if (points >= 3500) {
            await executeClientQuery(client, 'INSERT INTO student_badges (student_id, badge_id) VALUES (?, ?) ON CONFLICT (student_id, badge_id) DO NOTHING', [id, 'Advanced']);
        }
        if (points >= 5000) {
            await executeClientQuery(client, 'INSERT INTO student_badges (student_id, badge_id) VALUES (?, ?) ON CONFLICT (student_id, badge_id) DO NOTHING', [id, 'Super Advanced']);
        }
        if (points >= 10000) {
            await executeClientQuery(client, 'INSERT INTO student_badges (student_id, badge_id) VALUES (?, ?) ON CONFLICT (student_id, badge_id) DO NOTHING', [id, 'Grandmaster']);
        }

        await logAuditTrail(client, req.user.id, 'AWARD_POINTS', id, `Updated student points to ${points}`);

        await client.query('COMMIT');

        const profile = await getStudentById(id);
        res.json(profile);
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Failed to update student points:', err);
        res.status(500).json({ error: 'Failed to update student points' });
    } finally {
        client.release();
    }
});

// Teacher endpoint: Grant a badge to a student
app.post('/api/teachers/students/:id/badges', checkIsTeacher, validateBodySchema(ADD_BADGE_SCHEMA), async (req, res) => {
    const { id } = req.params;
    const { badgeId } = req.body;
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await executeClientQuery(
            client,
            'INSERT INTO student_badges (student_id, badge_id) VALUES (?, ?) ON CONFLICT (student_id, badge_id) DO NOTHING',
            [id, badgeId]
        );
        await logAuditTrail(client, req.user.id, 'GRANT_BADGE', id, `Granted badge: ${badgeId}`);
        await client.query('COMMIT');

        const profile = await getStudentById(id);
        res.json(profile);
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Failed to add badge to student:', err);
        res.status(500).json({ error: 'Failed to add badge to student' });
    } finally {
        client.release();
    }
});

// Teacher endpoint: Revoke a badge from a student
app.delete('/api/teachers/students/:id/badges/:badgeId', checkIsTeacher, async (req, res) => {
    const { id, badgeId } = req.params;
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await executeClientQuery(
            client,
            'DELETE FROM student_badges WHERE student_id = ? AND badge_id = ?',
            [id, badgeId]
        );
        await logAuditTrail(client, req.user.id, 'REVOKE_BADGE', id, `Revoked badge: ${badgeId}`);
        await client.query('COMMIT');

        const profile = await getStudentById(id);
        res.json(profile);
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Failed to delete badge from student:', err);
        res.status(500).json({ error: 'Failed to delete badge from student' });
    } finally {
        client.release();
    }
});

// ==============================================
// TEACHER SUITE: NEW ENDPOINTS
// ==============================================

// 1. HOMEWORK ASSIGNMENTS
// Assign homework to a single student
app.post('/api/teachers/homework', checkIsTeacher, validateBodySchema(ASSIGN_HOMEWORK_SCHEMA), async (req, res) => {
    const { studentId, puzzleId } = req.body;

    // Guard: refuse to assign homework to a teacher account
    try {
        const target = await getStudentById(studentId);
        if (target) {
            const teacherEmailsLower = TEACHER_EMAILS.map(e => e.toLowerCase());
            const isTeacherRole = target.role === 'teacher';
            const isTeacherEmail = target.email && teacherEmailsLower.includes(target.email.toLowerCase());
            if (isTeacherRole || isTeacherEmail) {
                return res.status(400).json({ error: 'Cannot assign homework to a teacher account' });
            }
        }
    } catch (guardErr) {
        console.error('Teacher guard check failed:', guardErr);
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await executeClientQuery(
            client,
            'INSERT INTO homework_assignments (student_id, puzzle_id) VALUES (?, ?)',
            [studentId, puzzleId]
        );
        await logAuditTrail(client, req.user.id, 'ASSIGN_HOMEWORK', studentId, `Assigned homework puzzle ${puzzleId}`);
        await client.query('COMMIT');

        // Fetch updated homework list for the student
        const homework = await executeQuery(
            'SELECT * FROM homework_assignments WHERE student_id = ? ORDER BY assigned_at DESC',
            [studentId]
        );
        res.json({ homework: homework.map(mapHomeworkRow) });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Failed to assign homework:', err);
        res.status(500).json({ error: 'Failed to assign homework' });
    } finally {
        client.release();
    }
});

// Assign homework to ALL non-teacher students at once
app.post('/api/teachers/homework/all', checkIsTeacher, validateBodySchema(ASSIGN_HOMEWORK_ALL_SCHEMA), async (req, res) => {
    const { puzzleId } = req.body;

    const client = await pool.connect();
    try {
        // Fetch all students, then filter server-side:
        // Exclude rows with role='teacher' AND exclude any email in TEACHER_EMAILS list
        // (double-filtered so teachers who haven't re-logged in are also skipped)
        const allRows = await executeQuery("SELECT id, email, role FROM students");

        const teacherEmailsLower = TEACHER_EMAILS.map(e => e.toLowerCase());

        const studentRows = (allRows || []).filter(row => {
            const isTeacherRole = row.role === 'teacher';
            const isTeacherEmail = row.email && teacherEmailsLower.includes(row.email.toLowerCase());
            return !isTeacherRole && !isTeacherEmail;
        });

        if (studentRows.length === 0) {
            return res.status(404).json({ error: 'No students found to assign homework to' });
        }

        await client.query('BEGIN');
        let assignedCount = 0;
        for (const row of studentRows) {
            try {
                await executeClientQuery(
                    client,
                    'INSERT INTO homework_assignments (student_id, puzzle_id) VALUES (?, ?) ON CONFLICT DO NOTHING',
                    [row.id, puzzleId]
                );
                assignedCount++;
            } catch (e) {
                // Skip if student already has this puzzle assigned — keep going
                console.warn(`Skipping duplicate for student ${row.id}:`, e.message);
            }
        }
        await logAuditTrail(client, req.user.id, 'ASSIGN_HOMEWORK_ALL', 'ALL', `Bulk assigned homework puzzle ${puzzleId} to ${assignedCount} students`);
        await client.query('COMMIT');

        res.json({
            success: true,
            assignedCount,
            totalStudents: studentRows.length,
            puzzleId
        });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Failed to bulk-assign homework:', err);
        res.status(500).json({ error: 'Failed to assign homework to all students' });
    } finally {
        client.release();
    }
});



// Get student homework
app.get('/api/students/:id/homework', authenticate, async (req, res) => {
    const { id } = req.params;
    if (req.user.id !== id && req.user.role !== 'teacher') {
        return res.status(403).json({ error: 'Forbidden: You cannot access another student\'s homework' });
    }
    try {
        const homework = await executeQuery(
            'SELECT * FROM homework_assignments WHERE student_id = ? ORDER BY assigned_at DESC',
            [id]
        );
        res.json(homework.map(mapHomeworkRow));
    } catch (err) {
        console.error('Failed to fetch homework:', err);
        res.status(500).json({ error: 'Failed to fetch homework assignments' });
    }
});

// Mark homework as completed
app.put('/api/students/:id/homework/:assignmentId/complete', authenticate, async (req, res) => {
    const { id, assignmentId } = req.params;
    if (req.user.id !== id && req.user.role !== 'teacher') {
        return res.status(403).json({ error: 'Forbidden: You cannot complete another student\'s homework' });
    }
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await executeClientQuery(
            client,
            'UPDATE homework_assignments SET completed = true, completed_at = CURRENT_TIMESTAMP WHERE student_id = ? AND id = ?',
            [id, assignmentId]
        );
        await client.query('COMMIT');
        res.json({ success: true });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Failed to complete homework:', err);
        res.status(500).json({ error: 'Failed to complete homework assignment' });
    } finally {
        client.release();
    }
});

// 2. PRIVATE COACHING FEEDBACK NOTES
app.put('/api/teachers/students/:id/coaching-notes', checkIsTeacher, validateBodySchema(COACHING_NOTES_SCHEMA), async (req, res) => {
    const { id } = req.params;
    const { notes } = req.body;
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await executeClientQuery(
            client,
            'UPDATE students SET coaching_notes = ? WHERE id = ?',
            [notes, id]
        );
        await logAuditTrail(client, req.user.id, 'UPDATE_COACHING_NOTES', id, 'Updated student coaching notes');
        await client.query('COMMIT');

        const profile = await getStudentById(id);
        res.json(profile);
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Failed to update coaching notes:', err);
        res.status(500).json({ error: 'Failed to update coaching feedback notes' });
    } finally {
        client.release();
    }
});

// 3. ATTENDANCE MANAGER (MANUAL LOGGING)
// Add attendance record date
app.post('/api/teachers/students/:id/attendance', checkIsTeacher, validateBodySchema(ATTENDANCE_LOG_SCHEMA), async (req, res) => {
    const { id } = req.params;
    const { date } = req.body;
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await executeClientQuery(
            client,
            'INSERT INTO attendance_history (student_id, date) VALUES (?, ?) ON CONFLICT (student_id, date) DO NOTHING',
            [id, date]
        );
        await logAuditTrail(client, req.user.id, 'ADD_ATTENDANCE', id, `Added attendance record for ${date}`);
        await client.query('COMMIT');

        const profile = await getStudentById(id);
        res.json(profile);
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Failed to manually log attendance:', err);
        res.status(500).json({ error: 'Failed to log manual attendance entry' });
    } finally {
        client.release();
    }
});

// Delete attendance record date
app.delete('/api/teachers/students/:id/attendance/:date', checkIsTeacher, async (req, res) => {
    const { id, date } = req.params;
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return res.status(400).json({ error: 'Invalid date format (YYYY-MM-DD)' });
    }
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await executeClientQuery(
            client,
            'DELETE FROM attendance_history WHERE student_id = ? AND date = ?',
            [id, date]
        );
        await logAuditTrail(client, req.user.id, 'DELETE_ATTENDANCE', id, `Deleted attendance record for ${date}`);
        await client.query('COMMIT');

        const profile = await getStudentById(id);
        res.json(profile);
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Failed to delete attendance record:', err);
        res.status(500).json({ error: 'Failed to delete attendance log date' });
    } finally {
        client.release();
    }
});

// 4. DYNAMIC CLASS SCHEDULES
// Get schedules
app.get('/api/schedules', async (req, res) => {
    try {
        // Determine if requester is authenticated. Prefer cookie, fall back to Bearer token.
        // Authenticated users receive full schedules (student list + Zoom link).
        // Unauthenticated guests receive sanitized schedules — student names and meeting
        // credentials stripped to prevent public exposure of student PII and Zoom passwords.
        let isAuthenticated = false;
        let token = req.cookies?.ms_session_v2 || null;
        if (!token) {
            const authHeader = req.headers['authorization'];
            if (authHeader && authHeader.startsWith('Bearer ')) token = authHeader.substring(7);
        }
        if (token && verifySessionToken(token)) {
            isAuthenticated = true;
        } else if (req.headers['x-caller-id']) {
            const caller = await getStudentById(req.headers['x-caller-id']);
            if (caller) isAuthenticated = true;
        }

        const schedules = await executeQuery('SELECT * FROM class_schedules ORDER BY day, time');

        if (isAuthenticated) {
            return res.json(schedules);
        }

        // Guest-safe view: omit Zoom credentials but keep enrolled student names
        const sanitized = schedules.map(s => ({
            id: s.id,
            day: s.day,
            time: s.time,
            hour: s.hour,
            minute: s.minute,
            level: s.level,
            students: s.students, // Expose enrolled students publically
            link: null,          // Zoom link hidden until authenticated
        }));
        res.json(sanitized);
    } catch (err) {
        console.error('Failed to fetch class schedules:', err);
        res.status(500).json({ error: 'Failed to retrieve class schedules' });
    }
});

// Update schedule details
app.put('/api/teachers/schedules/:id', checkIsTeacher, validateBodySchema(UPDATE_SCHEDULE_SCHEMA), async (req, res) => {
    const { id } = req.params;
    const { day, time, hour, minute, level, students, link } = req.body;

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await executeClientQuery(
            client,
            'UPDATE class_schedules SET day = ?, time = ?, hour = ?, minute = ?, level = ?, students = ?, link = ? WHERE id = ?',
            [day, time, hour, minute, level, students || [], link, id]
        );
        await logAuditTrail(client, req.user.id, 'UPDATE_SCHEDULE', id, `Updated class schedule for ${day} ${time} (Level: ${level})`);
        await client.query('COMMIT');

        const updatedSchedules = await executeQuery('SELECT * FROM class_schedules ORDER BY day, time');
        res.json(updatedSchedules);
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Failed to update class schedule:', err);
        res.status(500).json({ error: 'Failed to update class schedule' });
    } finally {
        client.release();
    }
});

// 5. ACADEMY ANALYTICS OVERVIEW
app.get('/api/teachers/analytics', checkIsTeacher, async (req, res) => {
    try {
        // Serve from cache when available — analytics is expensive (5 parallel queries)
        const cached = cache.get('analytics:overview');
        if (cached) return res.json(cached);

        const [studentCountRows, avgRatingRows, homeworkCountRows, puzzleSolvedRows, badgeRows] = await Promise.all([
            executeQuery("SELECT COUNT(*) as count FROM students WHERE role != 'teacher'"),
            executeQuery("SELECT AVG(points) as avg FROM students WHERE role != 'teacher'"),
            executeQuery("SELECT COUNT(*) as count FROM homework_assignments WHERE completed = false"),
            executeQuery("SELECT COUNT(*) as count FROM student_puzzles"),
            executeQuery(`
                SELECT badge_id, COUNT(*) as count 
                FROM student_badges 
                WHERE student_id IN (SELECT id FROM students WHERE role != 'teacher')
                GROUP BY badge_id
            `)
        ]);

        const totalStudents = parseInt(studentCountRows[0]?.count || 0);
        const averageRating = Math.round(parseFloat(avgRatingRows[0]?.avg || 0));
        const activeHomeworkCount = parseInt(homeworkCountRows[0]?.count || 0);
        const totalPuzzlesSolved = parseInt(puzzleSolvedRows[0]?.count || 0);

        const badgeDistribution = {};
        badgeRows.forEach(row => {
            badgeDistribution[row.badge_id] = parseInt(row.count);
        });

        const payload = {
            totalStudents,
            averageRating,
            activeHomeworkCount,
            totalPuzzlesSolved,
            badgeDistribution
        };
        cache.set('analytics:overview', payload, CACHE_TTL_ANALYTICS);
        res.json(payload);
    } catch (err) {
        console.error('Failed to fetch analytics:', err);
        res.status(500).json({ error: 'Failed to load analytics summaries' });
    }
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

// Boot the server
initDatabaseConnection().then(() => {
    setupDatabaseSchema().then(() => {
        app.listen(PORT, () => {
            console.log(`Server is running on port ${PORT}`);
        });
    }).catch(err => {
        console.error('Schema initialization failed:', err);
        process.exit(1);
    });
}).catch(err => {
    console.error('PostgreSQL connection failed:', err);
    process.exit(1);
});