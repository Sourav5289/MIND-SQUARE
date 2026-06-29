// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  Rose Three — isLoading state + fetch interceptor
//  Pattern mirrors React's: const [isLoading, setIsLoading] = useState(false)
//  setIsLoading(true) before fetch → setIsLoading(false) in finally block
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
(function () {
    // ── State ────────────────────────────────────────────────────────────
    let isLoading = false;
    let _loadingCounter = 0;          // tracks concurrent in-flight requests
    let _roseRafId = null;
    let _roseStartedAt = null;

    // ── Rose Three animation config ──────────────────────────────────────
    const _roseConfig = {
        particleCount: 76,
        trailSpan: 0.31,
        durationMs: 5300,
        rotationDurationMs: 28000,
        pulseDurationMs: 4400,
        strokeWidth: 4.6,
        roseA: 9.2,
        roseABoost: 0.6,
        roseBreathBase: 0.72,
        roseBreathBoost: 0.28,
        roseScale: 3.25,
    };

    function _rosePoint(progress, detailScale) {
        const t = progress * Math.PI * 2;
        const a = _roseConfig.roseA + detailScale * _roseConfig.roseABoost;
        const r = a * (_roseConfig.roseBreathBase + detailScale * _roseConfig.roseBreathBoost) * Math.cos(3 * t);
        return {
            x: 50 + Math.cos(t) * r * _roseConfig.roseScale,
            y: 50 + Math.sin(t) * r * _roseConfig.roseScale
        };
    }

    function _roseBuildPath(detailScale, steps = 480) {
        return Array.from({ length: steps + 1 }, (_, i) => {
            const p = _rosePoint(i / steps, detailScale);
            return `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`;
        }).join(' ');
    }

    function _roseNorm(p) { return ((p % 1) + 1) % 1; }

    function _roseDetailScale(time) {
        const a = (time % _roseConfig.pulseDurationMs) / _roseConfig.pulseDurationMs * Math.PI * 2;
        return 0.52 + ((Math.sin(a + 0.55) + 1) / 2) * 0.48;
    }

    // ── DOM refs (resolved lazily after DOMContentLoaded) ────────────────
    let _overlay, _group, _pathEl, _particles;

    function _ensureParticles() {
        if (_particles) return;
        _overlay = document.getElementById('rose-loader-overlay');
        _group = document.getElementById('rose-loader-group');
        _pathEl = document.getElementById('rose-loader-path');
        if (!_group || !_pathEl) return;
        const SVG_NS = 'http://www.w3.org/2000/svg';
        _pathEl.setAttribute('stroke-width', String(_roseConfig.strokeWidth));
        _particles = Array.from({ length: _roseConfig.particleCount }, () => {
            const c = document.createElementNS(SVG_NS, 'circle');
            c.setAttribute('fill', 'currentColor');
            _group.appendChild(c);
            return c;
        });
    }

    function _roseRender(now) {
        if (!_roseStartedAt) _roseStartedAt = now;
        const time = now - _roseStartedAt;
        const progress = (time % _roseConfig.durationMs) / _roseConfig.durationMs;
        const ds = _roseDetailScale(time);
        const rotation = -((time % _roseConfig.rotationDurationMs) / _roseConfig.rotationDurationMs) * 360;

        _ensureParticles();
        if (!_pathEl) { _roseRafId = requestAnimationFrame(_roseRender); return; }

        _group.setAttribute('transform', `rotate(${rotation} 50 50)`);
        _pathEl.setAttribute('d', _roseBuildPath(ds));

        _particles.forEach((node, i) => {
            const tailOff = i / (_roseConfig.particleCount - 1);
            const pt = _rosePoint(_roseNorm(progress - tailOff * _roseConfig.trailSpan), ds);
            const fade = Math.pow(1 - tailOff, 0.56);
            node.setAttribute('cx', pt.x.toFixed(2));
            node.setAttribute('cy', pt.y.toFixed(2));
            node.setAttribute('r', (0.9 + fade * 2.7).toFixed(2));
            node.setAttribute('opacity', (0.04 + fade * 0.96).toFixed(3));
        });

        _roseRafId = requestAnimationFrame(_roseRender);
    }

    // ── Public setIsLoading — mirrors React's setState ───────────────────
    window.setIsLoading = function (value) {
        if (value) {
            _loadingCounter++;
            isLoading = true;
            const el = document.getElementById('rose-loader-overlay');
            if (el) el.classList.add('visible');
            if (!_roseRafId) _roseRafId = requestAnimationFrame(_roseRender);
        } else {
            _loadingCounter = Math.max(0, _loadingCounter - 1);
            if (_loadingCounter === 0) {
                isLoading = false;
                const el = document.getElementById('rose-loader-overlay');
                if (el) el.classList.remove('visible');
                // keep rAF running so it's instant next time — stop after 3s idle
                if (_roseRafId) {
                    setTimeout(() => {
                        if (!isLoading && _roseRafId) {
                            cancelAnimationFrame(_roseRafId);
                            _roseRafId = null;
                            _roseStartedAt = null;
                        }
                    }, 3000);
                }
            }
        }
    };

    // ── Fetch interceptor — wraps every fetch() call automatically ───────
    //   Before fetch  → setIsLoading(true) and inject Authorization header
    //   In finally    → setIsLoading(false)
    const _nativeFetch = window.fetch;
    let isRefreshing = false;
    let refreshQueue = [];

    function getCookie(name) {
        const value = `; ${document.cookie}`;
        const parts = value.split(`; ${name}=`);
        if (parts.length === 2) return parts.pop().split(';').shift();
        return null;
    }

    window.fetch = async function (input, init) {
        setIsLoading(true);

        // Ensure init exists and is an object
        init = init || {};
        init.headers = init.headers || {};
        init.credentials = 'include'; // Ensure cookies are passed

        // Inject CSRF token if mutating request
        const method = (init.method || 'GET').toUpperCase();
        if (['POST', 'PUT', 'DELETE'].includes(method)) {
            const csrfToken = getCookie('ms_csrf_v2');
            if (csrfToken) {
                if (typeof Headers !== 'undefined' && init.headers instanceof Headers) {
                    init.headers.set('X-CSRF-Token', csrfToken);
                } else {
                    init.headers['X-CSRF-Token'] = csrfToken;
                }
            }
        }

        // SECURITY: Removed localStorage Authorization Bearer injection.
        // Session is carried by the HttpOnly `ms_session_v2` cookie (set by the server on login),
        // which is automatically attached via `credentials: 'include'` above. Storing a copy
        // of the token in localStorage would expose it to any XSS payload — defeating HttpOnly.

        try {
            const response = await _nativeFetch(input, init);

            // If response is 401 and user is logged in, try refreshing tokens
            const user = typeof getCurrentUser === 'function' ? getCurrentUser() : null;
            const inputStr = input.toString();
            if (response.status === 401 && user && !inputStr.includes('/api/auth/refresh') && !inputStr.includes('/api/students/login')) {
                if (!isRefreshing) {
                    isRefreshing = true;
                    try {
                        const refreshRes = await _nativeFetch('/api/auth/refresh', {
                            method: 'POST',
                            credentials: 'include',
                            headers: {
                                'Content-Type': 'application/json',
                                'X-CSRF-Token': getCookie('ms_csrf_v2') || ''
                            }
                        });
                        if (refreshRes.ok) {
                            isRefreshing = false;
                            // Resolve queued requests
                            const queue = refreshQueue;
                            refreshQueue = [];
                            queue.forEach(cb => cb(true));
                        } else {
                            isRefreshing = false;
                            const queue = refreshQueue;
                            refreshQueue = [];
                            queue.forEach(cb => cb(false));
                            if (typeof logoutUser === 'function') logoutUser();
                        }
                    } catch (err) {
                        isRefreshing = false;
                        const queue = refreshQueue;
                        refreshQueue = [];
                        queue.forEach(cb => cb(false));
                        if (typeof logoutUser === 'function') logoutUser();
                    }
                }

                // Return a Promise that resolves when refreshing is done
                return new Promise((resolve, reject) => {
                    refreshQueue.push((success) => {
                        if (success) {
                            // Re-read csrf token in case it rotated
                            if (['POST', 'PUT', 'DELETE'].includes(method)) {
                                const newCsrf = getCookie('ms_csrf_v2');
                                if (newCsrf) {
                                    if (typeof Headers !== 'undefined' && init.headers instanceof Headers) {
                                        init.headers.set('X-CSRF-Token', newCsrf);
                                    } else {
                                        init.headers['X-CSRF-Token'] = newCsrf;
                                    }
                                }
                            }
                            resolve(_nativeFetch(input, init));
                        } else {
                            reject(new Error('Authentication session refresh failed'));
                        }
                    });
                });
            }

            return response;
        } finally {
            setIsLoading(false);
        }
    };
})();

// Utility function to escape HTML special characters to prevent XSS injection (3.1 XSS)
function escapeHTML(str) {
    if (str === null || str === undefined) return '';
    return String(str).replace(/[&<>'"]/g,
        tag => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            "'": '&#39;',
            '"': '&quot;'
        }[tag] || tag)
    );
}

// SECURITY: Escape a value for use inside a JS string literal in an inline handler
// (e.g. onclick="fn('...')"). Returns a safe identifier-only fallback if the input
// is suspicious. Use sparingly — prefer addEventListener + data-* attributes.
function escapeJSAttr(str) {
    if (str === null || str === undefined) return '';
    // Whitelist: only allow safe id-like chars. Strip everything else.
    return String(str).replace(/[^a-zA-Z0-9_\-:.]/g, '');
}

