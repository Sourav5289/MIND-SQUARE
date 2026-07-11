// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  Chess Loader — isLoading state + fetch interceptor
//  Pattern mirrors React's: const [isLoading, setIsLoading] = useState(false)
//  setIsLoading(true) before fetch → setIsLoading(false) in finally block
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
(function () {
    // ── State ────────────────────────────────────────────────────────────
    let isLoading = false;
    let _loadingCounter = 0;          // tracks concurrent in-flight requests

    let _3dScene = null;
    let _3dCamera = null;
    let _3dRenderer = null;
    let _3dPawnGroup = null;
    let _3dAnimFrameId = null;

    function handleResize() {
        if (!_3dCamera || !_3dRenderer) return;
        const container = document.getElementById('chess-3d-loader-canvas');
        if (!container) return;
        const w = container.clientWidth || 130;
        const h = container.clientHeight || 130;
        _3dCamera.aspect = w / h;
        _3dCamera.updateProjectionMatrix();
        _3dRenderer.setSize(w, h);
    }

    function init3DLoader() {
        if (typeof THREE === 'undefined') return;
        const container = document.getElementById('chess-3d-loader-canvas');
        if (!container) return;

        container.innerHTML = '';
        const width = container.clientWidth || 130;
        const height = container.clientHeight || 130;

        _3dScene = new THREE.Scene();

        // Transparent canvas background to overlay cleanly on glass card background
        _3dRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        _3dRenderer.setSize(width, height);
        _3dRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        _3dRenderer.setClearColor(0x000000, 0);
        container.appendChild(_3dRenderer.domElement);

        _3dCamera = new THREE.PerspectiveCamera(40, width / height, 0.1, 100);
        _3dCamera.position.set(0, 0.1, 3.0);

        // Moderate ambient fill light to maintain realistic shadow depth
        const ambient = new THREE.AmbientLight(0xffffff, 0.65);
        _3dScene.add(ambient);

        // Strong key light shining directly from front camera angle to illuminate the face
        const keyLight = new THREE.DirectionalLight(0xfff3db, 2.2);
        keyLight.position.set(0, 0, 4);
        _3dScene.add(keyLight);

        // Warm directional accent light from the upper-right
        const spotLight = new THREE.SpotLight(0xffdf9e, 2.0, 8, Math.PI / 4, 0.5);
        spotLight.position.set(1.5, 3, 2);
        _3dScene.add(spotLight);

        // Cool rim light for subtle shape contour highlights
        const rimLight = new THREE.DirectionalLight(0x76a7e9, 1.2);
        rimLight.position.set(-2, 1, -2);
        _3dScene.add(rimLight);

        // Rich, realistic satin gold material (high metalness + balanced roughness for soft highlights)
        const goldMaterial = new THREE.MeshStandardMaterial({
            color: 0xdfa037, // Rich warm gold base
            metalness: 0.82,
            roughness: 0.24
        });

        _3dPawnGroup = new THREE.Group();

        // 3D Pawn geometry construction
        const base = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.65, 0.14, 32), goldMaterial);
        base.position.y = -0.65;
        _3dPawnGroup.add(base);

        const collar = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.05, 12, 32), goldMaterial);
        collar.rotation.x = Math.PI / 2;
        collar.position.y = 0.05;
        _3dPawnGroup.add(collar);

        const body = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.44, 0.65, 32), goldMaterial);
        body.position.y = -0.3;
        _3dPawnGroup.add(body);

        const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 32, 32), goldMaterial);
        head.position.y = 0.32;
        _3dPawnGroup.add(head);

        _3dScene.add(_3dPawnGroup);

        window.addEventListener('resize', handleResize);
    }

    function animate3DLoader(time) {
        if (!_3dPawnGroup) return;

        // Gentle rotate and hover bob
        _3dPawnGroup.rotation.y = time * 0.0016;
        _3dPawnGroup.position.y = Math.sin(time * 0.003) * 0.05;

        if (_3dRenderer && _3dScene && _3dCamera) {
            _3dRenderer.render(_3dScene, _3dCamera);
        }
        _3dAnimFrameId = requestAnimationFrame(animate3DLoader);
    }

    // ── Public setIsLoading ──────────────────────────────────────────────
    window.setIsLoading = function (value) {
        if (value) {
            _loadingCounter++;
            isLoading = true;
            const el = document.getElementById('chess-loader-overlay');
            if (el) el.classList.add('visible');

            if (!_3dScene) {
                init3DLoader();
            }
            handleResize();
            if (!_3dAnimFrameId && _3dPawnGroup) {
                _3dAnimFrameId = requestAnimationFrame(animate3DLoader);
            }
        } else {
            _loadingCounter = Math.max(0, _loadingCounter - 1);
            if (_loadingCounter === 0) {
                isLoading = false;
                const el = document.getElementById('chess-loader-overlay');
                if (el) el.classList.remove('visible');

                if (_3dAnimFrameId) {
                    cancelAnimationFrame(_3dAnimFrameId);
                    _3dAnimFrameId = null;
                }
                window.removeEventListener('resize', handleResize);
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
    "FirstBlood": { name: "First Blood", icon: "colorize", color: "from-red-400 to-rose-500", desc: "For winning your first game in the Arena." },
    "Unstoppable": { name: "Unstoppable", icon: "local_fire_department", color: "from-orange-500 to-red-600 animate-pulse", desc: "For winning 3 games in a row." },
    "Invincible": { name: "Invincible", icon: "workspace_premium", color: "from-purple-600 via-pink-600 to-red-600 animate-pulse", desc: "For winning 5 games in a row." },
    "TacticWizard": { name: "Tactic Wizard", icon: "auto_awesome", color: "from-cyan-400 to-blue-600", desc: "For solving 10 puzzles in the Tactics Trainer." },
    "PuzzleMaster": { name: "Puzzle Master", icon: "psychology", color: "from-indigo-400 to-purple-600 animate-pulse", desc: "For solving 50 puzzles." },
    "DeepThinker": { name: "Deep Thinker", icon: "hourglass_empty", color: "from-teal-400 to-emerald-600", desc: "For winning an Untimed game." },
    "SpeedDemon": { name: "Speed Demon", icon: "bolt", color: "from-amber-400 to-yellow-500 animate-pulse", desc: "For winning a 1m Bullet game." },
    "Blitzkrieg": { name: "Blitzkrieg", icon: "flash_on", color: "from-red-500 to-orange-500", desc: "For winning a 3m Blitz game." },
    "RapidMaster": { name: "Rapid Master", icon: "schedule", color: "from-blue-600 to-indigo-700", desc: "For winning a 10m Rapid game." },
    "Scholar": { name: "Active Scholar", icon: "assignment", color: "from-blue-400 to-indigo-600", desc: "For completing 5 homework assignments." },
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
    async login(credential, email = '', name = '', avatar = '') {
        try {
            const body = {};
            if (credential) body.credential = credential;
            if (email) body.email = email;
            if (name) body.name = name;
            if (avatar) body.avatar = avatar;

            const res = await fetch(API_BASE + '/api/students/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
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
                credentials: 'include',
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
                credentials: 'include',
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
                credentials: 'include',
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
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' }
            });
            if (!res.ok) throw new Error('Failed to check birthday reward');
            return await res.json();
        } catch (e) {
            console.error('API.checkBirthday error:', e);
            return null;
        }

    },
    async updateStats(id, points, gamesPlayed, winCount, badges, solvedPuzzles) {
        try {
            const res = await fetch(API_BASE + `/api/students/${id}/stats`, {
                method: 'POST',
                credentials: 'include',
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
    async getHomework(studentId) {
        try {
            const res = await fetch(API_BASE + `/api/students/${studentId}/homework`, {
                credentials: 'include'
            });
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
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' }
            });
            if (!res.ok) throw new Error('Failed to complete homework');
            return await res.json();
        } catch (e) {
            console.error('API.completeHomework error:', e);
            return null;
        }
    },
    async getStudentProfile(studentId) {
        try {
            const res = await fetch(API_BASE + `/api/students/${studentId}/profile`, {
                credentials: 'include'
            });
            if (!res.ok) throw new Error('Failed to get student profile');
            return await res.json();
        } catch (e) {
            console.error('API.getStudentProfile error:', e);
            return null;
        }
    },
    async assignHomework(studentId, puzzleId) {
        try {
            const res = await fetch(API_BASE + `/api/students/${studentId}/homework`, {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ puzzle_id: puzzleId })
            });
            if (!res.ok) throw new Error('Failed to assign homework');
            return await res.json();
        } catch (e) {
            console.error('API.assignHomework error:', e);
            return null;
        }
    },
    async teacherEditStudent(studentId, points, coachingNotes) {
        try {
            const res = await fetch(API_BASE + `/api/students/${studentId}/teacher-edit`, {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ points, coachingNotes })
            });
            if (!res.ok) throw new Error('Failed to edit student');
            return await res.json();
        } catch (e) {
            console.error('API.teacherEditStudent error:', e);
            return null;
        }
    },
    async getCustomPuzzles() {
        try {
            const res = await fetch(API_BASE + '/api/puzzles/custom', {
                credentials: 'include'
            });
            if (!res.ok) throw new Error('Failed to get custom puzzles');
            return await res.json();
        } catch (e) {
            console.error('API.getCustomPuzzles error:', e);
            return [];
        }
    },
    async createCustomPuzzle(puzzleData) {
        try {
            const res = await fetch(API_BASE + '/api/puzzles/custom', {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(puzzleData)
            });
            if (!res.ok) throw new Error('Failed to create custom puzzle');
            return await res.json();
        } catch (e) {
            console.error('API.createCustomPuzzle error:', e);
            return null;
        }
    },
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
        // Auto-connect to live challenge socket on successful sync if user is logged in
        if (typeof window.initLiveChallenge === 'function') {
            window.initLiveChallenge();
        } else if (typeof initLiveChallenge === 'function') {
            initLiveChallenge();
        }
    }

    // Sync custom puzzles list
    if (typeof window.syncPuzzlesList === 'function') {
        await window.syncPuzzlesList();
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

const ADMIN_EMAIL = 'mindsquarechessclasses@gmail.com';

function applyAdminOverrides(user) {
    if (!user || !user.email || user.email.toLowerCase() !== ADMIN_EMAIL) return user;

    user.points = Infinity;
    user.category = 'Grandmaster';
    user.gamesPlayed = 100;
    user.winCount = 100;

    // Grant all badges
    if (typeof BADGES !== 'undefined') {
        user.badges = Object.keys(BADGES);
    }

    // Mark all puzzles as solved for full tactics performance
    const detailed = [];
    const solvedList = [];
    const today = new Date();
    for (let i = 0; i < 365; i++) {
        const d = new Date(today);
        d.setDate(today.getDate() - i);
        const dStr = d.toISOString().split('T')[0];
        detailed.push({ id: 'admin_puzzle_' + i, date: dStr });
    }
    if (typeof PUZZLES !== 'undefined') {
        PUZZLES.forEach(p => solvedList.push(p.id));
    }
    user.solvedPuzzlesDetailed = detailed;
    user.solvedPuzzles = solvedList;

    return user;
}

function getCurrentUser() {
    const userJson = localStorage.getItem('mindsquare_current_user');
    if (!userJson) return null;
    return applyAdminOverrides(JSON.parse(userJson));
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
        const student = await API.login(credential);
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

// Shared student progression/badge checks
window.updateStudentProgression = function (student) {

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
    // First Blood: Win 1 game
    if (student.winCount >= 1 && !student.badges.includes("FirstBlood")) {
        student.badges.push("FirstBlood");
        showNotification("Achievement Unlocked: First Blood!", "success");
    }
    // Unstoppable: Win 3 games
    if (student.winCount >= 3 && !student.badges.includes("Unstoppable")) {
        student.badges.push("Unstoppable");
        showNotification("Achievement Unlocked: Unstoppable!", "success");
    }
    // Invincible: Win 5 games
    if (student.winCount >= 5 && !student.badges.includes("Invincible")) {
        student.badges.push("Invincible");
        showNotification("Achievement Unlocked: Invincible!", "success");
    }
    // Tactic Wizard: Solve 10 puzzles
    const solvedCount = (student.solvedPuzzles || []).length;
    if (solvedCount >= 10 && !student.badges.includes("TacticWizard")) {
        student.badges.push("TacticWizard");
        showNotification("Achievement Unlocked: Tactic Wizard!", "success");
    }
    // Puzzle Master: Solve 50 puzzles
    if (solvedCount >= 50 && !student.badges.includes("PuzzleMaster")) {
        student.badges.push("PuzzleMaster");
        showNotification("Achievement Unlocked: Puzzle Master!", "success");
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
window.recordGameResult = recordGameResult;

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
            <button data-action="filterClassesByDay" data-arg="${escapeJSAttr(day)}" class="${btnClass}">
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
                <span data-student-name="${escapeHTML(student)}" class="hidden"></span>
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
                <button data-action="openLoginModal"
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
                        <div class="flex items-center gap-2 text-xs font-semibold text-on-surface-variant bg-surface-container-high/40 px-3 py-1.5 rounded-xl border border-outline-variant/20 w-fit">
                            <span class="material-symbols-outlined text-sm text-secondary">group</span>
                            <span>Enrolled: ${cls.studentCount !== undefined ? cls.studentCount : cls.students.length} Students</span>
                        </div>
                        ${studentsHtml}
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

                    <!-- Recordings Panel -->
                    <div class="mt-4 pt-4 border-t border-outline-variant/20">
                        <button data-action="toggleRecordings" data-id="${cls.id}" class="w-full py-2 bg-surface-container-high hover:bg-surface-variant text-on-surface border border-outline-variant/30 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition-all">
                            <span class="material-symbols-outlined text-sm">video_library</span> Class Recordings
                        </button>
                        <div id="recordings-container-${cls.id}" class="hidden mt-3 space-y-2 text-left">
                            <div id="recordings-list-${cls.id}" class="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                                <span class="text-[10px] text-on-surface-variant italic">Loading recordings...</span>
                            </div>
                            <!-- Add Recording UI for Teachers -->
                            <div id="add-recording-box-${cls.id}" class="hidden mt-3 p-3 rounded-xl bg-surface-container border border-outline-variant/30 flex flex-col gap-2">
                                <span class="text-[10px] font-bold text-secondary uppercase tracking-wider">Add Class Recording</span>
                                <input type="text" id="rec-title-${cls.id}" placeholder="Topic (e.g. Sicilian Defense)" class="bg-background border border-outline-variant/50 text-on-background text-[11px] rounded-lg px-2.5 py-1.5 w-full focus:outline-none focus:border-secondary transition-all">
                                <input type="text" id="rec-url-${cls.id}" placeholder="Zoom/Drive Link" class="bg-background border border-outline-variant/50 text-on-background text-[11px] rounded-lg px-2.5 py-1.5 w-full focus:outline-none focus:border-secondary transition-all">
                                <button data-action="saveClassRecording" data-id="${cls.id}" class="py-1.5 bg-secondary text-on-secondary rounded-lg text-[10px] font-bold hover:bg-secondary/90 transition-all">
                                    Save Link
                                </button>
                            </div>
                        </div>
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

    const sections = ['landing-page', 'dashboard-page', 'chess-page', 'classes-page', 'leaderboard-page', 'puzzles-page', 'vision-trainer-page', 'openings-page', 'tournaments-page', 'endgame-trainer-page', 'puzzle-creator-page'];
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

    if (tabId === 'puzzle-creator') {
        if (typeof window.initEditorBoard === 'function') {
            window.initEditorBoard();
        }
    }

    if (tabId === 'puzzles') {
        if (typeof window.syncPuzzlesList === 'function') {
            window.syncPuzzlesList();
        }
    }

    if (window.ScrollTrigger) {
        ScrollTrigger.refresh();
    }

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
    if (tabId === 'endgame-trainer') {
        if (typeof initEndgameTrainer === 'function') {
            initEndgameTrainer();
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



    if (tabId === 'tournaments') {
        loadAcademyTournaments();
    }

    if (tabId === 'dashboard') {
        loadAnnouncements();
        loadDailyPuzzle();
        checkTeacherRole();
    }

    // Scroll to top
    window.scrollTo({ top: 0, behavior: 'smooth' });
}
window.navigateTo = navigateTo;
window.API = API;
window.setCurrentUser = setCurrentUser;

// Calculate ELO progression details
function getEloProgress(points, role) {
    if (points === Infinity) {
        return {
            levelName: "Level 4 (Grandmaster)",
            progressPct: 100,
            footerText: "Elite Grandmaster status attained!"
        };
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

    const downloadBtn = document.getElementById('dash-download-report-btn');
    if (downloadBtn) {
        if (isSelf) downloadBtn.classList.remove('hidden');
        else downloadBtn.classList.add('hidden');
    }

    const challengeBtn = document.getElementById('live-challenge-btn');
    if (challengeBtn) {
        if (isSelf) challengeBtn.classList.add('hidden');
        else challengeBtn.classList.remove('hidden');
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

    const isAdminUser = user.email && user.email.toLowerCase() === ADMIN_EMAIL;

    // Set user specific details in the Dashboard DOM
    document.getElementById('dash-user-name').innerText = user.name;
    document.getElementById('dash-user-avatar').src = user.avatar;
    document.getElementById('dash-user-points').innerText = isAdminUser ? '∞ Infinite' : `${user.points} pts`;
    document.getElementById('dash-user-rank').innerText = isAdminUser ? 'Nil' : `#${getUserRank(user.id)}`;
    document.getElementById('dash-user-category').innerText = user.category;
    document.getElementById('dash-win-ratio').innerText = isAdminUser ? '100% (∞/∞)' : `${user.gamesPlayed > 0 ? Math.round((user.winCount / user.gamesPlayed) * 100) : 0}% (${user.winCount}/${user.gamesPlayed})`;



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
    const ratioPct = isAdminUser ? 100 : (user.gamesPlayed > 0 ? Math.round((user.winCount / user.gamesPlayed) * 100) : 0);
    document.getElementById('dash-win-ratio-txt').innerText = `${ratioPct}%`;
    document.getElementById('dash-win-ratio-footer').innerText = isAdminUser ? 'Record: ∞ Wins / 0 Losses' : `Record: ${user.winCount} Wins / ${user.gamesPlayed - user.winCount} Losses`;

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
    const attStatEl = document.getElementById('dash-attendance-stat');
    if (attStatEl) {
        attStatEl.innerText = isSelf
            ? `${attendance.attended} / ${attendance.total} (${attPercent}%)`
            : '—';
    }

    const attBar = document.getElementById('dash-attendance-bar');
    if (attBar) attBar.style.width = isSelf ? `${attPercent}%` : '0%';

    // Render Badges
    const badgeContainer = document.getElementById('dash-badges-container');
    if (badgeContainer) {
        badgeContainer.innerHTML = '';
        const displayBadges = user.badges || [];
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
    const hwBlock = document.getElementById('student-homework-block');
    const coachBlock = document.getElementById('student-coaching-notes-block');
    const isTeacherViewingStudent = !isSelf && (currentUser.role === 'teacher' || currentUser.email.toLowerCase() === ADMIN_EMAIL);

    if (isSelf || isTeacherViewingStudent) {
        // Show both cards
        if (hwBlock) hwBlock.classList.remove('hidden');
        if (coachBlock) coachBlock.classList.remove('hidden');
        if (typeof window.loadStudentDashboardExtras === 'function') {
            window.loadStudentDashboardExtras(user.id);
        }
    } else {
        // Hide both cards
        if (hwBlock) hwBlock.classList.add('hidden');
        if (coachBlock) coachBlock.classList.add('hidden');
    }

    // Hide daily puzzle block for admin account (they have no pending puzzles)
    const dailyPuzzleBlock = document.getElementById('daily-puzzle-block');
    if (dailyPuzzleBlock) {
        if (isAdminUser) {
            dailyPuzzleBlock.classList.add('hidden');
        } else {
            dailyPuzzleBlock.classList.remove('hidden');
        }
    }

    // Render advanced tactics analytics
    if (typeof renderTacticsHeatmap === 'function') renderTacticsHeatmap(user);
    if (typeof renderTacticsRadarChart === 'function') renderTacticsRadarChart(user);
}


// Calculate the student's leaderboard rank
function getUserRank(studentId) {
    const students = getStudents();
    const student = students.find(s => s.id === studentId);
    if (student && student.email && student.email.toLowerCase() === ADMIN_EMAIL) {
        return 'Nil';
    }
    const idx = students.findIndex(s => s.id === studentId);
    return idx !== -1 ? idx + 1 : '-';
}

// Renders the Leaderboard grid/table and dynamic Top 3 Podium
function renderLeaderboard() {
    const students = getStudents();

    // Render birthday sections if any student has birthday today
    const birthdayStudents = students.filter(s => s.isBirthdayToday);
    const bdayContainer = document.getElementById('leaderboard-birthdays-container');
    if (bdayContainer) {
        if (birthdayStudents.length > 0) {
            bdayContainer.classList.remove('hidden');
            let bdayHtml = `
                <div class="relative overflow-hidden rounded-3xl border border-secondary/30 bg-gradient-to-r from-secondary/10 via-surface-container/60 to-primary/5 p-6 shadow-xl">
                    <div class="absolute inset-0 bg-gradient-to-br from-secondary/5 via-transparent to-primary/5 pointer-events-none"></div>
                    <div class="relative z-10 flex flex-col gap-4">
                        <div class="flex items-center gap-3">
                            <span class="material-symbols-outlined text-secondary text-2xl">cake</span>
                            <h4 class="font-display-lg text-lg font-extrabold text-on-surface">Academy Birthday Celebrations! 🎂</h4>
                        </div>
                        <div class="flex flex-col gap-3">
            `;

            const chessWishes = [
                "May your ELO score soar and your center control be absolute! ♟️✨",
                "Wishing you a year full of brilliant moves, dynamic sacrifices, and perfect endgames! 🏆✨",
                "May you spot every tactical opportunity and execute flawless checkmates! 👑🌟",
                "Wishing you tactical mastery, great calculations, and absolute domination on the 64 squares! ♟️🎉",
                "Here's to a year of sharp openings, ironclad defense, and victorious checkmates! 🍰🥊"
            ];

            birthdayStudents.forEach((s, i) => {
                const wishText = chessWishes[i % chessWishes.length];
                bdayHtml += `
                    <div class="flex items-center gap-4 bg-surface-container/50 border border-outline-variant/20 rounded-2xl p-4">
                        <img class="w-12 h-12 rounded-xl object-cover border border-secondary/30" src="${safeUrl(s.avatar)}" data-seed="${escapeJSAttr(s.name)}" />
                        <div class="text-left flex-1">
                            <p class="text-sm font-bold text-on-surface">
                                Wish you happy birthday, <span class="text-secondary">${escapeHTML(s.name)}</span>!
                            </p>
                            <p class="text-xs text-on-surface-variant leading-relaxed mt-1">
                                ${wishText}
                            </p>
                        </div>
                        <div class="text-3xl animate-bounce" style="animation-duration: 2s;">🎈</div>
                    </div>
                `;
            });

            bdayHtml += `
                        </div>
                    </div>
                </div>
            `;
            bdayContainer.innerHTML = bdayHtml;
        } else {
            bdayContainer.classList.add('hidden');
            bdayContainer.innerHTML = '';
        }
    }

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
            if (img) {
                img.src = s1.avatar;
                img.onerror = () => {
                    img.onerror = null;
                    img.src = `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(s1.name)}`;
                };
            }
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
            if (img) {
                img.src = s2.avatar;
                img.onerror = () => {
                    img.onerror = null;
                    img.src = `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(s2.name)}`;
                };
            }
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
            if (img) {
                img.src = s3.avatar;
                img.onerror = () => {
                    img.onerror = null;
                    img.src = `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(s3.name)}`;
                };
            }
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
            <tr class="${rowClass}" data-action="viewStudentProfile" data-arg="${escapeJSAttr(student.id)}">
                <td class="px-6 py-4 whitespace-nowrap text-center text-body-md font-bold">${rankBadge}</td>
                <td class="px-6 py-4 whitespace-nowrap">
                    <div class="flex items-center gap-3">
                        <img class="w-10 h-10 rounded-lg bg-surface-variant object-cover border border-outline-variant/30" src="${safeUrl(student.avatar)}" data-seed="${escapeJSAttr(student.name)}" />
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

    // Scorecard Birthday Popup Logic
    const currentUser = getCurrentUser();
    if (currentUser && currentUser.dob) {
        try {
            const today = new Date();
            const month = String(today.getMonth() + 1).padStart(2, '0');
            const day = String(today.getDate()).padStart(2, '0');
            const todayMonthDay = `${month}-${day}`;
            const dobParts = currentUser.dob.split('-');
            if (dobParts.length === 3) {
                const dobMonthDay = `${dobParts[1]}-${dobParts[2]}`;
                if (dobMonthDay === todayMonthDay) {
                    if (!window.scorecardBirthdayShown) {
                        window.scorecardBirthdayShown = true;
                        showScorecardBirthdayPopup(currentUser.name);
                    }
                }
            }
        } catch (e) {
            console.error("Scorecard birthday check failed:", e);
        }
    }
}

// Helper to render Scorecard Birthday Popup Modal
function showScorecardBirthdayPopup(username) {
    const modal = document.createElement('div');
    modal.id = 'scorecard-birthday-modal';
    modal.className = 'fixed inset-0 z-[99999] flex items-center justify-center bg-black/80 backdrop-blur-md p-4';
    modal.innerHTML = `
        <div class="w-full max-w-md bg-surface-container rounded-3xl border border-secondary/50 p-8 flex flex-col gap-6 shadow-2xl relative text-center items-center justify-center glass-card">
            <button data-action="removeParentCard" class="absolute top-4 right-4 text-on-surface-variant hover:text-on-surface cursor-pointer">
                <span class="material-symbols-outlined">close</span>
            </button>
            <div class="w-20 h-20 bg-secondary/15 rounded-full flex items-center justify-center mb-2 text-5xl animate-bounce">
                🎉
            </div>
            <div>
                <span class="text-secondary font-bold text-xs uppercase tracking-widest block mb-2">Today's Birthday 🎂</span>
                <h3 class="font-display-lg text-2xl font-extrabold text-on-surface">This student birthday is today!</h3>
                <p class="text-body-md text-on-surface-variant mt-3 leading-relaxed">
                    Wish you happy birthday, <span class="font-extrabold text-secondary">${escapeHTML(username)}</span>! 🎈🏆
                </p>
            </div>
            <button data-action="removeParentCard" class="w-full py-4 bg-secondary text-on-secondary font-bold rounded-2xl text-sm hover:scale-105 duration-200 transition-all shadow-lg shadow-secondary/15 mt-2 cursor-pointer">
                Awesome, Thank You!
            </button>
        </div>
    `;
    document.body.appendChild(modal);
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
                <a class="font-body-md text-on-surface-variant transition-all hover:text-secondary cursor-pointer" data-nav="landing">Academy</a>
                <a class="font-body-md text-on-surface-variant transition-all hover:text-secondary cursor-pointer" data-nav="dashboard">Dashboard</a>
                <a class="font-body-md text-on-surface-variant transition-all hover:text-secondary cursor-pointer" data-nav="chess">Arena</a>
                <a class="font-body-md text-on-surface-variant transition-all hover:text-secondary cursor-pointer" data-nav="puzzles">Puzzles</a>
                <a class="font-body-md text-on-surface-variant transition-all hover:text-secondary cursor-pointer" data-nav="vision-trainer">Vision</a>
                <a class="font-body-md text-on-surface-variant transition-all hover:text-secondary cursor-pointer" data-nav="openings">Openings</a>
                <a class="font-body-md text-on-surface-variant transition-all hover:text-secondary cursor-pointer" data-nav="classes">Classes</a>
                <a class="font-body-md text-on-surface-variant transition-all hover:text-secondary cursor-pointer" data-nav="tournaments">Tournaments</a>
                <a class="font-body-md text-on-surface-variant transition-all hover:text-secondary cursor-pointer" data-nav="leaderboard">Leaderboard</a>
            `;
        }





        authElements.forEach(el => el.classList.remove('hidden'));
        guestElements.forEach(el => el.classList.add('hidden'));
        if (typeof checkBirthdayWishFlow === 'function') {
            checkBirthdayWishFlow();
        }
    } else {


        // Unauthenticated State
        if (loginBtn) loginBtn.classList.remove('hidden');
        if (userProfileMenu) userProfileMenu.classList.add('hidden');



        if (headerNav) {
            headerNav.innerHTML = `
                <a class="font-body-md text-on-surface-variant transition-all hover:text-secondary cursor-pointer" data-nav="landing">Academy</a>
                <a class="font-body-md text-on-surface-variant transition-all hover:text-secondary cursor-pointer" data-nav="puzzles">Puzzles</a>
                <a class="font-body-md text-on-surface-variant transition-all hover:text-secondary cursor-pointer" data-nav="vision-trainer">Vision</a>
                <a class="font-body-md text-on-surface-variant transition-all hover:text-secondary cursor-pointer" data-nav="openings">Openings</a>
                <a class="font-body-md text-on-surface-variant transition-all hover:text-secondary cursor-pointer" data-nav="classes">Classes</a>
                <a class="font-body-md text-on-surface-variant transition-all hover:text-secondary cursor-pointer" data-nav="tournaments">Tournaments</a>
                <a class="font-body-md text-on-surface-variant transition-all hover:text-secondary cursor-pointer" data-nav="leaderboard">Leaderboard</a>
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
                showNotification(`Wish you happy birthday, ${user.name}! You received 1000 points.`, "success");
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
            showNotification(`Wish you happy birthday, ${user.name}! You received 1000 points.`, "success");
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
    if (_liveWS) {
        try {
            _liveWS.close();
        } catch (e) {}
        _liveWS = null;
        window.liveWS = null;
    }
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
window.logoutUser = logoutUser;

// Visual Notification alerts
function showNotification(msg, type = "success") {
    const alertBox = document.createElement('div');
    alertBox.className = `flex items-center gap-3 px-6 py-4 rounded-xl border shadow-xl glass-card`;

    // Direct inline styles to avoid Tailwind JIT compilation/purging issues
    alertBox.style.position = 'fixed';
    alertBox.style.top = '24px';
    alertBox.style.left = '50%';
    alertBox.style.transform = 'translateX(-50%) translateY(-40px)';
    alertBox.style.opacity = '0';
    alertBox.style.zIndex = '999999';
    alertBox.style.width = '92%';
    alertBox.style.maxWidth = '440px';
    alertBox.style.transition = 'transform 0.3s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.3s ease';

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
        <span class="text-body-md text-on-background font-semibold text-center w-full">${msg}</span>
    `;

    document.body.appendChild(alertBox);

    // Animate in
    setTimeout(() => {
        alertBox.style.transform = 'translateX(-50%) translateY(0)';
        alertBox.style.opacity = '1';
    }, 10);

    // Animate out and remove
    setTimeout(() => {
        alertBox.style.transform = 'translateX(-50%) translateY(-40px)';
        alertBox.style.opacity = '0';
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
        window.isProduction = data.isProduction || false;
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
                <button data-action="showPrivacyModal" class="px-3.5 py-1.5 text-xs font-semibold rounded-lg border border-outline-variant/30 hover:bg-surface-variant/30 transition-colors cursor-pointer text-on-surface">Learn More</button>
                <button data-action="acceptCookieConsent" class="px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-secondary text-on-secondary hover:opacity-90 shadow-md transition-opacity cursor-pointer">Accept Cookies</button>
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
                <button data-action="hidePrivacyModal" class="text-on-surface-variant hover:text-on-surface text-xl font-bold cursor-pointer">×</button>
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
                <button data-action="hidePrivacyModal" class="px-4 py-2 text-xs font-semibold rounded-lg bg-secondary text-on-secondary hover:opacity-90 transition-opacity cursor-pointer">Close Policy</button>
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
                <button data-action="hideDataDeletionModal" class="text-on-surface-variant hover:text-on-surface text-xl font-bold cursor-pointer">×</button>
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
            <button data-action="hideDataDeletionModal" class="px-4 py-2 text-xs font-semibold rounded-lg border border-outline-variant/30 hover:bg-surface-variant/30 transition-colors cursor-pointer text-on-surface">Cancel</button>
            <button data-action="requestDataDeletion" data-id="${escapeJSAttr(user.id)}" class="px-4 py-2 text-xs font-semibold rounded-lg bg-red-500 hover:bg-red-600 text-white transition-colors cursor-pointer">Confirm Deletion</button>
        `;
    } else {
        body.innerHTML = `
            <p class="leading-relaxed text-xs">
                To delete your profile data, you must log in first so we can verify your identity.
            </p>
        `;
        actions.innerHTML = `
            <button data-action="hideDataDeletionModal" class="px-4 py-2 text-xs font-semibold rounded-lg bg-secondary text-on-secondary hover:opacity-90 transition-opacity cursor-pointer">Close</button>
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
        const container = document.getElementById('google-login-btn-modal');
        if (container) {
            container.innerHTML = `
                <div class="text-xs text-error p-3 border border-error/25 bg-error/5 rounded-xl flex items-center justify-center gap-2 max-w-xs mx-auto">
                    <span class="material-symbols-outlined text-sm font-bold">error</span>
                    <span>Google auth is not configured. ${window.isProduction ? '' : 'Use direct login below.'}</span>
                </div>
            `;
        }
    }

    // Wait for Google script to load, then initialize (with polling fallback)
    function tryInitGoogle() {
        if (window.google && window.google.accounts && googleClientId) {
            initGoogleAuth(googleClientId);
            return true;
        }
        return false;
    }

    if (!tryInitGoogle() && googleClientId) {
        let checkCount = 0;
        const googleAuthInterval = setInterval(() => {
            checkCount++;
            if (tryInitGoogle()) {
                clearInterval(googleAuthInterval);
            } else if (checkCount > 20) {
                clearInterval(googleAuthInterval);
                console.warn('Google Identity script failed to load.');
                const container = document.getElementById('google-login-btn-modal');
                if (container && (!window.google || !window.google.accounts)) {
                    container.innerHTML = `
                        <div class="text-xs text-error p-3 border border-error/25 bg-error/5 rounded-xl flex items-center justify-center gap-2 max-w-xs mx-auto">
                            <span class="material-symbols-outlined text-sm font-bold">warning</span>
                            <span>Google Sign-In is unavailable. ${window.isProduction ? 'Please check your connection/ad-blocker.' : 'Use direct login below.'}</span>
                        </div>
                    `;
                }
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

window.openSidebar = function () {
    const sidebar = document.querySelector('nav');
    const backdrop = document.getElementById('sidebar-backdrop');
    if (sidebar && sidebar.classList.contains('-translate-x-full')) {
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

// Touch gestures swipe sidebar
(function initTouchGestures() {
    let startX = 0;
    let startY = 0;

    document.addEventListener('touchstart', e => {
        startX = e.touches[0].clientX;
        startY = e.touches[0].clientY;
    }, { passive: true });

    document.addEventListener('touchend', e => {
        const endX = e.changedTouches[0].clientX;
        const endY = e.changedTouches[0].clientY;

        const diffX = endX - startX;
        const diffY = endY - startY;

        // Check if movement is horizontal
        if (Math.abs(diffX) > Math.abs(diffY) * 1.5) {
            // Swipe right: open if started near left edge (startX < 60)
            if (diffX > 75 && startX < 60) {
                window.openSidebar();
            }
            // Swipe left: close
            if (diffX < -75) {
                window.closeSidebar();
            }
        }
    }, { passive: true });
})();




// Load homework widget and coaching notes for student dashboard
// Load homework widget and coaching notes for student dashboard
window.loadStudentDashboardExtras = async function (userId) {
    if (!userId) return;
    const user = getStudents().find(s => s.id === userId);

    const currentUser = getCurrentUser();
    const isTeacher = currentUser && (currentUser.role === 'teacher' || currentUser.email.toLowerCase() === ADMIN_EMAIL);

    // Always hide the homework widget block for both student and teacher dashboard views
    const hwBlock = document.getElementById('student-homework-block');
    if (hwBlock) {
        hwBlock.classList.add('hidden');
    }

    const coachText = document.getElementById('student-coaching-notes-text');
    const coachBlock = document.getElementById('student-coaching-notes-block');

    if (coachBlock) {
        if (isTeacher && userId !== currentUser.id) {
            // Show score/rating adjustment card for the teacher
            coachBlock.classList.remove('hidden');
            const titleEl = coachBlock.querySelector('.card-title');
            if (titleEl) {
                titleEl.innerHTML = `<span class="material-symbols-outlined text-primary">edit</span> Adjust Student Rating`;
            }
            if (coachText) {
                const currentPoints = user ? user.points || 0 : 0;
                coachText.innerHTML = `
                    <div class="flex flex-col gap-3 mt-2">
                        <!-- Direct ELO Points Adjustment -->
                        <div class="flex items-center justify-between p-2.5 bg-surface-container-high rounded-xl border border-outline-variant/30 font-body-md">
                            <div class="flex flex-col">
                                <span class="text-[10px] text-primary font-bold uppercase tracking-wider">Direct ELO Points</span>
                                <span class="text-[10px] text-on-surface-variant">Update student rating score</span>
                            </div>
                            <input id="coach-student-points-input" type="number" value="${currentPoints}" class="w-20 bg-background border border-outline-variant/50 text-on-background text-xs rounded-lg px-2 py-1 text-center font-bold focus:outline-none focus:border-primary" />
                        </div>

                        <button data-action="coachSavePointsAndNotes" data-arg="${escapeHTML(userId)}" class="w-full py-2 bg-primary text-on-primary rounded-xl text-xs font-bold transition-all hover:bg-primary/90 flex items-center justify-center gap-1.5">
                            <span class="material-symbols-outlined text-sm">save</span> Save Rating
                        </button>
                    </div>
                `;
            }
        } else {
            // Hide coaching notes completely for students
            coachBlock.classList.add('hidden');
        }
    }
};

// Navigate to puzzle tab and set the active puzzle for solving homework (stub)
window.startHomeworkPuzzle = function (assignmentId, puzzleId, studentId) {
    navigateTo('puzzles');
};

// Stub for homework assignment
window.coachAssignHomework = async function(studentId) {
    return;
};

window.coachSavePointsAndNotes = async function(studentId) {
    const pointsInput = document.getElementById('coach-student-points-input');
    if (!pointsInput) return;

    const points = parseInt(pointsInput.value, 10) || 0;

    showNotification("Saving student rating...", "info");
    const result = await API.teacherEditStudent(studentId, points, "");
    if (result) {
        showNotification("Student rating saved successfully!", "success");
        
        // Refresh local students cache and dashboard view immediately
        await window.syncDatabaseWithServer();
        if (typeof renderDashboard === 'function') {
            renderDashboard();
        }
    } else {
        showNotification("Failed to save rating.", "error");
    }
};

// =======================================================
// ADVANCED STATISTICS & HEATMAP/RADAR GRAPH RENDERING
// =======================================================

window.showGlobalTooltip = function (event, text) {
    let tooltip = document.getElementById('app-global-tooltip');
    if (!tooltip) {
        tooltip = document.createElement('div');
        tooltip.id = 'app-global-tooltip';
        tooltip.className = 'absolute hidden bg-surface-container-highest border border-outline-variant text-[10px] text-on-surface font-semibold px-2 py-1 rounded-md shadow-md pointer-events-none z-[200] transition-opacity duration-150';
        document.body.appendChild(tooltip);
    }
    tooltip.innerText = text;
    tooltip.classList.remove('hidden');
    
    const rect = event.currentTarget.getBoundingClientRect();
    tooltip.style.left = `${window.scrollX + rect.left + (rect.width / 2) - (tooltip.offsetWidth / 2)}px`;
    tooltip.style.top = `${window.scrollY + rect.top - tooltip.offsetHeight - 6}px`;
    tooltip.style.opacity = 1;
};

window.hideGlobalTooltip = function () {
    const tooltip = document.getElementById('app-global-tooltip');
    if (tooltip) {
        tooltip.classList.add('hidden');
        tooltip.style.opacity = 0;
    }
};

// Tooltip helpers for Heatmap cells (handles mouse events)
window.showHeatmapTooltip = function (event) {
    const text = event.currentTarget.getAttribute('data-tooltip');
    window.showGlobalTooltip(event, text);
};
window.hideHeatmapTooltip = function () {
    window.hideGlobalTooltip();
};

function getPuzzleMotif(title) {
    const t = title.toLowerCase();
    if (t.includes('fork') || t.includes('double attack')) return 'Fork';
    if (t.includes('mate') || t.includes('net') || t.includes('weakness')) return 'Checkmate';
    if (t.includes('discovered') || t.includes('check')) return 'Discovered Attack';
    if (t.includes('pin') || t.includes('diagonal')) return 'Pin';
    if (t.includes('sacrifice') || t.includes('deflection') || t.includes('decoy')) return 'Sacrifice';
    return 'Checkmate'; // default fallback
}

function renderTacticsHeatmap(user) {
    const solvedCounts = {};
    const detailed = user.solvedPuzzlesDetailed || [];
    detailed.forEach(p => {
        if (p.date) {
            solvedCounts[p.date] = (solvedCounts[p.date] || 0) + 1;
        }
    });

    // Calculate streak
    let streak = 0;
    let checkDate = new Date();
    const todayStr = checkDate.toISOString().split('T')[0];
    let hasToday = (solvedCounts[todayStr] || 0) > 0;
    
    let tempDate = new Date();
    if (!hasToday) {
        // If they didn't solve today, check if they solved yesterday to continue streak
        tempDate.setDate(tempDate.getDate() - 1);
    }
    
    while (true) {
        const dStr = tempDate.toISOString().split('T')[0];
        if (solvedCounts[dStr] > 0) {
            streak++;
            tempDate.setDate(tempDate.getDate() - 1);
        } else {
            break;
        }
    }

    const streakTxt = document.getElementById('heatmap-streak-txt');
    if (streakTxt) {
        streakTxt.innerText = `${streak} day solved streak ${streak > 0 ? '🔥' : '❄️'}`;
    }

    const svg = document.getElementById('tactics-heatmap-svg');
    if (!svg) return;
    svg.innerHTML = '';

    // Create 53 weeks (columns)
    const cells = [];
    const dateCursor = new Date();
    dateCursor.setDate(dateCursor.getDate() - 364);
    
    // Adjust starting cursor to a Sunday so grid align is clean
    const startDay = dateCursor.getDay(); // 0 is Sunday
    dateCursor.setDate(dateCursor.getDate() - startDay);

    for (let col = 0; col < 53; col++) {
        for (let row = 0; row < 7; row++) {
            const dateStr = dateCursor.toISOString().split('T')[0];
            const count = solvedCounts[dateStr] || 0;
            
            // color-grade based on count
            let color = 'rgba(255, 255, 255, 0.05)'; // default dark grey / surface
            if (count === 1) color = 'rgba(16, 185, 129, 0.35)'; // light emerald
            else if (count === 2) color = 'rgba(16, 185, 129, 0.6)'; // medium
            else if (count >= 3) color = 'rgba(16, 185, 129, 1.0)'; // solid
            
            const x = col * 11.5;
            const y = row * 11.5;

            // Formatted date string for tooltip
            const formattedDate = dateCursor.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
            const tooltipTxt = `${count} puzzle${count === 1 ? '' : 's'} solved on ${formattedDate}`;

            cells.push(`
                <rect x="${x}" y="${y}" width="9.5" height="9.5" rx="1.5"
                    fill="${color}" 
                    style="cursor: pointer;"
                    class="transition-all hover:stroke-secondary hover:stroke-[1.5]"
                    data-tooltip="${escapeHTML(tooltipTxt)}"
                />
            `);

            dateCursor.setDate(dateCursor.getDate() + 1);
        }
    }

    svg.innerHTML = cells.join('');
}

function renderTacticsRadarChart(user) {
    const categories = ['Fork', 'Checkmate', 'Discovered Attack', 'Pin', 'Sacrifice'];
    
    // Count user solved puzzles per motif
    const solvedCounts = { 'Fork': 0, 'Checkmate': 0, 'Discovered Attack': 0, 'Pin': 0, 'Sacrifice': 0 };
    const totalPuzzles = { 'Fork': 0, 'Checkmate': 0, 'Discovered Attack': 0, 'Pin': 0, 'Sacrifice': 0 };
    
    // Populate total counts from PUZZLES list
    if (typeof PUZZLES !== 'undefined') {
        PUZZLES.forEach(p => {
            const motif = getPuzzleMotif(p.title);
            totalPuzzles[motif] = (totalPuzzles[motif] || 0) + 1;
        });
    }

    const solvedList = user.solvedPuzzles || [];
    solvedList.forEach(pId => {
        const p = (typeof PUZZLES !== 'undefined') ? PUZZLES.find(item => item.id === pId) : null;
        if (p) {
            const motif = getPuzzleMotif(p.title);
            solvedCounts[motif]++;
        }
    });

    const svg = document.getElementById('tactics-radar-chart');
    const listContainer = document.getElementById('tactics-motif-list');
    if (!svg || !listContainer) return;
    
    svg.innerHTML = '';
    listContainer.innerHTML = '';

    // Render list/accuracy items
    categories.forEach(cat => {
        const solved = solvedCounts[cat];
        const total = totalPuzzles[cat] || 1;
        const pct = Math.round((solved / total) * 100);
        
        listContainer.innerHTML += `
            <div class="flex flex-col gap-1">
                <div class="flex justify-between items-center text-[10px]">
                    <span class="text-on-surface font-semibold">${cat}</span>
                    <span class="text-secondary font-bold">${solved}/${total} (${pct}%)</span>
                </div>
                <div class="w-full h-1 bg-surface-container rounded-full overflow-hidden">
                    <div class="h-full bg-secondary rounded-full" style="width: ${pct}%"></div>
                </div>
            </div>
        `;
    });

    // Draw background concentric pentagons (grids)
    const gridScales = [0.2, 0.4, 0.6, 0.8, 1.0];
    const R = 80;

    gridScales.forEach(scale => {
        const points = [];
        for (let i = 0; i < 5; i++) {
            const angle = (i * 2 * Math.PI / 5) - Math.PI / 2;
            const x = R * scale * Math.cos(angle);
            const y = R * scale * Math.sin(angle);
            points.push(`${x},${y}`);
        }
        svg.innerHTML += `
            <polygon points="${points.join(' ')}" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="1"/>
        `;
    });

    // Draw axes lines and text labels
    for (let i = 0; i < 5; i++) {
        const angle = (i * 2 * Math.PI / 5) - Math.PI / 2;
        const x = R * Math.cos(angle);
        const y = R * Math.sin(angle);
        
        // Draw axis line
        svg.innerHTML += `
            <line x1="0" y1="0" x2="${x}" y2="${y}" stroke="rgba(255,255,255,0.12)" stroke-width="1"/>
        `;

        // Text label positioning
        const labelX = (R + 18) * Math.cos(angle);
        const labelY = (R + 10) * Math.sin(angle);
        let textAnchor = 'middle';
        if (Math.cos(angle) > 0.1) textAnchor = 'start';
        else if (Math.cos(angle) < -0.1) textAnchor = 'end';

        svg.innerHTML += `
            <text x="${labelX}" y="${labelY + 3}" fill="var(--color-on-surface-variant)" font-size="8" font-weight="bold" text-anchor="${textAnchor}">${categories[i]}</text>
        `;
    }

    // Reference benchmark average shape
    const refPoints = [];
    for (let i = 0; i < 5; i++) {
        const angle = (i * 2 * Math.PI / 5) - Math.PI / 2;
        const refVal = 0.5; 
        const x = R * refVal * Math.cos(angle);
        const y = R * refVal * Math.sin(angle);
        refPoints.push(`${x},${y}`);
    }
    svg.innerHTML += `
        <polygon points="${refPoints.join(' ')}" fill="rgba(255,255,255,0.03)" stroke="rgba(255,255,255,0.15)" stroke-width="1" stroke-dasharray="2,2"/>
    `;

    // Student actual performance shape
    const studentPoints = [];
    for (let i = 0; i < 5; i++) {
        const cat = categories[i];
        const solved = solvedCounts[cat];
        const total = totalPuzzles[cat] || 1;
        
        const pct = Math.max(0.12, solved / total);
        const angle = (i * 2 * Math.PI / 5) - Math.PI / 2;
        const x = R * pct * Math.cos(angle);
        const y = R * pct * Math.sin(angle);
        studentPoints.push(`${x},${y}`);
    }
    
    svg.innerHTML += `
        <polygon points="${studentPoints.join(' ')}" fill="rgba(222, 184, 135, 0.2)" stroke="var(--color-secondary)" stroke-width="2"/>
    `;

    // Draw coordinate dots
    for (let i = 0; i < 5; i++) {
        const cat = categories[i];
        const solved = solvedCounts[cat];
        const total = totalPuzzles[cat] || 1;
        const pct = Math.max(0.12, solved / total);
        
        const angle = (i * 2 * Math.PI / 5) - Math.PI / 2;
        const x = R * pct * Math.cos(angle);
        const y = R * pct * Math.sin(angle);
        
        svg.innerHTML += `
            <circle cx="${x}" cy="${y}" r="3.5" fill="var(--color-secondary)" stroke="var(--color-surface-container-highest)" stroke-width="1"
                style="cursor: pointer;"
                data-tooltip="${cat}: ${solved} solved / ${total} total"
            />
        `;
    }
}

// ================================================================
// TEACHER ROLE CHECK
// ================================================================
let currentUserRole = 'student';

async function checkTeacherRole() {
    try {
        const res = await fetch('/api/me/role', { credentials: 'include' });
        if (!res.ok) return;
        const data = await res.json();
        currentUserRole = data.role || 'student';

        // Show/hide teacher controls
        const addAnnouncementBtn = document.getElementById('add-announcement-btn');
        const addTournamentBtn = document.getElementById('add-tournament-btn');
        if (addAnnouncementBtn) {
            addAnnouncementBtn.classList.toggle('hidden', currentUserRole !== 'teacher');
        }
        if (addTournamentBtn) {
            addTournamentBtn.classList.toggle('hidden', currentUserRole !== 'teacher');
        }
        const creatorLink = document.getElementById('sidebar-puzzle-creator-link');
        if (creatorLink) {
            creatorLink.classList.toggle('hidden', currentUserRole !== 'teacher');
        }
    } catch (e) {}
}

// ================================================================
// COACH ANNOUNCEMENTS BOARD
// ================================================================
async function loadAnnouncements() {
    const list = document.getElementById('announcements-list');
    if (!list) return;
    list.innerHTML = `<span class="text-xs text-on-surface-variant italic animate-pulse">Loading announcements...</span>`;
    try {
        const res = await fetch('/api/announcements');
        const data = await res.json();
        if (!data.length) {
            list.innerHTML = `<span class="text-xs text-on-surface-variant italic">No announcements yet. Check back soon!</span>`;
            return;
        }
        list.innerHTML = data.map(a => `
            <div class="relative p-3 rounded-xl bg-surface-container-high border ${a.pinned ? 'border-primary/40' : 'border-outline-variant/25'} flex flex-col gap-1">
                ${a.pinned ? `<span class="text-[9px] text-primary font-bold uppercase tracking-wider mb-0.5 flex items-center gap-1"><span class="material-symbols-outlined text-[10px]">push_pin</span> Pinned</span>` : ''}
                <div class="flex justify-between items-start">
                    <span class="text-xs font-bold text-on-surface leading-tight">${escapeHTML(a.title)}</span>
                    ${currentUserRole === 'teacher' ? `<button data-action="deleteAnnouncement" data-id="${a.id}" class="ml-1 text-on-surface-variant hover:text-red-400 transition-colors flex-shrink-0"><span class="material-symbols-outlined text-xs">delete</span></button>` : ''}
                </div>
                <p class="text-[11px] text-on-surface-variant leading-relaxed">${escapeHTML(a.body)}</p>
                <span class="text-[10px] text-on-surface-variant/60 mt-1">${new Date(a.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })} · ${escapeHTML(a.author_name)}</span>
            </div>
        `).join('');
    } catch (e) {
        list.innerHTML = `<span class="text-xs text-red-400">Failed to load announcements.</span>`;
    }
}

function openAnnouncementModal() {
    const m = document.getElementById('announcement-modal');
    if (m) m.classList.remove('hidden');
}
function closeAnnouncementModal() {
    const m = document.getElementById('announcement-modal');
    if (m) m.classList.add('hidden');
}

async function submitAnnouncement() {
    const title = document.getElementById('announcement-title-input')?.value.trim();
    const body = document.getElementById('announcement-body-input')?.value.trim();
    const pinned = document.getElementById('announcement-pinned-input')?.checked;
    if (!title || !body) return showNotification('Title and body are required.', 'error');
    try {
        const res = await fetch('/api/announcements', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ title, body, pinned })
        });
        if (!res.ok) throw new Error(await res.text());
        closeAnnouncementModal();
        document.getElementById('announcement-title-input').value = '';
        document.getElementById('announcement-body-input').value = '';
        document.getElementById('announcement-pinned-input').checked = false;
        showNotification('Announcement posted!', 'success');
        loadAnnouncements();
    } catch (e) {
        showNotification('Failed to post announcement.', 'error');
    }
}

async function deleteAnnouncement(id) {
    try {
        await fetch(`/api/announcements/${id}`, { method: 'DELETE', credentials: 'include' });
        showNotification('Announcement deleted.', 'success');
        loadAnnouncements();
    } catch (e) {
        showNotification('Failed to delete.', 'error');
    }
}

// ================================================================
// DAILY PUZZLE CARD
// ================================================================
function loadDailyPuzzle() {
    const titleEl = document.getElementById('daily-puzzle-title');
    const descEl = document.getElementById('daily-puzzle-desc');
    if (!titleEl || !descEl) return;

    // Pick a deterministic puzzle of the day based on date seed
    const today = new Date();
    const seed = today.getFullYear() * 10000 + (today.getMonth() + 1) * 100 + today.getDate();

    if (typeof PUZZLES === 'undefined' || PUZZLES.length === 0) {
        titleEl.innerText = 'Puzzles loading...';
        return;
    }
    const idx = seed % PUZZLES.length;
    const puzzle = PUZZLES[idx];
    titleEl.innerText = puzzle.title;
    descEl.innerText = puzzle.description;

    // Check if already solved today
    const user = getCurrentUser();
    const todayStr = today.toISOString().split('T')[0];
    const alreadySolved = user && user.solvedPuzzles && user.solvedPuzzles.includes(puzzle.id);
    const btn = document.getElementById('daily-puzzle-btn');
    if (btn) {
        if (alreadySolved) {
            btn.innerHTML = `<span class="material-symbols-outlined text-sm">check_circle</span> Solved Today! ✅`;
            btn.classList.add('opacity-70', 'cursor-default');
            btn.onclick = null;
        } else {
            btn.innerHTML = `<span class="material-symbols-outlined text-sm">play_circle</span> Solve Now`;
            btn.classList.remove('opacity-70', 'cursor-default');
            btn.onclick = () => startDailyPuzzle();
        }
    }

    window._dailyPuzzleId = puzzle.id;
}

function startDailyPuzzle() {
    navigateTo('puzzles');
    setTimeout(() => {
        if (window._dailyPuzzleId && typeof loadPuzzle === 'function') {
            loadPuzzle(window._dailyPuzzleId);
        }
    }, 400);
}

// ================================================================
// ACADEMY TOURNAMENTS
// ================================================================
let loadedAcademyTournamentsList = [];

async function loadAcademyTournaments() {
    const container = document.getElementById('academy-tournaments-list');
    if (!container) return;
    container.innerHTML = `<div class="col-span-full text-center py-8 text-on-surface-variant text-sm animate-pulse">Loading tournaments...</div>`;
    try {
        await checkTeacherRole();
        const res = await fetch('/api/tournaments/academy');
        const tournaments = await res.json();
        loadedAcademyTournamentsList = tournaments;

        if (!tournaments.length) {
            container.innerHTML = `
                <div class="col-span-full text-center py-12">
                    <span class="material-symbols-outlined text-5xl text-on-surface-variant/40 mb-3">emoji_events</span>
                    <p class="text-sm text-on-surface-variant">No tournaments yet. Stay tuned!</p>
                </div>`;
            return;
        }

        container.innerHTML = tournaments.map(t => {
            const statusColor = t.status === 'ongoing' ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' :
                t.status === 'completed' ? 'bg-slate-500/20 text-slate-400 border-slate-500/30' :
                'bg-amber-500/20 text-amber-400 border-amber-500/30';
            const statusLabel = t.status === 'ongoing' ? '🔴 Ongoing' : t.status === 'completed' ? '✅ Completed' : '⏳ Upcoming';
            return `
                <div class="glass-card rounded-2xl p-6 border border-outline-variant/30 flex flex-col gap-3 hover:border-secondary/40 transition-all">
                    <div class="flex items-start justify-between gap-2">
                        <h4 class="font-bold text-on-surface text-base leading-tight">${escapeHTML(t.title)}</h4>
                        <span class="px-2 py-0.5 rounded-full text-[10px] font-bold border ${statusColor} flex-shrink-0">${statusLabel}</span>
                    </div>
                    ${t.description ? `<p class="text-xs text-on-surface-variant leading-relaxed">${escapeHTML(t.description)}</p>` : ''}
                    <div class="flex items-center gap-3 text-[11px] text-on-surface-variant">
                        ${t.start_date ? `<span class="flex items-center gap-1"><span class="material-symbols-outlined text-xs">calendar_today</span>${escapeHTML(t.start_date)}</span>` : ''}
                        <span class="flex items-center gap-1"><span class="material-symbols-outlined text-xs">group</span>${t.registrations} registered</span>
                        <span class="flex items-center gap-1"><span class="material-symbols-outlined text-xs">person</span>${escapeHTML(t.creator_name)}</span>
                    </div>
                    <div class="flex flex-col gap-2 mt-2">
                        <div class="flex gap-2">
                            ${t.isRegistered ? `
                                <div class="flex-1 py-2 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 rounded-xl text-xs font-bold flex items-center justify-center gap-1">
                                    <span class="material-symbols-outlined text-sm">check_circle</span> You have registered
                                </div>
                            ` : (t.status !== 'completed' ? `
                                <button data-action="registerTournament" data-id="${t.id}" class="flex-1 py-2 bg-secondary text-on-secondary rounded-xl text-xs font-bold transition-all shadow hover:bg-secondary/90 flex items-center justify-center gap-1 cursor-pointer">
                                    <span class="material-symbols-outlined text-sm">how_to_reg</span> Register
                                </button>
                            ` : '')}
                            ${currentUserRole === 'teacher' ? `
                                <button data-action="updateTournamentStatus" data-id="${t.id}" data-status="${t.status === 'upcoming' ? 'ongoing' : 'completed'}" title="Change Status" class="py-2 px-3 bg-surface-container-high text-on-surface border border-outline-variant rounded-xl text-xs font-bold transition-all hover:bg-surface-variant/30 flex items-center gap-1">
                                    <span class="material-symbols-outlined text-sm">${t.status === 'upcoming' ? 'play_circle' : 'check_circle'}</span>
                                </button>
                                <button data-action="deleteTournament" data-id="${t.id}" class="py-2 px-3 bg-red-500/10 text-red-400 border border-red-500/20 rounded-xl text-xs font-bold hover:bg-red-500/20 transition-all flex items-center">
                                    <span class="material-symbols-outlined text-sm">delete</span>
                                </button>
                            ` : ''}
                        </div>
                        <div id="tournament-details-${t.id}" class="mt-2 p-3 rounded-xl bg-surface-container-low border border-outline-variant/20 space-y-3">
                            <div id="tournament-players-${t.id}">
                                <span class="text-[9px] font-bold text-secondary uppercase tracking-wider block mb-1">Players</span>
                                <div id="players-list-${t.id}" class="flex flex-wrap gap-1">
                                    <span class="text-[10px] text-on-surface-variant italic">No players registered yet.</span>
                                </div>
                            </div>
                            <div id="tournament-pairings-${t.id}">
                                <span class="text-[9px] font-bold text-primary uppercase tracking-wider block mb-1">Bracket Pairings</span>
                                <div id="pairings-list-${t.id}" class="space-y-1.5">
                                    <span class="text-[10px] text-on-surface-variant italic">Pairings will appear when ongoing.</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        // Auto-populate details (players and pairings) for each tournament on render
        tournaments.forEach(t => {
            window.loadTournamentDetailsInline(t.id);
        });
    } catch (e) {
        container.innerHTML = `<div class="col-span-full text-center py-8 text-red-400 text-sm">Failed to load tournaments.</div>`;
    }
}

function openTournamentModal() {
    const m = document.getElementById('tournament-modal');
    if (m) m.classList.remove('hidden');
}
function closeTournamentModal() {
    const m = document.getElementById('tournament-modal');
    if (m) m.classList.add('hidden');
}

async function submitTournament() {
    const title = document.getElementById('tournament-title-input')?.value.trim();
    const description = document.getElementById('tournament-desc-input')?.value.trim();
    const start_date = document.getElementById('tournament-date-input')?.value.trim();
    if (!title) return showNotification('Tournament name is required.', 'error');
    try {
        const res = await fetch('/api/tournaments/academy', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ title, description, start_date })
        });
        if (!res.ok) throw new Error(await res.text());
        closeTournamentModal();
        document.getElementById('tournament-title-input').value = '';
        document.getElementById('tournament-desc-input').value = '';
        document.getElementById('tournament-date-input').value = '';
        showNotification('Tournament created!', 'success');
        loadAcademyTournaments();
    } catch (e) {
        showNotification('Failed to create tournament.', 'error');
    }
}

async function registerTournament(id) {
    try {
        const res = await fetch(`/api/tournaments/academy/${id}/register`, { method: 'POST', credentials: 'include' });
        if (!res.ok) throw new Error(await res.text());
        showNotification('Registered for tournament!', 'success');
        loadAcademyTournaments();
    } catch (e) {
        showNotification('Registration failed.', 'error');
    }
}

async function deleteTournament(id) {
    try {
        await fetch(`/api/tournaments/academy/${id}`, { method: 'DELETE', credentials: 'include' });
        showNotification('Tournament deleted.', 'success');
        loadAcademyTournaments();
    } catch (e) {
        showNotification('Failed to delete.', 'error');
    }
}

async function updateTournamentStatus(id, status) {
    try {
        await fetch(`/api/tournaments/academy/${id}/status`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ status })
        });
        showNotification(`Tournament marked ${status}!`, 'success');
        loadAcademyTournaments();
    } catch (e) {
        showNotification('Failed to update.', 'error');
    }
}

window.challengeTournamentOpponent = function(opponentId, opponentName) {
    if (typeof window.sendChallengeInvite === 'function') {
        // Send a 5-minute (300 seconds) challenge to the tournament opponent
        window.sendChallengeInvite(opponentId, opponentName, 300);
    } else {
        showNotification("Failed to send challenge. Please make sure you are connected to the live server.", "error");
    }
};

// ================================================================
// PDF PROGRESS REPORT CARD
// ================================================================
function downloadProgressReport() {
    const user = getCurrentUser();
    if (!user) return showNotification('Please sign in to download your report.', 'error');

    const { jsPDF } = window.jspdf || {};
    if (!jsPDF) return showNotification('PDF library not loaded. Try refreshing.', 'error');

    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

    // Helper: Draw footer at bottom of a page
    function drawFooter(pdfDoc) {
        pdfDoc.setFillColor(30, 27, 75);
        pdfDoc.rect(0, 280, 210, 17, 'F');
        pdfDoc.setTextColor(200, 190, 240);
        pdfDoc.setFontSize(8);
        pdfDoc.setFont('helvetica', 'normal');
        pdfDoc.text('Mind Square Chess Academy · This report was generated automatically and is for internal use only.', 15, 290);
    }

    // Helper: Turn the website logo white for dark header contrast
    function getWhiteLogo() {
        const logoImg = document.getElementById('header-logo-img');
        if (!logoImg) return null;
        try {
            const canvas = document.createElement('canvas');
            canvas.width = logoImg.naturalWidth || logoImg.width || 128;
            canvas.height = logoImg.naturalHeight || logoImg.height || 128;
            const ctx = canvas.getContext('2d');
            
            // Draw original logo
            ctx.drawImage(logoImg, 0, 0);
            
            // Tint to solid white
            ctx.globalCompositeOperation = 'source-in';
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            
            return canvas.toDataURL('image/png');
        } catch (e) {
            console.warn("Failed to generate white logo canvas:", e);
            return null;
        }
    }

    // Header Gradient background
    doc.setFillColor(30, 27, 75);
    doc.rect(0, 0, 210, 55, 'F');
    doc.setFillColor(88, 28, 135);
    doc.rect(0, 35, 210, 20, 'F');

    // Add Academy Logo (White, larger)
    try {
        const whiteLogo = getWhiteLogo();
        if (whiteLogo) {
            doc.addImage(whiteLogo, 'PNG', 15, 7, 20, 20);
        } else {
            // Fallback to original logo if canvas fails
            const logoImg = document.getElementById('header-logo-img');
            if (logoImg) doc.addImage(logoImg, 'PNG', 15, 7, 20, 20);
        }
    } catch (e) {
        console.warn("Could not add logo to PDF:", e);
    }

    // Academy name & metadata (shifted x-coord to 40 to make space for the larger logo)
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(22);
    doc.setFont('helvetica', 'bold');
    doc.text('Mind Square Chess Academy', 40, 19);

    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    doc.text('Progress Report Card', 40, 27);

    doc.setFontSize(9);
    doc.text(`Generated: ${new Date().toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}`, 15, 45);
    doc.text(`Student ID: ${user.id}`, 130, 45);

    // Student name section
    doc.setFillColor(245, 243, 255);
    doc.rect(0, 55, 210, 30, 'F');
    doc.setTextColor(30, 27, 75);
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.text(user.name || 'Student', 15, 72);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 90, 140);
    doc.text(user.email || '', 15, 80);
    doc.text(`Category: ${user.category || 'Beginner'}`, 140, 72);

    // Divider
    doc.setDrawColor(180, 160, 220);
    doc.setLineWidth(0.4);
    doc.line(15, 88, 195, 88);

    // Stats section
    doc.setTextColor(30, 27, 75);
    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.text('Performance Statistics', 15, 97);

    const stats = [
        ['Total Points (ELO)', `${user.points || 0} pts`],
        ['Games Played', `${user.gamesPlayed || 0}`],
        ['Wins', `${user.winCount || 0}`],
        ['Win Rate', `${user.gamesPlayed > 0 ? Math.round((user.winCount / user.gamesPlayed) * 100) : 0}%`],
        ['Puzzles Solved', `${(user.solvedPuzzles || []).length}`],
        ['Academy Rank', `#${getUserRank(user.id)}`],
    ];

    let y = 106;
    stats.forEach(([label, value], i) => {
        const bg = i % 2 === 0 ? [250, 248, 255] : [240, 237, 252];
        doc.setFillColor(...bg);
        doc.rect(15, y - 5, 180, 9, 'F');
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(70, 60, 110);
        doc.text(label, 18, y);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(30, 27, 75);
        doc.text(value, 155, y, { align: 'right' });
        y += 10;
    });

    // Badges section
    y += 5;
    doc.setDrawColor(180, 160, 220);
    doc.line(15, y, 195, y);
    y += 8;
    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(30, 27, 75);
    doc.text('Earned Badges & Achievements', 15, y);
    y += 8;

    const BADGE_DESIGNS = {
        "Beginner": { emoji: "🛡️", gradStart: "#3b82f6", gradEnd: "#06b6d4" },
        "Intermediate": { emoji: "🎖️", gradStart: "#a855f7", gradEnd: "#6366f1" },
        "Super Intermediate": { emoji: "⭐", gradStart: "#ec4899", gradEnd: "#f43f5e" },
        "Advanced": { emoji: "🏆", gradStart: "#f59e0b", gradEnd: "#f97316" },
        "Super Advanced": { emoji: "✨", gradStart: "#f43f5e", gradEnd: "#dc2626" },
        "Grandmaster": { emoji: "👑", gradStart: "#facc15", gradEnd: "#ea580c" },
        "FirstBlood": { emoji: "⚔️", gradStart: "#f87171", gradEnd: "#f43f5e" },
        "Unstoppable": { emoji: "🔥", gradStart: "#f97316", gradEnd: "#dc2626" },
        "Invincible": { emoji: "🛡️", gradStart: "#9333ea", gradEnd: "#dc2626" },
        "TacticWizard": { emoji: "🪄", gradStart: "#22d3ee", gradEnd: "#2563eb" },
        "PuzzleMaster": { emoji: "🧠", gradStart: "#818cf8", gradEnd: "#8b5cf6" },
        "DeepThinker": { emoji: "⏳", gradStart: "#2dd4bf", gradEnd: "#059669" },
        "SpeedDemon": { emoji: "⚡", gradStart: "#fbbf24", gradEnd: "#eab308" },
        "Blitzkrieg": { emoji: "⚡", gradStart: "#ef4444", gradEnd: "#f97316" },
        "RapidMaster": { emoji: "⏰", gradStart: "#2563eb", gradEnd: "#4f46e5" },
        "Scholar": { emoji: "📖", gradStart: "#60a5fa", gradEnd: "#2563eb" },
        "Other": { emoji: "🎨", gradStart: "#10b981", gradEnd: "#0d9488" }
    };

    function generateBadgeImage(bId) {
        const design = BADGE_DESIGNS[bId] || BADGE_DESIGNS["Beginner"];
        const canvas = document.createElement('canvas');
        canvas.width = 128;
        canvas.height = 128;
        const ctx = canvas.getContext('2d');

        // Create gradient background
        const grad = ctx.createLinearGradient(0, 0, 128, 128);
        grad.addColorStop(0, design.gradStart);
        grad.addColorStop(1, design.gradEnd);
        ctx.fillStyle = grad;
        
        // Draw rounded rectangle
        const radius = 28;
        ctx.beginPath();
        if (typeof ctx.roundRect === 'function') {
            ctx.roundRect(4, 4, 120, 120, radius);
        } else {
            ctx.rect(4, 4, 120, 120);
        }
        ctx.fill();

        // Draw glass gloss overlay on top half
        ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
        ctx.beginPath();
        if (typeof ctx.roundRect === 'function') {
            ctx.roundRect(4, 4, 120, 60, [radius, radius, 0, 0]);
        } else {
            ctx.rect(4, 4, 120, 60);
        }
        ctx.fill();

        // Draw emoji icon in center
        ctx.font = '64px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(design.emoji, 64, 66);

        return canvas.toDataURL('image/png');
    }

    const badges = user.badges || ['Beginner'];
    badges.forEach((bId, i) => {
        const b = BADGES[bId] || BADGES['Beginner'];
        const col = i % 2 === 0 ? 15 : 110;
        
        // Push spacing for the next row
        if (i % 2 === 0 && i > 0) {
            y += 12;
        }

        // Automatic Page Break if badges exceed the page boundary (265mm)
        if (y > 265) {
            drawFooter(doc);
            doc.addPage();
            
            // Draw page 2 header banner
            doc.setFillColor(30, 27, 75);
            doc.rect(0, 0, 210, 15, 'F');
            doc.setTextColor(255, 255, 255);
            doc.setFontSize(10);
            doc.setFont('helvetica', 'bold');
            doc.text('Mind Square Chess Academy - Earned Badges (Cont.)', 15, 10);
            
            y = 25; // Reset content start y on new page
        }

        // Generate and add badge image graphic (clean 9x9mm size)
        try {
            const imgData = generateBadgeImage(bId);
            doc.addImage(imgData, 'PNG', col, y - 4, 9, 9);
        } catch (e) {
            console.error("Failed to add badge image to PDF:", e);
            doc.setFillColor(235, 230, 255);
            doc.circle(col + 4.5, y + 0.5, 4.5, 'F');
        }

        // Draw badge name
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        doc.setTextColor(30, 27, 75);
        doc.text(b.name, col + 12, y - 1);
        
        // Draw badge description
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7);
        doc.setTextColor(100, 90, 140);
        const splitDesc = doc.splitTextToSize(b.desc, 72);
        doc.text(splitDesc, col + 12, y + 2.5);
    });

    if (badges.length > 0) {
        y += 10;
    }

    // Coaching notes
    if (user.coachingNotes) {
        y += 8;
        
        // Automatic Page Break if coaching notes would overflow
        if (y > 255) {
            drawFooter(doc);
            doc.addPage();
            
            // Draw page 2 header banner
            doc.setFillColor(30, 27, 75);
            doc.rect(0, 0, 210, 15, 'F');
            doc.setTextColor(255, 255, 255);
            doc.setFontSize(10);
            doc.setFont('helvetica', 'bold');
            doc.text("Mind Square Chess Academy - Coach's Notes (Cont.)", 15, 10);
            
            y = 25;
        }

        doc.setDrawColor(180, 160, 220);
        doc.line(15, y, 195, y);
        y += 8;
        doc.setFontSize(13);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(30, 27, 75);
        doc.text("Coach's Notes", 15, y);
        y += 7;
        doc.setFontSize(10);
        doc.setFont('helvetica', 'italic');
        doc.setTextColor(80, 70, 120);
        const lines = doc.splitTextToSize(user.coachingNotes, 175);
        doc.text(lines, 15, y);
        y += lines.length * 5.5;
    }

    // Draw footer on final page
    drawFooter(doc);

    doc.save(`MindSquare_Report_${(user.name || 'student').replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`);
    showNotification('Report card downloaded!', 'success');
}

