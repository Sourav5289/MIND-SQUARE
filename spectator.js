// ================================================================
// LIVE TOURNAMENT SPECTATOR MODULE
// ================================================================
// Allows any user (logged in or guest) to watch a live tournament
// game in real-time. Uses the existing WebSocket connection to
// receive move broadcasts from the server.
// ================================================================

(function () {
    // ── State ────────────────────────────────────────────────────
    let spectatorGame = null;      // chess.js instance for read-only board
    let spectatorGameId = null;    // active gameId being watched
    let spectatorWhite = null;
    let spectatorBlack = null;
    let spectatorMoveList = [];
    let spectatorOrientation = 'white';

    // ── Board config (mirrors chess-engine.js square size logic) ─
    const SQ = 60; // px per square in spectator board

    // ── Open Spectator Modal ─────────────────────────────────────
    window.openSpectatorModal = function (gameId, whiteName, blackName, currentFen) {
        spectatorGameId = gameId;
        spectatorWhite = whiteName;
        spectatorBlack = blackName;
        spectatorMoveList = [];

        // Initialise chess.js position
        if (typeof Chess !== 'undefined') {
            spectatorGame = new Chess(currentFen || undefined);
        } else {
            spectatorGame = null;
        }

        // Register as a spectator over WebSocket
        if (window.liveWS && window.liveWS.readyState === WebSocket.OPEN) {
            window.liveWS.send(JSON.stringify({
                type: 'spectate_join',
                gameId
            }));
        }

        // Render player names
        const whiteEl = document.getElementById('spec-white-name');
        const blackEl = document.getElementById('spec-black-name');
        if (whiteEl) whiteEl.textContent = whiteName;
        if (blackEl) blackEl.textContent = blackName;

        // Draw board
        renderSpectatorBoard();

        // Show modal
        const modal = document.getElementById('spectator-modal');
        if (modal) {
            modal.classList.remove('hidden');
            modal.classList.add('flex');
        }

        // Start status pulse
        setSpectatorStatus('🔴 Live', 'text-emerald-400');
    };

    // ── Close Spectator Modal ────────────────────────────────────
    window.closeSpectatorModal = function () {
        if (spectatorGameId && window.liveWS && window.liveWS.readyState === WebSocket.OPEN) {
            window.liveWS.send(JSON.stringify({
                type: 'spectate_leave',
                gameId: spectatorGameId
            }));
        }
        spectatorGameId = null;
        const modal = document.getElementById('spectator-modal');
        if (modal) {
            modal.classList.add('hidden');
            modal.classList.remove('flex');
        }
    };

    // ── Handle incoming move from WebSocket ──────────────────────
    window.handleSpectatorMove = function (gameId, move, fen, moveSan) {
        if (gameId !== spectatorGameId) return;

        if (spectatorGame) {
            try {
                if (fen) {
                    spectatorGame.load(fen);
                } else if (move) {
                    spectatorGame.move(move);
                }
            } catch (e) { /* ignore invalid positions */ }
        }

        // Append to move list
        if (moveSan) {
            spectatorMoveList.push(moveSan);
            renderSpectatorMoveList();
        }

        renderSpectatorBoard();
        flashLastMove(move);
        setSpectatorStatus('🔴 Live', 'text-emerald-400');
    };

    // ── Handle game over notification ────────────────────────────
    window.handleSpectatorGameOver = function (gameId, result) {
        if (gameId !== spectatorGameId) return;
        setSpectatorStatus(`✅ Game Over — ${result}`, 'text-amber-400');
    };

    // ── Render board ─────────────────────────────────────────────
    function renderSpectatorBoard() {
        const canvas = document.getElementById('spectator-board-canvas');
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        const size = SQ * 8;
        canvas.width = size;
        canvas.height = size;

        const fen = spectatorGame ? spectatorGame.fen() : 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
        const position = fenToPosition(fen);

        // Draw squares
        for (let row = 0; row < 8; row++) {
            for (let col = 0; col < 8; col++) {
                const isLight = (row + col) % 2 === 0;
                ctx.fillStyle = isLight ? '#f0d9b5' : '#b58863';
                ctx.fillRect(col * SQ, row * SQ, SQ, SQ);
            }
        }

        // Draw coordinate labels
        ctx.font = `bold ${SQ * 0.18}px Inter, sans-serif`;
        for (let i = 0; i < 8; i++) {
            const rankLabel = spectatorOrientation === 'white' ? (8 - i).toString() : (i + 1).toString();
            const fileLabel = spectatorOrientation === 'white'
                ? 'abcdefgh'[i]
                : 'hgfedcba'[i];

            ctx.fillStyle = i % 2 === 0 ? '#b58863' : '#f0d9b5';
            ctx.fillText(rankLabel, 3, i * SQ + SQ * 0.22);

            ctx.fillStyle = (7 - i) % 2 === 0 ? '#b58863' : '#f0d9b5';
            ctx.fillText(fileLabel, i * SQ + SQ * 0.83, size - 3);
        }

        // Draw pieces
        const pieceSymbols = {
            'K': '♔', 'Q': '♕', 'R': '♖', 'B': '♗', 'N': '♘', 'P': '♙',
            'k': '♚', 'q': '♛', 'r': '♜', 'b': '♝', 'n': '♞', 'p': '♟'
        };

        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = `${SQ * 0.72}px serif`;

        for (let row = 0; row < 8; row++) {
            for (let col = 0; col < 8; col++) {
                const displayRow = spectatorOrientation === 'white' ? row : 7 - row;
                const displayCol = spectatorOrientation === 'white' ? col : 7 - col;
                const piece = position[displayRow] ? position[displayRow][displayCol] : null;
                if (piece && pieceSymbols[piece]) {
                    const isWhitePiece = piece === piece.toUpperCase();
                    // Shadow for contrast
                    ctx.shadowColor = isWhitePiece ? 'rgba(0,0,0,0.6)' : 'rgba(255,255,255,0.2)';
                    ctx.shadowBlur = 3;
                    ctx.fillStyle = isWhitePiece ? '#fff' : '#1a1a2e';
                    ctx.fillText(pieceSymbols[piece], col * SQ + SQ / 2, row * SQ + SQ / 2);
                    ctx.shadowBlur = 0;
                }
            }
        }
    }

    // ── Flash last move highlight ─────────────────────────────────
    function flashLastMove(move) {
        if (!move) return;
        const canvas = document.getElementById('spectator-board-canvas');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');

        // Parse 'e2e4' style or { from, to } object
        const from = typeof move === 'string' ? move.substring(0, 2) : move.from;
        const to = typeof move === 'string' ? move.substring(2, 4) : move.to;

        [from, to].forEach((sq, idx) => {
            if (!sq || sq.length < 2) return;
            const file = sq.charCodeAt(0) - 97; // a=0
            const rank = 8 - parseInt(sq[1]);
            const col = spectatorOrientation === 'white' ? file : 7 - file;
            const row = spectatorOrientation === 'white' ? rank : 7 - rank;

            ctx.fillStyle = idx === 0 ? 'rgba(255,210,0,0.45)' : 'rgba(255,210,0,0.65)';
            ctx.fillRect(col * SQ, row * SQ, SQ, SQ);
        });

        // Re-draw pieces on top
        renderSpectatorBoard();
    }

    // ── Render move list ─────────────────────────────────────────
    function renderSpectatorMoveList() {
        const list = document.getElementById('spec-move-list');
        if (!list) return;

        let html = '';
        for (let i = 0; i < spectatorMoveList.length; i += 2) {
            const moveNum = Math.floor(i / 2) + 1;
            const white = spectatorMoveList[i] || '';
            const black = spectatorMoveList[i + 1] || '';
            html += `
                <div class="flex items-center gap-1 text-[11px]">
                    <span class="text-on-surface-variant/60 w-5 text-right">${moveNum}.</span>
                    <span class="px-1.5 py-0.5 rounded bg-surface-container font-mono font-bold text-secondary min-w-[48px] text-center">${escapeHTML ? escapeHTML(white) : white}</span>
                    ${black ? `<span class="px-1.5 py-0.5 rounded bg-surface-container font-mono font-bold text-on-surface min-w-[48px] text-center">${escapeHTML ? escapeHTML(black) : black}</span>` : ''}
                </div>`;
        }
        list.innerHTML = html || '<span class="text-[11px] text-on-surface-variant italic">No moves yet...</span>';
        list.scrollTop = list.scrollHeight;
    }

    // ── Status badge ─────────────────────────────────────────────
    function setSpectatorStatus(text, colorClass) {
        const el = document.getElementById('spec-status');
        if (!el) return;
        el.className = `text-xs font-bold ${colorClass} flex items-center gap-1`;
        el.textContent = text;
    }

    // ── Flip board orientation ───────────────────────────────────
    window.flipSpectatorBoard = function () {
        spectatorOrientation = spectatorOrientation === 'white' ? 'black' : 'white';
        renderSpectatorBoard();
    };

    // ── Parse FEN to 2D position array ───────────────────────────
    function fenToPosition(fen) {
        const board = [];
        const rows = fen.split(' ')[0].split('/');
        for (const row of rows) {
            const rank = [];
            for (const ch of row) {
                if (isNaN(parseInt(ch))) {
                    rank.push(ch);
                } else {
                    for (let i = 0; i < parseInt(ch); i++) rank.push(null);
                }
            }
            board.push(rank);
        }
        return board;
    }

    // ── Spectator count display ──────────────────────────────────
    window.updateSpectatorCount = function (gameId, count) {
        if (gameId !== spectatorGameId) return;
        const el = document.getElementById('spec-watcher-count');
        if (el) el.textContent = `${count} watching`;
    };

})();