// SECURITY: Validate a URL is safe to put into src/href (no javascript:, data: with HTML, etc.)
function safeUrl(url) {
    if (!url) return '';
    const s = String(url).trim();
    // Allow relative paths and http(s) only. Allow data:image/* (avatars).
    if (/^(https?:)?\/\//i.test(s)) return escapeHTML(s);
    if (/^\//.test(s)) return escapeHTML(s);
    if (/^data:image\//i.test(s)) return escapeHTML(s);
    return ''; // reject javascript:, vbscript:, etc.
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const CATEGORIES = [
    "Beginner",
    "Basic",
    "Intermediate",
    "Super Intermediate",
    "Advanced",
    "Super Advanced",
    "Grandmaster",
    "Other"
];

const BADGES = {
    "Beginner": { name: "Pawn Pioneer", icon: "shield", color: "from-blue-500 to-cyan-500", desc: "For mastering basic moves and board setup." },
    "Intermediate": { name: "Knight Strategist", icon: "military_tech", color: "from-purple-500 to-indigo-500", desc: "For understanding forks, pins, and tactical combinations." },
    "Super Intermediate": { name: "Bishop Bombardier", icon: "grade", color: "from-pink-500 to-rose-500", desc: "For solid tactical and strategic gameplay." },
    "Advanced": { name: "Rook Tactician", icon: "workspace_premium", color: "from-amber-500 to-orange-500", desc: "For demonstrating advanced positional play and endgame skills." },
    "Super Advanced": { name: "Grandmaster Mind", icon: "stars", color: "from-rose-500 to-red-600 animate-pulse", desc: "For achieving elite mastery, high ELO, and complex calculations." },
    "Grandmaster": { name: "Legendary Grandmaster", icon: "emoji_events", color: "from-yellow-400 via-amber-500 to-orange-600 animate-pulse font-extrabold", desc: "For achieving supreme mastery of 10,000+ points." },
    "Other": { name: "Creative Maverick", icon: "auto_awesome", color: "from-emerald-500 to-teal-500", desc: "For unique playstyles and exceptional creative solutions." }
};



// CLASS_SCHEDULE is populated dynamically from /api/schedules on every sync.
// The Zoom meeting URL and student enrollment lists are only returned by the
// backend to authenticated users, so they are never exposed client-side.
let CLASS_SCHEDULE = [];


const FIRST_NAMES = ["Magnus", "Hikaru", "Viswanathan", "Judit", "Garry", "Anatoly", "Fabiano", "Levon", "Ding", "Praggnanandhaa", "Gukesh", "Vidit", "Nihal", "Wesley", "Alireza", "Ian", "Anish", "Alexander", "Mikhail", "Bobby", "Alexandra", "Hou", "Polgar", "Koneru", "Harika", "Tania", "Rameshbabu", " Vaishali", "Anna", "Mariami", "Nurgyul", "Divya", "Arjun", "Vincent", "Nodirbek", "Jorden", "Daniil", "Jan-Krzysztof", "Richard", "Peter", "Leinier", "Sam", "Hans", "Abhimanyu", "Ray", "Awonder", "Jeffery", "Samuel", "Liren", "Nepomniachtchi"];
const LAST_NAMES = ["Carlsen", "Nakamura", "Anand", "Polgar", "Kasparov", "Karpov", "Caruana", "Aronian", "Liren", "R", "D", "Gujrathi", "Sarin", "So", "Firouzja", "Nepo", "Giri", "Alekhine", "Tal", "Fischer", "Botez", "Yifan", "Polgar", "Humpy", "Dronavalli", "Sachdev", "Praggnanandhaa", "Vaishali", "Muzychuk", "Lomtadze", "Salimova", "Deshmukh", "Erigaisi", "Keymer", "Abdusattorov", "Foreest", "Dubov", "Duda", "Rapport", "Svidler", "Dominguez", "Shankland", "Niemann", "Mishra", "Robson", "Liang", "Xiong", "Sevian", "Ding", "Karjakin"];

// ─── Client-Side Request Cache ────────────────────────────────────────────────
// Prevents redundant XHR calls when the user rapidly switches between SPA tabs.
// Only used for read-only GET endpoints; mutations bypass it entirely.
// TTLs match the server-side cache TTLs so clients and server stay in sync.
const clientCache = {
    _store: new Map(),
    get(key) {
        const entry = this._store.get(key);
        if (!entry) return null;
        if (Date.now() > entry.expiresAt) { this._store.delete(key); return null; }
        return entry.value;
    },
    set(key, value, ttlMs) {
        this._store.set(key, { value, expiresAt: Date.now() + ttlMs });
    },
    del(key) { this._store.delete(key); },
    invalidate() { this._store.clear(); }
};

// API Client Helper.
// SECURITY: Always use same-origin (was hardcoded to http://localhost:3000 → broke production +
// mixed-content under HTTPS). Backend must be served on the same host as the frontend.
const API_BASE = '';

const API = {
    async getStudents() {
        try {
            const currentUser = getCurrentUser();
            const callerId = currentUser ? currentUser.id : '';
            const cacheKey = `students:${callerId}`;
            const hit = clientCache.get(cacheKey);
            if (hit) return hit;
            const res = await fetch(API_BASE + '/api/students', {
                credentials: 'include',
                headers: { 'X-Caller-Id': callerId }
            });
            if (!res.ok) throw new Error('Failed to fetch students');
            const data = await res.json();
            clientCache.set(cacheKey, data, 30_000); // 30 s
            return data;
        } catch (e) {
            console.error('API.getStudents error:', e);
            return [];
        }
    },
    async getMyProfile() {
        try {
            const currentUser = getCurrentUser();
            if (!currentUser) return null;
            const res = await fetch(API_BASE + '/api/students/me', {
                credentials: 'include',
                headers: { 'X-Caller-Id': currentUser.id }
            });
            if (!res.ok) return null;
            return await res.json();
        } catch (e) {
            console.error('API.getMyProfile error:', e);
            return null;
        }
    },
    async login(email, name, avatar) {
        try {
            const res = await fetch(API_BASE + '/api/students/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, name, avatar })
            });
            if (!res.ok) throw new Error('Login failed');
            return await res.json();
        } catch (e) {
            console.error('API.login error:', e);
            return null;
        }
    },
    async updateName(id, name) {
        try {
            const res = await fetch(API_BASE + `/api/students/${id}/name`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name })
            });
            if (!res.ok) throw new Error('Failed to update name');
            return await res.json();
        } catch (e) {
            console.error('API.updateName error:', e);
            return null;
        }
    },
    async updateAvatar(id, avatar) {
        try {
            const res = await fetch(API_BASE + `/api/students/${id}/avatar`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ avatar })
            });
            if (!res.ok) throw new Error('Failed to update avatar');
            return await res.json();
        } catch (e) {
            console.error('API.updateAvatar error:', e);
            return null;
        }
    },
    async updateDob(id, dob) {
        try {
            const res = await fetch(API_BASE + `/api/students/${id}/dob`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ dob })
            });
            if (!res.ok) throw new Error('Failed to update Date of Birth');
            return await res.json();
        } catch (e) {
            console.error('API.updateDob error:', e);
            return null;
        }
    },
    async checkBirthday(id) {
        try {
            const res = await fetch(API_BASE + `/api/students/${id}/check-birthday`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });
            if (!res.ok) throw new Error('Failed to check birthday reward');
            return await res.json();
        } catch (e) {
            console.error('API.checkBirthday error:', e);
            return null;
        }
    },
    async markAttendance(id, date) {
        try {
            const res = await fetch(API_BASE + `/api/students/${id}/attendance`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ date })
            });
            if (!res.ok) throw new Error('Failed to mark attendance');
            return await res.json();
        } catch (e) {
            console.error('API.markAttendance error:', e);
            return null;
        }
    },
    async updateStats(id, points, gamesPlayed, winCount, badges, solvedPuzzles) {
        try {
            const res = await fetch(API_BASE + `/api/students/${id}/stats`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ points, gamesPlayed, winCount, badges, solvedPuzzles })
            });
            if (!res.ok) throw new Error('Failed to update stats');
            return await res.json();
        } catch (e) {
            console.error('API.updateStats error:', e);
            return null;
        }
    },
    async teacherUpdatePoints(studentId, points) {
        try {
            const currentUser = getCurrentUser();
            const callerId = currentUser ? currentUser.id : '';
            const res = await fetch(API_BASE + `/api/teachers/students/${studentId}/points`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Caller-Id': callerId
                },
                body: JSON.stringify({ points })
            });
            if (!res.ok) throw new Error('Failed to update student points');
            return await res.json();
        } catch (e) {
            console.error('API.teacherUpdatePoints error:', e);
            return null;
        }
    },
    async teacherAddBadge(studentId, badgeId) {
        try {
            const currentUser = getCurrentUser();
            const callerId = currentUser ? currentUser.id : '';
            const res = await fetch(API_BASE + `/api/teachers/students/${studentId}/badges`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Caller-Id': callerId
                },
                body: JSON.stringify({ badgeId })
            });
            if (!res.ok) throw new Error('Failed to add badge to student');
            return await res.json();
        } catch (e) {
            console.error('API.teacherAddBadge error:', e);
            return null;
        }
    },
    async teacherRemoveBadge(studentId, badgeId) {
        try {
            const currentUser = getCurrentUser();
            const callerId = currentUser ? currentUser.id : '';
            const res = await fetch(API_BASE + `/api/teachers/students/${studentId}/badges/${badgeId}`, {
                method: 'DELETE',
                headers: {
                    'X-Caller-Id': callerId
                }
            });
            if (!res.ok) throw new Error('Failed to remove badge from student');
            return await res.json();
        } catch (e) {
            console.error('API.teacherRemoveBadge error:', e);
            return null;
        }
    },

    // --- Teacher Suite: Homework ---
    async assignHomework(studentId, puzzleId) {
        try {
            const currentUser = getCurrentUser();
            const callerId = currentUser ? currentUser.id : '';
            const res = await fetch(API_BASE + '/api/teachers/homework', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-Caller-Id': callerId },
                body: JSON.stringify({ studentId, puzzleId })
            });
            if (!res.ok) throw new Error('Failed to assign homework');
            return await res.json();
        } catch (e) {
            console.error('API.assignHomework error:', e);
            return null;
        }
    },
    async getHomework(studentId) {
        try {
            const res = await fetch(API_BASE + `/api/students/${studentId}/homework`);
            if (!res.ok) throw new Error('Failed to get homework');
            return await res.json();
        } catch (e) {
            console.error('API.getHomework error:', e);
            return [];
        }
    },
    async completeHomework(studentId, assignmentId) {
        try {
            const res = await fetch(API_BASE + `/api/students/${studentId}/homework/${assignmentId}/complete`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' }
            });
            if (!res.ok) throw new Error('Failed to complete homework');
            return await res.json();
        } catch (e) {
            console.error('API.completeHomework error:', e);
            return null;
        }
    },
    async assignHomeworkToAll(puzzleId) {
        try {
            const currentUser = getCurrentUser();
            const callerId = currentUser ? currentUser.id : '';
            const res = await fetch(API_BASE + '/api/teachers/homework/all', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-Caller-Id': callerId },
                body: JSON.stringify({ puzzleId })
            });
            if (!res.ok) throw new Error('Failed to bulk-assign homework');
            return await res.json();
        } catch (e) {
            console.error('API.assignHomeworkToAll error:', e);
            return null;
        }
    },

    // --- Teacher Suite: Coaching Notes ---
    async updateCoachingNotes(studentId, notes) {
        try {
            const currentUser = getCurrentUser();
            const callerId = currentUser ? currentUser.id : '';
            const res = await fetch(API_BASE + `/api/teachers/students/${studentId}/coaching-notes`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', 'X-Caller-Id': callerId },
                body: JSON.stringify({ notes })
            });
            if (!res.ok) throw new Error('Failed to update coaching notes');
            return await res.json();
        } catch (e) {
            console.error('API.updateCoachingNotes error:', e);
            return null;
        }
    },

    // --- Teacher Suite: Attendance ---
    async logManualAttendance(studentId, date) {
        try {
            const currentUser = getCurrentUser();
            const callerId = currentUser ? currentUser.id : '';
            const res = await fetch(API_BASE + `/api/teachers/students/${studentId}/attendance`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-Caller-Id': callerId },
                body: JSON.stringify({ date })
            });
            if (!res.ok) throw new Error('Failed to log attendance');
            return await res.json();
        } catch (e) {
            console.error('API.logManualAttendance error:', e);
            return null;
        }
    },
    async removeManualAttendance(studentId, date) {
        try {
            const currentUser = getCurrentUser();
            const callerId = currentUser ? currentUser.id : '';
            const res = await fetch(API_BASE + `/api/teachers/students/${studentId}/attendance/${date}`, {
                method: 'DELETE',
                headers: { 'X-Caller-Id': callerId }
            });
            if (!res.ok) throw new Error('Failed to remove attendance');
            return await res.json();
        } catch (e) {
            console.error('API.removeManualAttendance error:', e);
            return null;
        }
    },

    // --- Teacher Suite: Schedules ---
    async getSchedules() {
        try {
            const hit = clientCache.get('schedules');
            if (hit) return hit;
            const res = await fetch(API_BASE + '/api/schedules');
            if (!res.ok) throw new Error('Failed to get schedules');
            const data = await res.json();
            clientCache.set('schedules', data, 30_000); // 30 s
            return data;
        } catch (e) {
            console.error('API.getSchedules error:', e);
            return [];
        }
    },
    async updateSchedule(id, day, time, hour, minute, level, students, link) {
        try {
            const currentUser = getCurrentUser();
            const callerId = currentUser ? currentUser.id : '';
            const res = await fetch(API_BASE + `/api/teachers/schedules/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', 'X-Caller-Id': callerId },
                body: JSON.stringify({ day, time, hour, minute, level, students, link })
            });
            if (!res.ok) throw new Error('Failed to update schedule');
            return await res.json();
        } catch (e) {
            console.error('API.updateSchedule error:', e);
            return null;
        }
    },

    // --- Teacher Suite: Analytics ---
    async getTeacherAnalytics() {
        try {
            const currentUser = getCurrentUser();
            const callerId = currentUser ? currentUser.id : '';
            const hit = clientCache.get('analytics');
            if (hit) return hit;
            const res = await fetch(API_BASE + '/api/teachers/analytics', {
                headers: { 'X-Caller-Id': callerId }
            });
            if (!res.ok) throw new Error('Failed to get analytics');
            const data = await res.json();
            clientCache.set('analytics', data, 60_000); // 60 s
            return data;
        } catch (e) {
            console.error('API.getTeacherAnalytics error:', e);
            return null;
        }
    }
};

let cachedStudents = [];
let viewingStudentId = null;

window.viewStudentProfile = function (studentId) {
    viewingStudentId = studentId;
    navigateTo('dashboard', true);
};

function initDatabase() {
    let stored = localStorage.getItem('mindsquare_students');
    if (stored) {
        try {
            cachedStudents = JSON.parse(stored);
        } catch (e) {
            cachedStudents = [];
        }
    }
}

// Global function to sync with backend DB
window.syncDatabaseWithServer = async function () {
    // Force-bust the client-side cache so we always fetch fresh data on an explicit sync
    clientCache.del('schedules');
    clientCache.invalidate();

    // Fetch class schedules dynamically from the backend.
    // Authenticated users receive full data (student list + Zoom link);
    // guests receive a sanitized view with no PII or Zoom credentials.
    const dbSchedules = await API.getSchedules();
    if (dbSchedules && Array.isArray(dbSchedules)) {
        CLASS_SCHEDULE = dbSchedules;
    }

    const dbStudents = await API.getStudents();
    if (dbStudents && dbStudents.length > 0) {
        cachedStudents = dbStudents;
        localStorage.setItem('mindsquare_students', JSON.stringify(dbStudents));
    } else {
        initDatabase();
    }

    // Refresh the signed-in user's full profile from the authenticated endpoint (includes private fields)
    const currentUser = getCurrentUser();
    if (currentUser) {
        const myProfile = await API.getMyProfile();
        if (myProfile) {
            setCurrentUser(myProfile);
        }
    }

    renderLeaderboard();
    renderDashboard();
};

function getStudents() {
    return cachedStudents;
}

function saveStudents(students) {
    cachedStudents = students;
    students.sort((a, b) => b.points - a.points);
    localStorage.setItem('mindsquare_students', JSON.stringify(students));
    renderLeaderboard();
}

function getCurrentUser() {
    const userJson = localStorage.getItem('mindsquare_current_user');
    return userJson ? JSON.parse(userJson) : null;
}

function setCurrentUser(user) {
    if (user) {
        // Remove token from local user cache to avoid storage redundancy
        const { token, ...profile } = user;
        // SECURITY: Do NOT store the session token in localStorage (XSS-readable).
        localStorage.setItem('mindsquare_current_user', JSON.stringify(profile));
    } else {
        localStorage.removeItem('mindsquare_current_user');
        localStorage.removeItem('mindsquare_session_token');
    }
    updateAuthUI();
}

window.syncUserStatsToServer = async function (user) {
    const updatedUser = await API.updateStats(
        user.id,
        user.points,
        user.gamesPlayed,
        user.winCount,
        user.badges,
        user.solvedPuzzles || []
    );
    if (updatedUser) {
        const students = getStudents();
        const idx = students.findIndex(s => s.id === user.id);
        if (idx !== -1) {
            students[idx] = updatedUser;
            saveStudents(students);
        }
        setCurrentUser(updatedUser);
        renderDashboard();
        // Re-render puzzles list so solved checkmarks reflect the server's authoritative state
        if (typeof renderPuzzlesList === 'function') {
            renderPuzzlesList();
        }
    }
};

window.editDisplayName = async function () {
    const currentUser = getCurrentUser();
    if (!currentUser) return;

    const newName = prompt("Enter your new display name:", currentUser.name);
    if (newName === null) return;
    if (!newName.trim()) {
        showNotification("Name cannot be empty!", "error");
        return;
    }

    showNotification("Updating name in database...", "info");
    const updatedUser = await API.updateName(currentUser.id, newName.trim());
    if (updatedUser) {
        const students = getStudents();
        const idx = students.findIndex(s => s.id === currentUser.id);
        if (idx !== -1) {
            students[idx] = updatedUser;
            saveStudents(students);
        }
        setCurrentUser(updatedUser);
        showNotification("Display name updated successfully!", "success");
        renderDashboard();
    } else {
        showNotification("Failed to update name in database.", "error");
    }
};

async function loginWithGoogle(credential) {
    try {
        const payload = decodeJwt(credential);
        const email = payload.email;
        const name = payload.name;
        const defaultAvatar = payload.picture || `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(name)}`;

        showNotification("Signing in...", "info");
        const student = await API.login(email, name, defaultAvatar);
        if (student) {
            // Update in local cache
            const students = getStudents();
            const idx = students.findIndex(s => s.id === student.id);
            if (idx === -1) {
                students.push(student);
            } else {
                students[idx] = student;
            }
            saveStudents(students);
            setCurrentUser(student);
            showNotification(`Welcome back, ${student.name}!`, "success");
            navigateTo('dashboard');
            // Re-sync so authenticated schedule data (Zoom link + student names) loads immediately
            window.syncDatabaseWithServer();
        } else {
            showNotification("Authentication failed on server.", "error");
        }
    } catch (e) {
        console.error("Google Auth Decode Error:", e);
        showNotification("Failed to authenticate with Google", "error");
    }
}

function decodeJwt(token) {
    var base64Url = token.split('.')[1];
    var base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    var jsonPayload = decodeURIComponent(window.atob(base64).split('').map(function (c) {
        return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
    }).join(''));

    return JSON.parse(jsonPayload);
}


async function markAttendanceForActiveUser() {
    const currentUser = getCurrentUser();
    if (!currentUser) {
        showNotification("Please sign in first!", "error");
        return;
    }

    const todayStr = new Date().toISOString().split('T')[0];
    const hasAttendedToday = currentUser.attendance && currentUser.attendance.history && currentUser.attendance.history.includes(todayStr);

    if (hasAttendedToday) {
        showNotification("Attendance already marked for today!", "warning");
        return;
    }

    showNotification("Logging attendance in database...", "info");
    const updatedUser = await API.markAttendance(currentUser.id, todayStr);
    if (updatedUser) {
        const students = getStudents();
        const studentIndex = students.findIndex(s => s.id === currentUser.id);
        if (studentIndex !== -1) {
            students[studentIndex] = updatedUser;
            saveStudents(students);
        }
        setCurrentUser(updatedUser);
        showNotification("Webcam Scan Complete! Attendance Registered.", "success");
        renderDashboard();
    } else {
        showNotification("Failed to save attendance in database.", "error");
    }
}


let webcamStream = null;
let scanAnimationFrameId = null;

function startAttendanceScan() {
    const video = document.getElementById('attendance-video');
    const canvas = document.getElementById('attendance-canvas');
    if (!video || !canvas) return;


    document.getElementById('scan-init-view').classList.add('hidden');
    document.getElementById('scan-active-view').classList.remove('hidden');

    navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 } })
        .then(stream => {
            webcamStream = stream;
            video.srcObject = stream;
            video.onloadedmetadata = () => {
                video.play();
                drawScanOverlay(video, canvas);
            };
        })
        .catch(err => {
            console.warn("Webcam access error, loading wireframe simulator:", err);
            showNotification("Webcam blocked or unavailable. Running simulator.", "warning");

            drawScanOverlay(null, canvas);
        });
}

function stopAttendanceScan() {
    const video = document.getElementById('attendance-video');
    if (video) video.srcObject = null;

    if (webcamStream) {
        webcamStream.getTracks().forEach(track => track.stop());
        webcamStream = null;
    }
    if (scanAnimationFrameId) {
        cancelAnimationFrame(scanAnimationFrameId);
        scanAnimationFrameId = null;
    }

    const initView = document.getElementById('scan-init-view');
    const activeView = document.getElementById('scan-active-view');
    if (initView) initView.classList.remove('hidden');
    if (activeView) activeView.classList.add('hidden');
}

function drawScanOverlay(video, canvas) {
    const ctx = canvas.getContext('2d');
    let laserY = 20;
    let laserDirection = 1;
    let scanProgress = 0;
    let targetLocked = false;

    function renderLoop() {
        if (!canvas) return;
        ctx.clearRect(0, 0, canvas.width, canvas.height);


        if (video && video.readyState >= 2) {
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

            ctx.fillStyle = 'rgba(13, 28, 50, 0.2)';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
        } else {

            ctx.fillStyle = '#0c0f10';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.strokeStyle = 'rgba(185, 199, 228, 0.2)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(canvas.width / 2, canvas.height / 2 - 30, 80, 0, Math.PI * 2);
            ctx.moveTo(canvas.width / 2 - 40, canvas.height / 2 + 50);
            ctx.bezierCurveTo(canvas.width / 2 - 100, canvas.height / 2 + 120, canvas.width / 2 - 120, canvas.height, canvas.width / 2 - 120, canvas.height);
            ctx.moveTo(canvas.width / 2 + 40, canvas.height / 2 + 50);
            ctx.bezierCurveTo(canvas.width / 2 + 100, canvas.height / 2 + 120, canvas.width / 2 + 120, canvas.height, canvas.width / 2 + 120, canvas.height);
            ctx.stroke();

            ctx.fillStyle = 'rgba(185, 199, 228, 0.4)';
            ctx.font = '14px Manrope';
            ctx.textAlign = 'center';
            ctx.fillText("WEBCAM SIMULATOR ACTIVE", canvas.width / 2, canvas.height / 2 + 80);
        }


        const cx = canvas.width / 2;
        const cy = canvas.height / 2;
        const rSize = 120;

        ctx.strokeStyle = targetLocked ? '#10b981' : '#e9c176';
        ctx.lineWidth = 2;

        // Corner brackets
        // Top-left
        ctx.beginPath(); ctx.moveTo(cx - rSize, cy - rSize + 30); ctx.lineTo(cx - rSize, cy - rSize); ctx.lineTo(cx - rSize + 30, cy - rSize); ctx.stroke();
        // Top-right
        ctx.beginPath(); ctx.moveTo(cx + rSize, cy - rSize + 30); ctx.lineTo(cx + rSize, cy - rSize); ctx.lineTo(cx + rSize - 30, cy - rSize); ctx.stroke();
        // Bottom-left
        ctx.beginPath(); ctx.moveTo(cx - rSize, cy + rSize - 30); ctx.lineTo(cx - rSize, cy + rSize); ctx.lineTo(cx - rSize + 30, cy + rSize); ctx.stroke();
        // Bottom-right
        ctx.beginPath(); ctx.moveTo(cx + rSize, cy + rSize - 30); ctx.lineTo(cx + rSize, cy + rSize); ctx.lineTo(cx + rSize - 30, cy + rSize); ctx.stroke();

        // Target capture indicators
        scanProgress += 0.8;
        if (scanProgress > 100) scanProgress = 100;

        if (scanProgress > 40) {
            targetLocked = true;
            ctx.fillStyle = 'rgba(16, 185, 129, 0.15)';
            ctx.fillRect(cx - rSize, cy - rSize, rSize * 2, rSize * 2);

            ctx.strokeStyle = '#10b981';
            ctx.beginPath();
            ctx.arc(cx, cy, 30, 0, Math.PI * 2);
            ctx.stroke();

            ctx.fillStyle = '#10b981';
            ctx.font = 'bold 12px Manrope';
            ctx.textAlign = 'center';
            ctx.fillText("TARGET LOCK: MATCH 98.4%", cx, cy - rSize - 15);
        } else {
            ctx.fillStyle = '#e9c176';
            ctx.font = 'bold 12px Manrope';
            ctx.textAlign = 'center';
            ctx.fillText("ACQUIRING BIOMETRIC PRINT...", cx, cy - rSize - 15);
        }

        // Draw laser scan line
        laserY += laserDirection * 3;
        if (laserY > cy + rSize || laserY < cy - rSize) {
            laserDirection *= -1;
        }

        ctx.strokeStyle = targetLocked ? 'rgba(16, 185, 129, 0.8)' : 'rgba(233, 193, 118, 0.8)';
        ctx.lineWidth = 3;
        ctx.shadowColor = targetLocked ? '#10b981' : '#e9c176';
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.moveTo(cx - rSize, laserY);
        ctx.lineTo(cx + rSize, laserY);
        ctx.stroke();

        // Reset shadow
        ctx.shadowBlur = 0;

        // Draw progress bar
        ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
        ctx.fillRect(cx - rSize, cy + rSize + 20, rSize * 2, 8);
        ctx.fillStyle = targetLocked ? '#10b981' : '#e9c176';
        ctx.fillRect(cx - rSize, cy + rSize + 20, (rSize * 2) * (scanProgress / 100), 8);

        if (scanProgress < 100) {
            scanAnimationFrameId = requestAnimationFrame(renderLoop);
        } else {
            // Completed! Mark attendance and return
            setTimeout(() => {
                stopAttendanceScan();
                markAttendanceForActiveUser();
                navigateTo('dashboard');
            }, 600);
        }
    }

    renderLoop();
}

// Shared student progression/badge checks
window.updateStudentProgression = function (student) {
    if (student.role === 'teacher') return;
    if (!student.badges) student.badges = [];

    // 1500 points -> Intermediate
    if (student.points >= 1500 && !student.badges.includes("Intermediate")) {
        student.badges.push("Intermediate");
        student.category = "Intermediate";
        showNotification("New Badge Earned: Knight Strategist!", "success");
    }
    // 2500 points -> Super Intermediate
    if (student.points >= 2500 && !student.badges.includes("Super Intermediate")) {
        student.badges.push("Super Intermediate");
        student.category = "Super Intermediate";
        showNotification("New Badge Earned: Bishop Bombardier!", "success");
    }
    // 3500 points -> Advanced
    if (student.points >= 3500 && !student.badges.includes("Advanced")) {
        student.badges.push("Advanced");
        student.category = "Advanced";
        showNotification("New Badge Earned: Rook Tactician!", "success");
    }
    // 5000 points -> Super Advanced
    if (student.points >= 5000 && !student.badges.includes("Super Advanced")) {
        student.badges.push("Super Advanced");
        student.category = "Super Advanced";
        showNotification("New Badge Earned: Grandmaster Mind!", "success");
    }
    // 10000 points -> Grandmaster
    if (student.points >= 10000 && !student.badges.includes("Grandmaster")) {
        student.badges.push("Grandmaster");
        student.category = "Grandmaster";
        showNotification("New Badge Earned: Legendary Grandmaster!", "success");
    }

    // Set correct category based on points
    if (student.points < 1500) {
        student.category = "Beginner";
    } else if (student.points < 2500) {
        student.category = "Intermediate";
    } else if (student.points < 3500) {
        student.category = "Super Intermediate";
    } else if (student.points < 5000) {
        student.category = "Advanced";
    } else if (student.points < 10000) {
        student.category = "Super Advanced";
    } else {
        student.category = "Grandmaster";
    }
};

// Update student points when they win/lose/draw
function recordGameResult(result) {
    const currentUser = getCurrentUser();
    if (!currentUser) return;

    const students = getStudents();
    const studentIndex = students.findIndex(s => s.id === currentUser.id);

    if (studentIndex !== -1) {
        const student = students[studentIndex];
        student.gamesPlayed += 1;

        let pointsEarned = 0;
        if (result === 'win') {
            student.winCount += 1;
            pointsEarned = 25 + Math.floor(Math.random() * 10);
            showNotification(`Victory! You earned +${pointsEarned} points!`, "success");
        } else if (result === 'draw') {
            pointsEarned = 5 + Math.floor(Math.random() * 5);
            showNotification(`Draw! You earned +${pointsEarned} points.`, "success");
        } else {
            pointsEarned = -10;
            showNotification("Defeat! -10 points.", "error");
        }

        student.points = Math.max(0, student.points + pointsEarned);

        // Dynamically update categories/badges based on points using shared progression checks
        window.updateStudentProgression(student);

        students[studentIndex] = student;
        saveStudents(students);
        setCurrentUser(student);
        renderDashboard();

        // Sync stats to database asynchronously
        syncUserStatsToServer(student);
    }
}

function getClassDetails(category) {
    switch (category) {
        case "Super Intermediate":
            return {
                title: "Super Intermediate Strategy",
                desc: "Strategic maneuvers, minor piece coordination, and introductory endgame fundamentals."
            };
        case "Advanced":
            return {
                title: "Advanced Tactical Masterclass",
                desc: "Complex calculation trees, candidate moves pruning, and professional grandmaster match review."
            };
        case "Intermediate":
            return {
                title: "Intermediate Position Analysis",
                desc: "Pawn structure weaknesses, open file control, space advantage exploitation, and active defense."
            };
        case "Intermediate - TX":
            return {
                title: "Texas Intermediate Tournament Prep",
                desc: "Competitive opening lines, speed chess tactics, time management strategies, and tournament focus."
            };
        case "Beginner":
            return {
                title: "Beginner Rules & Patterns",
                desc: "Understanding tactical motifs: pins, forks, double attacks, and basic checkmate patterns."
            };
        case "Basic Beginner":
            return {
                title: "Basic Beginner Fundamentals",
                desc: "Piece values, board notation, basic movements, and introductory chess strategy step-by-step."
            };
        default:
            return {
                title: "Interactive Live Class",
                desc: "Interactive learning session with top coaches to improve your chess rating and tactics."
            };
    }
}

function getCategoryStyles(category) {
    switch (category) {
        case "Super Intermediate":
            return { bg: "bg-amber-500/15 text-amber-400 border-amber-500/30", gradient: "from-amber-600 to-orange-500" };
        case "Advanced":
            return { bg: "bg-indigo-500/15 text-indigo-400 border-indigo-500/30", gradient: "from-indigo-600 to-purple-500" };
        case "Intermediate":
            return { bg: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30", gradient: "from-emerald-600 to-teal-500" };
        case "Intermediate - TX":
            return { bg: "bg-fuchsia-500/15 text-fuchsia-400 border-fuchsia-500/30", gradient: "from-fuchsia-600 to-pink-500" };
        case "Beginner":
            return { bg: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30", gradient: "from-yellow-500 to-amber-400" };
        case "Basic Beginner":
            return { bg: "bg-rose-500/15 text-rose-400 border-rose-500/30", gradient: "from-rose-600 to-red-500" };
        default:
            return { bg: "bg-slate-500/15 text-slate-400 border-slate-500/30", gradient: "from-slate-600 to-slate-500" };
    }
}

function getNextOccurrence(cls, referenceDate) {
    const DAYS_MAP = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    const targetDayIndex = DAYS_MAP.indexOf(cls.day);
    const currentDayIndex = referenceDate.getDay();

    let diff = targetDayIndex - currentDayIndex;

    const d = new Date(referenceDate);
    d.setDate(referenceDate.getDate() + diff);
    d.setHours(cls.hour, cls.minute, 0, 0);

    // If the class finished more than 1 hour ago, schedule for next week
    if (d.getTime() + 60 * 60 * 1000 < referenceDate.getTime()) {
        d.setDate(d.getDate() + 7);
    }
    return d;
}

function getUpcomingClasses(referenceDate) {
    const list = CLASS_SCHEDULE.map(cls => {
        const date = getNextOccurrence(cls, referenceDate);
        const isLive = (referenceDate.getTime() >= date.getTime() && referenceDate.getTime() <= (date.getTime() + 60 * 60 * 1000));
        return {
            ...cls,
            occurrenceDate: date,
            isLive: isLive
        };
    });

    list.sort((a, b) => a.occurrenceDate.getTime() - b.occurrenceDate.getTime());
    return list;
}

const DAYS_MAP = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
let currentSelectedDay = DAYS_MAP[new Date().getDay()];

function autoSelectNextDayWithClasses() {
    if (!CLASS_SCHEDULE || CLASS_SCHEDULE.length === 0) return;
    const todayName = DAYS_MAP[new Date().getDay()];
    const todayHasClasses = CLASS_SCHEDULE.some(c => c.day === todayName);
    if (currentSelectedDay === todayName && !todayHasClasses) {
        const daysOrder = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
        const todayIdx = new Date().getDay();
        for (let i = 0; i < 7; i++) {
            const checkDay = daysOrder[(todayIdx + i) % 7];
            if (CLASS_SCHEDULE.some(c => c.day === checkDay)) {
                currentSelectedDay = checkDay;
                break;
            }
        }
    }
}

function renderClassesTabs() {
    const tabsContainer = document.getElementById('classes-day-tabs');
    if (!tabsContainer) return;

    const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
    tabsContainer.innerHTML = '';

    days.forEach(day => {
        const isActive = currentSelectedDay === day;
        const count = (CLASS_SCHEDULE || []).filter(c => c.day === day).length;
        const indicator = count > 0 
            ? ` <span class="ml-1.5 px-1.5 py-0.5 text-[9px] rounded-full ${isActive ? 'bg-on-secondary text-secondary' : 'bg-secondary/20 text-secondary'} font-bold">${count}</span>`
            : '';

        const btnClass = isActive
            ? "px-4 py-2 bg-secondary text-on-secondary rounded-full text-xs font-bold shadow-lg shadow-secondary/15 transition-all cursor-pointer inline-flex items-center"
            : "px-4 py-2 bg-surface-variant text-on-surface rounded-full text-xs font-semibold border border-outline-variant hover:bg-surface-variant/80 transition-all cursor-pointer inline-flex items-center";

        tabsContainer.innerHTML += `
            <button onclick="filterClassesByDay('${escapeJSAttr(day)}')" class="${btnClass}">
                ${escapeHTML(day)}${indicator}
            </button>
        `;
    });
}

function filterClassesByDay(day) {
    currentSelectedDay = day;
    renderClassesTabs();
    renderClassesList();
}

function highlightStudentName(value) {
    const query = value.trim().toLowerCase();
    const cards = document.querySelectorAll('#classes-grid-container > div');

    cards.forEach(card => {
        const studentBadges = card.querySelectorAll('[data-student-name]');
        let hasMatch = false;

        studentBadges.forEach(badge => {
            const name = badge.getAttribute('data-student-name').toLowerCase();
            if (query && name.includes(query)) {
                // Highlight matching name
                badge.className = "px-2.5 py-1 rounded-full text-[11px] font-bold bg-yellow-400 text-black border border-yellow-300 shadow-md shadow-yellow-400/20 scale-105 transition-all duration-200 inline-block";
                hasMatch = true;
            } else if (query) {
                // Dim non-matching name
                badge.className = "px-2.5 py-1 rounded-full text-[11px] font-medium bg-surface-variant/20 text-on-surface-variant/30 border border-outline-variant/5 transition-all duration-200 inline-block";
            } else {
                // Reset to default
                badge.className = "px-2.5 py-1 rounded-full text-[11px] font-medium bg-surface-variant/40 text-on-surface-variant border border-outline-variant/10 transition-all duration-200 inline-block";
            }
        });

        // Optionally highlight/glow the entire card if it contains a matching student
        if (query) {
            if (hasMatch) {
                card.classList.add('border-secondary/60', 'shadow-2xl', 'shadow-secondary/15', 'scale-[1.01]', 'opacity-100');
                card.classList.remove('opacity-40');
            } else {
                card.classList.add('opacity-40');
                card.classList.remove('border-secondary/60', 'shadow-2xl', 'shadow-secondary/15', 'scale-[1.01]');
            }
        } else {
            // Reset card opacity/border
            card.classList.remove('opacity-40', 'border-secondary/60', 'shadow-2xl', 'shadow-secondary/15', 'scale-[1.01]');
        }
    });
}

function renderClassesList() {
    const gridContainer = document.getElementById('classes-grid-container');
    if (!gridContainer) return;

    // Auto-load schedules from the backend if not yet populated.
    if (!CLASS_SCHEDULE || CLASS_SCHEDULE.length === 0) {
        gridContainer.innerHTML = `
            <div class="col-span-full text-center py-12 bg-surface-container/20 border border-dashed border-outline-variant rounded-2xl">
                <span class="material-symbols-outlined text-4xl text-on-surface-variant/30 mb-2 animate-pulse">downloading</span>
                <p class="text-sm font-semibold text-on-surface-variant">Loading classes...</p>
            </div>
        `;
        API.getSchedules().then(data => {
            if (Array.isArray(data) && data.length > 0) {
                CLASS_SCHEDULE = data;
                autoSelectNextDayWithClasses();
                renderClassesTabs();
                renderClassesList();
            } else {
                gridContainer.innerHTML = `
                    <div class="col-span-full text-center py-12 bg-surface-container/20 border border-dashed border-outline-variant rounded-2xl">
                        <span class="material-symbols-outlined text-4xl text-on-surface-variant/30 mb-2">calendar_today</span>
                        <p class="text-sm font-semibold text-on-surface-variant">No classes scheduled yet.</p>
                    </div>
                `;
            }
        });
        return;
    }

    gridContainer.innerHTML = '';

    const now = new Date();
    const classes = getUpcomingClasses(now);

    // Filter by selected day
    const filtered = classes.filter(c => c.day === currentSelectedDay);

    if (filtered.length === 0) {
        gridContainer.innerHTML = `
            <div class="col-span-full text-center py-12 bg-surface-container/20 border border-dashed border-outline-variant rounded-2xl">
                <span class="material-symbols-outlined text-4xl text-on-surface-variant/30 mb-2">calendar_today</span>
                <p class="text-sm font-semibold text-on-surface-variant">No classes scheduled for ${currentSelectedDay}.</p>
            </div>
        `;
        return;
    }

    filtered.forEach(cls => {
        const styles = getCategoryStyles(cls.level);
        const details = getClassDetails(cls.level);
        const seed = encodeURIComponent(cls.level + cls.time);
        const avatar = `https://api.dicebear.com/7.x/bottts/svg?seed=${seed}`;

        let cardClass = "glass-card rounded-2xl border overflow-hidden flex flex-col justify-between p-6 hover:scale-[1.02] transition-all duration-300 relative group";
        let liveBadge = "";

        if (cls.isLive) {
            cardClass += " border-emerald-500/50 shadow-2xl shadow-emerald-500/10 scale-[1.03] ring-2 ring-emerald-500/20";
            liveBadge = `
                <div class="absolute top-4 right-4 flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[10px] font-bold uppercase tracking-wider animate-pulse">
                    <span class="w-1.5 h-1.5 rounded-full bg-emerald-400"></span> Live Now
                </div>
            `;
        } else {
            cardClass += " border-outline-variant/30";
            liveBadge = `
                <div class="absolute top-4 right-4 px-2.5 py-0.5 rounded-full bg-slate-500/20 text-slate-400 border border-slate-500/30 text-[10px] font-bold uppercase tracking-wider">
                    Scheduled
                </div>
            `;
        }

        let studentsHtml = '';
        cls.students.forEach(student => {
            studentsHtml += `
                <span data-student-name="${escapeHTML(student)}" class="px-2.5 py-1 rounded-full text-[11px] font-medium bg-surface-variant/40 text-on-surface-variant border border-outline-variant/10 transition-all duration-200 inline-block">
                    ${escapeHTML(student)}
                </span>
            `;
        });

        const user = getCurrentUser();
        let buttonHtml = '';
        if (user) {
            if (cls.isLive) {
                buttonHtml = `
                    <a href="${safeUrl(cls.link)}" target="_blank" rel="noopener noreferrer"
                        class="w-full py-3 bg-gradient-to-r ${styles.gradient} text-on-surface hover:opacity-90 shadow-lg shadow-secondary/20 rounded-xl font-bold transition-all flex items-center justify-center gap-2 text-xs">
                        <span class="material-symbols-outlined text-sm">video_call</span> Join Zoom Class (Live)
                    </a>
                `;
            } else {
                buttonHtml = `
                    <button class="w-full py-3 bg-surface-variant text-on-surface-variant cursor-not-allowed border border-outline-variant rounded-xl font-bold text-xs flex items-center justify-center gap-2" disabled>
                        <span class="material-symbols-outlined text-sm">lock</span> Opens at ${escapeHTML(cls.time)}
                    </button>
                `;
            }
        } else {
            buttonHtml = `
                <button onclick="openLoginModal()"
                    class="w-full py-3 bg-secondary text-on-secondary hover:bg-secondary/90 shadow-lg shadow-secondary/10 hover:shadow-secondary/20 rounded-xl font-bold transition-all flex items-center justify-center gap-2 text-xs">
                    <span class="material-symbols-outlined text-sm">login</span> Sign in to Join Class
                </button>
            `;
        }

        gridContainer.innerHTML += `
            <div class="${cardClass}">
                ${liveBadge}
                <div>
                    <div class="flex items-center gap-3 mb-4">
                        <img class="w-10 h-10 rounded-lg border border-outline-variant/50 bg-surface-variant object-cover"
                            src="${safeUrl(avatar)}" />
                        <div class="text-left">
                            <span class="text-sm font-bold text-on-surface block">${escapeHTML(cls.day)} Class</span>
                            <span class="px-2 py-0.5 rounded text-[9px] font-bold inline-block mt-0.5 ${styles.bg}">${escapeHTML(cls.level)}</span>
                        </div>
                    </div>
                    <h4 class="text-lg font-bold text-on-surface group-hover:text-secondary transition-colors mb-1">
                        ${escapeHTML(details.title)}
                    </h4>
                    
                    <div class="flex items-center gap-2 mb-3 text-xs font-semibold text-secondary/90 bg-secondary/5 px-3 py-1.5 rounded-xl border border-secondary/10 w-fit">
                        <span class="material-symbols-outlined text-sm text-secondary">schedule</span>
                        <span>${escapeHTML(cls.time)}</span>
                        <span class="text-on-surface-variant/30">|</span>
                        <span class="material-symbols-outlined text-sm text-secondary">calendar_today</span>
                        <span>${cls.occurrenceDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</span>
                    </div>
                    <p class="text-xs text-on-surface-variant leading-relaxed mb-4 font-body-md">
                        ${escapeHTML(details.desc)}
                    </p>
                    
                    <div class="mb-6">
                        <span class="text-[10px] text-on-surface-variant block uppercase tracking-wider mb-2 font-bold">Enrolled Students (${cls.students.length})</span>
                        <div class="flex flex-wrap gap-1.5">
                            ${studentsHtml}
                        </div>
                    </div>
                </div>
                
                <div class="space-y-4">
                    <div class="flex items-center justify-between text-xs border-t border-outline-variant/20 pt-4 text-on-surface-variant">
                        <span>Time: ${escapeHTML(cls.time)} (1 hr)</span>
                        <span class="font-mono text-[10px]">ID: zoom-${escapeHTML(String(cls.day).toLowerCase().substring(0, 3))}-${escapeHTML(String(cls.hour))}</span>
                    </div>
                    <div>
                        ${buttonHtml}
                    </div>
                </div>
            </div>
        `;
    });

    // Re-apply student name highlighting if there's an active query
    const searchVal = document.getElementById('classes-student-search')?.value || "";
    highlightStudentName(searchVal);
}