// ================================================================
// CONFETTI WIN CELEBRATION
// ================================================================
function launchConfetti() {
    const canvas = document.createElement('canvas');
    canvas.id = 'confetti-canvas';
    canvas.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;z-index:9999;pointer-events:none;';
    document.body.appendChild(canvas);

    const ctx = canvas.getContext('2d');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const colors = ['#a855f7', '#6366f1', '#ec4899', '#f59e0b', '#10b981', '#3b82f6', '#f97316'];
    const particles = Array.from({ length: 160 }, () => ({
        x: Math.random() * canvas.width,
        y: -10,
        r: Math.random() * 6 + 3,
        d: Math.random() * 10 + 2,
        color: colors[Math.floor(Math.random() * colors.length)],
        tilt: Math.floor(Math.random() * 10) - 10,
        tiltAngle: 0,
        tiltAngleIncrement: Math.random() * 0.07 + 0.05
    }));

    let angle = 0;
    let frame;
    let elapsed = 0;

    function draw() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        angle += 0.01;
        elapsed++;
        particles.forEach(p => {
            p.tiltAngle += p.tiltAngleIncrement;
            p.y += (Math.cos(angle + p.d) + 2) * 1.8;
            p.x += Math.sin(angle) * 1.2;
            p.tilt = Math.sin(p.tiltAngle) * 12;
            ctx.beginPath();
            ctx.lineWidth = p.r;
            ctx.strokeStyle = p.color;
            ctx.moveTo(p.x + p.tilt + p.r / 4, p.y);
            ctx.lineTo(p.x + p.tilt, p.y + p.tilt + p.r / 4);
            ctx.stroke();
        });
        if (elapsed < 200) {
            frame = requestAnimationFrame(draw);
        } else {
            canvas.remove();
        }
    }
    draw();
}