let countdownInterval = null;
function initClassCountdown() {
    if (countdownInterval) clearInterval(countdownInterval);

    const timerEl = document.getElementById('class-countdown-timer');
    const titleEl = document.getElementById('class-countdown-title');
    const dotEl = document.getElementById('class-countdown-dot');
    const labelEl = document.getElementById('class-countdown-label');
    if (!timerEl) return;

    function updateTimer() {
        const now = new Date();
        const classes = getUpcomingClasses(now);

        // Find the currently live class or the first upcoming one
        const liveClass = classes.find(c => c.isLive);

        if (liveClass) {
            const details = getClassDetails(liveClass.level);
            if (titleEl) titleEl.innerText = `${details.title} (Live Now)`;
            if (labelEl) labelEl.innerText = `Active Live Session`;

            const endTime = liveClass.occurrenceDate.getTime() + 60 * 60 * 1000;
            const diffMs = endTime - now.getTime();

            if (diffMs <= 0) {
                clearInterval(countdownInterval);
                initClassCountdown();
                renderClassesList();
                return;
            }

            const minutes = Math.floor((diffMs % 3600000) / 60000);
            const seconds = Math.floor((diffMs % 60000) / 1000);
            timerEl.innerText = `Ends in: ${String(minutes).padStart(2, '0')}m ${String(seconds).padStart(2, '0')}s`;
            if (dotEl) {
                dotEl.className = "w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse ml-2";
                dotEl.style.display = "inline-block";
            }
        } else {
            const nextClass = classes[0];

            if (!nextClass) {
                if (titleEl) titleEl.innerText = "No classes scheduled";
                timerEl.innerText = "00h 00m 00s";
                return;
            }

            const details = getClassDetails(nextClass.level);
            if (titleEl) titleEl.innerText = `${details.title} w/ Enrolled Students`;
            if (labelEl) labelEl.innerText = `Next Live Session Countdown (${nextClass.day} at ${nextClass.time})`;

            const diffMs = nextClass.occurrenceDate.getTime() - now.getTime();

            if (diffMs <= 0) {
                clearInterval(countdownInterval);
                initClassCountdown();
                renderClassesList();
                return;
            }

            const hours = Math.floor(diffMs / 3600000);
            const minutes = Math.floor((diffMs % 3600000) / 60000);
            const seconds = Math.floor((diffMs % 60000) / 1000);

            timerEl.innerText = `${String(hours).padStart(2, '0')}h ${String(minutes).padStart(2, '0')}m ${String(seconds).padStart(2, '0')}s`;
            if (dotEl) {
                dotEl.className = "w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse ml-2";
                dotEl.style.display = "inline-block";
            }
        }
    }

    updateTimer();
    countdownInterval = setInterval(updateTimer, 1000);
}

// Tab routing logic
function navigateTo(tabId, keepViewingUser = false) {
    if (!keepViewingUser) {
        viewingStudentId = null;
    }

    // Close sidebar drawer if open
    if (typeof closeSidebar === 'function') {
        closeSidebar();
    }

    // Update URL query parameters to persist tab on refresh
    const url = new URL(window.location);
    url.searchParams.set('tab', tabId);
    window.history.replaceState({}, '', url);

    const sections = ['landing-page', 'dashboard-page', 'attendance-page', 'chess-page', 'classes-page', 'leaderboard-page', 'puzzles-page', 'vision-trainer-page', 'openings-page', 'tournaments-page'];
    const targetSec = `${tabId}-page`;

    sections.forEach(sec => {
        const el = document.getElementById(sec);
        if (el) {
            if (sec === targetSec) {
                if (el.classList.contains('hidden')) {
                    el.classList.remove('hidden');
                    if (window.gsap) {
                        gsap.fromTo(el,
                            { opacity: 0, y: 15, scale: 0.98 },
                            { opacity: 1, y: 0, scale: 1, duration: 0.45, ease: "power2.out", clearProps: "transform,scale,opacity" }
                        );
                    }
                }
            } else {
                el.classList.add('hidden');
            }
        }
    });

    // Handle Active Styles in Navbar / Sidebar
    const navLinks = document.querySelectorAll('header a, nav a');
    navLinks.forEach(link => {
        const text = link.innerText.trim().toLowerCase();
        const onClickAttr = link.getAttribute('onclick') || '';
        const isMatched = onClickAttr.includes("'" + tabId + "'") ||
            onClickAttr.includes('"' + tabId + '"') ||
            text === tabId ||
            (tabId === 'landing' && text === 'academy');
        if (isMatched) {
            link.classList.add('text-secondary', 'font-bold');
            link.classList.remove('text-on-surface-variant');
        } else {
            link.classList.remove('text-secondary', 'font-bold');
            link.classList.add('text-on-surface-variant');
        }
    });

    // Render logic per tab
    if (tabId === 'dashboard') renderDashboard();
    if (tabId === 'leaderboard') renderLeaderboard();
    if (tabId === 'chess') initChessGame();
    if (tabId === 'teacher') {
        renderTeacherStudentTable();
        if (typeof window.loadTeacherAnalytics === 'function') window.loadTeacherAnalytics();
        if (typeof window.initBroadcastDropdown === 'function') window.initBroadcastDropdown();
    }
    if (tabId === 'puzzles') {
        if (typeof initPuzzleGame === 'function') {
            initPuzzleGame();
        }
    }
    if (tabId === 'vision-trainer') {
        if (typeof initVisionTrainer === 'function') {
            initVisionTrainer();
        }
    }
    if (tabId === 'openings') {
        if (typeof initOpeningsExplorer === 'function') {
            initOpeningsExplorer();
        }
    }

    if (tabId === 'classes') {
        autoSelectNextDayWithClasses();
        renderClassesTabs();
        renderClassesList();
        initClassCountdown();
    } else {
        if (countdownInterval) {
            clearInterval(countdownInterval);
            countdownInterval = null;
        }
    }

    if (tabId === 'attendance') {
        startAttendanceScan();
    } else {
        stopAttendanceScan();
    }



    // Scroll to top
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// Calculate ELO progression details
function getEloProgress(points, role) {
    if (role === 'teacher') {
        return { levelName: "Legendary Grandmaster", progressPct: 100, footerText: "Teacher Account (Infinite ELO)" };
    }
    let levelName = "Level 1";
    let progressPct = 0;
    let footerText = "";

    if (points < 1300) {
        const min = 0;
        const max = 1300;
        const current = points;
        progressPct = Math.min(100, Math.round(((current - min) / (max - min)) * 100));
        levelName = "Level 1 (Pawn)";
        footerText = `${max - points} ELO to Level 2 (Knight)`;
    } else if (points < 1900) {
        const min = 1300;
        const max = 1900;
        progressPct = Math.min(100, Math.round(((points - min) / (max - min)) * 100));
        levelName = "Level 2 (Knight)";
        footerText = `${max - points} ELO to Level 3 (Rook)`;
    } else if (points < 2200) {
        const min = 1900;
        const max = 2200;
        progressPct = Math.min(100, Math.round(((points - min) / (max - min)) * 100));
        levelName = "Level 3 (Rook)";
        footerText = `${max - points} ELO to Level 4 (Grandmaster)`;
    } else {
        const min = 2200;
        const max = 3000;
        progressPct = Math.min(100, Math.round(((points - min) / (max - min)) * 100));
        levelName = "Level 4 (Grandmaster)";
        if (points < max) {
            footerText = `${max - points} ELO to elite 3000 ELO`;
        } else {
            footerText = "Elite Grandmaster status attained!";
        }
    }
    return { levelName, progressPct, footerText };
}

// Renders the Dashboard with current user metrics
function renderDashboard() {
    const currentUser = getCurrentUser();
    if (!currentUser) {
        navigateTo('landing');
        return;
    }

    let user = currentUser;
    const isSelf = !viewingStudentId || viewingStudentId === currentUser.id;

    if (!isSelf) {
        const targetUser = getStudents().find(s => s.id === viewingStudentId);
        if (targetUser) {
            user = targetUser;
        }
    }

    // Toggle view elements based on isSelf
    const backBtn = document.getElementById('dash-back-my-profile-btn');
    if (backBtn) {
        if (isSelf) backBtn.classList.add('hidden');
        else backBtn.classList.remove('hidden');
    }

    const editBtn = document.getElementById('dash-edit-name-btn');
    if (editBtn) {
        if (isSelf) editBtn.classList.remove('hidden');
        else editBtn.classList.add('hidden');
    }

    const avatarOverlay = document.getElementById('dash-change-avatar-overlay');
    if (avatarOverlay) {
        if (isSelf) {
            avatarOverlay.style.display = '';
            avatarOverlay.classList.remove('pointer-events-none');
        } else {
            avatarOverlay.style.display = 'none';
            avatarOverlay.classList.add('pointer-events-none');
        }
    }

    const emailEl = document.getElementById('dash-user-email');
    if (emailEl) {
        if (isSelf && user.email) {
            emailEl.innerText = user.email;
            emailEl.style.display = '';
        } else {
            emailEl.innerText = '';
            emailEl.style.display = 'none';
        }
    }

    // Set user specific details in the Dashboard DOM
    document.getElementById('dash-user-name').innerText = user.name;
    document.getElementById('dash-user-avatar').src = user.avatar;
    document.getElementById('dash-user-points').innerText = user.role === 'teacher' ? 'Infinite' : `${user.points} pts`;
    document.getElementById('dash-user-rank').innerText = `#${getUserRank(user.id)}`;
    document.getElementById('dash-user-category').innerText = user.role === 'teacher' ? 'Legendary Grandmaster' : user.category;
    document.getElementById('dash-win-ratio').innerText = user.role === 'teacher' ? '100%' : `${user.gamesPlayed > 0 ? Math.round((user.winCount / user.gamesPlayed) * 100) : 0}% (${user.winCount}/${user.gamesPlayed})`;

    // Clear custom electric border from dashboard avatar
    const avatarWrapper = document.getElementById('dash-user-avatar-wrapper');
    if (avatarWrapper) {
        avatarWrapper.classList.remove('electric-border');
        if (avatarWrapper._electricBorderCleanup) {
            avatarWrapper._electricBorderCleanup();
            avatarWrapper._electricBorderCleanup = null;
            avatarWrapper.dataset.electricBorderInitialized = 'false';
        }
    }

    // ELO progression calculation & dynamic widgets rendering
    const { levelName, progressPct, footerText } = getEloProgress(user.points, user.role);
    document.getElementById('dash-elo-level-txt').innerText = levelName;
    document.getElementById('dash-elo-progress-pct').innerText = `${progressPct}%`;
    document.getElementById('dash-elo-progress-footer').innerText = footerText;

    const eloCircle = document.getElementById('dash-elo-progress');
    if (eloCircle) {
        const targetEloOffset = 251.2 * (1 - progressPct / 100);
        if (window.gsap) {
            gsap.fromTo(eloCircle,
                { strokeDashoffset: 251.2 },
                { strokeDashoffset: targetEloOffset, duration: 1.2, ease: "power2.out" }
            );
            const progressVal = { val: 0 };
            gsap.to(progressVal, {
                val: progressPct,
                duration: 1.2,
                ease: "power2.out",
                onUpdate: () => {
                    document.getElementById('dash-elo-progress-pct').innerText = `${Math.round(progressVal.val)}%`;
                }
            });
        } else {
            eloCircle.style.strokeDashoffset = targetEloOffset;
        }
    }

    // Win Ratio speedometer calculation & dynamic rendering
    const ratioPct = user.gamesPlayed > 0 ? Math.round((user.winCount / user.gamesPlayed) * 100) : 0;
    document.getElementById('dash-win-ratio-txt').innerText = `${ratioPct}%`;
    document.getElementById('dash-win-ratio-footer').innerText = `Record: ${user.winCount} Wins / ${user.gamesPlayed - user.winCount} Losses`;

    const winGauge = document.getElementById('dash-win-gauge');
    if (winGauge) {
        const targetWinOffset = 251.2 - (125.6 * (ratioPct / 100));
        if (window.gsap) {
            gsap.fromTo(winGauge,
                { strokeDashoffset: 251.2 },
                { strokeDashoffset: targetWinOffset, duration: 1.2, ease: "power2.out" }
            );
            const ratioVal = { val: 0 };
            gsap.to(ratioVal, {
                val: ratioPct,
                duration: 1.2,
                ease: "power2.out",
                onUpdate: () => {
                    document.getElementById('dash-win-ratio-txt').innerText = `${Math.round(ratioVal.val)}%`;
                }
            });
        } else {
            winGauge.style.strokeDashoffset = targetWinOffset;
        }
    }

    // Renders attendance percentages (only available on own authenticated profile)
    const attendance = user.attendance || { attended: 0, total: 20, history: [] };
    const attPercent = attendance.total > 0 ? Math.round((attendance.attended / attendance.total) * 100) : 0;
    document.getElementById('dash-attendance-stat').innerText = isSelf
        ? `${attendance.attended} / ${attendance.total} (${attPercent}%)`
        : '—';

    const attBar = document.getElementById('dash-attendance-bar');
    if (attBar) attBar.style.width = isSelf ? `${attPercent}%` : '0%';

    // Render Badges
    const badgeContainer = document.getElementById('dash-badges-container');
    if (badgeContainer) {
        badgeContainer.innerHTML = '';
        const displayBadges = user.role === 'teacher' ? Object.keys(BADGES) : user.badges;
        displayBadges.forEach(bId => {
            const b = BADGES[bId] || BADGES['Beginner'];
            badgeContainer.innerHTML += `
                <div class="flex items-center gap-4 p-4 rounded-xl bg-surface-container-high border border-outline-variant/30 relative overflow-hidden group hover:scale-[1.02] transition-all duration-300">
                    <div class="absolute -right-2 -bottom-2 opacity-5 group-hover:scale-125 transition-transform duration-500">
                        <span class="material-symbols-outlined text-8xl">${escapeHTML(b.icon)}</span>
                    </div>
                    <div class="w-12 h-12 rounded-lg bg-gradient-to-br ${b.color} flex items-center justify-center text-on-surface text-2xl font-bold shadow-md shadow-black/30">
                        <span class="material-symbols-outlined">${escapeHTML(b.icon)}</span>
                    </div>
                    <div class="flex flex-col">
                        <span class="font-bold text-on-surface group-hover:text-secondary transition-colors">${escapeHTML(b.name)}</span>
                        <span class="font-label-sm text-on-surface-variant max-w-xs">${escapeHTML(b.desc)}</span>
                    </div>
                </div>
            `;
        });
    }

    // Check if attendance is already marked today
    const checkinBtn = document.getElementById('dash-checkin-btn');
    if (checkinBtn) {
        if (isSelf) {
            checkinBtn.style.display = '';
            const todayStr = new Date().toISOString().split('T')[0];
            if (attendance.history.includes(todayStr)) {
                checkinBtn.innerHTML = `<span class="material-symbols-outlined">verified</span> Attendance Marked`;
                checkinBtn.classList.remove('bg-secondary', 'hover:scale-105');
                checkinBtn.classList.add('bg-emerald-600', 'cursor-default');
                checkinBtn.onclick = null;
            } else {
                checkinBtn.innerHTML = `<span class="material-symbols-outlined">face</span> Register Attendance`;
                checkinBtn.classList.remove('bg-emerald-600', 'cursor-default');
                checkinBtn.classList.add('bg-secondary', 'hover:scale-105');
                checkinBtn.onclick = () => navigateTo('attendance');
            }
        } else {
            checkinBtn.style.display = 'none';
        }
    }

    // Load student-specific extras (homework widget + coaching notes)
    // Only show for a student viewing their own dashboard — hide for teachers
    const hwBlock = document.getElementById('student-homework-block');
    const coachBlock = document.getElementById('student-coaching-notes-block');

    if (isSelf && user.role !== 'teacher') {
        // Student self-view: show both cards and populate them
        if (hwBlock) hwBlock.classList.remove('hidden');
        if (coachBlock) coachBlock.classList.remove('hidden');
        if (typeof window.loadStudentDashboardExtras === 'function') {
            window.loadStudentDashboardExtras(user.id);
        }
    } else {
        // Teacher dashboard or viewing another profile: hide both cards
        if (hwBlock) hwBlock.classList.add('hidden');
        if (coachBlock) coachBlock.classList.add('hidden');
    }
}


// Calculate the student's leaderboard rank
function getUserRank(studentId) {
    const students = getStudents();
    const student = students.find(s => s.id === studentId);
    if (student && student.role === 'teacher') return '-';

    const nonTeachers = students.filter(s => s.role !== 'teacher');
    const idx = nonTeachers.findIndex(s => s.id === studentId);
    return idx !== -1 ? idx + 1 : '-';
}

// Renders the Leaderboard grid/table and dynamic Top 3 Podium
function renderLeaderboard() {
    const students = getStudents().filter(s => !s.role || s.role !== 'teacher');

    // Dynamic Top 3 Podium Rendering
    const p1 = document.getElementById('podium-rank-1');
    const p2 = document.getElementById('podium-rank-2');
    const p3 = document.getElementById('podium-rank-3');
    const podiumContainer = p1 ? p1.parentElement : null;

    if (students.length >= 1) {
        if (p1) {
            p1.classList.remove('hidden');
            const s1 = students[0];
            p1.onclick = () => window.viewStudentProfile(s1.id);
            p1.classList.add('cursor-pointer', 'transition-all', 'hover:scale-[1.03]');
            const img = p1.querySelector('img');
            if (img) img.src = s1.avatar;
            const h4 = p1.querySelector('h4');
            if (h4) h4.innerHTML = `${escapeHTML(s1.name)} <span class="material-symbols-outlined text-secondary text-sm">verified</span>`;
            const idSpan = p1.querySelector('.text-on-surface-variant');
            if (idSpan) idSpan.innerText = s1.id;
            const catBadge = p1.querySelector('.podium-category-badge');
            if (catBadge) catBadge.innerText = s1.category;
            const ptsEl = p1.querySelector('.text-xl') || p1.querySelector('.text-lg');
            if (ptsEl) ptsEl.innerText = `${s1.points.toLocaleString()} pts`;
        }
    } else {
        if (p1) p1.classList.add('hidden');
    }

    if (students.length >= 2) {
        if (p2) {
            p2.classList.remove('hidden');
            const s2 = students[1];
            p2.onclick = () => window.viewStudentProfile(s2.id);
            p2.classList.add('cursor-pointer', 'transition-all', 'hover:scale-[1.03]');
            const img = p2.querySelector('img');
            if (img) img.src = s2.avatar;
            const h4 = p2.querySelector('h4');
            if (h4) h4.innerText = s2.name;
            const idSpan = p2.querySelector('.text-on-surface-variant');
            if (idSpan) idSpan.innerText = s2.id;
            const catBadge = p2.querySelector('.podium-category-badge');
            if (catBadge) catBadge.innerText = s2.category;
            const ptsEl = p2.querySelector('.text-lg') || p2.querySelector('.text-xl');
            if (ptsEl) ptsEl.innerText = `${s2.points.toLocaleString()} pts`;
        }
    } else {
        if (p2) p2.classList.add('hidden');
    }

    if (students.length >= 3) {
        if (p3) {
            p3.classList.remove('hidden');
            const s3 = students[2];
            p3.onclick = () => window.viewStudentProfile(s3.id);
            p3.classList.add('cursor-pointer', 'transition-all', 'hover:scale-[1.03]');
            const img = p3.querySelector('img');
            if (img) img.src = s3.avatar;
            const h4 = p3.querySelector('h4');
            if (h4) h4.innerText = s3.name;
            const idSpan = p3.querySelector('.text-on-surface-variant');
            if (idSpan) idSpan.innerText = s3.id;
            const catBadge = p3.querySelector('.podium-category-badge');
            if (catBadge) catBadge.innerText = s3.category;
            const ptsEl = p3.querySelector('.text-lg') || p3.querySelector('.text-xl');
            if (ptsEl) ptsEl.innerText = `${s3.points.toLocaleString()} pts`;
        }
    } else {
        if (p3) p3.classList.add('hidden');
    }

    // Dynamic grid adjustments based on student count for premium presentation
    if (podiumContainer) {
        if (students.length === 1) {
            podiumContainer.className = "flex justify-center mb-12";
            if (p1) {
                p1.className = "glass-card rounded-2xl p-6 border-2 border-secondary/50 flex flex-col items-center text-center relative overflow-hidden w-full max-w-sm shadow-2xl glow-accent";
            }
        } else if (students.length === 2) {
            podiumContainer.className = "grid grid-cols-1 md:grid-cols-2 gap-6 mb-12 max-w-2xl mx-auto";
            if (p1) {
                p1.className = "glass-card rounded-2xl p-6 border-2 border-secondary/50 flex flex-col items-center text-center relative overflow-hidden scale-100 md:scale-105 shadow-2xl glow-accent order-1";
            }
            if (p2) {
                p2.className = "glass-card rounded-2xl p-6 border border-outline-variant/30 flex flex-col items-center text-center relative overflow-hidden order-2 mt-0";
            }
        } else {
            podiumContainer.className = "grid grid-cols-1 md:grid-cols-3 gap-6 mb-12";
            if (p1) {
                p1.className = "glass-card rounded-2xl p-6 border-2 border-secondary/50 flex flex-col items-center text-center relative overflow-hidden order-1 md:order-2 scale-100 md:scale-105 shadow-2xl glow-accent";
            }
            if (p2) {
                p2.className = "glass-card rounded-2xl p-6 border border-outline-variant/30 flex flex-col items-center text-center relative overflow-hidden order-2 md:order-1 mt-0 md:mt-6";
            }
            if (p3) {
                p3.className = "glass-card rounded-2xl p-6 border border-outline-variant/30 flex flex-col items-center text-center relative overflow-hidden order-3 md:order-3 mt-0 md:mt-6";
            }
        }
    }

    // Apply ElectricBorder animation for Top 3
    if (students.length >= 1 && p1 && !p1.classList.contains('hidden')) {
        createElectricBorder(p1, { color: '#7df9ff', speed: 1.2, chaos: 0.15, borderRadius: 16 });
    }
    if (students.length >= 2 && p2 && !p2.classList.contains('hidden')) {
        createElectricBorder(p2, { color: '#7df9ff', speed: 1.0, chaos: 0.12, borderRadius: 16 });
    }
    if (students.length >= 3 && p3 && !p3.classList.contains('hidden')) {
        createElectricBorder(p3, { color: '#7df9ff', speed: 0.8, chaos: 0.10, borderRadius: 16 });
    }

    // Table rows rendering
    const container = document.getElementById('leaderboard-rows');
    if (!container) return;

    container.innerHTML = '';

    students.forEach((student, index) => {
        const rank = index + 1;
        let rankBadge = `${rank}`;
        let rowClass = "hover:bg-surface-variant/30 cursor-pointer transition-all border-b border-outline-variant/20";

        // Highlight top 3
        if (rank === 1) {
            rankBadge = `<span class="material-symbols-outlined text-amber-400 text-3xl font-bold">workspace_premium</span>`;
            rowClass += " bg-secondary/5 font-semibold";
        } else if (rank === 2) {
            rankBadge = `<span class="material-symbols-outlined text-slate-300 text-3xl font-bold">workspace_premium</span>`;
        } else if (rank === 3) {
            rankBadge = `<span class="material-symbols-outlined text-amber-700 text-3xl font-bold">workspace_premium</span>`;
        }

        // Render badge icons
        let badgeIcons = '';
        student.badges.forEach(bId => {
            const b = BADGES[bId];
            if (b) {
                badgeIcons += `<span class="material-symbols-outlined text-sm px-1.5 py-0.5 rounded bg-surface-container border border-outline-variant/30 text-on-surface-variant cursor-help" title="${escapeHTML(b.name)}: ${escapeHTML(b.desc)}">${escapeHTML(b.icon)}</span> `;
            }
        });

        // Current User Highlight
        const currentUser = getCurrentUser();
        const isSelf = currentUser && currentUser.id === student.id;
        if (isSelf) {
            rowClass += " border-l-4 border-secondary bg-surface-container-high/80";
        }

        container.innerHTML += `
            <tr class="${rowClass}" onclick="window.viewStudentProfile('${escapeJSAttr(student.id)}')">
                <td class="px-6 py-4 whitespace-nowrap text-center text-body-md font-bold">${rankBadge}</td>
                <td class="px-6 py-4 whitespace-nowrap">
                    <div class="flex items-center gap-3">
                        <img class="w-10 h-10 rounded-lg bg-surface-variant object-cover border border-outline-variant/30" src="${safeUrl(student.avatar)}" />
                        <div class="flex flex-col">
                            <span class="text-body-md text-on-surface font-semibold flex items-center gap-1.5">
                                ${escapeHTML(student.name)} ${isSelf ? '<span class="text-xs bg-secondary/20 text-secondary px-2 py-0.5 rounded-full">You</span>' : ''}
                            </span>
                            <span class="text-xs text-on-surface-variant">${escapeHTML(student.id)}</span>
                        </div>
                    </div>
                </td>
                <td class="px-6 py-4 whitespace-nowrap">
                    <span class="px-2.5 py-1 rounded-full text-xs font-bold bg-surface-container-high text-primary border border-outline-variant/20">${escapeHTML(student.category)}</span>
                </td>
                <td class="px-6 py-4 whitespace-nowrap">
                    <div class="flex items-center gap-1">
                        ${badgeIcons}
                    </div>
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-center text-body-md font-semibold text-secondary">${escapeHTML(student.points)} pts</td>
                <td class="px-6 py-4 whitespace-nowrap text-center text-xs text-on-surface-variant">${escapeHTML(student.winCount)}/${escapeHTML(student.gamesPlayed)} wins</td>
            </tr>
        `;
    });
}

// Update Navbar buttons based on Auth State
function updateAuthUI() {
    const user = getCurrentUser();
    const loginBtn = document.getElementById('navbar-login-btn');
    const userProfileMenu = document.getElementById('navbar-user-profile');
    const headerNav = document.getElementById('navbar-links');

    // Sidebar nav handles
    const sidebarNav = document.querySelector('nav');

    // Toggle auth-only / guest-only elements in the UI
    const authElements = document.querySelectorAll('.auth-only');
    const guestElements = document.querySelectorAll('.guest-only');

    if (user) {
        // Authenticated State
        if (loginBtn) loginBtn.classList.add('hidden');
        const loginModal = document.getElementById('dev-login-modal');
        if (loginModal) loginModal.classList.add('hidden');
        if (userProfileMenu) {
            userProfileMenu.classList.remove('hidden');
            document.getElementById('navbar-avatar').src = user.avatar;
            document.getElementById('navbar-user-name-txt').innerText = user.name.split(' ')[0];
        }

        // Show Dashboard and Chess Arena links
        if (headerNav) {
            headerNav.innerHTML = `
                <a class="font-body-md text-on-surface-variant transition-all hover:text-secondary cursor-pointer" onclick="navigateTo('landing')">Academy</a>
                <a class="font-body-md text-on-surface-variant transition-all hover:text-secondary cursor-pointer" onclick="navigateTo('dashboard')">Dashboard</a>
                <a class="font-body-md text-on-surface-variant transition-all hover:text-secondary cursor-pointer" onclick="navigateTo('chess')">Arena</a>
                <a class="font-body-md text-on-surface-variant transition-all hover:text-secondary cursor-pointer" onclick="navigateTo('puzzles')">Puzzles</a>
                <a class="font-body-md text-on-surface-variant transition-all hover:text-secondary cursor-pointer" onclick="navigateTo('vision-trainer')">Vision</a>
                <a class="font-body-md text-on-surface-variant transition-all hover:text-secondary cursor-pointer" onclick="navigateTo('openings')">Openings</a>
                <a class="font-body-md text-on-surface-variant transition-all hover:text-secondary cursor-pointer" onclick="navigateTo('classes')">Classes</a>
                <a class="font-body-md text-on-surface-variant transition-all hover:text-secondary cursor-pointer" onclick="navigateTo('tournaments')">Tournaments</a>
                <a class="font-body-md text-on-surface-variant transition-all hover:text-secondary cursor-pointer" onclick="navigateTo('leaderboard')">Leaderboard</a>
            `;
        }



        // Toggle teacher-only elements
        const teacherNavbarBtn = document.getElementById('navbar-teacher-btn');
        const teacherSidebarBtn = document.getElementById('sidebar-teacher-btn');
        if (user.role === 'teacher') {
            if (teacherNavbarBtn) teacherNavbarBtn.classList.remove('hidden');
            if (teacherSidebarBtn) teacherSidebarBtn.classList.remove('hidden');
        } else {
            if (teacherNavbarBtn) teacherNavbarBtn.classList.add('hidden');
            if (teacherSidebarBtn) teacherSidebarBtn.classList.add('hidden');
        }

        authElements.forEach(el => el.classList.remove('hidden'));
        guestElements.forEach(el => el.classList.add('hidden'));
        if (typeof checkBirthdayWishFlow === 'function') {
            checkBirthdayWishFlow();
        }
    } else {
        // Hide teacher elements on logout
        const teacherNavbarBtn = document.getElementById('navbar-teacher-btn');
        const teacherSidebarBtn = document.getElementById('sidebar-teacher-btn');
        if (teacherNavbarBtn) teacherNavbarBtn.classList.add('hidden');
        if (teacherSidebarBtn) teacherSidebarBtn.classList.add('hidden');

        // Unauthenticated State
        if (loginBtn) loginBtn.classList.remove('hidden');
        if (userProfileMenu) userProfileMenu.classList.add('hidden');



        if (headerNav) {
            headerNav.innerHTML = `
                <a class="font-body-md text-on-surface-variant transition-all hover:text-secondary cursor-pointer" onclick="navigateTo('landing')">Academy</a>
                <a class="font-body-md text-on-surface-variant transition-all hover:text-secondary cursor-pointer" onclick="navigateTo('puzzles')">Puzzles</a>
                <a class="font-body-md text-on-surface-variant transition-all hover:text-secondary cursor-pointer" onclick="navigateTo('vision-trainer')">Vision</a>
                <a class="font-body-md text-on-surface-variant transition-all hover:text-secondary cursor-pointer" onclick="navigateTo('openings')">Openings</a>
                <a class="font-body-md text-on-surface-variant transition-all hover:text-secondary cursor-pointer" onclick="navigateTo('classes')">Classes</a>
                <a class="font-body-md text-on-surface-variant transition-all hover:text-secondary cursor-pointer" onclick="navigateTo('tournaments')">Tournaments</a>
                <a class="font-body-md text-on-surface-variant transition-all hover:text-secondary cursor-pointer" onclick="navigateTo('leaderboard')">Leaderboard</a>
            `;
        }



        const backdrop = document.getElementById('sidebar-backdrop');
        if (backdrop) {
            backdrop.classList.add('hidden');
            backdrop.classList.add('opacity-0');
            backdrop.classList.remove('opacity-100');
        }

        authElements.forEach(el => el.classList.add('hidden'));
        guestElements.forEach(el => el.classList.remove('hidden'));
    }
}

let birthdayWishChecked = false;

async function checkBirthdayWishFlow() {
    const user = getCurrentUser();
    if (!user) return;

    // 1. If DOB is not set, prompt the user
    if (!user.dob) {
        document.getElementById('dob-prompt-modal').classList.remove('hidden');
        return;
    }

    // 2. If DOB is set, run birthday reward check once per session
    if (birthdayWishChecked) return;
    birthdayWishChecked = true;

    try {
        const response = await API.checkBirthday(user.id);
        if (response) {
            const { profile, rewarded } = response;

            // Sync with server profile (updating points/stats in local storage and UI)
            if (profile) {
                const students = getStudents();
                const idx = students.findIndex(s => s.id === profile.id);
                if (idx !== -1) {
                    students[idx] = profile;
                    saveStudents(students);
                }
                setCurrentUser(profile);
            }

            if (rewarded) {
                // Trigger birthday greeting modal
                document.getElementById('birthday-title').innerText = `Wish you happy birthday, ${user.name}!`;
                document.getElementById('birthday-wish-modal').classList.remove('hidden');
                showNotification("Happy Birthday! +1,000 points rewarded!", "success");
            }
        }
    } catch (err) {
        console.error("Birthday check failed:", err);
    }
}

// Modal action handlers
window.submitDob = async function () {
    const dobVal = document.getElementById('dob-input').value;
    if (!dobVal) {
        showNotification("Please select a valid date.", "warning");
        return;
    }

    const user = getCurrentUser();
    if (!user) return;

    showNotification("Saving Date of Birth...", "info");
    const response = await API.updateDob(user.id, dobVal);
    if (response) {
        const { profile, rewarded } = response;
        document.getElementById('dob-prompt-modal').classList.add('hidden');
        showNotification("Date of birth updated successfully!", "success");

        if (profile) {
            const students = getStudents();
            const idx = students.findIndex(s => s.id === profile.id);
            if (idx !== -1) {
                students[idx] = profile;
                saveStudents(students);
            }
            setCurrentUser(profile);
        }

        if (rewarded) {
            document.getElementById('birthday-title').innerText = `Wish you happy birthday, ${user.name}!`;
            document.getElementById('birthday-wish-modal').classList.remove('hidden');
            showNotification("Happy Birthday! +1,000 points rewarded!", "success");
        }
    } else {
        showNotification("Failed to update date of birth. Try again.", "error");
    }
};

window.closeBirthdayModal = function () {
    document.getElementById('birthday-wish-modal').classList.add('hidden');
};

// Perform client-side user logout
async function logoutUser() {
    try {
        await fetch('/api/auth/logout', {
            method: 'POST',
            credentials: 'include'
        });
    } catch (e) {
        console.error('Logout request failed:', e);
    }
    setCurrentUser(null);
    showNotification("Successfully logged out.", "success");
    navigateTo('landing');
    // Re-sync after logout so schedule view drops back to guest (sanitized) view
    window.syncDatabaseWithServer();
}

// Visual Notification alerts
function showNotification(msg, type = "success") {
    const alertBox = document.createElement('div');
    alertBox.className = `fixed bottom-6 right-6 z-50 flex items-center gap-3 px-6 py-4 rounded-xl border shadow-xl transform translate-y-10 opacity-0 transition-all duration-300 glass-card`;

    let icon = 'info';
    let iconColor = 'text-primary';

    if (type === 'success') {
        icon = 'check_circle';
        iconColor = 'text-emerald-400';
        alertBox.style.borderLeft = '4px solid #34d399';
    } else if (type === 'error') {
        icon = 'error';
        iconColor = 'text-red-400';
        alertBox.style.borderLeft = '4px solid #f87171';
    } else if (type === 'warning') {
        icon = 'warning';
        iconColor = 'text-amber-400';
        alertBox.style.borderLeft = '4px solid #fbbf24';
    }

    alertBox.innerHTML = `
        <span class="material-symbols-outlined ${iconColor}">${icon}</span>
        <span class="text-body-md text-on-background font-semibold">${msg}</span>
    `;

    document.body.appendChild(alertBox);

    // Animate in
    setTimeout(() => {
        alertBox.classList.remove('translate-y-10', 'opacity-0');
    }, 10);

    // Animate out and remove
    setTimeout(() => {
        alertBox.classList.add('translate-y-10', 'opacity-0');
        setTimeout(() => alertBox.remove(), 300);
    }, 4000);
}

// Initialize GSI configuration
function initGoogleAuth(clientId) {
    if (!window.google) return;
    if (!clientId) {
        console.warn('Google Sign-In is not configured. Set GOOGLE_CLIENT_ID in the server .env file.');
        return;
    }

    try {
        window.google.accounts.id.initialize({
            client_id: clientId,
            callback: window.handleCredentialResponse,
            itp_support: true
        });

        // Render Google button on the Landing and CTA pages
        const renderBtns = ['google-login-btn-header', 'google-login-btn-cta', 'google-login-btn-modal'];
        renderBtns.forEach(id => {
            const container = document.getElementById(id);
            if (container) {
                window.google.accounts.id.renderButton(container, {
                    theme: 'dark',
                    size: 'large',
                    shape: 'pill',
                    text: 'signin_with'
                });
            }
        });
    } catch (err) {
        console.warn("Failed to initialize Google Auth:", err);
    }
}

// Google Sign in Callback (fired by Google GSI Script)
window.handleCredentialResponse = function (response) {
    if (response && response.credential) {
        loginWithGoogle(response.credential);
    } else {
        showNotification("Failed to receive Google credential", "error");
    }
};

async function fetchGoogleClientId() {
    try {
        const res = await fetch('/api/config');
        if (!res.ok) return '';
        const data = await res.json();
        return data.googleClientId || '';
    } catch (e) {
        console.warn('Failed to load Google OAuth config from server:', e);
        return '';
    }
}

// Initialize Privacy Controls, Cookie Consent and Modals (6. Privacy / GDPR)
function initPrivacyControls() {
    // 1. Build and Inject Cookie Consent Banner if needed
    if (localStorage.getItem('mindsquare_cookie_consent') !== 'accepted') {
        const banner = document.createElement('div');
        banner.id = 'cookie-consent-banner';
        banner.className = 'fixed bottom-4 left-4 right-4 max-w-xl mx-auto z-[9999] glass-card border border-outline-variant/30 text-on-surface shadow-2xl p-5 rounded-2xl flex flex-col md:flex-row items-center justify-between gap-4 transition-all duration-500 transform translate-y-0';
        banner.innerHTML = `
            <div class="flex-1 text-left">
                <h4 class="font-bold text-sm text-secondary flex items-center gap-1.5 mb-1">
                    <span class="material-symbols-outlined text-lg">cookie</span> Cookie & Privacy Consent
                </h4>
                <p class="text-xs text-on-surface-variant leading-relaxed">
                    We use strictly functional cookies (for session security and authentication) to provide chess academy features. No advertising or tracking cookies are used.
                </p>
            </div>
            <div class="flex gap-2 shrink-0">
                <button onclick="window.showPrivacyModal()" class="px-3.5 py-1.5 text-xs font-semibold rounded-lg border border-outline-variant/30 hover:bg-surface-variant/30 transition-colors cursor-pointer text-on-surface">Learn More</button>
                <button onclick="window.acceptCookieConsent()" class="px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-secondary text-on-secondary hover:opacity-90 shadow-md transition-opacity cursor-pointer">Accept Cookies</button>
            </div>
        `;
        document.body.appendChild(banner);
    }

    // 2. Build and Inject Privacy Policy Modal
    const privacyModal = document.createElement('div');
    privacyModal.id = 'privacy-policy-modal';
    privacyModal.className = 'fixed inset-0 bg-background/80 backdrop-blur-md flex items-center justify-center z-[99999] hidden p-4';
    privacyModal.innerHTML = `
        <div class="glass-card max-w-2xl w-full border border-outline-variant/30 rounded-2xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
            <div class="px-6 py-4 border-b border-outline-variant/20 flex justify-between items-center shrink-0">
                <h3 class="text-lg font-bold text-secondary flex items-center gap-2">
                    <span class="material-symbols-outlined">gavel</span> Privacy Policy & Cookie Statement
                </h3>
                <button onclick="window.hidePrivacyModal()" class="text-on-surface-variant hover:text-on-surface text-xl font-bold cursor-pointer">×</button>
            </div>
            <div class="px-6 py-6 overflow-y-auto text-left text-sm text-on-surface-variant space-y-4">
                <div>
                    <h4 class="font-semibold text-on-surface text-sm mb-1">1. Information We Process</h4>
                    <p class="text-xs leading-relaxed">
                        To operate Mind Square Chess Academy, we process user profile information (Name, Email, and Avatar) provided via Google login or created as a mock dev profile. We also record class schedules, tactics puzzle completion logs, Elo ratings, and academy attendance records.
                    </p>
                </div>
                <div>
                    <h4 class="font-semibold text-on-surface text-sm mb-1">2. Strictly Functional Cookies</h4>
                    <p class="text-xs leading-relaxed">
                        We store two essential functional cookies:
                    </p>
                    <ul class="list-disc pl-4 text-xs mt-1 space-y-1">
                        <li><strong>ms_session_v2:</strong> Secure HttpOnly authentication cookie (expires in 15 minutes, automatically rotated).</li>
                        <li><strong>ms_refresh:</strong> Secure HttpOnly token rotation cookie (expires in 7 days).</li>
                        <li><strong>ms_csrf_v2:</strong> Secure cross-site request forgery prevention token cookie.</li>
                    </ul>
                </div>
                <div>
                    <h4 class="font-semibold text-on-surface text-sm mb-1">3. Your GDPR / Privacy Rights</h4>
                    <p class="text-xs leading-relaxed">
                        You have the right to request access to your data, rectifications of mistakes, or complete deletion of all records associated with your email address. For self-serve data removal, use our Data Deletion Request panel.
                    </p>
                </div>
            </div>
            <div class="px-6 py-4 border-t border-outline-variant/20 flex justify-end shrink-0">
                <button onclick="window.hidePrivacyModal()" class="px-4 py-2 text-xs font-semibold rounded-lg bg-secondary text-on-secondary hover:opacity-90 transition-opacity cursor-pointer">Close Policy</button>
            </div>
        </div>
    `;
    document.body.appendChild(privacyModal);

    // 3. Build and Inject Data Deletion Modal
    const deletionModal = document.createElement('div');
    deletionModal.id = 'data-deletion-modal';
    deletionModal.className = 'fixed inset-0 bg-background/80 backdrop-blur-md flex items-center justify-center z-[99999] hidden p-4';
    deletionModal.innerHTML = `
        <div class="glass-card max-w-md w-full border border-outline-variant/30 rounded-2xl overflow-hidden shadow-2xl flex flex-col">
            <div class="px-6 py-4 border-b border-outline-variant/20 flex justify-between items-center">
                <h3 class="text-lg font-bold text-red-400 flex items-center gap-2">
                    <span class="material-symbols-outlined">delete_forever</span> Account Data Deletion
                </h3>
                <button onclick="window.hideDataDeletionModal()" class="text-on-surface-variant hover:text-on-surface text-xl font-bold cursor-pointer">×</button>
            </div>
            <div class="px-6 py-6 text-left text-sm text-on-surface-variant space-y-3" id="data-deletion-body">
                <!-- Will be dynamically populated based on Auth State -->
            </div>
            <div class="px-6 py-4 border-t border-outline-variant/20 flex justify-end gap-2" id="data-deletion-actions">
                <!-- Action buttons -->
            </div>
        </div>
    `;
    document.body.appendChild(deletionModal);
}

// Window actions for Privacy (6. Privacy / GDPR)
window.acceptCookieConsent = function () {
    localStorage.setItem('mindsquare_cookie_consent', 'accepted');
    const banner = document.getElementById('cookie-consent-banner');
    if (banner) banner.remove();
    showNotification("Cookie consent recorded.", "success");
};

window.showPrivacyModal = function () {
    const modal = document.getElementById('privacy-policy-modal');
    if (modal) modal.classList.remove('hidden');
};

window.hidePrivacyModal = function () {
    const modal = document.getElementById('privacy-policy-modal');
    if (modal) modal.classList.add('hidden');
};

window.showDataDeletionModal = function () {
    const modal = document.getElementById('data-deletion-modal');
    if (!modal) return;

    const body = document.getElementById('data-deletion-body');
    const actions = document.getElementById('data-deletion-actions');
    const user = getCurrentUser();

    if (user) {
        body.innerHTML = `
            <p class="leading-relaxed">
                Hello, <strong>${escapeHTML(user.name)}</strong> (${escapeHTML(user.id)}).
            </p>
            <p class="text-xs leading-relaxed text-red-300">
                Warning: Clicking "Confirm Deletion" will permanently purge your student profile, rating statistics, badge milestones, puzzle solving history, and attendance records from our servers. This action is irreversible.
            </p>
        `;
        actions.innerHTML = `
            <button onclick="window.hideDataDeletionModal()" class="px-4 py-2 text-xs font-semibold rounded-lg border border-outline-variant/30 hover:bg-surface-variant/30 transition-colors cursor-pointer text-on-surface">Cancel</button>
            <button onclick="window.requestDataDeletion('${escapeJSAttr(user.id)}')" class="px-4 py-2 text-xs font-semibold rounded-lg bg-red-500 hover:bg-red-600 text-white transition-colors cursor-pointer">Confirm Deletion</button>
        `;
    } else {
        body.innerHTML = `
            <p class="leading-relaxed text-xs">
                To delete your profile data, you must log in first so we can verify your identity.
            </p>
        `;
        actions.innerHTML = `
            <button onclick="window.hideDataDeletionModal()" class="px-4 py-2 text-xs font-semibold rounded-lg bg-secondary text-on-secondary hover:opacity-90 transition-opacity cursor-pointer">Close</button>
        `;
    }

    modal.classList.remove('hidden');
};

window.hideDataDeletionModal = function () {
    const modal = document.getElementById('data-deletion-modal');
    if (modal) modal.classList.add('hidden');
};

window.requestDataDeletion = async function (studentId) {
    if (!studentId) return;
    showNotification("Deleting your profile data...", "info");
    try {
        const res = await fetch(`/api/students/${studentId}`, {
            method: 'DELETE',
            credentials: 'include'
        });
        if (res.ok) {
            window.hideDataDeletionModal();
            // Clear local storage and state
            setCurrentUser(null);
            showNotification("Your account and all profile data have been permanently deleted.", "success");
            navigateTo('landing');
        } else {
            const data = await res.json();
            showNotification(data.error || "Failed to delete account.", "error");
        }
    } catch (e) {
        console.error("Account deletion failed:", e);
        showNotification("An error occurred during account deletion.", "error");
    }
};

// Load configurations on initialization
document.addEventListener('DOMContentLoaded', async () => {
    // Remove stale dev OAuth client ID from older app versions
    localStorage.removeItem('mindsquare_google_client_id');

    initDatabase();
    updateAuthUI();
    updateThemeIcon();
    initPrivacyControls();

    // Sync database cache from PostgreSQL server
    if (typeof window.syncDatabaseWithServer === 'function') {
        window.syncDatabaseWithServer();
    }

    const googleClientId = await fetchGoogleClientId();
    window.googleClientId = googleClientId;
    if (!googleClientId) {
        console.error('Google Sign-In is not configured. Set GOOGLE_CLIENT_ID in the server .env file and restart.');
    }

    // Wait for Google script to load, then initialize (with polling fallback)
    function tryInitGoogle() {
        if (window.google && window.google.accounts) {
            initGoogleAuth(googleClientId);
            return true;
        }
        return false;
    }

    if (!tryInitGoogle()) {
        let checkCount = 0;
        const googleAuthInterval = setInterval(() => {
            checkCount++;
            if (tryInitGoogle() || checkCount > 20) {
                clearInterval(googleAuthInterval);
            }
        }, 250);
    }

    // Check local URL search parameters for Google Signin Redirect triggers or SPA tab redirect
    const urlParams = new URLSearchParams(window.location.search);
    const tabParam = urlParams.get('tab');
    if (tabParam) {
        navigateTo(tabParam);
    } else {
        const user = getCurrentUser();
        if (user) {
            navigateTo('dashboard');
        } else {
            navigateTo('landing');
        }
    }
});

// Let user upload and crop/resize their own photo for their account
window.uploadUserAvatar = function (event) {
    const file = event.target.files[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
        showNotification("Please select an image file.", "error");
        return;
    }

    const reader = new FileReader();
    reader.onerror = function () {
        console.error("FileReader error");
        showNotification("Failed to read image file.", "error");
    };

    reader.onload = function (e) {
        const rawDataUrl = e.target.result;
        const img = new Image();

        img.onerror = function () {
            console.warn("Canvas resizing image load failed. Saving raw image as fallback.");
            saveAvatar(rawDataUrl);
        };

        img.onload = function () {
            try {
                // Resize and crop to 256x256 square using a canvas
                const canvas = document.createElement('canvas');
                canvas.width = 256;
                canvas.height = 256;
                const ctx = canvas.getContext('2d');

                // Draw image cropped and centered
                const minDim = Math.min(img.width, img.height);
                const sx = (img.width - minDim) / 2;
                const sy = (img.height - minDim) / 2;
                ctx.drawImage(img, sx, sy, minDim, minDim, 0, 0, 256, 256);

                // Get compressed jpeg base64 string
                const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
                saveAvatar(dataUrl);
            } catch (err) {
                console.error("Canvas scaling error, falling back to raw image:", err);
                saveAvatar(rawDataUrl);
            }
        };
        img.src = rawDataUrl;
    };
    reader.readAsDataURL(file);

    async function saveAvatar(dataUrl) {
        const currentUser = getCurrentUser();
        if (currentUser) {
            showNotification("Uploading profile photo to database...", "info");
            const updatedUser = await API.updateAvatar(currentUser.id, dataUrl);
            if (updatedUser) {
                const students = getStudents();
                const studentIndex = students.findIndex(s => s.id === currentUser.id);
                if (studentIndex !== -1) {
                    students[studentIndex] = updatedUser;
                    saveStudents(students);
                }
                setCurrentUser(updatedUser);
                renderDashboard();
                showNotification("Profile photo updated successfully!", "success");
            } else {
                showNotification("Failed to upload profile photo to database.", "error");
            }
        } else {
            showNotification("No student profile currently logged in.", "error");
        }

        // Reset the file input so it triggers change events properly next time
        const fileInput = document.getElementById('avatar-file-input');
        if (fileInput) fileInput.value = '';
    }
};

// Theme toggle logic
window.toggleTheme = function () {
    const isDark = document.documentElement.classList.contains('dark');
    if (isDark) {
        document.documentElement.classList.remove('dark');
        localStorage.setItem('theme', 'light');
    } else {
        document.documentElement.classList.add('dark');
        localStorage.setItem('theme', 'dark');
    }
    updateThemeIcon();
};

function updateThemeIcon() {
    const icon = document.getElementById('theme-toggle-icon');
    if (!icon) return;
    const isDark = document.documentElement.classList.contains('dark');
    const btn = icon.closest ? icon.closest('button') : icon.parentElement;

    // Sun paths (light mode indicator — shown in dark mode to invite switching to light)
    const sunPaths = `
        <circle cx="12" cy="12" r="5"/>
        <line x1="12" y1="1" x2="12" y2="3"/>
        <line x1="12" y1="21" x2="12" y2="23"/>
        <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
        <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
        <line x1="1" y1="12" x2="3" y2="12"/>
        <line x1="21" y1="12" x2="23" y2="12"/>
        <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
        <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>`;

    // Moon paths (dark mode indicator — shown in light mode to invite switching to dark)
    const moonPaths = `<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>`;

    if (isDark) {
        icon.innerHTML = sunPaths;
        if (btn) btn.title = 'Switch to Light Theme';
    } else {
        icon.innerHTML = moonPaths;
        if (btn) btn.title = 'Switch to Dark Theme';
    }
}


// Side Navigation Drawer Toggle Controller
window.toggleSidebar = function () {
    const sidebar = document.querySelector('nav');
    const backdrop = document.getElementById('sidebar-backdrop');
    if (!sidebar) return;

    const isOpen = sidebar.classList.contains('translate-x-0');
    if (isOpen) {
        sidebar.classList.remove('translate-x-0');
        sidebar.classList.add('-translate-x-full');
        if (backdrop) {
            backdrop.classList.remove('opacity-100');
            backdrop.classList.add('opacity-0');
            setTimeout(() => {
                if (sidebar.classList.contains('-translate-x-full')) {
                    backdrop.classList.add('hidden');
                }
            }, 300);
        }
    } else {
        if (backdrop) {
            backdrop.classList.remove('hidden');
            backdrop.offsetHeight; // force reflow
            backdrop.classList.remove('opacity-0');
            backdrop.classList.add('opacity-100');
        }
        sidebar.classList.remove('-translate-x-full');
        sidebar.classList.add('translate-x-0');
    }
};

window.closeSidebar = function () {
    const sidebar = document.querySelector('nav');
    const backdrop = document.getElementById('sidebar-backdrop');
    if (sidebar && sidebar.classList.contains('translate-x-0')) {
        sidebar.classList.remove('translate-x-0');
        sidebar.classList.add('-translate-x-full');
        if (backdrop) {
            backdrop.classList.remove('opacity-100');
            backdrop.classList.add('opacity-0');
            setTimeout(() => {
                if (sidebar.classList.contains('-translate-x-full')) {
                    backdrop.classList.add('hidden');
                }
            }, 300);
        }
    }
};

// ==============================================
// ElectricBorder Component Helper (Vanilla JS)
// ==============================================
function createElectricBorder(element, options = {}) {
    if (!element) return;

    const color = options.color || '#5227FF';
    const speed = options.speed !== undefined ? options.speed : 1;
    const chaos = options.chaos !== undefined ? options.chaos : 0.12;
    const borderRadius = options.borderRadius !== undefined ? options.borderRadius : 24;

    function hexToRgba(hex, alpha) {
        hex = hex.replace('#', '');
        if (hex.length === 3) {
            hex = hex.split('').map(c => c + c).join('');
        }
        const r = parseInt(hex.substring(0, 2), 16);
        const g = parseInt(hex.substring(2, 4), 16);
        const b = parseInt(hex.substring(4, 6), 16);
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }

    if (element.dataset.electricBorderInitialized === 'true') {
        // Restore class if overridden by renderLeaderboard
        element.classList.add('electric-border');
        element.style.setProperty('--electric-border-color', color);
        element.style.setProperty('--electric-border-glow-1', hexToRgba(color, 0.6));
        element.style.setProperty('--electric-border-glow-2', color);
        return;
    }
    element.dataset.electricBorderInitialized = 'true';

    // Set custom CSS variables on the element
    element.classList.add('electric-border');
    element.style.setProperty('--electric-border-color', color);
    element.style.setProperty('--electric-border-glow-1', hexToRgba(color, 0.6));
    element.style.setProperty('--electric-border-glow-2', color);
    element.style.borderRadius = `${borderRadius}px`;

    let contentWrapper = element.querySelector('.eb-content');
    let canvasContainer, canvas, layers;

    if (!contentWrapper) {
        // 1. Move all existing children of element into a new wrapper div (.eb-content)
        contentWrapper = document.createElement('div');
        contentWrapper.className = 'eb-content';
        while (element.firstChild) {
            contentWrapper.appendChild(element.firstChild);
        }

        // 2. Create canvas elements
        canvasContainer = document.createElement('div');
        canvasContainer.className = 'eb-canvas-container';
        canvas = document.createElement('canvas');
        canvas.className = 'eb-canvas';
        canvasContainer.appendChild(canvas);

        // 3. Create glow layers
        layers = document.createElement('div');
        layers.className = 'eb-layers';
        const glow1 = document.createElement('div');
        glow1.className = 'eb-glow-1';
        const glow2 = document.createElement('div');
        glow2.className = 'eb-glow-2';
        const bgGlow = document.createElement('div');
        bgGlow.className = 'eb-background-glow';
        layers.appendChild(glow1);
        layers.appendChild(glow2);
        layers.appendChild(bgGlow);

        // 4. Append canvas container, layers, and content wrapper
        element.appendChild(canvasContainer);
        element.appendChild(layers);
        element.appendChild(contentWrapper);
    } else {
        canvasContainer = element.querySelector('.eb-canvas-container');
        canvas = element.querySelector('.eb-canvas');
        layers = element.querySelector('.eb-layers');
    }

    // Animation variables
    let animationFrameId = null;
    let time = 0;
    let lastFrameTime = 0;

    const ctx = canvas.getContext('2d');

    // Noise functions
    function random(x) {
        return (Math.sin(x * 12.9898) * 43758.5453) % 1;
    }

    // 2D Perlin Noise simulation
    function noise2D(x, y) {
        const i = Math.floor(x);
        const j = Math.floor(y);
        const fx = x - i;
        const fy = y - j;

        const a = random(i + j * 57);
        const b = random(i + 1 + j * 57);
        const c = random(i + (j + 1) * 57);
        const d = random(i + 1 + (j + 1) * 57);

        const ux = fx * fx * (3.0 - 2.0 * fx);
        const uy = fy * fy * (3.0 - 2.0 * fy);

        return a * (1 - ux) * (1 - uy) + b * ux * (1 - uy) + c * (1 - ux) * uy + d * ux * uy;
    }

    function octavedNoise(x, octaves, lacunarity, gain, baseAmplitude, baseFrequency, time, seed, baseFlatness) {
        let y = 0;
        let amplitude = baseAmplitude;
        let frequency = baseFrequency;

        for (let i = 0; i < octaves; i++) {
            let octaveAmplitude = amplitude;
            if (i === 0) {
                octaveAmplitude *= baseFlatness;
            }
            y += octaveAmplitude * noise2D(frequency * x + seed * 100, time * frequency * 0.3);
            frequency *= lacunarity;
            amplitude *= gain;
        }

        return y;
    }

    function getCornerPoint(centerX, centerY, radius, startAngle, arcLength, progress) {
        const angle = startAngle + progress * arcLength;
        return {
            x: centerX + radius * Math.cos(angle),
            y: centerY + radius * Math.sin(angle)
        };
    }

    function getRoundedRectPoint(t, left, top, width, height, radius) {
        const straightWidth = width - 2 * radius;
        const straightHeight = height - 2 * radius;
        const cornerArc = (Math.PI * radius) / 2;
        const totalPerimeter = 2 * straightWidth + 2 * straightHeight + 4 * cornerArc;
        const distance = t * totalPerimeter;

        let accumulated = 0;

        // Top edge
        if (distance <= accumulated + straightWidth) {
            const progress = (distance - accumulated) / straightWidth;
            return { x: left + radius + progress * straightWidth, y: top };
        }
        accumulated += straightWidth;

        // Top-right corner
        if (distance <= accumulated + cornerArc) {
            const progress = (distance - accumulated) / cornerArc;
            return getCornerPoint(left + width - radius, top + radius, radius, -Math.PI / 2, Math.PI / 2, progress);
        }
        accumulated += cornerArc;

        // Right edge
        if (distance <= accumulated + straightHeight) {
            const progress = (distance - accumulated) / straightHeight;
            return { x: left + width, y: top + radius + progress * straightHeight };
        }
        accumulated += straightHeight;

        // Bottom-right corner
        if (distance <= accumulated + cornerArc) {
            const progress = (distance - accumulated) / cornerArc;
            return getCornerPoint(left + width - radius, top + height - radius, radius, 0, Math.PI / 2, progress);
        }
        accumulated += cornerArc;

        // Bottom edge
        if (distance <= accumulated + straightWidth) {
            const progress = (distance - accumulated) / straightWidth;
            return { x: left + width - radius - progress * straightWidth, y: top + height };
        }
        accumulated += straightWidth;

        // Bottom-left corner
        if (distance <= accumulated + cornerArc) {
            const progress = (distance - accumulated) / cornerArc;
            return getCornerPoint(left + radius, top + height - radius, radius, Math.PI / 2, Math.PI / 2, progress);
        }
        accumulated += cornerArc;

        // Left edge
        if (distance <= accumulated + straightHeight) {
            const progress = (distance - accumulated) / straightHeight;
            return { x: left, y: top + height - radius - progress * straightHeight };
        }
        accumulated += straightHeight;

        // Top-left corner
        const progress = (distance - accumulated) / cornerArc;
        return getCornerPoint(left + radius, top + radius, radius, Math.PI, Math.PI / 2, progress);
    }

    const octaves = 10;
    const lacunarity = 1.6;
    const gain = 0.7;
    const amplitude = chaos;
    const frequency = 10;
    const baseFlatness = 0;
    const displacement = 60;
    const borderOffset = 60;

    let width = 0;
    let height = 0;

    function updateSize() {
        if (!element || !canvas) return { width: 0, height: 0 };
        const rect = element.getBoundingClientRect();
        width = rect.width + borderOffset * 2;
        height = rect.height + borderOffset * 2;

        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width = width * dpr;
        canvas.height = height * dpr;
        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;
        if (ctx) {
            ctx.scale(dpr, dpr);
        }
        return { width, height };
    }

    updateSize();
    let lastDpr = Math.min(window.devicePixelRatio || 1, 2);

    function drawElectricBorder(currentTime) {
        if (!canvas || !ctx || !element) return;

        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        if (dpr !== lastDpr) {
            lastDpr = dpr;
            updateSize();
        }

        const deltaTime = lastFrameTime === 0 ? 0 : (currentTime - lastFrameTime) / 1000;
        if (deltaTime > 0 && deltaTime < 0.5) {
            time += deltaTime * speed;
        }
        lastFrameTime = currentTime;

        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.scale(dpr, dpr);

        ctx.strokeStyle = color;
        ctx.lineWidth = 1;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        const scale = displacement;
        const left = borderOffset;
        const top = borderOffset;
        const borderWidth = width - 2 * borderOffset;
        const borderHeight = height - 2 * borderOffset;
        const maxRadius = Math.min(borderWidth, borderHeight) / 2;
        const radius = Math.min(borderRadius, maxRadius);

        const approximatePerimeter = 2 * (borderWidth + borderHeight) + 2 * Math.PI * radius;
        const sampleCount = Math.floor(approximatePerimeter / 2);

        ctx.beginPath();

        for (let i = 0; i <= sampleCount; i++) {
            const progress = i / sampleCount;

            const point = getRoundedRectPoint(progress, left, top, borderWidth, borderHeight, radius);

            const xNoise = octavedNoise(
                progress * 8,
                octaves,
                lacunarity,
                gain,
                amplitude,
                frequency,
                time,
                0,
                baseFlatness
            );

            const yNoise = octavedNoise(
                progress * 8,
                octaves,
                lacunarity,
                gain,
                amplitude,
                frequency,
                time,
                1,
                baseFlatness
            );

            const displacedX = point.x + xNoise * scale;
            const displacedY = point.y + yNoise * scale;

            if (i === 0) {
                ctx.moveTo(displacedX, displacedY);
            } else {
                ctx.lineTo(displacedX, displacedY);
            }
        }

        ctx.closePath();
        ctx.stroke();

        animationFrameId = requestAnimationFrame(drawElectricBorder);
    }

    const resizeObserver = new ResizeObserver(() => {
        updateSize();
    });
    resizeObserver.observe(element);

    animationFrameId = requestAnimationFrame(drawElectricBorder);

    element._electricBorderCleanup = () => {
        if (animationFrameId) {
            cancelAnimationFrame(animationFrameId);
        }
        resizeObserver.disconnect();
    };
}

// ==============================================
// TEACHER CONTROL PANEL ACTIONS & HANDLERS
// ==============================================

window.activeTeacherManageStudentId = null;

window.renderTeacherStudentTable = function (filterText = '') {
    const container = document.getElementById('teacher-student-rows');
    if (!container) return;
    container.innerHTML = '';

    const students = getStudents();
    const filtered = students.filter(student => {
        const nameMatch = student.name && student.name.toLowerCase().includes(filterText.toLowerCase());
        const emailMatch = student.email && student.email.toLowerCase().includes(filterText.toLowerCase());
        const idMatch = student.id && student.id.toLowerCase().includes(filterText.toLowerCase());
        return nameMatch || emailMatch || idMatch;
    });

    filtered.forEach(student => {
        // Render badge icons
        let badgeIcons = '';
        if (student.badges && Array.isArray(student.badges)) {
            student.badges.forEach(bId => {
                const b = BADGES[bId];
                if (b) {
                    badgeIcons += `<span class="material-symbols-outlined text-xs px-1.5 py-0.5 rounded bg-surface-container border border-outline-variant/30 text-on-surface-variant cursor-help" title="${escapeHTML(b.name)}: ${escapeHTML(b.desc)}">${escapeHTML(b.icon)}</span> `;
                }
            });
        }

        container.innerHTML += `
            <tr class="hover:bg-surface-variant/30 border-b border-outline-variant/20">
                <td class="px-6 py-4 whitespace-nowrap text-xs font-mono text-on-surface-variant">${escapeHTML(student.id)}</td>
                <td class="px-6 py-4 whitespace-nowrap">
                    <div class="flex items-center gap-3">
                        <img class="w-8 h-8 rounded-lg bg-surface-variant object-cover border border-outline-variant/30" src="${safeUrl(student.avatar) || 'images/default-avatar.png'}" />
                        <span class="text-xs text-on-surface font-semibold">${escapeHTML(student.name)}</span>
                    </div>
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-xs text-on-surface-variant">${escapeHTML(student.email || 'N/A')}</td>
                <td class="px-6 py-4 whitespace-nowrap">
                    <span class="px-2.5 py-1 rounded-full text-[10px] font-bold bg-surface-container-high text-primary border border-outline-variant/20">${escapeHTML(student.category)}</span>
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-center text-xs font-semibold text-secondary">${escapeHTML(student.points)} pts</td>
                <td class="px-6 py-4 whitespace-nowrap">
                    <div class="flex items-center gap-1 flex-wrap">
                        ${badgeIcons || '<span class="text-[10px] text-on-surface-variant/40">None</span>'}
                    </div>
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-center">
                    <button onclick="window.openTeacherManageModal('${escapeJSAttr(student.id)}')" class="px-3 py-1.5 bg-primary text-on-primary hover:bg-primary/90 text-xs font-bold rounded-xl transition-all cursor-pointer">
                        Manage
                    </button>
                </td>
            </tr>
        `;
    });
};

window.filterTeacherStudents = function () {
    const input = document.getElementById('teacher-student-search');
    const val = input ? input.value : '';
    window.renderTeacherStudentTable(val);
};

window.openTeacherManageModal = async function (studentId) {
    window.activeTeacherManageStudentId = studentId;
    const student = getStudents().find(s => s.id === studentId);
    if (!student) {
        showNotification("Student profile not found", "error");
        return;
    }

    // Set subtitle
    const subtitle = document.getElementById('teacher-manage-subtitle');
    if (subtitle) subtitle.innerText = `${student.id} | ${student.name}`;

    // Set points input value
    const pointsInput = document.getElementById('teacher-manage-points');
    if (pointsInput) pointsInput.value = student.points;

    // Populate badges checkboxes
    const badgesContainer = document.getElementById('teacher-manage-badges-container');
    if (badgesContainer) {
        badgesContainer.innerHTML = '';
        Object.keys(BADGES).forEach(bId => {
            const b = BADGES[bId];
            const hasBadge = student.badges && student.badges.includes(bId);
            const checkboxId = `badge-chk-${bId}`;
            badgesContainer.innerHTML += `
                <label class="flex items-center gap-3 p-2 bg-surface-container/30 border border-outline-variant/10 rounded-lg cursor-pointer hover:bg-surface-container/50 transition-all">
                    <input type="checkbox" id="${escapeHTML(checkboxId)}" ${hasBadge ? 'checked' : ''}
                        onchange="window.toggleBadge(this, '${escapeJSAttr(studentId)}', '${escapeJSAttr(bId)}')"
                        class="accent-primary w-4 h-4 cursor-pointer" />
                    <div class="flex items-center gap-1.5 min-w-0">
                        <span class="material-symbols-outlined text-sm text-primary">${escapeHTML(b.icon)}</span>
                        <span class="text-xs text-on-surface truncate font-semibold">${escapeHTML(b.name)}</span>
                    </div>
                </label>
            `;
        });
    }

    // Populate coaching notes textarea
    const notesTextarea = document.getElementById('teacher-manage-coaching-notes');
    if (notesTextarea) notesTextarea.value = student.coachingNotes || '';

    // Populate homework puzzle dropdown (show all PUZZLES from chess-engine)
    const hwSelect = document.getElementById('teacher-manage-hw-select');
    if (hwSelect && typeof PUZZLES !== 'undefined') {
        hwSelect.innerHTML = '<option value="">-- Select a puzzle --</option>';
        PUZZLES.forEach(p => {
            const opt = document.createElement('option');
            opt.value = p.id;
            opt.textContent = `${p.id}: ${p.title}`;
            hwSelect.appendChild(opt);
        });
    }

    // Load and render homework assignments for the student
    const hwContainer = document.getElementById('teacher-manage-hw-list');
    if (hwContainer) {
        hwContainer.innerHTML = '<span class="text-xs text-on-surface-variant">Loading...</span>';
        const homeworkList = await API.getHomework(studentId);
        window._currentStudentHomework = homeworkList || [];
        renderHomeworkList(hwContainer, homeworkList || [], studentId);
    }

    // Load and render attendance chips
    const attendanceContainer = document.getElementById('teacher-manage-attendance-chips');
    if (attendanceContainer) {
        const attendanceDates = student.attendanceHistory || [];
        renderAttendanceChips(attendanceContainer, attendanceDates, studentId);
    }

    // Show the modal
    const modal = document.getElementById('teacher-manage-modal');
    if (modal) modal.classList.remove('hidden');
};

window.closeTeacherManageModal = function () {
    const modal = document.getElementById('teacher-manage-modal');
    if (modal) {
        modal.classList.add('hidden');
    }
    window.activeTeacherManageStudentId = null;
};

window.saveStudentPoints = async function () {
    const studentId = window.activeTeacherManageStudentId;
    if (!studentId) {
        showNotification("No student profile is currently active to modify", "error");
        return;
    }

    const pointsInput = document.getElementById('teacher-manage-points');
    if (!pointsInput) return;

    const pointsVal = parseInt(pointsInput.value, 10);
    if (isNaN(pointsVal) || pointsVal < 0) {
        showNotification("Please enter a valid non-negative ELO rating", "warning");
        return;
    }

    showNotification("Updating student ELO rating...", "info");
    try {
        const updatedProfile = await API.teacherUpdatePoints(studentId, pointsVal);
        if (updatedProfile) {
            // Update local state cache
            const students = getStudents();
            const idx = students.findIndex(s => s.id === studentId);
            if (idx !== -1) {
                students[idx] = updatedProfile;
                saveStudents(students);
            }

            showNotification("Student ELO updated successfully!", "success");

            // Re-render student rows in teacher page
            const searchInput = document.getElementById('teacher-student-search');
            window.renderTeacherStudentTable(searchInput ? searchInput.value : '');

            // Close the modal
            window.closeTeacherManageModal();
        } else {
            showNotification("Failed to update student ELO rating on server.", "error");
        }
    } catch (err) {
        console.error(err);
        showNotification("An error occurred during updating ELO points.", "error");
    }
};

window.toggleBadge = async function (checkbox, studentId, badgeId) {
    checkbox.disabled = true;
    try {
        let updatedProfile = null;
        if (checkbox.checked) {
            showNotification(`Awarding badge: ${BADGES[badgeId].name}...`, "info");
            updatedProfile = await API.teacherAddBadge(studentId, badgeId);
        } else {
            showNotification(`Revoking badge: ${BADGES[badgeId].name}...`, "info");
            updatedProfile = await API.teacherRemoveBadge(studentId, badgeId);
        }

        if (updatedProfile) {
            // Update local state cache
            const students = getStudents();
            const idx = students.findIndex(s => s.id === studentId);
            if (idx !== -1) {
                students[idx] = updatedProfile;
                saveStudents(students);
            }
            showNotification("Badge configuration saved!", "success");

            // Re-render student rows in teacher page
            const searchInput = document.getElementById('teacher-student-search');
            window.renderTeacherStudentTable(searchInput ? searchInput.value : '');
        } else {
            checkbox.checked = !checkbox.checked; // revert UI checkbox check state
            showNotification("Failed to update badge state on server.", "error");
        }
    } catch (err) {
        checkbox.checked = !checkbox.checked; // revert UI checkbox check state
        console.error(err);
        showNotification("An error occurred during badge toggle request.", "error");
    } finally {
        checkbox.disabled = false;
    }
};

// ==============================================
// TEACHER SUITE: NEW ACTION HANDLERS
// ==============================================

function renderHomeworkList(container, homeworkList, studentId) {
    if (!homeworkList || homeworkList.length === 0) {
        container.innerHTML = '<span class="text-xs text-on-surface-variant italic">No homework assigned yet.</span>';
        return;
    }
    container.innerHTML = '';
    homeworkList.forEach(hw => {
        const puzzle = (typeof PUZZLES !== 'undefined') ? PUZZLES.find(p => p.id === hw.puzzle_id) : null;
        const puzzleTitle = puzzle ? puzzle.title : hw.puzzle_id;
        const statusClass = hw.completed ? 'hw-chip hw-chip-done' : 'hw-chip hw-chip-pending';
        const statusLabel = hw.completed ? '✓ Done' : 'Pending';
        const chip = document.createElement('div');
        chip.className = statusClass;
        chip.innerHTML = `<span class="hw-chip-title">${escapeHTML(hw.puzzle_id)}: ${escapeHTML(puzzleTitle)}</span><span class="hw-chip-status">${statusLabel}</span>`;
        container.appendChild(chip);
    });
}

function renderAttendanceChips(container, dates, studentId) {
    if (!dates || dates.length === 0) {
        container.innerHTML = '<span class="text-xs text-on-surface-variant italic">No attendance records.</span>';
        return;
    }
    container.innerHTML = '';
    const sorted = [...dates].sort((a, b) => b.localeCompare(a));
    sorted.forEach(date => {
        const chip = document.createElement('span');
        chip.className = 'attendance-chip';
        chip.innerHTML = `${escapeHTML(date)} <button onclick="window.removeAttendanceDate('${escapeHTML(studentId)}', '${escapeHTML(date)}')" class="attendance-chip-del" title="Remove date">×</button>`;
        container.appendChild(chip);
    });
}

window.saveCoachingNotes = async function () {
    const studentId = window.activeTeacherManageStudentId;
    if (!studentId) return;
    const textarea = document.getElementById('teacher-manage-coaching-notes');
    if (!textarea) return;
    const notes = textarea.value.trim();
    showNotification('Saving coaching notes...', 'info');
    const result = await API.updateCoachingNotes(studentId, notes);
    if (result) {
        const students = getStudents();
        const idx = students.findIndex(s => s.id === studentId);
        if (idx !== -1) { students[idx] = result; saveStudents(students); }
        showNotification('Coaching notes saved!', 'success');
    } else {
        showNotification('Failed to save coaching notes.', 'error');
    }
};

window.assignHomeworkToStudent = async function () {
    const studentId = window.activeTeacherManageStudentId;
    if (!studentId) return;
    const hwSelect = document.getElementById('teacher-manage-hw-select');
    if (!hwSelect || !hwSelect.value) {
        showNotification('Please select a puzzle to assign.', 'warning');
        return;
    }
    const puzzleId = hwSelect.value;
    showNotification('Assigning homework...', 'info');
    const result = await API.assignHomework(studentId, puzzleId);
    if (result) {
        showNotification('Homework assigned!', 'success');
        const hwContainer = document.getElementById('teacher-manage-hw-list');
        window._currentStudentHomework = result.homework || [];
        if (hwContainer) renderHomeworkList(hwContainer, result.homework || [], studentId);
        hwSelect.value = '';
    } else {
        showNotification('Failed to assign homework.', 'error');
    }
};

window.broadcastHomeworkToAll = async function () {
    const select = document.getElementById('broadcast-hw-select');
    if (!select || !select.value) {
        showNotification('Please select a puzzle to broadcast.', 'warning');
        return;
    }
    const puzzleId = select.value;
    const puzzle = (typeof PUZZLES !== 'undefined') ? PUZZLES.find(p => p.id === puzzleId) : null;
    const puzzleTitle = puzzle ? puzzle.title : puzzleId;

    // Disable the button to prevent double-click
    const btn = document.getElementById('broadcast-hw-btn');
    if (btn) { btn.disabled = true; btn.innerText = 'Assigning...'; }

    showNotification(`Broadcasting "${puzzleTitle}" to all students...`, 'info');
    const result = await API.assignHomeworkToAll(puzzleId);

    if (btn) { btn.disabled = false; btn.innerText = 'Assign to All'; }

    if (result && result.success) {
        showNotification(
            `✓ Homework assigned to ${result.assignedCount} student${result.assignedCount !== 1 ? 's' : ''}!`,
            'success'
        );
        select.value = '';
        // Refresh analytics so Active Homework counter updates
        if (typeof window.loadTeacherAnalytics === 'function') window.loadTeacherAnalytics();
    } else {
        showNotification('Failed to broadcast homework to all students.', 'error');
    }
};

// Populate the broadcast dropdown when teacher page opens
window.initBroadcastDropdown = function () {
    const select = document.getElementById('broadcast-hw-select');
    if (!select || select.options.length > 1) return; // already populated
    if (typeof PUZZLES === 'undefined') return;
    PUZZLES.forEach(p => {
        const opt = document.createElement('option');
        opt.value = p.id;
        opt.textContent = `${p.id}: ${p.title}`;
        select.appendChild(opt);
    });
};



window.removeAttendanceDate = async function (studentId, date) {
    showNotification('Removing attendance record...', 'info');
    const result = await API.removeManualAttendance(studentId, date);
    if (result) {
        const students = getStudents();
        const idx = students.findIndex(s => s.id === studentId);
        if (idx !== -1) { students[idx] = result; saveStudents(students); }
        showNotification('Attendance record removed.', 'success');
        const container = document.getElementById('teacher-manage-attendance-chips');
        if (container) renderAttendanceChips(container, result.attendanceHistory || [], studentId);
    } else {
        showNotification('Failed to remove attendance record.', 'error');
    }
};

window.addManualAttendance = async function () {
    const studentId = window.activeTeacherManageStudentId;
    if (!studentId) return;
    const dateInput = document.getElementById('teacher-manage-attendance-date');
    if (!dateInput || !dateInput.value) {
        showNotification('Please select a date to log.', 'warning');
        return;
    }
    const date = dateInput.value;
    showNotification('Logging attendance...', 'info');
    const result = await API.logManualAttendance(studentId, date);
    if (result) {
        const students = getStudents();
        const idx = students.findIndex(s => s.id === studentId);
        if (idx !== -1) { students[idx] = result; saveStudents(students); }
        showNotification('Attendance logged!', 'success');
        const container = document.getElementById('teacher-manage-attendance-chips');
        if (container) renderAttendanceChips(container, result.attendanceHistory || [], studentId);
        dateInput.value = '';
    } else {
        showNotification('Failed to log attendance.', 'error');
    }
};

// Load and render teacher analytics summary grid
window.loadTeacherAnalytics = async function () {
    const data = await API.getTeacherAnalytics();
    if (!data) return;
    const el = (id) => document.getElementById(id);
    if (el('analytics-total-students')) el('analytics-total-students').innerText = data.totalStudents;
    if (el('analytics-avg-rating')) el('analytics-avg-rating').innerText = data.averageRating;
    if (el('analytics-active-hw')) el('analytics-active-hw').innerText = data.activeHomeworkCount;
    if (el('analytics-puzzles-solved')) el('analytics-puzzles-solved').innerText = data.totalPuzzlesSolved;
};

// Load homework widget and coaching notes for student dashboard
window.loadStudentDashboardExtras = async function (userId) {
    if (!userId) return;
    const user = getStudents().find(s => s.id === userId);

    // --- Coaching notes block (always visible) ---
    const coachText = document.getElementById('student-coaching-notes-text');
    if (coachText) {
        const notes = user && user.coachingNotes ? user.coachingNotes.trim() : '';
        coachText.innerText = notes || 'No coaching notes yet from your coach.';
    }

    // --- Homework widget (always visible, shows all items) ---
    const hwList = document.getElementById('student-homework-list');
    if (!hwList) return;

    const homeworkItems = await API.getHomework(userId);
    if (!homeworkItems || homeworkItems.length === 0) {
        hwList.innerHTML = '<span class="text-xs text-on-surface-variant italic">No homework assigned yet.</span>';
        return;
    }

    hwList.innerHTML = '';

    // Sort: pending first, then completed
    const sorted = [...homeworkItems].sort((a, b) => {
        if (a.completed === b.completed) return 0;
        return a.completed ? 1 : -1;
    });

    sorted.forEach(hw => {
        const puzzle = (typeof PUZZLES !== 'undefined') ? PUZZLES.find(p => p.id === hw.puzzle_id) : null;
        const puzzleTitle = puzzle ? puzzle.title : hw.puzzle_id;
        const item = document.createElement('div');

        if (hw.completed) {
            // Completed homework — show green tick, no button
            item.className = 'homework-item homework-item-done';
            item.innerHTML = `
                <span class="material-symbols-outlined text-emerald-400 text-sm">task_alt</span>
                <div class="flex-1 min-w-0">
                    <span class="text-xs font-semibold text-emerald-400 block truncate line-through opacity-70">${escapeHTML(puzzleTitle)}</span>
                    <span class="text-[10px] text-on-surface-variant">${escapeHTML(hw.puzzle_id)} · Completed ✓</span>
                </div>
                <span class="homework-done-badge">Done</span>
            `;
        } else {
            // Pending homework — show solve button
            item.className = 'homework-item';
            item.innerHTML = `
                <span class="material-symbols-outlined text-amber-400 text-sm">task</span>
                <div class="flex-1 min-w-0">
                    <span class="text-xs font-semibold text-on-surface block truncate">${escapeHTML(puzzleTitle)}</span>
                    <span class="text-[10px] text-on-surface-variant">${escapeHTML(hw.puzzle_id)} · Assigned by coach</span>
                </div>
                <button onclick="window.startHomeworkPuzzle('${escapeHTML(hw.id)}', '${escapeHTML(hw.puzzle_id)}', '${escapeHTML(userId)}')" class="homework-item-btn">
                    Solve
                </button>
            `;
        }
        hwList.appendChild(item);
    });
};

// Navigate to puzzle tab and set the active puzzle for solving homework
window.startHomeworkPuzzle = function (assignmentId, puzzleId, studentId) {
    window._pendingHomeworkAssignmentId = assignmentId;
    window._pendingHomeworkStudentId = studentId;
    // Set active puzzle in chess engine
    if (typeof PUZZLES !== 'undefined') {
        window.activePuzzleId = puzzleId;
    }
    navigateTo('puzzles');
    showNotification(`Now solving: ${puzzleId}. Complete it to mark homework done!`, 'info');
};