// Hook confetti into recordGameResult wins
const _origRecordGameResult = window.recordGameResult || recordGameResult;
window.recordGameResultWithCelebration = function(result) {
    if (result === 'win') {
        launchConfetti();
    }
    if (typeof _origRecordGameResult === 'function') {
        _origRecordGameResult(result);
    }
};

// ================================================================
// WEBSOCKET LIVE CHALLENGE
// ================================================================
let _liveWS = null;
let _liveReconnectTimeout = null;
window._lastOnlineUsersList = [];
let _liveOpponentId = null;
let _liveGameId = null;
let _liveMyColor = null;
let _liveClockLimit = 300;
window._liveClockLimit = 300;

function initLiveChallenge() {
    const user = getCurrentUser();
    if (!user) return;

    // Clear any pending reconnection timer
    if (_liveReconnectTimeout) {
        clearTimeout(_liveReconnectTimeout);
        _liveReconnectTimeout = null;
    }

    if (_liveWS && _liveWS.readyState === WebSocket.OPEN) {
        // Already connected. Refresh list of online users dynamically.
        try {
            _liveWS.send(JSON.stringify({ type: 'get_online_users' }));
            showNotification("Refreshed online students.", "success");
        } catch (e) {}
        return;
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}`;
    _liveWS = new WebSocket(wsUrl);
    window.liveWS = _liveWS;

    _liveWS.onopen = () => {
        _liveWS.send(JSON.stringify({ type: 'register', userId: user.id, userName: user.name }));
        
        // Show live challenge search bar
        const searchContainer = document.getElementById('live-challenge-search-container');
        if (searchContainer) searchContainer.classList.remove('hidden');

        // Update the Connect button state to "Connected"
        const connBtn = document.querySelector('[data-action="initLiveChallenge"]');
        if (connBtn) {
            connBtn.innerText = 'Connected';
            connBtn.className = "text-[10px] px-2 py-1 bg-emerald-600 text-white rounded-lg transition-all font-bold cursor-default";
        }
    };

    _liveWS.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        handleLiveWSMessage(msg);
    };

    _liveWS.onerror = (err) => {
        console.error("Live challenge WebSocket error:", err);
    };

    _liveWS.onclose = (event) => {
        console.warn("Live challenge WebSocket closed. Code:", event.code, "Reason:", event.reason);
        _liveWS = null;
        window.liveWS = null;
        
        // Hide live challenge search bar
        const searchContainer = document.getElementById('live-challenge-search-container');
        if (searchContainer) searchContainer.classList.add('hidden');

        // Update UI to reflect disconnected status
        const container = document.getElementById('live-challenge-users');
        if (container) {
            container.innerHTML = `<span class="text-xs text-red-400 font-semibold flex items-center gap-1"><span class="material-symbols-outlined text-sm">link_off</span> Disconnected. Reconnecting...</span>`;
        }
        
        const connBtn = document.querySelector('[data-action="initLiveChallenge"]');
        if (connBtn) {
            connBtn.innerText = 'Connecting...';
            connBtn.className = "text-[10px] px-2 py-1 bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded-lg transition-all font-bold cursor-default animate-pulse";
        }

        // Auto-reconnect after 3 seconds if the user remains logged in
        if (getCurrentUser()) {
            _liveReconnectTimeout = setTimeout(() => {
                console.log("Attempting to reconnect live challenge WebSocket...");
                initLiveChallenge();
            }, 3000);
        }
    };
}
window.initLiveChallenge = initLiveChallenge;

function handleLiveWSMessage(msg) {
    switch (msg.type) {
        case 'online_users':
            window._lastOnlineUsersList = msg.users;
            renderOnlineUsers(msg.users);
            break;
        case 'challenge_invited':
            showChallengeInvite(msg);
            break;
        case 'challenge_accepted':
            startLiveGame(msg);
            break;
        case 'challenge_declined':
            showNotification(`${msg.declinedByName} declined your challenge.`, 'error');
            break;
        case 'tournaments_updated':
            if (typeof loadAcademyTournaments === 'function') {
                loadAcademyTournaments();
            }
            break;
        case 'spectator_move':
            if (typeof window.handleSpectatorMove === 'function') {
                window.handleSpectatorMove(msg.gameId, msg.move, msg.fen, msg.san);
            }
            break;
        case 'spectator_game_over':
            if (typeof window.handleSpectatorGameOver === 'function') {
                window.handleSpectatorGameOver(msg.gameId, msg.result);
            }
            break;
        case 'opponent_move':
            applyOpponentMove(msg.move, msg.fen);
            break;
        case 'opponent_resigned':
            showNotification('Opponent resigned! You win! 🎉', 'success');
            launchConfetti();
            
            // Record victory points
            if (typeof window.recordGameResult === 'function') {
                window.recordGameResult('win');
            }
            
            // Close active game states
            window._liveMode = false;
            const chatWrapperResign = document.getElementById('live-chat-wrapper');
            if (chatWrapperResign) chatWrapperResign.classList.add('hidden');
            
            const statusElResign = document.getElementById('chess-status');
            if (statusElResign) statusElResign.innerText = "Game over. Opponent resigned.";
            
            if (typeof stopChessClock === 'function') {
                stopChessClock();
            }
            break;
        case 'game_resume':
            resumeLiveGame(msg);
            break;
        case 'opponent_disconnected':
            showNotification(`Opponent went offline! Waiting ${msg.graceSeconds}s for them to return...`, 'warning');
            break;
        case 'opponent_reconnected':
            showNotification('Opponent reconnected!', 'success');
            break;
        case 'opponent_disconnected_timeout':
            showNotification('Opponent failed to reconnect in time. Game ended.', 'info');
            window._liveMode = false;
            break;
        case 'opponent_draw_offered':
            showDrawOffer();
            break;
        case 'opponent_draw_accepted':
            showNotification("It's a draw! 🤝", 'info');
            break;
        case 'chat':
            appendLiveChat(msg.senderName, msg.text);
            break;
        case 'spectator_move':
            if (typeof window.handleSpectatorMove === 'function') {
                window.handleSpectatorMove(msg.gameId, msg.move, msg.fen, msg.san);
            }
            break;
        case 'spectator_game_over':
            if (typeof window.handleSpectatorGameOver === 'function') {
                window.handleSpectatorGameOver(msg.gameId, msg.result);
            }
            break;
        case 'spectator_count':
            if (typeof window.updateSpectatorCount === 'function') {
                window.updateSpectatorCount(msg.gameId, msg.count);
            }
            break;
    }
}

function renderOnlineUsers(users) {
    const container = document.getElementById('live-challenge-users');
    if (!container) return;
    
    // Filter out the current user to prevent challenging yourself
    const currentUser = getCurrentUser();
    let otherUsers = users.filter(u => u.id !== currentUser?.id);

    // Apply search filter if query is present
    const searchInput = document.getElementById('live-challenge-search-input');
    const query = searchInput ? searchInput.value.toLowerCase().trim() : '';
    if (query) {
        otherUsers = otherUsers.filter(u => u.name.toLowerCase().includes(query));
    }

    if (!otherUsers.length) {
        container.innerHTML = `<span class="text-xs text-on-surface-variant italic">${query ? 'No matching online students.' : 'No other students online right now.'}</span>`;
        return;
    }
    container.innerHTML = otherUsers.map(u => `
        <div class="flex items-center justify-between p-2 rounded-xl bg-surface-container-high border border-outline-variant/25 gap-2">
            <div class="flex items-center gap-2">
                <span class="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                <span class="text-xs font-semibold text-on-surface">${escapeHTML(u.name)}</span>
            </div>
            <button data-action="sendChallengeInvite" data-target-user-id="${u.id}" data-target-user-name="${u.name.replace(/'/g, "\\'")}"
                class="text-[10px] px-2 py-1 bg-secondary text-on-secondary rounded-lg font-bold hover:bg-secondary/90 transition-all">
                ⚔️ Challenge
            </button>
        </div>
    `).join('');
}
window.renderOnlineUsers = renderOnlineUsers;

function sendChallengeInvite(targetUserId, targetUserName, clockLimit) {
    if (!_liveWS) { showNotification('Not connected. Refresh the page.', 'error'); return; }
    _liveWS.send(JSON.stringify({ type: 'challenge_invite', targetUserId, clockLimit: clockLimit || _liveClockLimit }));
    showNotification(`Challenge sent to ${targetUserName}!`, 'success');
}
window.sendChallengeInvite = sendChallengeInvite;

function setLiveClockLimit(limit) {
    _liveClockLimit = limit;
    window._liveClockLimit = limit; // Keep both in sync for external handlers
    
    // Update the visual styling of all clock preset buttons in the Live Challenge widget
    const buttons = document.querySelectorAll('[data-action="setLiveClockLimit"]');
    buttons.forEach(btn => {
        const arg = parseInt(btn.getAttribute('data-arg'), 10);
        if (arg === limit) {
            btn.className = "px-2 py-1 rounded-lg text-[10px] bg-secondary/20 border border-secondary/40 text-secondary font-bold transition-all";
        } else {
            btn.className = "px-2 py-1 rounded-lg text-[10px] bg-surface-container-high border border-outline-variant text-on-surface hover:border-secondary transition-all";
        }
    });
}
window.setLiveClockLimit = setLiveClockLimit;

function showChallengeInvite(msg) {
    const user = getCurrentUser();
    
    // Hide legacy dashboard banner completely since we now use the centered modal
    const banner = document.getElementById('live-challenge-invite-banner');
    if (banner) {
        banner.classList.add('hidden');
    }

    // Centered modal backdrop & box
    const toastId = 'live-challenge-toast-' + msg.senderId;
    let toast = document.getElementById(toastId);
    if (!toast) {
        toast = document.createElement('div');
        toast.id = toastId;
        toast.className = 'fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4';
        document.body.appendChild(toast);
    }
    toast.innerHTML = `
        <div class="max-w-md w-full p-6 rounded-2xl shadow-2xl border border-outline-variant/30 bg-surface/95 text-on-surface flex flex-col gap-4" style="backdrop-filter: blur(20px); animation: zoomIn 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);">
            <div class="flex items-center gap-3">
                <div class="w-12 h-12 rounded-full bg-secondary/20 flex items-center justify-center text-secondary text-2xl animate-pulse">
                    <span class="material-symbols-outlined text-2xl">swords</span>
                </div>
                <div>
                    <h3 class="font-display-lg text-lg font-bold">Live Challenge Invite!</h3>
                    <p class="text-[10px] text-on-surface-variant uppercase tracking-wider">Real-time PvP Chess</p>
                </div>
            </div>
            <p class="text-sm text-on-surface leading-relaxed">
                <strong>${escapeHTML(msg.senderName)}</strong> has challenged you to a live match (${msg.clockLimit / 60} min time control)!
            </p>
            <div class="flex justify-end gap-3 mt-2">
                <button data-action="declineChallenge" data-sender-id="${msg.senderId}" class="px-4 py-2 bg-red-500/10 text-red-400 border border-red-500/30 rounded-xl text-xs font-bold hover:bg-red-500/20 transition-all cursor-pointer">Decline</button>
                <button data-action="acceptChallenge" data-sender-id="${msg.senderId}" data-clock-limit="${msg.clockLimit}" class="px-4 py-2 bg-emerald-600 text-white rounded-xl text-xs font-bold hover:bg-emerald-700 transition-all cursor-pointer">Accept Challenge</button>
            </div>
        </div>
    `;
}

function acceptChallenge(senderId, clockLimit) {
    if (!_liveWS) return;
    _liveWS.send(JSON.stringify({ type: 'challenge_accept', senderId, clockLimit }));
    const banner = document.getElementById('live-challenge-invite-banner');
    if (banner) banner.classList.add('hidden');
    // Remove the centered challenge invite modal
    const toastId = 'live-challenge-toast-' + senderId;
    const toast = document.getElementById(toastId);
    if (toast) toast.remove();
}
window.acceptChallenge = acceptChallenge;

function declineChallenge(senderId) {
    if (!_liveWS) return;
    _liveWS.send(JSON.stringify({ type: 'challenge_decline', senderId }));
    const banner = document.getElementById('live-challenge-invite-banner');
    if (banner) banner.classList.add('hidden');
    // Remove the centered challenge invite modal
    const toastId = 'live-challenge-toast-' + senderId;
    const toast = document.getElementById(toastId);
    if (toast) toast.remove();
}
window.declineChallenge = declineChallenge;

function startLiveGame(msg) {
    const user = getCurrentUser();
    _liveGameId = msg.gameId;
    _liveMyColor = msg.whitePlayerId === user.id ? 'w' : 'b';
    _liveOpponentId = _liveMyColor === 'w' ? msg.blackPlayerId : msg.whitePlayerId;
    _liveClockLimit = msg.clockLimit || 300;

    showNotification(`Live game started! You play as ${_liveMyColor === 'w' ? 'White' : 'Black'}. Good luck!`, 'success');
    navigateTo('chess');

    setTimeout(() => {
        if (typeof selectedClockLimit !== 'undefined') {
            selectedClockLimit = _liveClockLimit;
        }
        if (typeof initChessGame === 'function') initChessGame();
        
        window._liveMode = true;
        window._liveMyColor = _liveMyColor;

        // Flip board if player is playing as Black
        if (typeof boardFlipped !== 'undefined') {
            boardFlipped = (_liveMyColor === 'b');
            if (typeof renderBoard2D === 'function') renderBoard2D();
        }

        // Start the clock!
        if (typeof startChessClock === 'function' && _liveClockLimit > 0) {
            activeClockPlayer = 'w';
            startChessClock();
        }
    }, 400);
}

function resumeLiveGame(msg) {
    const user = getCurrentUser();
    _liveGameId = msg.gameId;
    _liveMyColor = msg.whitePlayerId === user.id ? 'w' : 'b';
    _liveOpponentId = _liveMyColor === 'w' ? msg.blackPlayerId : msg.whitePlayerId;
    _liveClockLimit = msg.clockLimit || 300;

    showNotification(`Resuming live match...`, 'info');
    navigateTo('chess');

    setTimeout(() => {
        if (typeof selectedClockLimit !== 'undefined') {
            selectedClockLimit = _liveClockLimit;
        }
        
        // Pass the FEN string to rebuild the board layout
        if (typeof initChessGame === 'function') initChessGame(msg.fen);
        
        window._liveMode = true;
        window._liveMyColor = _liveMyColor;

        // Flip board if player is playing as Black
        if (typeof boardFlipped !== 'undefined') {
            boardFlipped = (_liveMyColor === 'b');
            if (typeof renderBoard2D === 'function') renderBoard2D();
        }

        // Resync current active turn status
        if (typeof chessGame !== 'undefined') {
            const currentTurn = chessGame.turn();
            const statusEl = document.getElementById('chess-status');
            if (statusEl) {
                statusEl.innerText = currentTurn === _liveMyColor ? "Your turn! Choose a move." : "Opponent is thinking...";
            }

            // Start clock for the player whose turn it currently is
            if (typeof startChessClock === 'function' && _liveClockLimit > 0) {
                activeClockPlayer = currentTurn;
                startChessClock();
            }
        }
    }, 400);
}

function resignLiveGame() {
    if (!window._liveMode || !_liveWS || !_liveGameId || !_liveOpponentId) return;
    
    if (confirm("Are you sure you want to resign the game? This will count as a loss.")) {
        _liveWS.send(JSON.stringify({
            type: 'game_resign',
            gameId: _liveGameId,
            opponentId: _liveOpponentId
        }));

        // Record defeat points
        if (typeof window.recordGameResult === 'function') {
            window.recordGameResult('lose');
        }

        window._liveMode = false;
        showNotification("You resigned the game.", "info");

        // Hide active game chat and controls
        const chatWrapper = document.getElementById('live-chat-wrapper');
        if (chatWrapper) chatWrapper.classList.add('hidden');

        const statusEl = document.getElementById('chess-status');
        if (statusEl) {
            statusEl.innerText = "Game over. You resigned.";
        }
        
        if (typeof stopChessClock === 'function') {
            stopChessClock();
        }
    }
}
window.resignLiveGame = resignLiveGame;

function sendLiveMove(move, fen) {
    if (!_liveWS || !_liveOpponentId || !window._liveMode) return;
    _liveWS.send(JSON.stringify({
        type: 'game_move',
        gameId: _liveGameId,
        opponentId: _liveOpponentId,
        move,
        fen,
        san: move
    }));
}
window.sendLiveMove = sendLiveMove;

function applyOpponentMove(move, fen) {
    if (typeof chessGame !== 'undefined' && move) {
        try {
            const parsedMove = chessGame.move(move);
            if (parsedMove) {
                if (typeof playMoveSoundForMove === 'function') {
                    playMoveSoundForMove(parsedMove, chessGame);
                }
                
                // Render opponent's move on active board view (2D or 3D)
                if (typeof gameMode !== 'undefined' && gameMode === '3D' && typeof updateBoard3D === 'function') {
                    updateBoard3D();
                } else if (typeof renderBoard2D === 'function') {
                    renderBoard2D();
                }

                // Update game turn status text
                const statusEl = document.getElementById('chess-status');
                if (statusEl) {
                    statusEl.innerText = `Opponent played: ${parsedMove.san}. Your turn!`;
                }

                // Verify checkmate, draw or game-over status
                if (typeof checkGameStatus === 'function') {
                    checkGameStatus();
                }

                // Switch clock turn
                if (typeof switchClockTurn === 'function') {
                    switchClockTurn();
                }
            }
        } catch (e) {
            console.error('Error applying opponent move:', e);
        }
    }
}
window.applyOpponentMove = applyOpponentMove;

function showDrawOffer() {
    showNotification('Opponent offers a draw. Check the live game panel to respond.', 'info');
}

function appendLiveChat(senderName, text) {
    const chatEl = document.getElementById('live-chat-messages');
    if (!chatEl) return;
    const msg = document.createElement('div');
    msg.className = 'text-xs p-2 rounded-lg bg-surface-container-high border border-outline-variant/20';
    msg.innerHTML = `<strong class="text-secondary">${escapeHTML(senderName)}:</strong> <span class="text-on-surface">${escapeHTML(text)}</span>`;
    chatEl.appendChild(msg);
    chatEl.scrollTop = chatEl.scrollHeight;
}

function sendLiveChatMessage() {
    const input = document.getElementById('live-chat-input');
    if (!input || !_liveWS || !_liveOpponentId) return;
    const text = input.value.trim();
    if (!text) return;
    _liveWS.send(JSON.stringify({ type: 'chat_message', gameId: _liveGameId, opponentId: _liveOpponentId, text }));
    appendLiveChat('You', text);
    input.value = '';
}



// ================================================================
// STUDY / LOGIN STREAK TRACKER
// ================================================================
function trackStudyStreak() {
    const user = getCurrentUser();
    if (!user) return;

    const key = `studyStreak_${user.id}`;
    const todayStr = new Date().toISOString().split('T')[0];

    let streak = JSON.parse(localStorage.getItem(key) || '{"count":0,"lastDate":""}');

    if (streak.lastDate === todayStr) return; // Already tracked today

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];

    if (streak.lastDate === yesterdayStr) {
        streak.count++;
    } else if (streak.lastDate !== todayStr) {
        streak.count = 1;
    }

    streak.lastDate = todayStr;
    localStorage.setItem(key, JSON.stringify(streak));

    // Show streak badge on dashboard
    const dashStreakEl = document.getElementById('dash-study-streak');
    if (dashStreakEl) {
        dashStreakEl.textContent = `🔥 ${streak.count} day streak`;
        dashStreakEl.classList.remove('hidden');
    }

    // Award streak achievements
    if (streak.count >= 7 && user.badges && !user.badges.includes('streak_week')) {
        if (typeof updateStudentProgression === 'function') {
            updateStudentProgression(user.id, 'study_streak_7');
        }
    }

    return streak.count;
}

// Run streak tracker on init
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(trackStudyStreak, 1500);
});

// ================================================================
// LIVE GAME INTEGRATION — Show chat on game start
// ================================================================
const _origStartLiveGame = window.startLiveGame;
function startLiveGame_enhanced(msg) {
    // Show live chat panel
    const chatWrapper = document.getElementById('live-chat-wrapper');
    if (chatWrapper) chatWrapper.classList.remove('hidden');
    startLiveGame(msg);
}

// ================================================================
// CLASS RECORDINGS SYSTEM
// ================================================================
async function toggleRecordings(scheduleId, btn) {
    const container = document.getElementById(`recordings-container-${scheduleId}`);
    if (!container) return;

    if (container.classList.contains('hidden')) {
        container.classList.remove('hidden');
        btn.classList.add('bg-secondary/20', 'text-secondary', 'border-secondary/30');

        // Fetch recordings
        await loadRecordingsList(scheduleId);

        // Show/hide teacher adding section
        const addBox = document.getElementById(`add-recording-box-${scheduleId}`);
        if (addBox) {
            addBox.classList.toggle('hidden', currentUserRole !== 'teacher');
        }
    } else {
        container.classList.add('hidden');
        btn.classList.remove('bg-secondary/20', 'text-secondary', 'border-secondary/30');
    }
}

async function loadRecordingsList(scheduleId) {
    const list = document.getElementById(`recordings-list-${scheduleId}`);
    if (!list) return;

    list.innerHTML = `<span class="text-[10px] text-on-surface-variant italic animate-pulse">Loading recordings...</span>`;
    try {
        const res = await fetch(`/api/schedules/${scheduleId}/recordings`);
        if (!res.ok) throw new Error();
        const data = await res.json();

        if (!data.length) {
            list.innerHTML = `<span class="text-[10px] text-on-surface-variant italic">No recording links added yet.</span>`;
            return;
        }

        list.innerHTML = data.map(r => `
            <div class="flex items-center justify-between p-2 rounded-lg bg-surface-container-high border border-outline-variant/20 gap-2">
                <a href="${safeUrl(r.recording_url)}" target="_blank" rel="noopener noreferrer" 
                    class="text-xs text-primary hover:underline font-semibold flex items-center gap-1 overflow-hidden text-ellipsis whitespace-nowrap">
                    <span class="material-symbols-outlined text-[14px]">play_circle</span>
                    <span>${escapeHTML(r.title || 'Recorded Session')}</span>
                </a>
                <div class="flex items-center gap-1.5 flex-shrink-0">
                    <span class="text-[9px] text-on-surface-variant/60">${new Date(r.recorded_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span>
                    ${currentUserRole === 'teacher' ? `
                        <button data-action="deleteRecording" data-schedule-id="${scheduleId}" data-recording-id="${r.id}" class="text-on-surface-variant hover:text-red-400 transition-colors">
                            <span class="material-symbols-outlined text-xs">delete</span>
                        </button>
                    ` : ''}
                </div>
            </div>
        `).join('');
    } catch (e) {
        list.innerHTML = `<span class="text-[10px] text-red-400">Failed to load recordings.</span>`;
    }
}

async function saveClassRecording(scheduleId) {
    const titleInput = document.getElementById(`rec-title-${scheduleId}`);
    const urlInput = document.getElementById(`rec-url-${scheduleId}`);
    if (!titleInput || !urlInput) return;

    const title = titleInput.value.trim();
    const url = urlInput.value.trim();
    if (!url) return showNotification('Recording URL is required.', 'error');

    try {
        const res = await fetch(`/api/schedules/${scheduleId}/recordings`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ title, recording_url: url })
        });
        if (!res.ok) throw new Error(await res.text());

        titleInput.value = '';
        urlInput.value = '';
        showNotification('Recording added successfully!', 'success');
        await loadRecordingsList(scheduleId);
    } catch (e) {
        showNotification('Failed to add recording.', 'error');
    }
}

async function deleteRecording(scheduleId, id) {
    if (!confirm('Are you sure you want to delete this recording?')) return;
    try {
        const res = await fetch(`/api/schedules/recordings/${id}`, {
            method: 'DELETE',
            credentials: 'include'
        });
        if (!res.ok) throw new Error();
        showNotification('Recording deleted.', 'success');
        await loadRecordingsList(scheduleId);
    } catch (e) {
        showNotification('Failed to delete recording.', 'error');
    }
}

// ================================================================
// TOURNAMENT DETAILS & BRACKET FIXTURES GENERATOR
// ================================================================
window.loadTournamentDetailsInline = async function(tournamentId) {
    const playersList = document.getElementById(`players-list-${tournamentId}`);
    const pairingsList = document.getElementById(`pairings-list-${tournamentId}`);
    if (!playersList && !pairingsList) return;

    try {
        const res = await fetch(`/api/tournaments/academy/${tournamentId}/registrations`, { credentials: 'include' });
        if (!res.ok) throw new Error();
        const players = await res.json();

        // Populate players list
        if (playersList) {
            if (!players.length) {
                playersList.innerHTML = `<span class="text-[10px] text-on-surface-variant italic">No players registered yet.</span>`;
            } else {
                playersList.innerHTML = players.map(p => `
                    <span class="px-2 py-0.5 rounded-full text-[9px] font-bold bg-surface-container-high border border-outline-variant text-on-surface"
                        title="${p.category || 'Beginner'} · ${p.points} ELO">
                        👤 ${escapeHTML(p.name)}
                    </span>
                `).join('');
            }
        }

        // Generate bracket fixtures
        if (pairingsList) {
            if (players.length < 2) {
                pairingsList.innerHTML = `<span class="text-[10px] text-on-surface-variant italic">At least 2 players required to build bracket.</span>`;
            } else {
                // Fetch active live games from server
                let activeGames = [];
                try {
                    const gamesRes = await fetch('/api/games/active');
                    if (gamesRes.ok) {
                        activeGames = await gamesRes.json();
                    }
                } catch (err) {
                    console.error('Failed to load active games:', err);
                }

                // Generate a deterministic bracket pairings based on player list seed
                const roundPairings = generateBracketPairings(players);
                pairingsList.innerHTML = roundPairings.map((pair, idx) => {
                    // Check if these two players have an active live game
                    const activeMatch = activeGames.find(g => 
                        (g.whitePlayerId === pair[0].id && g.blackPlayerId === pair[1].id) ||
                        (g.whitePlayerId === pair[1].id && g.blackPlayerId === pair[0].id)
                    );

                    const hasBye = pair[1].name && pair[1].name.includes('BYE');
                    let actionHtml = '';

                    if (hasBye) {
                        actionHtml = `<span class="px-1.5 py-0.5 rounded bg-slate-500/10 text-slate-400 text-[8px] font-bold border border-slate-500/20">BYE</span>`;
                    } else if (activeMatch) {
                        actionHtml = `
                            <button data-action="openSpectatorModal" data-game-id="${activeMatch.gameId}" data-white-name="${activeMatch.whitePlayerName.replace(/'/g, "\\'")}" data-black-name="${activeMatch.blackPlayerName.replace(/'/g, "\\'")}" data-fen="${activeMatch.fen}" 
                                class="px-2 py-1 bg-emerald-500 hover:bg-emerald-600 text-white rounded text-[8px] font-bold hover:scale-105 transition-all flex items-center gap-0.5 cursor-pointer">
                                <span class="material-symbols-outlined text-[10px]">visibility</span> Watch Live
                            </button>
                        `;
                    } else {
                        const currentUser = getCurrentUser();
                        const isMyMatch = currentUser && (currentUser.id === pair[0].id || currentUser.id === pair[1].id);
                        const tournament = loadedAcademyTournamentsList.find(t => t.id === tournamentId);
                        const isOngoing = tournament && tournament.status === 'ongoing';

                        if (isOngoing && isMyMatch) {
                            const opponent = currentUser.id === pair[0].id ? pair[1] : pair[0];
                            actionHtml = `
                                <button data-action="challengeTournamentOpponent" data-opponent-id="${opponent.id}" data-opponent-name="${opponent.name.replace(/'/g, "\\'")}"
                                    class="px-2 py-1 bg-secondary text-on-secondary rounded text-[8px] font-bold hover:scale-105 transition-all flex items-center gap-0.5 cursor-pointer animate-pulse">
                                    ⚔️ Play Match
                                </button>
                            `;
                        } else {
                            actionHtml = `<span class="px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 text-[8px] font-bold border border-amber-500/20">WAITING</span>`;
                        }
                    }

                    return `
                        <div class="flex items-center justify-between p-2 rounded-lg bg-surface-container border border-outline-variant/30 text-[10px] gap-2">
                            <span class="font-bold text-on-surface">Match ${idx + 1}</span>
                            <div class="flex items-center gap-1.5 flex-1 justify-center text-center">
                                <span class="text-secondary font-bold truncate max-w-[70px]">${escapeHTML(pair[0].name)}</span>
                                <span class="text-on-surface-variant/40">vs</span>
                                <span class="text-primary font-bold truncate max-w-[70px]">${escapeHTML(pair[1].name)}</span>
                            </div>
                            ${actionHtml}
                        </div>
                    `;
                }).join('');
            }
        }
    } catch (e) {
        console.error('Failed to load tournament details:', e);
    }
};

async function toggleTournamentDetails(tournamentId, btn) {
    const details = document.getElementById(`tournament-details-${tournamentId}`);
    if (!details) return;

    if (details.classList.contains('hidden')) {
        details.classList.remove('hidden');
        if (btn) btn.classList.add('bg-secondary/20', 'text-secondary', 'border-secondary/30');
        await window.loadTournamentDetailsInline(tournamentId);
    } else {
        details.classList.add('hidden');
        if (btn) btn.classList.remove('bg-secondary/20', 'text-secondary', 'border-secondary/30');
    }
}

function generateBracketPairings(players) {
    // Deterministic matchmaking pairing: Sort by ELO, pair high vs low (Swiss/Knockout style)
    const sorted = [...players].sort((a, b) => b.points - a.points);
    const pairings = [];
    
    // Pair top half vs bottom half
    const half = Math.floor(sorted.length / 2);
    for (let i = 0; i < half; i++) {
        pairings.push([sorted[i], sorted[sorted.length - 1 - i]]);
    }
    
    // If odd count, pair the remaining player with a dummy 'BYE' player
    if (sorted.length % 2 !== 0) {
        pairings.push([sorted[half], { name: 'BYE (No Opponent)' }]);
    }
    
    return pairings;
}

// ================================================================
// CUSTOM PUZZLE CREATOR LOGIC
// ================================================================
let editorGrid = Array(8).fill(null).map(() => Array(8).fill(null));
let activePaletteTool = 'select'; // 'select', 'eraser', 'wp', 'wn', etc.
let editorTurn = 'w';
let selectedEditorSquare = null;
let STATIC_PUZZLES = null;

// Sync custom puzzles into global PUZZLES array
window.syncPuzzlesList = async function() {
    if (typeof PUZZLES === 'undefined') return;
    if (!STATIC_PUZZLES) {
        STATIC_PUZZLES = [...PUZZLES];
    }
    
    // Skip fetching if the user is not logged in (guest)
    if (!getCurrentUser()) return;
    
    try {
        const custom = await API.getCustomPuzzles();
        if (Array.isArray(custom)) {
            PUZZLES = [...STATIC_PUZZLES, ...custom];
        }
    } catch (e) {
        console.error("Failed to sync custom puzzles list:", e);
    }
    
    if (typeof renderPuzzlesList === 'function') {
        renderPuzzlesList();
    }
};

// Initialize Custom Puzzle Board Editor UI elements
window.initEditorBoard = function() {
    const gridEl = document.getElementById('editor-board-grid');
    if (!gridEl) return;

    // Render palette pieces (White)
    const whitePalette = document.getElementById('editor-palette-white');
    if (whitePalette && typeof SVG_PIECES !== 'undefined') {
        const whiteTypes = ['wp', 'wn', 'wb', 'wr', 'wq', 'wk'];
        whitePalette.innerHTML = whiteTypes.map(key => `
            <button data-action="selectPalettePiece" data-arg="${key}" class="w-10 h-10 p-1 bg-surface-container-high hover:bg-surface-bright rounded-lg border border-outline-variant/40 hover:scale-105 transition-all flex items-center justify-center cursor-pointer">
                ${SVG_PIECES[key].replace('<svg', '<svg class="w-full h-full"')}
            </button>
        `).join('');
    }

    // Render palette pieces (Black)
    const blackPalette = document.getElementById('editor-palette-black');
    if (blackPalette && typeof SVG_PIECES !== 'undefined') {
        const blackTypes = ['bp', 'bn', 'bb', 'br', 'bq', 'bk'];
        blackPalette.innerHTML = blackTypes.map(key => `
            <button data-action="selectPalettePiece" data-arg="${key}" class="w-10 h-10 p-1 bg-surface-container-high hover:bg-surface-bright rounded-lg border border-outline-variant/40 hover:scale-105 transition-all flex items-center justify-center cursor-pointer">
                ${SVG_PIECES[key].replace('<svg', '<svg class="w-full h-full"')}
            </button>
        `).join('');
    }

    // Reset editor turn indicators
    selectEditorTurn('w');
    // Default to standard layout starting board
    resetEditorBoard('standard');
};

// Reset Editor Board layout
window.resetEditorBoard = function(mode) {
    if (mode === 'standard') {
        editorGrid = [
            ['br', 'bn', 'bb', 'bq', 'bk', 'bb', 'bn', 'br'],
            ['bp', 'bp', 'bp', 'bp', 'bp', 'bp', 'bp', 'bp'],
            [null, null, null, null, null, null, null, null],
            [null, null, null, null, null, null, null, null],
            [null, null, null, null, null, null, null, null],
            [null, null, null, null, null, null, null, null],
            ['wp', 'wp', 'wp', 'wp', 'wp', 'wp', 'wp', 'wp'],
            ['wr', 'wn', 'wb', 'wq', 'wk', 'wb', 'wn', 'wr']
        ];
    } else {
        editorGrid = Array(8).fill(null).map(() => Array(8).fill(null));
    }
    selectedEditorSquare = null;
    renderEditorBoard();
};

// Render custom puzzle board
window.renderEditorBoard = function() {
    const gridEl = document.getElementById('editor-board-grid');
    if (!gridEl) return;

    gridEl.innerHTML = '';
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            const cell = document.createElement('div');
            cell.className = `relative aspect-square flex items-center justify-center cursor-pointer border border-outline-variant/15 select-none transition-all duration-150`;
            
            const isDark = (r + c) % 2 === 1;
            cell.style.backgroundColor = isDark ? '#2e7d32' : '#e8f5e9'; // Green/White wood skin colors
            
            cell.dataset.row = r;
            cell.dataset.col = c;

            // Highlight selected editor square
            if (selectedEditorSquare && selectedEditorSquare.row === r && selectedEditorSquare.col === c) {
                cell.className += ' ring-4 ring-secondary/80 ring-inset bg-secondary/15';
            }

            const pKey = editorGrid[r][c];
            if (pKey && typeof SVG_PIECES !== 'undefined') {
                const pieceSvg = SVG_PIECES[pKey].replace('<svg', '<svg class="w-full h-full"');
                cell.innerHTML = `<div class="w-4/5 h-4/5 flex items-center justify-center transform active:scale-95 transition-transform pointer-events-none">${pieceSvg}</div>`;
            }

            cell.onclick = () => handleEditorCellClick(r, c);
            gridEl.appendChild(cell);
        }
    }
};

function handleEditorCellClick(row, col) {
    if (activePaletteTool === 'select') {
        if (selectedEditorSquare) {
            const fromPiece = editorGrid[selectedEditorSquare.row][selectedEditorSquare.col];
            editorGrid[row][col] = fromPiece;
            editorGrid[selectedEditorSquare.row][selectedEditorSquare.col] = null;
            selectedEditorSquare = null;
        } else {
            if (editorGrid[row][col]) {
                selectedEditorSquare = { row, col };
            }
        }
    } else if (activePaletteTool === 'eraser') {
        editorGrid[row][col] = null;
        selectedEditorSquare = null;
    } else {
        editorGrid[row][col] = activePaletteTool;
        selectedEditorSquare = null;
    }
    renderEditorBoard();
}

window.selectPaletteTool = function(tool) {
    activePaletteTool = tool;
    selectedEditorSquare = null;

    const eraserBtn = document.getElementById('palette-tool-eraser');
    const selectBtn = document.getElementById('palette-tool-select');

    if (eraserBtn) {
        if (tool === 'eraser') {
            eraserBtn.className = "px-4 py-1.5 bg-red-500 text-white rounded-xl text-xs font-bold border border-red-600 transition-all flex items-center gap-1.5 cursor-pointer";
        } else {
            eraserBtn.className = "px-4 py-1.5 bg-surface-variant text-on-surface rounded-xl text-xs font-bold border border-outline-variant/40 hover:bg-surface-bright transition-all flex items-center gap-1.5 cursor-pointer";
        }
    }

    if (selectBtn) {
        if (tool === 'select') {
            selectBtn.className = "px-4 py-1.5 bg-secondary text-on-secondary rounded-xl text-xs font-bold border border-secondary/40 transition-all flex items-center gap-1.5 cursor-pointer";
        } else {
            selectBtn.className = "px-4 py-1.5 bg-surface-variant text-on-surface rounded-xl text-xs font-bold border border-outline-variant/40 hover:bg-surface-bright transition-all flex items-center gap-1.5 cursor-pointer";
        }
    }
    
    document.querySelectorAll('#editor-palette-white button, #editor-palette-black button').forEach(btn => {
        btn.classList.remove('ring-4', 'ring-secondary', 'bg-secondary/15');
    });
};

window.selectPalettePiece = function(pieceCode, btn) {
    window.selectPaletteTool(pieceCode);
    if (btn) {
        btn.classList.add('ring-4', 'ring-secondary', 'bg-secondary/15');
    }
};

window.selectEditorTurn = function(turn) {
    editorTurn = turn;
    
    const turnW = document.getElementById('editor-turn-w');
    const turnB = document.getElementById('editor-turn-b');

    if (turnW && turnB) {
        if (turn === 'w') {
            turnW.className = "flex-1 py-2 bg-secondary text-on-secondary rounded-xl text-xs font-bold border border-secondary/40 transition-all cursor-pointer";
            turnB.className = "flex-1 py-2 bg-surface-container-high text-on-surface rounded-xl text-xs font-bold border border-outline-variant/30 transition-all cursor-pointer";
        } else {
            turnB.className = "flex-1 py-2 bg-secondary text-on-secondary rounded-xl text-xs font-bold border border-secondary/40 transition-all cursor-pointer";
            turnW.className = "flex-1 py-2 bg-surface-container-high text-on-surface rounded-xl text-xs font-bold border border-outline-variant/30 transition-all cursor-pointer";
        }
    }
};

function getEditorFEN() {
    let rows = [];
    for (let r = 0; r < 8; r++) {
        let empty = 0;
        let rowStr = '';
        for (let c = 0; c < 8; c++) {
            const piece = editorGrid[r][c];
            if (piece) {
                if (empty > 0) {
                    rowStr += empty;
                    empty = 0;
                }
                const color = piece[0];
                const type = piece[1].toUpperCase();
                rowStr += (color === 'w') ? type : type.toLowerCase();
            } else {
                empty++;
            }
        }
        if (empty > 0) {
            rowStr += empty;
        }
        rows.push(rowStr);
    }
    return rows.join('/') + ` ${editorTurn} KQkq - 0 1`;
}

window.publishCustomPuzzle = async function() {
    const titleInput = document.getElementById('editor-puzzle-title');
    const descInput = document.getElementById('editor-puzzle-desc');
    const hintInput = document.getElementById('editor-puzzle-hint');
    const rewardInput = document.getElementById('editor-puzzle-reward');
    const solutionFromInput = document.getElementById('editor-solution-from');
    const solutionToInput = document.getElementById('editor-solution-to');

    if (!titleInput || !descInput || !hintInput || !rewardInput || !solutionFromInput || !solutionToInput) return;

    const title = titleInput.value.trim();
    const description = descInput.value.trim();
    const hint = hintInput.value.trim();
    const reward = parseInt(rewardInput.value, 10) || 15;
    const fromSquare = solutionFromInput.value.trim().toLowerCase();
    const toSquare = solutionToInput.value.trim().toLowerCase();

    if (!title) return showNotification("Please enter a puzzle title.", "error");
    if (!description) return showNotification("Please enter a puzzle description.", "error");
    
    const coordRegex = /^[a-h][1-8]$/;
    if (!coordRegex.test(fromSquare) || !coordRegex.test(toSquare)) {
        return showNotification("Invalid move coordinates. Must be e.g. e2 and e4.", "error");
    }

    const solution = `${fromSquare}-${toSquare}`;

    // Validate that position has both Kings
    let whiteKings = 0;
    let blackKings = 0;
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            if (editorGrid[r][c] === 'wk') whiteKings++;
            if (editorGrid[r][c] === 'bk') blackKings++;
        }
    }

    if (whiteKings !== 1 || blackKings !== 1) {
        return showNotification("A valid chess position requires exactly one White King and one Black King.", "error");
    }

    const fen = getEditorFEN();

    showNotification("Publishing custom puzzle...", "info");
    const result = await API.createCustomPuzzle({
        title,
        description,
        fen,
        solution,
        hint,
        reward
    });

    if (result) {
        showNotification("Puzzle published successfully! 🎉", "success");
        
        // Reset form inputs
        titleInput.value = '';
        descInput.value = '';
        hintInput.value = '';
        rewardInput.value = '15';
        solutionFromInput.value = '';
        solutionToInput.value = '';
        
        resetEditorBoard('standard');
        
        // Refresh local cache and list views
        await window.syncPuzzlesList();
    } else {
        showNotification("Failed to publish puzzle.", "error");
    }
};

// Global Capturing Event Listener to resolve avatar loading failures (e.g. 429 rate limit)
// without violating Content Security Policy (CSP) with inline scripting
document.addEventListener('error', function (event) {
    const target = event.target;
    if (target && target.tagName === 'IMG') {
        const isAvatar = target.id === 'navbar-avatar' || 
                         target.id === 'dash-user-avatar' || 
                         target.classList.contains('object-cover') ||
                         target.src.includes('googleusercontent.com');
                         
        if (isAvatar) {
            if (target.dataset.fallbackApplied) return;
            target.dataset.fallbackApplied = 'true';
            target.src = `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%2394a3b8"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>`;
        }
    }
}, true); // capturing phase required because error event does not bubble