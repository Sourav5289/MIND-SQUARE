/**
 * Mind Square Chess Academy
 * 2D / 3D Hybrid Chess Engine & UI
 */

let chessGame = null;
let selectedSquare2D = null;
let boardFlipped = false;
let gameMode = '2D'; // '2D' or '3D'
let aiLevel = 'medium'; // 'easy', 'medium', 'hard'

// Three.js 3D Variables
let scene, camera, renderer, orbitControls;
let chessPieces3D = {}; // Map of board squares (e.g. 'e4') to Three.js Object3D
let boardTiles3D = {};  // Map of board squares (e.g. 'e4') to Tile meshes
let selectedSquare3D = null;
let highlightedSquares3D = [];
let is3DInitialized = false;

// SVG definitions of Chess Pieces (Clean, minimalist vector icons)
const SVG_PIECES = {
    'wp': `<svg viewBox="0 0 45 45"><path d="M22.5 9c-2.21 0-4 1.79-4 4 0 .89.29 1.71.78 2.38C17.33 16.5 16 18.59 16 21c0 2.03.94 3.84 2.41 5.03-3 1.06-7.41 5.55-7.41 13.47h23c0-7.92-4.41-12.41-7.41-13.47 1.47-1.19 2.41-3 2.41-5.03 0-2.41-1.33-4.5-3.28-5.62.49-.67.78-1.49.78-2.38 0-2.21-1.79-4-4-4z" fill="#fff" stroke="#3e4144" stroke-width="1.5" stroke-linecap="round"/></svg>`,
    'wn': `<svg viewBox="0 0 45 45"><g fill="none" fill-rule="evenodd" stroke="#3e4144" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M 22,10 C 32.5,11 38.5,18 38,39 L 15,39 C 15,30 25,32.5 23,18" style="fill:#ffffff; stroke:#3e4144;"/><path d="M 24,18 C 24.38,20.91 18.45,25.37 16,27 C 13,29 13.18,31.34 11,31 C 9.958,30.06 12.41,27.96 11,28 C 10,28 11.19,29.23 10,30 C 9,30 5.997,31 6,26 C 6,24 12,14 12,14 C 12,14 13.89,12.1 14,10.5 C 13.27,9.506 13.5,8.5 13.5,7.5 C 14.5,6.5 16.5,10 16.5,10 L 18.5,10 C 18.5,10 19.28,8.008 21,7 C 22,7 22,10 22,10" style="fill:#ffffff; stroke:#3e4144;"/><path d="M 9.5 25.5 A 0.5 0.5 0 1 1 8.5,25.5 A 0.5 0.5 0 1 1 9.5 25.5 z" style="fill:#3e4144; stroke:#3e4144;"/><path d="M 15 15.5 A 0.5 1.5 0 1 1 14,15.5 A 0.5 1.5 0 1 1 15 15.5 z" transform="matrix(0.866,0.5,-0.5,0.866,9.693,-5.173)" style="fill:#3e4144; stroke:#3e4144;"/></g></svg>`,
    'wb': `<svg viewBox="0 0 45 45"><g fill="none" fill-rule="evenodd" stroke="#3e4144" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><g fill="#fff" stroke-linecap="butt"><path d="M9 36c3.39-.97 10.11.43 13.5-2 3.39 2.43 10.11 1.03 13.5 2 0 0 1.65.54 3 2-.68.97-1.65.99-3 .5-3.39-.97-10.11.46-13.5-1-3.39 1.46-10.11.03-13.5 1-1.354.49-2.323.47-3-.5 1.354-1.94 3-2 3-2zM15 32c2.5 2.5 12.5 2.5 15 0 .5-1.5 0-2 0-2 0-2.5-2.5-4-2.5-4 5.5-1.5 6-11.5-5-15.5-11 4-10.5 14-5 15.5 0 0-2.5 1.5-2.5 4 0 0-.5.5 0 2zM25 8a2.5 2.5 0 1 1-5 0 2.5 2.5 0 1 1 5 0z"/></g><path d="M17.5 26h10M15 30h15m-7.5-14.5v5M20 18h5" stroke-linejoin="miter"/></g></svg>`,
    'wr': `<svg viewBox="0 0 45 45"><g fill="#fff" fill-rule="evenodd" stroke="#3e4144" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 39h27v-3H9v3zM12 36v-4h21v4H12zM11 14V9h4v2h5V9h5v2h5V9h4v5" stroke-linecap="butt"/><path d="M34 14l-3 3H14l-3-3"/><path d="M31 17v12.5H14V17" stroke-linecap="butt" stroke-linejoin="miter"/><path d="M31 29.5l1.5 2.5h-20l1.5-2.5"/><path d="M11 14h23" fill="none" stroke-linejoin="miter"/></g></svg>`,
    'wq': `<svg viewBox="0 0 45 45"><g fill="#fff" fill-rule="evenodd" stroke="#3e4144" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M8 12a2 2 0 1 1-4 0 2 2 0 1 1 4 0zM24.5 7.5a2 2 0 1 1-4 0 2 2 0 1 1 4 0zM41 12a2 2 0 1 1-4 0 2 2 0 1 1 4 0zM16 8.5a2 2 0 1 1-4 0 2 2 0 1 1 4 0zM33 9a2 2 0 1 1-4 0 2 2 0 1 1 4 0z"/><path d="M9 26c8.5-1.5 21-1.5 27 0l2-12-7 11V11l-5.5 13.5-3-15-3 15-5.5-14V25L7 14l2 12zM9 26c0 2 1.5 2 2.5 4 1 1.5 1 1 .5 3.5-1.5 1-1.5 2.5-1.5 2.5-1.5 1.5.5 2.5.5 2.5 6.5 1 16.5 1 23 0 0 0 1.5-1 0-2.5 0 0 .5-1.5-1-2.5-.5-2.5-.5-2 .5-3.5 1-2 2.5-2 2.5-4-8.5-1.5-18.5-1.5-27 0z" stroke-linecap="butt"/><path d="M11.5 30c3.5-1 18.5-1 22 0M12 33.5c6-1 15-1 21 0" fill="none"/></g></svg>`,
    'wk': `<svg viewBox="0 0 45 45"><g fill="none" fill-rule="evenodd" stroke="#3e4144" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22.5 11.63V6.75M20.12 9h4.76M22.5 39s9-4 9-13.5c0-4.5-2.7-8.1-9-10.8-6.3 2.7-9 6.3-9 10.8 0 9.5 9 13.5 9 13.5z" fill="#fff" stroke-linecap="butt"/><path d="M11.5 37c5.5 3.5 15.5 3.5 21 0v-7s9-4.5 6-10.5c-4-6.5-13.5-3.5-16 4V27v-3.5c-3.5-7.5-13-10.5-16-4-3 6 5 10 5 10V37z" fill="#fff"/><path d="M11.5 30c5.5-3 15.5-3 21 0m-21 3.5c5.5-3 15.5-3 21 0m-21 3.5c5.5-3 15.5-3 21 0" fill="none"/></g></svg>`,
    'bp': `<svg viewBox="0 0 45 45"><path d="M22.5 9c-2.21 0-4 1.79-4 4 0 .89.29 1.71.78 2.38C17.33 16.5 16 18.59 16 21c0 2.03.94 3.84 2.41 5.03-3 1.06-7.41 5.55-7.41 13.47h23c0-7.92-4.41-12.41-7.41-13.47 1.47-1.19 2.41-3 2.41-5.03 0-2.41-1.33-4.5-3.28-5.62.49-.67.78-1.49.78-2.38 0-2.21-1.79-4-4-4z" fill="#3e4144" stroke="#3e4144" stroke-width="1.5" stroke-linecap="round"/></svg>`,
    'bn': `<svg viewBox="0 0 45 45"><g fill="none" fill-rule="evenodd" stroke="#3e4144" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M 22,10 C 32.5,11 38.5,18 38,39 L 15,39 C 15,30 25,32.5 23,18" style="fill:#3e4144; stroke:#3e4144;"/><path d="M 24,18 C 24.38,20.91 18.45,25.37 16,27 C 13,29 13.18,31.34 11,31 C 9.958,30.06 12.41,27.96 11,28 C 10,28 11.19,29.23 10,30 C 9,30 5.997,31 6,26 C 6,24 12,14 12,14 C 12,14 13.89,12.1 14,10.5 C 13.27,9.506 13.5,8.5 13.5,7.5 C 14.5,6.5 16.5,10 16.5,10 L 18.5,10 C 18.5,10 19.28,8.008 21,7 C 22,7 22,10 22,10" style="fill:#3e4144; stroke:#3e4144;"/><path d="M 9.5 25.5 A 0.5 0.5 0 1 1 8.5,25.5 A 0.5 0.5 0 1 1 9.5 25.5 z" style="fill:#ececec; stroke:#ececec;"/><path d="M 15 15.5 A 0.5 1.5 0 1 1 14,15.5 A 0.5 1.5 0 1 1 15 15.5 z" transform="matrix(0.866,0.5,-0.5,0.866,9.693,-5.173)" style="fill:#ececec; stroke:#ececec;"/><path d="M 24.55,10.4 L 24.1,11.85 L 24.6,12 C 27.75,13 30.25,14.49 32.5,18.75 C 34.75,23.01 35.75,29.06 35.25,39 L 35.2,39.5 L 37.45,39.5 L 37.5,39 C 38,28.94 36.62,22.15 34.25,17.66 C 31.88,13.17 28.46,11.02 25.06,10.5 L 24.55,10.4 z " style="fill:#ececec; stroke:none;"/></g></svg>`,
    'bb': `<svg viewBox="0 0 45 45"><g fill="none" fill-rule="evenodd" stroke="#3e4144" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 36c3.39-.97 10.11.43 13.5-2 3.39 2.43 10.11 1.03 13.5 2 0 0 1.65.54 3 2-.68.97-1.65.99-3 .5-3.39-.97-10.11.46-13.5-1-3.39 1.46-10.11.03-13.5 1-1.354.49-2.323.47-3-.5 1.354-1.94 3-2 3-2zm6-4c2.5 2.5 12.5 2.5 15 0 .5-1.5 0-2 0-2 0-2.5-2.5-4-2.5-4 5.5-1.5 6-11.5-5-15.5-11 4-10.5 14-5 15.5 0 0-2.5 1.5-2.5 4 0 0-.5.5 0 2zM25 8a2.5 2.5 0 1 1-5 0 2.5 2.5 0 1 1 5 0z" fill="#3e4144" stroke-linecap="butt"/><path d="M17.5 26h10M15 30h15m-7.5-14.5v5M20 18h5" stroke="#fff" stroke-linejoin="miter"/></g></svg>`,
    'br': `<svg viewBox="0 0 45 45"><g fill="#3e4144" fill-rule="evenodd" stroke="#3e4144" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 39h27v-3H9v3zM12.5 32l1.5-2.5h17l1.5 2.5h-20zM12 36v-4h21v4H12z" stroke-linecap="butt"/><path d="M14 29.5v-13h17v13H14z" stroke-linecap="butt" stroke-linejoin="miter"/><path d="M14 16.5L11 14h23l-3 2.5H14zM11 14V9h4v2h5V9h5v2h5V9h4v5H11z" stroke-linecap="butt"/><path d="M12 35.5h21M13 31.5h19M14 29.5h17M14 16.5h17M11 14h23" fill="none" stroke="#fff" stroke-width="1" stroke-linejoin="miter"/></g></svg>`,
    'bq': `<svg viewBox="0 0 45 45"><g fill="#3e4144" fill-rule="evenodd" stroke="#3e4144" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><g fill="#3e4144" stroke="none"><circle cx="6" cy="12" r="2.75"/><circle cx="14" cy="9" r="2.75"/><circle cx="22.5" cy="8" r="2.75"/><circle cx="31" cy="9" r="2.75"/><circle cx="39" cy="12" r="2.75"/></g><path d="M9 26c8.5-1.5 21-1.5 27 0l2.5-12.5L31 25l-.3-14.1-5.2 13.6-3-14.5-3 14.5-5.2-13.6L14 25 6.5 13.5 9 26zM9 26c0 2 1.5 2 2.5 4 1 1.5 1 1 .5 3.5-1.5 1-1.5 2.5-1.5 2.5-1.5 1.5.5 2.5.5 2.5 6.5 1 16.5 1 23 0 0 0 1.5-1 0-2.5 0 0 .5-1.5-1-2.5-.5-2.5-.5-2 .5-3.5 1-2 2.5-2 2.5-4-8.5-1.5-18.5-1.5-27 0z" stroke-linecap="butt"/><path d="M11 38.5a35 35 1 0 0 23 0" fill="none" stroke-linecap="butt"/><path d="M11 29a35 35 1 0 1 23 0M12.5 31.5h20M11.5 34.5a35 35 1 0 0 22 0M10.5 37.5a35 35 1 0 0 24 0" fill="none" stroke="#fff"/></g></svg>`,
    'bk': `<svg viewBox="0 0 45 45"><g fill="none" fill-rule="evenodd" stroke="#3e4144" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22.5 11.63V6" stroke-linejoin="miter"/><path d="M22.5 25s4.5-7.5 3-10.5c0 0-1-2.5-3-2.5s-3 2.5-3 2.5c-1.5 3 3 10.5 3 10.5" fill="#3e4144" stroke-linecap="butt" stroke-linejoin="miter"/><path d="M11.5 37c5.5 3.5 15.5 3.5 21 0v-7s9-4.5 6-10.5c-4-6.5-13.5-3.5-16 4V27v-3.5c-3.5-7.5-13-10.5-16-4-3 6 5 10 5 10V37z" fill="#3e4144"/><path d="M20 8h5" stroke-linejoin="miter"/><path d="M32 29.5s8.5-4 6.03-9.65C34.15 14 25 18 22.5 24.5l.01 2.1-.01-2.1C20 18 9.906 14 6.997 19.85c-2.497 5.65 4.853 9 4.853 9M11.5 30c5.5-3 15.5-3 21 0m-21 3.5c5.5-3 15.5-3 21 0m-21 3.5c5.5-3 15.5-3 21 0" stroke="#fff"/></g></svg>`
};

// Initialize Chessboard and logic
function initChessGame(fen = null) {
    chessGame = fen ? new Chess(fen) : new Chess();
    selectedSquare2D = null;
    
    // Status text based on current turn if FEN was loaded
    const startingTurn = chessGame.turn() === 'w' ? 'White' : 'Black';
    document.getElementById('chess-status').innerText = fen ? `Game resumed. Turn: ${startingTurn}` : 'Your turn (White). Choose a move!';
    document.getElementById('chess-status-badge').innerText = 'In Progress';
    document.getElementById('chess-status-badge').className = 'px-3 py-1 bg-amber-500/20 text-secondary border border-secondary/30 rounded-full font-bold text-xs';

    // Reset clock, histories and move streak
    gameHistoryMoves = [];
    playerMoveStreak = 0;
    const streakBadge = document.getElementById('move-streak-badge');
    if (streakBadge) streakBadge.classList.add('hidden');

    activeClockPlayer = 'w';
    whiteTime = selectedClockLimit;
    blackTime = selectedClockLimit;
    stopChessClock();
    if (selectedClockLimit > 0) {
        document.getElementById('timer-txt-white').innerText = formatTime(whiteTime);
        document.getElementById('timer-txt-black').innerText = formatTime(blackTime);
    }

    // Reset Evaluation bar
    const evalWhite = document.getElementById('arena-eval-bar-white');
    const evalBlack = document.getElementById('arena-eval-bar-black');
    const evalText = document.getElementById('arena-eval-bar-text');
    if (evalWhite) evalWhite.style.height = '50%';
    if (evalBlack) evalBlack.style.height = '50%';
    if (evalText) evalText.innerText = '+0.0';

    renderBoard2D();

    // Toggle state tabs or load Three.js
    if (gameMode === '3D') {
        document.getElementById('chess-board-2d').classList.add('hidden');
        document.getElementById('chess-board-3d').classList.remove('hidden');
        initBoard3D();
        setTimeout(() => {
            changeBoardSkin(activeBoardSkin);
        }, 100);
    } else {
        document.getElementById('chess-board-2d').classList.remove('hidden');
        document.getElementById('chess-board-3d').classList.add('hidden');
    }
}

// 2D Renderer
function updateOuterBoardCoordinates(boardPrefix, flipped = false) {
    const ranksEl = document.getElementById(`${boardPrefix}-ranks`);
    const filesEl = document.getElementById(`${boardPrefix}-files`);
    if (!ranksEl || !filesEl) return;

    ranksEl.style.alignSelf = 'stretch';

    const files = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
    const ranks = ['1', '2', '3', '4', '5', '6', '7', '8'];

    const displayFiles = flipped ? [...files].reverse() : files;
    const displayRanks = flipped ? ranks : [...ranks].reverse();

    ranksEl.innerHTML = displayRanks.map(r => `<div class="flex-1 flex items-center justify-center">${r}</div>`).join('');
    filesEl.innerHTML = displayFiles.map(f => `<div class="flex-1 text-center">${f}</div>`).join('');
}

function renderBoard2D() {
    const boardEl = document.getElementById('chess-board-2d');
    if (!boardEl) return;
    boardEl.innerHTML = '';
    
    updateOuterBoardCoordinates('chess-board', boardFlipped);

    const board = chessGame.board();
    const columns = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];

    // Determine loop direction based on board flip
    const rowRange = boardFlipped ? Array.from({ length: 8 }, (_, i) => i) : Array.from({ length: 8 }, (_, i) => 7 - i);
    const colRange = boardFlipped ? Array.from({ length: 8 }, (_, i) => 7 - i) : Array.from({ length: 8 }, (_, i) => i);

    rowRange.forEach(r => {
        colRange.forEach(c => {
            const squareName = columns[c] + (r + 1);
            const piece = board[7 - r][c]; // Chess.js maps board [0][0] to a8

            const cell = document.createElement('div');
            cell.dataset.square = squareName;

            // Apply chess styling
            const isDark = (r + c) % 2 === 0;
            cell.className = `relative aspect-square flex items-center justify-center cursor-pointer transition-all duration-200 select-none `;

            const skinColors = BOARD_SKINS[activeBoardSkin] || BOARD_SKINS['green'];
            cell.style.backgroundColor = isDark ? skinColors.dark : skinColors.light;
            cell.style.color = isDark ? skinColors.darkText : skinColors.lightText;

            // Highlighting
            if (selectedSquare2D === squareName) {
                cell.className += ' ring-4 ring-secondary/70 ring-inset bg-secondary/10';
            }

            // Piece drawing
            if (piece) {
                const pieceKey = piece.color + piece.type;
                let pieceSvg = SVG_PIECES[pieceKey];
                if (pieceSvg) {
                    pieceSvg = pieceSvg.replace('<svg', '<svg class="w-full h-full"');
                    cell.innerHTML = `<div class="w-4/5 h-4/5 flex items-center justify-center transform active:scale-95 transition-transform">${pieceSvg}</div>`;
                } else {
                    console.warn("Missing SVG for piece key:", pieceKey);
                }
            }



            // Add move hints if selected piece can move here
            if (selectedSquare2D) {
                const moves = chessGame.moves({ square: selectedSquare2D, verbose: true });
                const isPossibleMove = moves.some(m => m.to === squareName);
                if (isPossibleMove) {
                    const hint = document.createElement('div');
                    if (piece) {
                        hint.className = 'absolute inset-0 border-[3px] border-secondary rounded-full m-1 opacity-70';
                    } else {
                        hint.className = 'absolute w-4 h-4 bg-secondary rounded-full opacity-60';
                    }
                    cell.appendChild(hint);
                }
            }

            cell.onclick = () => handleSquareClick2D(squareName);
            boardEl.appendChild(cell);
        });
    });
}

function handleSquareClick2D(square) {
    if (chessGame.game_over()) return;
    if (arenaGameMode === 'review') return;

    if (window._liveMode) {
        if (chessGame.turn() !== window._liveMyColor) {
            showNotification("It is not your turn!", "warning");
            return;
        }
        const piece = chessGame.get(square);
        if (piece && piece.color !== window._liveMyColor && selectedSquare2D === null) {
            return; // Can't select opponent pieces
        }
    }

    // Check if the user is clicking their own piece to select
    const piece = chessGame.get(square);
    const isUserPiece = piece && piece.color === chessGame.turn();

    if (isUserPiece) {
        selectedSquare2D = square;
        renderBoard2D();
    } else if (selectedSquare2D) {
        // Attempt move
        const move = makePlayerMove(selectedSquare2D, square);
        if (move) {
            selectedSquare2D = null;
            renderBoard2D();

            // Handle turn controls based on game mode
            if (!chessGame.game_over() && arenaGameMode === 'vs-computer' && !window._liveMode) {
                document.getElementById('chess-status').innerText = 'Mind Square AI is thinking...';
                setTimeout(makeAIMove, 700);
            } else if (!chessGame.game_over() && arenaGameMode === 'pass-play') {
                switchClockTurn();
                setTimeout(() => {
                    flipBoardView();
                }, 500);
            }
        } else {
            // Invalid move click, deselect
            selectedSquare2D = null;
            renderBoard2D();
        }
    }
}

let playerMoveStreak = 0;
function updatePlayerMoveStreak(classification) {
    if (['Brilliant', 'Best Move', 'Good', 'Book Move'].includes(classification.name)) {
        playerMoveStreak++;
    } else {
        playerMoveStreak = 0;
    }
    const streakBadge = document.getElementById('move-streak-badge');
    if (streakBadge) {
        if (playerMoveStreak >= 2) {
            streakBadge.innerText = `🔥 ${playerMoveStreak} Streak`;
            streakBadge.classList.remove('hidden');
        } else {
            streakBadge.classList.add('hidden');
        }
    }
}

function selectBestMoveForGame(game, depth) {
    const moves = game.moves({ verbose: true });
    if (moves.length === 0) return null;
    const isMaximizing = (game.turn() === 'w');
    let bestVal = isMaximizing ? -Infinity : Infinity;
    let bestMove = null;
    moves.forEach(m => {
        game.move(m);
        const val = evaluateBoard(game.board());
        game.undo();
        if (isMaximizing) {
            if (val > bestVal) {
                bestVal = val;
                bestMove = m;
            }
        } else {
            if (val < bestVal) {
                bestVal = val;
                bestMove = m;
            }
        }
    });
    return bestMove;
}

function makePlayerMove(from, to) {
    try {
        const move = chessGame.move({
            from: from,
            to: to,
            promotion: 'q' // Auto promote to queen for simplicity
        });

        if (move) {
            playMoveSoundForMove(move, chessGame);
            
            // Record game history logs for Post-Game Review
            const currentEval = getPositionEvalScore();
            gameHistoryMoves.push({
                fen: chessGame.fen(),
                move: move,
                eval: currentEval
            });

            // Calculate live move streak
            const lastMoveIdx = gameHistoryMoves.length - 1;
            const prevEval = lastMoveIdx > 0 ? gameHistoryMoves[lastMoveIdx - 1].eval : 0;
            const classification = classifyMove(prevEval, currentEval, move);
            updatePlayerMoveStreak(classification);

            // If in WS Live mode, transmit move to opponent
            if (window._liveMode && typeof window.sendLiveMove === 'function') {
                window.sendLiveMove(move.san, chessGame.fen());
            }

            checkGameStatus();
            return move;
        }
    } catch (e) {
        // Invalid move
    }
    return null;
}

// Optimized Minimax AI with Move Ordering and correct perspective
function makeAIMove() {
    if (chessGame.game_over()) return;

    let selectedMove = null;

    if (aiLevel === 'easy') {
        // Easy AI: Depth 2 search (Fast & moderate)
        selectedMove = selectBestMove(2);
    } else if (aiLevel === 'medium') {
        // Medium AI: Depth 3 search (Fast & challenging)
        selectedMove = selectBestMove(3);
    } else if (aiLevel === 'hard') {
        // Hard AI: Depth 4 search (Very strong / Grandmaster level)
        selectedMove = selectBestMove(4);
    }

    if (selectedMove) {
        chessGame.move(selectedMove);
        playMoveSoundForMove(selectedMove, chessGame);

        if (gameMode === '3D') {
            updateBoard3D();
        } else {
            renderBoard2D();
        }

        document.getElementById('chess-status').innerText = `AI played: ${selectedMove.san}. Your turn!`;
        checkGameStatus();
    }
}

// Selects the best move using Minimax to a specified depth
function selectBestMove(depth) {
    const moves = chessGame.moves({ verbose: true });
    if (moves.length === 0) return null;

    const aiColor = chessGame.turn(); // 'w' or 'b'
    const isAiMaximizing = (aiColor === 'w');

    // Order moves for alpha-beta efficiency (MVV-LVA)
    const orderedMoves = orderMoves(moves);

    let bestVal = isAiMaximizing ? -Infinity : Infinity;
    const moveEvaluations = [];

    orderedMoves.forEach(m => {
        chessGame.move(m);
        // After AI's move, it is the opponent's turn.
        // If AI is White (maximizing), then opponent is Black (minimizing, so isMaximizing = false).
        // If AI is Black (minimizing), then opponent is White (maximizing, so isMaximizing = true).
        const val = minimax(depth - 1, -Infinity, Infinity, !isAiMaximizing);
        chessGame.undo();

        moveEvaluations.push({ move: m, val: val });

        if (isAiMaximizing) {
            if (val > bestVal) bestVal = val;
        } else {
            if (val < bestVal) bestVal = val;
        }
    });

    // Score tolerance based on difficulty (allows variation while staying strong)
    // Easy: within 30 points (0.3 pawns)
    // Medium: within 15 points (0.15 pawns)
    // Hard: within 5 points (0.05 pawns)
    let tolerance = 15;
    if (aiLevel === 'easy') tolerance = 30;
    else if (aiLevel === 'hard') tolerance = 5;

    // Filter candidate moves within the tolerance
    const candidateMoves = moveEvaluations.filter(item => {
        if (isAiMaximizing) {
            return (bestVal - item.val) <= tolerance;
        } else {
            return (item.val - bestVal) <= tolerance;
        }
    }).map(item => item.move);

    // Pick randomly from the candidates to introduce variety
    return candidateMoves[Math.floor(Math.random() * candidateMoves.length)];
}

// Alpha-Beta Minimax Evaluation
function minimax(depth, alpha, beta, isMaximizing) {
    if (depth === 0 || chessGame.game_over()) {
        return evaluateBoard(chessGame.board());
    }

    const moves = chessGame.moves({ verbose: true });
    const orderedMoves = orderMoves(moves);

    if (isMaximizing) {
        let maxEval = -Infinity;
        for (let i = 0; i < orderedMoves.length; i++) {
            chessGame.move(orderedMoves[i]);
            let score = minimax(depth - 1, alpha, beta, false);
            chessGame.undo();
            maxEval = Math.max(maxEval, score);
            alpha = Math.max(alpha, score);
            if (beta <= alpha) break;
        }
        return maxEval;
    } else {
        let minEval = Infinity;
        for (let i = 0; i < orderedMoves.length; i++) {
            chessGame.move(orderedMoves[i]);
            let score = minimax(depth - 1, alpha, beta, true);
            chessGame.undo();
            minEval = Math.min(minEval, score);
            beta = Math.min(beta, score);
            if (beta <= alpha) break;
        }
        return minEval;
    }
}

// Highly optimized O(N) move ordering: partition checks, captures, and promotions
function orderMoves(moves) {
    const captures = [];
    const others = [];
    for (let i = 0; i < moves.length; i++) {
        const m = moves[i];
        if (m.captured || m.promotion || (m.san && m.san.includes('+'))) {
            captures.push(m);
        } else {
            others.push(m);
        }
    }
    return captures.concat(others);
}

// Basic Chess Piece Valuations (scaled by 10)
const PIECE_VALUES = {
    'p': 10,
    'n': 30,
    'b': 30,
    'r': 50,
    'q': 90,
    'k': 1000
};

// Piece-Square Tables (PST) for positional valuations
const PST = {
    'p': [
        [0,  0,  0,  0,  0,  0,  0,  0],
        [50, 50, 50, 50, 50, 50, 50, 50],
        [10, 10, 20, 30, 30, 20, 10, 10],
        [5,  5, 10, 25, 25, 10,  5,  5],
        [0,  0,  0, 20, 20,  0,  0,  0],
        [5, -5,-10,  0,  0,-10, -5,  5],
        [5, 10, 10,-20,-20, 10, 10,  5],
        [0,  0,  0,  0,  0,  0,  0,  0]
    ],
    'n': [
        [-50,-40,-30,-30,-30,-30,-40,-50],
        [-40,-20,  0,  0,  0,  0,-20,-40],
        [-30,  0, 10, 15, 15, 10,  0,-30],
        [-30,  5, 15, 20, 20, 15,  5,-30],
        [-30,  0, 15, 20, 20, 15,  0,-30],
        [-30,  5, 10, 15, 15, 10,  5,-30],
        [-40,-20,  0,  5,  5,  0,-20,-40],
        [-50,-40,-30,-30,-30,-30,-40,-50]
    ],
    'b': [
        [-20,-10,-10,-10,-10,-10,-10,-20],
        [-10,  0,  0,  0,  0,  0,  0,-10],
        [-10,  0,  5, 10, 10,  5,  0,-10],
        [-10,  5,  5, 10, 10,  5,  5,-10],
        [-10,  0, 10, 10, 10, 10,  0,-10],
        [-10, 10, 10, 10, 10, 10, 10,-10],
        [-10,  5,  0,  0,  0,  0,  5,-10],
        [-20,-10,-10,-10,-10,-10,-10,-20]
    ],
    'r': [
        [0,  0,  0,  0,  0,  0,  0,  0],
        [5, 10, 10, 10, 10, 10, 10,  5],
        [-5,  0,  0,  0,  0,  0,  0, -5],
        [-5,  0,  0,  0,  0,  0,  0, -5],
        [-5,  0,  0,  0,  0,  0,  0, -5],
        [-5,  0,  0,  0,  0,  0,  0, -5],
        [-5,  0,  0,  0,  0,  0,  0, -5],
        [0,  0,  0,  5,  5,  0,  0,  0]
    ],
    'q': [
        [-20,-10,-10, -5, -5,-10,-10,-20],
        [-10,  0,  0,  0,  0,  0,  0,-10],
        [-10,  0,  5,  5,  5,  5,  0,-10],
        [-5,  0,  5,  5,  5,  5,  0, -5],
        [0,  0,  5,  5,  5,  5,  0, -5],
        [-10,  5,  5,  5,  5,  5,  0,-10],
        [-10,  0,  5,  0,  0,  5,  0,-10],
        [-20,-10,-10, -5, -5,-10,-10,-20]
    ],
    'k': [
        [-30,-40,-40,-50,-50,-40,-40,-30],
        [-30,-40,-40,-50,-50,-40,-40,-30],
        [-30,-40,-40,-50,-50,-40,-40,-30],
        [-30,-40,-40,-50,-50,-40,-40,-30],
        [-20,-30,-30,-40,-40,-30,-30,-20],
        [-10,-20,-20,-20,-20,-20,-20,-10],
        [20, 20,  0,  0,  0,  0, 20, 20],
        [20, 30, 10,  0,  0, 10, 30, 20]
    ]
};

function evaluateBoard(board) {
    let score = 0;
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            const piece = board[r][c];
            if (piece) {
                const type = piece.type;
                const baseVal = PIECE_VALUES[type] * 10;
                const table = PST[type];
                const pstVal = table ? (piece.color === 'w' ? table[r][c] : table[7 - r][c]) : 0;
                
                score += (piece.color === 'w' ? (baseVal + pstVal) : -(baseVal + pstVal));
            }
        }
    }
    return score;
}

let soundEnabled = (localStorage.getItem('arena_sound_enabled') !== 'false');

function toggleArenaSound() {
    soundEnabled = !soundEnabled;
    localStorage.setItem('arena_sound_enabled', soundEnabled ? 'true' : 'false');
    const btn = document.getElementById('arena-sound-toggle-btn');
    if (btn) {
        btn.innerText = soundEnabled ? 'Enabled' : 'Disabled';
        btn.className = soundEnabled 
            ? 'px-4 py-1.5 bg-secondary text-on-secondary rounded-lg text-xs font-bold transition-all shadow hover:bg-secondary/90'
            : 'px-4 py-1.5 bg-surface-container-high text-on-surface border border-outline-variant hover:bg-surface-variant/30 text-xs font-bold rounded-lg transition-all';
    }
    showNotification(`Sound effects ${soundEnabled ? 'enabled' : 'disabled'}`, 'info');
}

// Audio feedback
function playMoveSound(type = 'move') {
    if (!soundEnabled) return;
    try {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

        
        if (type === 'capture') {
            // Crisp wooden knock + short white noise burst for capture impact
            const osc = audioCtx.createOscillator();
            const gainNode = audioCtx.createGain();
            osc.connect(gainNode);
            gainNode.connect(audioCtx.destination);
            
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(120, audioCtx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(240, audioCtx.currentTime + 0.12);
            gainNode.gain.setValueAtTime(0.35, audioCtx.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.12);
            osc.start();
            osc.stop(audioCtx.currentTime + 0.12);

            const bufferSize = audioCtx.sampleRate * 0.035;
            const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
            const data = buffer.getChannelData(0);
            for (let i = 0; i < bufferSize; i++) {
                data[i] = Math.random() * 2 - 1;
            }
            const noise = audioCtx.createBufferSource();
            noise.buffer = buffer;
            const noiseFilter = audioCtx.createBiquadFilter();
            noiseFilter.type = 'bandpass';
            noiseFilter.frequency.value = 600;
            const noiseGain = audioCtx.createGain();
            noiseGain.gain.setValueAtTime(0.08, audioCtx.currentTime);
            noiseGain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.035);
            noise.connect(noiseFilter);
            noiseFilter.connect(noiseGain);
            noiseGain.connect(audioCtx.destination);
            noise.start();
        } 
        else if (type === 'check') {
            // Double quick bell chime
            const osc = audioCtx.createOscillator();
            const gainNode = audioCtx.createGain();
            osc.connect(gainNode);
            gainNode.connect(audioCtx.destination);

            osc.type = 'sine';
            osc.frequency.setValueAtTime(800, audioCtx.currentTime);
            osc.frequency.setValueAtTime(1000, audioCtx.currentTime + 0.06);
            gainNode.gain.setValueAtTime(0.12, audioCtx.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.18);
            osc.start();
            osc.stop(audioCtx.currentTime + 0.18);
        }
        else if (type === 'gameover') {
            // Heavy low-frequency frequency sweep
            const osc = audioCtx.createOscillator();
            const gainNode = audioCtx.createGain();
            osc.connect(gainNode);
            gainNode.connect(audioCtx.destination);

            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(180, audioCtx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(60, audioCtx.currentTime + 0.35);
            gainNode.gain.setValueAtTime(0.18, audioCtx.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.35);
            osc.start();
            osc.stop(audioCtx.currentTime + 0.35);
        }
        else if (type === 'tick') {
            // Soft high click
            const osc = audioCtx.createOscillator();
            const gainNode = audioCtx.createGain();
            osc.connect(gainNode);
            gainNode.connect(audioCtx.destination);

            osc.type = 'sine';
            osc.frequency.setValueAtTime(1800, audioCtx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(800, audioCtx.currentTime + 0.012);
            gainNode.gain.setValueAtTime(0.02, audioCtx.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.012);
            osc.start();
            osc.stop(audioCtx.currentTime + 0.012);
        }
        else if (type === 'lowtime') {
            // High chime warning beep
            const osc = audioCtx.createOscillator();
            const gainNode = audioCtx.createGain();
            osc.connect(gainNode);
            gainNode.connect(audioCtx.destination);

            osc.type = 'sine';
            osc.frequency.setValueAtTime(1100, audioCtx.currentTime);
            gainNode.gain.setValueAtTime(0.06, audioCtx.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.07);
            osc.start();
            osc.stop(audioCtx.currentTime + 0.07);
        }
        else {
            // Standard move (default): Crisp wooden tap
            const osc = audioCtx.createOscillator();
            const gainNode = audioCtx.createGain();
            osc.connect(gainNode);
            gainNode.connect(audioCtx.destination);

            osc.type = 'triangle';
            osc.frequency.setValueAtTime(150, audioCtx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(300, audioCtx.currentTime + 0.08);

            gainNode.gain.setValueAtTime(0.3, audioCtx.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.1);

            osc.start();
            osc.stop(audioCtx.currentTime + 0.1);
        }
    } catch (err) {
        // Sound failure safety
    }
}

function playMoveSoundForMove(move, gameRef = chessGame) {
    if (!move) return;
    if (gameRef.game_over()) {
        playMoveSound('gameover');
    } else if (gameRef.in_check()) {
        playMoveSound('check');
    } else if (move.captured || (typeof move.san === 'string' && move.san.includes('x'))) {
        playMoveSound('capture');
    } else {
        playMoveSound('move');
    }
}

// Check winner
function checkGameStatus() {
    if (chessGame.game_over()) {
        let statusText = 'Game Over! ';
        let statusBadge = document.getElementById('chess-status-badge');
        let outcome = 'draw';

        if (chessGame.in_checkmate()) {
            const loserColor = chessGame.turn();
            const myColor = window._liveMode ? window._liveMyColor : 'w';
            
            if (myColor === loserColor) {
                // I lost
                statusText += window._liveMode ? 'Checkmate! You lose.' : 'Checkmate! AI wins.';
                statusBadge.innerText = 'Defeat';
                statusBadge.className = 'px-3 py-1 bg-red-500/20 text-red-400 border border-red-500/30 rounded-full font-bold text-xs';
                outcome = 'lose';
            } else {
                // I won
                statusText += 'Checkmate! You win!';
                statusBadge.innerText = 'Victory';
                statusBadge.className = 'px-3 py-1 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-full font-bold text-xs';
                outcome = 'win';
            }
        } else if (chessGame.in_draw() || chessGame.in_stalemate() || chessGame.in_threefold_repetition()) {
            statusText += 'Draw match.';
            statusBadge.innerText = 'Draw';
            statusBadge.className = 'px-3 py-1 bg-slate-500/20 text-slate-400 border border-slate-500/30 rounded-full font-bold text-xs';
            outcome = 'draw';
        }

        document.getElementById('chess-status').innerText = statusText;

        // Update user metrics in db
        if (typeof window.recordGameResult === 'function') {
            window.recordGameResult(outcome);
        } else if (typeof recordGameResult === 'function') {
            recordGameResult(outcome);
        }

        // Disable live mode on game completion
        window._liveMode = false;
        const chatWrapper = document.getElementById('live-chat-wrapper');
        if (chatWrapper) chatWrapper.classList.add('hidden');
    }
}

// Mode toggle
function toggleEngineView(mode) {
    gameMode = mode;

    const btn2d = document.getElementById('btn-view-2d');
    const btn3d = document.getElementById('btn-view-3d');

    if (mode === '3D') {
        btn3d.className = 'px-6 py-2 bg-secondary text-on-secondary rounded-full text-sm font-bold shadow-lg shadow-secondary/15';
        btn2d.className = 'px-6 py-2 bg-surface-variant text-on-surface rounded-full text-sm font-bold border border-outline-variant hover:bg-surface-variant/85';

        document.getElementById('chess-board-2d').classList.add('hidden');
        document.getElementById('chess-board-3d').classList.remove('hidden');
        initBoard3D();
    } else {
        btn2d.className = 'px-6 py-2 bg-secondary text-on-secondary rounded-full text-sm font-bold shadow-lg shadow-secondary/15';
        btn3d.className = 'px-6 py-2 bg-surface-variant text-on-surface rounded-full text-sm font-bold border border-outline-variant hover:bg-surface-variant/85';

        document.getElementById('chess-board-3d').classList.add('hidden');
        document.getElementById('chess-board-2d').classList.remove('hidden');
        renderBoard2D();
    }
}

function changeDifficulty(level) {
    aiLevel = level;
    
    // Toggle active button style classes
    const levels = ['easy', 'medium', 'hard'];
    levels.forEach(l => {
        const btn = document.getElementById(`btn-diff-${l}`);
        if (btn) {
            if (l === level) {
                btn.className = 'py-2 rounded-xl text-xs font-semibold bg-secondary/10 text-secondary border border-secondary/30 transition-all';
            } else {
                btn.className = 'py-2 rounded-xl text-xs font-semibold bg-surface-container-high text-on-surface border border-outline-variant hover:bg-surface-variant/30 transition-all hover:border-secondary';
            }
        }
    });

    showNotification(`Difficulty level set to: ${level.toUpperCase()}`, "info");
}

function resetChessMatch() {
    initChessGame();
    if (gameMode === '3D') {
        updateBoard3D();
    }
    showNotification("Match reset. Good luck!", "info");
}

function flipBoardView() {
    boardFlipped = !boardFlipped;
    if (gameMode === '3D') {
        // In 3D, we just rotate the camera to the opposite side
        const targetRot = boardFlipped ? Math.PI : 0;
        gsap.to(camera.position, {
            x: boardFlipped ? 0 : 0,
            z: boardFlipped ? -12 : 12,
            duration: 1,
            onUpdate: () => camera.lookAt(0, 0, 0)
        });
    } else {
        renderBoard2D();
    }
    showNotification("Board Flipped", "info");
}

// ==========================================
// THREE.JS 3D CHESS BOARD IMPLEMENTATION
// ==========================================

function initBoard3D() {
    const container = document.getElementById('chess-board-3d');
    if (!container) return;

    // Remove existing Canvas
    if (is3DInitialized && renderer) {
        container.innerHTML = '';
    }

    const width = container.clientWidth || 600;
    const height = container.clientHeight || 500;

    // Create Scene
    scene = new THREE.Scene();
    scene.background = new THREE.Color('#111415'); // Dark match with background theme

    // Create Camera
    camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
    // Position camera looking down on the board from white's perspective
    camera.position.set(0, 10, 10);

    // Create Renderer
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);

    // Orbit Controls
    if (window.THREE.OrbitControls || window.OrbitControls) {
        const ControlsClass = window.THREE.OrbitControls || window.OrbitControls;
        orbitControls = new ControlsClass(camera, renderer.domElement);
        orbitControls.enableDamping = true;
        orbitControls.dampingFactor = 0.05;
        orbitControls.maxPolarAngle = Math.PI / 2 - 0.05; // prevent going below board
        orbitControls.minDistance = 5;
        orbitControls.maxDistance = 20;
    }

    // Add Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xfff8e7, 0.8); // slight warm glow
    dirLight.position.set(5, 12, 5);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 1024;
    dirLight.shadow.mapSize.height = 1024;
    dirLight.shadow.camera.near = 0.5;
    dirLight.shadow.camera.far = 25;
    const d = 6;
    dirLight.shadow.camera.left = -d;
    dirLight.shadow.camera.right = d;
    dirLight.shadow.camera.top = d;
    dirLight.shadow.camera.bottom = -d;
    scene.add(dirLight);

    const accentLight = new THREE.PointLight(0xe9c176, 0.5, 15); // gold glow center
    accentLight.position.set(0, 5, 0);
    scene.add(accentLight);

    // Draw Board Tiles
    create3DBoardGrid();

    // Draw 3D Pieces based on chessGame state
    spawn3DPieces();

    // Raycast input setup
    renderer.domElement.addEventListener('click', on3DClick);

    // Resize Handler
    window.addEventListener('resize', on3DWindowResize);

    is3DInitialized = true;
    animate3D();
}

function create3DBoardGrid() {
    const tileSize = 1.0;
    const tileHeight = 0.15;
    const columns = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];

    // Clear reference map
    boardTiles3D = {};

    // Walnut wood board frame — warm classic tone matching traditional boards
    const frameGeo = new THREE.BoxGeometry(8.5, tileHeight * 0.8, 8.5);
    const frameMat = new THREE.MeshStandardMaterial({
        color: 0x5c3d1e,    // Dark walnut
        roughness: 0.65,
        metalness: 0.0
    });
    const frame = new THREE.Mesh(frameGeo, frameMat);
    frame.position.y = -tileHeight / 2;
    frame.receiveShadow = true;
    scene.add(frame);

    // Use active board skin colours — default is Classical Green
    const skinColors    = BOARD_SKINS[activeBoardSkin] || BOARD_SKINS['green'];
    const darkTileColor  = skinColors.color3dDark;   // e.g. 0x769656
    const lightTileColor = skinColors.color3dLight;  // e.g. 0xeeeed2

    // Inner board grid
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            const squareName = columns[c] + (r + 1);
            const isDark = (r + c) % 2 === 0;

            const tileGeo = new THREE.BoxGeometry(tileSize, tileHeight, tileSize);

            // Classical board tile — reads colours from the active skin
            const tileMat = new THREE.MeshStandardMaterial({
                color: isDark ? darkTileColor : lightTileColor,
                roughness: 0.30,
                metalness: 0.05
            });

            const tile = new THREE.Mesh(tileGeo, tileMat);

            // Shift coordinate origin to center of board
            const x = (c - 3.5) * tileSize;
            const z = -(r - 3.5) * tileSize; // negative to match white on bottom

            tile.position.set(x, 0, z);
            tile.receiveShadow = true;
            tile.userData = { square: squareName, defaultColor: isDark ? darkTileColor : lightTileColor };

            scene.add(tile);
            boardTiles3D[squareName] = tile;
        }
    }
}

// Procedural 3D Piece Generation (frosted gold metal vs dark obsidian metal)
function spawn3DPieces() {
    // Clear old pieces
    Object.values(chessPieces3D).forEach(mesh => {
        scene.remove(mesh);
    });
    chessPieces3D = {};

    const board = chessGame.board();
    const columns = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];

    // Classic Staunton-style piece materials:
    //   White side → ivory / cream  |  Black side → dark ebony / walnut
    const whiteMaterial = new THREE.MeshStandardMaterial({
        color: 0xf5f0e8,    // Ivory cream — classic Staunton white
        roughness: 0.45,
        metalness: 0.05,
        envMapIntensity: 0.5
    });

    const blackMaterial = new THREE.MeshStandardMaterial({
        color: 0x120d08,    // Dark ebony / walnut — classic Staunton black
        roughness: 0.40,
        metalness: 0.05,
        envMapIntensity: 0.5
    });

    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            const piece = board[7 - r][c];
            if (piece) {
                const squareName = columns[c] + (r + 1);
                const mat = (piece.color === 'w') ? whiteMaterial : blackMaterial;

                const pieceMesh = createProceduralPieceMesh(piece.type, mat);

                // Position piece at tile coordinates
                const x = (c - 3.5) * 1.0;
                const z = -(r - 3.5) * 1.0;
                pieceMesh.position.set(x, 0.075, z); // half tile height offset

                scene.add(pieceMesh);
                chessPieces3D[squareName] = pieceMesh;
            }
        }
    }
}

// Procedural modeling of chess shapes using basic primitives
function createProceduralPieceMesh(type, material) {
    const group = new THREE.Group();

    // Base ring (all pieces have this)
    const baseGeo = new THREE.CylinderGeometry(0.35, 0.38, 0.1, 16);
    const base = new THREE.Mesh(baseGeo, material);
    base.position.y = 0.05;
    base.castShadow = true;
    base.receiveShadow = true;
    group.add(base);

    let heightOffset = 0.1;

    switch (type) {
        case 'p': // Pawn
            const bodyGeo = new THREE.CylinderGeometry(0.2, 0.28, 0.4, 16);
            const body = new THREE.Mesh(bodyGeo, material);
            body.position.y = heightOffset + 0.2;
            body.castShadow = true;
            group.add(body);

            const headGeo = new THREE.SphereGeometry(0.18, 16, 16);
            const head = new THREE.Mesh(headGeo, material);
            head.position.y = heightOffset + 0.5;
            head.castShadow = true;
            group.add(head);
            break;

        case 'r': // Rook
            const castleGeo = new THREE.CylinderGeometry(0.25, 0.28, 0.55, 16);
            const castle = new THREE.Mesh(castleGeo, material);
            castle.position.y = heightOffset + 0.275;
            castle.castShadow = true;
            group.add(castle);

            const battlementsGeo = new THREE.CylinderGeometry(0.28, 0.28, 0.15, 8);
            const batt = new THREE.Mesh(battlementsGeo, material);
            batt.position.y = heightOffset + 0.6;
            batt.castShadow = true;
            group.add(batt);
            break;

        case 'n': // Knight (horse look)
            const bodyNGeo = new THREE.CylinderGeometry(0.2, 0.28, 0.3, 16);
            const bodyN = new THREE.Mesh(bodyNGeo, material);
            bodyN.position.y = heightOffset + 0.15;
            group.add(bodyN);

            const headNGeo = new THREE.BoxGeometry(0.22, 0.38, 0.35);
            const headN = new THREE.Mesh(headNGeo, material);
            headN.position.set(0, heightOffset + 0.42, 0.05);
            headN.rotation.x = -0.2;
            headN.castShadow = true;
            group.add(headN);
            break;

        case 'b': // Bishop
            const trunkGeo = new THREE.CylinderGeometry(0.18, 0.26, 0.5, 16);
            const trunk = new THREE.Mesh(trunkGeo, material);
            trunk.position.y = heightOffset + 0.25;
            group.add(trunk);

            const hatGeo = new THREE.ConeGeometry(0.2, 0.35, 16);
            const hat = new THREE.Mesh(hatGeo, material);
            hat.position.y = heightOffset + 0.6;
            hat.castShadow = true;
            group.add(hat);

            const crossB = new THREE.SphereGeometry(0.06, 8, 8);
            const cb = new THREE.Mesh(crossB, material);
            cb.position.y = heightOffset + 0.77;
            group.add(cb);
            break;

        case 'q': // Queen
            const bodyQ = new THREE.CylinderGeometry(0.18, 0.3, 0.65, 16);
            const bq = new THREE.Mesh(bodyQ, material);
            bq.position.y = heightOffset + 0.325;
            group.add(bq);

            const crownGeo = new THREE.ConeGeometry(0.28, 0.2, 12, 1, true); // open cone
            const crown = new THREE.Mesh(crownGeo, material);
            crown.position.y = heightOffset + 0.7;
            crown.rotation.x = Math.PI;
            group.add(crown);

            const gem = new THREE.SphereGeometry(0.07, 8, 8);
            const g = new THREE.Mesh(gem, material);
            g.position.y = heightOffset + 0.82;
            group.add(g);
            break;

        case 'k': // King
            const bodyK = new THREE.CylinderGeometry(0.18, 0.3, 0.7, 16);
            const bk = new THREE.Mesh(bodyK, material);
            bk.position.y = heightOffset + 0.35;
            group.add(bk);

            const crownK = new THREE.CylinderGeometry(0.28, 0.22, 0.2, 12);
            const ck = new THREE.Mesh(crownK, material);
            ck.position.y = heightOffset + 0.75;
            group.add(ck);

            // Simple cross
            const horizGeo = new THREE.BoxGeometry(0.25, 0.07, 0.07);
            const vertGeo = new THREE.BoxGeometry(0.07, 0.25, 0.07);
            const cx1 = new THREE.Mesh(horizGeo, material);
            const cx2 = new THREE.Mesh(vertGeo, material);
            const crossG = new THREE.Group();
            crossG.add(cx1);
            crossG.add(cx2);
            crossG.position.y = heightOffset + 0.95;
            group.add(crossG);
            break;
    }

    // Enable shadows on all child meshes
    group.traverse(node => {
        if (node.isMesh) {
            node.castShadow = true;
            node.receiveShadow = true;
        }
    });

    return group;
}

// Raycaster interaction
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

function on3DClick(event) {
    // Get relative mouse position inside canvas bounds
    const rect = renderer.domElement.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);

    // We only intersect with Board Tiles to determine clicked coordinate
    const tiles = Object.values(boardTiles3D);
    const intersects = raycaster.intersectObjects(tiles);

    if (intersects.length > 0) {
        const clickedTile = intersects[0].object;
        const square = clickedTile.userData.square;

        handleSquareClick3D(square);
    }
}

function handleSquareClick3D(square) {
    if (chessGame.game_over()) return;
    if (arenaGameMode === 'review') return;

    if (window._liveMode) {
        if (chessGame.turn() !== window._liveMyColor) {
            showNotification("It is not your turn!", "warning");
            return;
        }
        const piece = chessGame.get(square);
        if (piece && piece.color !== window._liveMyColor && selectedSquare3D === null) {
            return; // Can't select opponent pieces
        }
    }

    const piece = chessGame.get(square);
    const isUserPiece = piece && piece.color === chessGame.turn();

    if (isUserPiece) {
        // Highlight active tile
        clear3DHighlights();
        selectedSquare3D = square;

        // Show selected feedback in yellow
        boardTiles3D[square].material.color.setHex(0xdab36a);

        // Highlight possible destination moves
        const moves = chessGame.moves({ square: square, verbose: true });
        moves.forEach(m => {
            const destTile = boardTiles3D[m.to];
            if (destTile) {
                destTile.material.color.setHex(0x39475f); // blue-grey hint
                highlightedSquares3D.push(m.to);
            }
        });
    } else if (selectedSquare3D) {
        // Attempt player move
        const move = makePlayerMove(selectedSquare3D, square);
        if (move) {
            clear3DHighlights();
            selectedSquare3D = null;
            updateBoard3D();

            // AI or local opponent turn
            if (!chessGame.game_over() && arenaGameMode === 'vs-computer' && !window._liveMode) {
                document.getElementById('chess-status').innerText = 'Mind Square AI is thinking...';
                setTimeout(makeAIMove, 700);
            } else if (!chessGame.game_over() && arenaGameMode === 'pass-play') {
                switchClockTurn();
                setTimeout(() => {
                    flipBoardView();
                }, 500);
            }
        } else {
            // Invalid clicked area, deselect
            clear3DHighlights();
            selectedSquare3D = null;
        }
    }
}

function clear3DHighlights() {
    // Reset selected tile color
    if (selectedSquare3D && boardTiles3D[selectedSquare3D]) {
        boardTiles3D[selectedSquare3D].material.color.setHex(boardTiles3D[selectedSquare3D].userData.defaultColor);
    }

    // Reset hint tile colors
    highlightedSquares3D.forEach(sq => {
        if (boardTiles3D[sq]) {
            boardTiles3D[sq].material.color.setHex(boardTiles3D[sq].userData.defaultColor);
        }
    });

    highlightedSquares3D = [];
}

function updateBoard3D() {
    clear3DHighlights();
    
    // Animate last move if history exists
    const history = chessGame.history({ verbose: true });
    if (history.length > 0) {
        const lastMove = history[history.length - 1];
        const pieceMesh = chessPieces3D[lastMove.from];
        
        if (pieceMesh) {
            // 1. Handle captured piece scale down
            const capturedMesh = chessPieces3D[lastMove.to];
            if (capturedMesh) {
                gsap.to(capturedMesh.scale, {
                    x: 0,
                    y: 0,
                    z: 0,
                    duration: 0.25,
                    onComplete: () => {
                        scene.remove(capturedMesh);
                    }
                });
            }
            
            // 2. Calculate coordinates
            const columns = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
            const targetColIdx = columns.indexOf(lastMove.to[0]);
            const targetRowIdx = parseInt(lastMove.to[1]) - 1;
            const targetX = (targetColIdx - 3.5) * 1.0;
            const targetZ = -(targetRowIdx - 3.5) * 1.0;
            
            // 3. Animate slide translation
            gsap.to(pieceMesh.position, {
                x: targetX,
                z: targetZ,
                duration: 0.65,
                ease: "power2.out",
                onComplete: () => {
                    // Update our pieces map
                    chessPieces3D[lastMove.to] = pieceMesh;
                    if (chessPieces3D[lastMove.from] === pieceMesh) {
                        delete chessPieces3D[lastMove.from];
                    }
                    // Fallback to full sync just in case (e.g. promotions, castling)
                    spawn3DPieces();
                }
            });
            return;
        }
    }
    
    spawn3DPieces();
}

function on3DWindowResize() {
    const container = document.getElementById('chess-board-3d');
    if (!container || !renderer || !camera) return;

    const width = container.clientWidth;
    const height = container.clientHeight;

    camera.aspect = width / height;
    camera.updateProjectionMatrix();

    renderer.setSize(width, height);
}

// 3D Render loop
function animate3D() {
    if (gameMode !== '3D') return;
    requestAnimationFrame(animate3D);

    if (orbitControls) {
        orbitControls.update();
    }

    renderer.render(scene, camera);
}

// ==========================================
// 3D CAMERA ANGLE CONTROLS
// ==========================================

function changeCameraAngle(preset) {
    if (!camera) return;
    
    const presets = ['player', 'topdown', 'orbital'];
    presets.forEach(p => {
        const btn = document.getElementById(`btn-cam-${p}`);
        if (btn) {
            if (p === preset) {
                btn.className = 'px-4 py-1.5 bg-secondary text-on-secondary hover:bg-secondary/90 transition-all rounded-full text-xs font-semibold';
            } else {
                btn.className = 'px-4 py-1.5 bg-surface-variant text-on-surface border border-outline-variant hover:bg-surface-bright transition-all rounded-full text-xs font-semibold';
            }
        }
    });

    if (preset === 'player') {
        gsap.to(camera.position, { 
            x: 0, y: 8, z: 8, 
            duration: 1.2, 
            ease: "power2.inOut", 
            onUpdate: () => {
                camera.lookAt(0, 0, 0);
                if (orbitControls) orbitControls.update();
            }
        });
    } else if (preset === 'topdown') {
        gsap.to(camera.position, { 
            x: 0, y: 11, z: 0.01, 
            duration: 1.2, 
            ease: "power2.inOut", 
            onUpdate: () => {
                camera.lookAt(0, 0, 0);
                if (orbitControls) orbitControls.update();
            }
        });
    } else if (preset === 'orbital') {
        gsap.to(camera.position, { 
            x: 7, y: 5.5, z: 7, 
            duration: 1.5, 
            ease: "power2.inOut", 
            onUpdate: () => {
                camera.lookAt(0, 0, 0);
                if (orbitControls) orbitControls.update();
            }
        });
    }
    
    showNotification(`3D camera angle set to ${preset.toUpperCase()}`, "info");
}

// ==========================================
// CHESS ACADEMY TACTICS CHALLENGES
// ==========================================

let PUZZLES = [
    {
        id: "PZ-001",
        title: "Back Rank Weakness",
        description: "Black's back rank is completely unprotected. White to move and mate in 1.",
        fen: "6k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1",
        solution: "d1-d8",
        hint: "Deliver checks on the 8th rank with your Rook.",
        reward: 10
    },
    {
        id: "PZ-002",
        title: "Scholar's Mate Trap",
        description: "A classic developmental mistake. White's Queen and Bishop target the weak f7 square. White to move and mate in 1.",
        fen: "r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5Q2/PPPP1PPP/RNB1K1NR w KQkq - 4 4",
        solution: "f3-f7",
        hint: "The Queen on f3 can execute a checkmate, guarded by the Bishop on c4.",
        reward: 10
    },
    {
        id: "PZ-003",
        title: "Obsidian Backdoor Mate",
        description: "White has a powerful rook on the a-file. Black's king is cornered on a8. White to move and mate in 1.",
        fen: "k7/8/1K6/8/8/8/8/R7 w - - 0 1",
        solution: "a1-a8",
        hint: "Move your Rook on a1 to the 8th rank.",
        reward: 15
    }
];

// Dynamically generate 212 additional valid, legal, and diverse puzzles across 5 tactical categories
(function generateExtraPuzzles() {
    const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
    const knightOffsets = [
        [1, 2], [1, -2], [-1, 2], [-1, -2],
        [2, 1], [2, -1], [-2, 1], [-2, -1]
    ];
    const isOnBoard = (f, r) => f >= 0 && f < 8 && r >= 0 && r < 8;

    function rowsToFen(rows) {
        let fenRows = [];
        for (let r = 7; r >= 0; r--) {
            let rowStr = rows[r].join('').replace(/1+/g, m => m.length);
            fenRows.push(rowStr);
        }
        return fenRows.join('/') + " w - - 0 1";
    }

    for (let count = 4; count <= 215; count++) {
        let category = (count - 4) % 8;
        let idx = Math.floor((count - 4) / 8);

        let rows = Array(8).fill(null).map(() => Array(8).fill('1'));
        let title = "";
        let description = "";
        let solution = "";
        let hint = "";
        let reward = 20;

        // Base background setup: Place White King on g1 (6, 0)
        rows[0][6] = 'K';

        if (category === 0) {
            // --- Category 0: Royal Knight Forks ---
            let tx = 2 + (idx % 4);
            let ty = 3 + (Math.floor(idx / 4) % 3);
            
            let kx = tx + knightOffsets[0][0];
            let ky = ty + knightOffsets[0][1];
            let qx = tx + knightOffsets[2][0];
            let qy = ty + knightOffsets[2][1];
            let nx = tx + knightOffsets[5][0];
            let ny = ty + knightOffsets[5][1];

            if (isOnBoard(kx, ky) && isOnBoard(qx, qy) && isOnBoard(nx, ny)) {
                rows[ky][kx] = 'k'; // Black King
                rows[qy][qx] = 'q'; // Black Queen
                rows[ny][nx] = 'N'; // White Knight
                
                if (kx !== 0 && qx !== 0 && nx !== 0 && tx !== 0) rows[1][0] = 'P'; // a2
                if (kx !== 1 && qx !== 1 && nx !== 1 && tx !== 1) rows[1][1] = 'P'; // b2
                if (kx !== 6 && qx !== 6 && nx !== 6 && tx !== 6) rows[1][6] = 'P'; // g2
                if (kx !== 7 && qx !== 7 && nx !== 7 && tx !== 7) rows[1][7] = 'P'; // h2
                
                if (kx !== 0 && qx !== 0 && nx !== 0 && tx !== 0) rows[6][0] = 'p'; // a7
                if (kx !== 1 && qx !== 1 && nx !== 1 && tx !== 1) rows[6][1] = 'p'; // b7
                
                title = `Royal Fork Strike #${idx + 1}`;
                description = `Find the key double attack. Jump your Knight to a square checking the Black King on ${files[kx].toUpperCase()}${ky + 1} and attacking the Queen on ${files[qx].toUpperCase()}${qy + 1}.`;
                solution = `${files[nx]}${ny + 1}-${files[tx]}${ty + 1}`;
                hint = `Move your Knight on ${files[nx]}${ny + 1} to the square ${files[tx]}${ty + 1} to fork the King and Queen.`;
                reward = 20;
            } else {
                rows[7][7] = 'k';
                rows[5][5] = 'q';
                rows[4][4] = 'N';
                title = `Simple Knight Fork #${idx + 1}`;
                description = `Deliver a Knight fork on the Black King and Queen.`;
                solution = `e5-f7`;
                hint = `Move Knight to f7.`;
            }
        }
        else if (category === 1) {
            // --- Category 1: Smothered Corner Mates ---
            if (idx % 2 === 0) {
                rows[7][7] = 'k'; // Black King on h8
                rows[7][6] = 'r'; // Black Rook on g8
                rows[6][6] = 'p'; // Black pawn on g7
                rows[6][7] = 'p'; // Black pawn on h7
                
                let nx = (idx % 2 === 0) ? 4 : 6;
                let ny = 4;
                rows[ny][nx] = 'N';
                
                rows[1][0] = 'P'; rows[1][1] = 'P';
                
                title = `Smothered Corner Mate #${idx + 1}`;
                description = `The Black King is trapped by its own pieces in the h8 corner. Deliver a smothered mate in 1!`;
                solution = `${files[nx]}${ny + 1}-f7`;
                hint = `Deliver checkmate with your Knight. Jump to f7.`;
            } else {
                rows[7][0] = 'k'; // Black King on a8
                rows[7][1] = 'r'; // Black Rook on b8
                rows[6][0] = 'p'; // Black pawn on a7
                rows[6][1] = 'p'; // Black pawn on b7
                
                let nx = (idx % 2 === 0) ? 3 : 1;
                let ny = 4;
                rows[ny][nx] = 'N';
                
                rows[1][6] = 'P'; rows[1][7] = 'P';
                
                title = `Smothered Corner Mate #${idx + 1}`;
                description = `The Black King is trapped by its own pieces in the a8 corner. Deliver a smothered mate in 1!`;
                solution = `${files[nx]}${ny + 1}-c7`;
                hint = `Deliver checkmate with your Knight. Jump to c7.`;
            }
            reward = 25;
        }
        else if (category === 2) {
            // --- Category 2: Discovered Double Checks ---
            let kx = (idx % 2 === 0) ? 4 : 6; // e8 or g8
            rows[7][kx] = 'k'; // Black King
            
            rows[0][kx] = 'R'; // White Rook on e1/g1
            
            let ny = (idx % 2 === 0) ? 3 : 5; // Knight on e4/g6
            rows[ny][kx] = 'N';
            
            let tx = (idx % 2 === 0) ? kx - 1 : kx - 2;
            let ty = (idx % 2 === 0) ? 5 : 6;
            
            for (let f = 0; f < 8; f++) {
                if (f !== kx && f !== tx) {
                    rows[1][f] = 'P';
                    rows[6][f] = 'p';
                }
            }
            
            title = `Discovered Double Check #${idx + 1}`;
            description = `Move your Knight to deliver checkmate or win major material via a discovered double check from your Rook on the open file.`;
            solution = `${files[kx]}${ny + 1}-${files[tx]}${ty + 1}`;
            hint = `Jump your Knight to ${files[tx]}${ty + 1} to check the King and reveal the Rook's check at the same time.`;
            reward = 20;
        }
        else if (category === 3) {
            // --- Category 3: Absolute Pins & Exploits ---
            rows[7][7] = 'k'; // Black King on h8
            rows[5][5] = 'q'; // Black Queen on f6
            
            rows[1][4] = 'B';
            rows[0][3] = 'R'; // Rook on d1 defending d4
            
            rows[1][0] = 'P'; rows[1][1] = 'P'; rows[1][7] = 'P';
            rows[6][0] = 'p'; rows[6][1] = 'p'; rows[6][2] = 'p';
            
            title = `Absolute Diagonal Pin #${idx + 1}`;
            description = `The Black Queen is on the same diagonal as the King. Spot the pinning move that wins the Queen.`;
            solution = `e2-d4`;
            hint = `Move your Bishop on e2 to the d4 square. The Queen will be completely pinned and undefendable.`;
            reward = 20;
        }
        else if (category === 4) {
            // --- Category 4: Back Rank Corridor Mates ---
            let kx = idx % 8;
            rows[7][kx] = 'k'; // Black King
            
            if (kx > 0) rows[6][kx - 1] = 'p';
            rows[6][kx] = 'p';
            if (kx < 7) rows[6][kx + 1] = 'p';
            
            let rx = (kx >= 4) ? kx - 3 : kx + 3;
            rows[1][rx] = 'R'; // White Rook starts on rank 2
            
            title = `Back-Rank Corridor Mate #${idx + 1}`;
            description = `Black's King is trapped behind its own pawns on the back rank. Deliver a corridor mate using your Rook.`;
            solution = `${files[rx]}2-${files[rx]}8`;
            hint = `Slide your Rook all the way to the 8th rank at ${files[rx]}8.`;
            reward = 15;
        }
        else if (category === 5) {
            // --- Category 5: Anastasia's & Arabian Mates ---
            if (idx % 2 === 0) {
                rows[7][7] = 'k'; // Black King on h8
                rows[6][7] = 'p'; // Black pawn on h7
                rows[6][4] = 'N'; // White Knight on e7
                
                rows[3][0] = 'R'; // White Rook on a4
                
                title = `Anastasia's Mating Net #${idx + 1}`;
                description = `White's Knight on e7 cuts off the g8 and g6 escape squares. Deliver Anastasia's Mate.`;
                solution = `a4-h4`;
                hint = `Move your Rook to the open h-file at h4.`;
            } else {
                rows[7][7] = 'k'; // Black King on h8
                rows[5][5] = 'N'; // White Knight on f6
                rows[6][0] = 'R'; // White Rook on a7
                
                title = `Arabian Mating Net #${idx + 1}`;
                description = `Use your Knight on f6 to support a back-rank mate. Deliver the classic Arabian Mate.`;
                solution = `a7-h7`;
                hint = `Slide your Rook on a7 to h7, guarded by the Knight.`;
            }
            reward = 25;
        }
        else if (category === 6) {
            // --- Category 6: Boden's Criss-Cross Mates ---
            if (idx % 2 === 0) {
                rows[7][2] = 'k'; // Black King on c8
                rows[7][3] = 'r'; // Black Rook on d8
                rows[7][1] = 'n'; // Black Knight on b7
                rows[5][2] = 'p'; // Black pawn on c6
                
                rows[3][5] = 'B'; // White Bishop 1 on f4
                rows[1][4] = 'B'; // White Bishop 2 on e2
                
                title = `Boden's Criss-Cross Mate #${idx + 1}`;
                description = `Black's castled Queenside King is vulnerable. Deliver Boden's Mate using your two Bishops.`;
                solution = `e2-a6`;
                hint = `Move your Bishop on e2 to a6 to deliver the criss-crossing checkmate.`;
            } else {
                rows[7][6] = 'k'; // Black King on g8
                rows[7][5] = 'r'; // Black Rook on f8
                rows[7][7] = 'n'; // Black Knight on h7
                rows[5][6] = 'p'; // Black pawn on g6
                
                rows[3][2] = 'B'; // White Bishop 1 on c4
                rows[2][7] = 'B'; // White Bishop 2 on h3
                rows[0][3] = 'B'; // White Bishop 3 starts on d1
                
                title = `Boden's Criss-Cross Mate #${idx + 1}`;
                description = `Black's castled Kingside King is vulnerable. Deliver Boden's Mate using your two Bishops.`;
                solution = `d1-c4`;
                hint = `Move your Bishop on d1 to c4 to deliver the checkmate.`;
            }
            reward = 25;
        }
        else if (category === 7) {
            // --- Category 7: Decoy & Deflection Sacrifices ---
            rows[7][6] = 'k'; // Black King
            rows[6][7] = 'p'; rows[6][6] = 'p'; rows[6][5] = 'p'; // f7, g7, h7 pawns
            
            rows[7][3] = 'r'; // Black Rook on d8
            rows[6][2] = 'q'; // Black Queen on c7
            
            rows[0][3] = 'R'; // White Rook on d1
            
            let qx = (idx % 2 === 0) ? 0 : 1;
            let qy = (idx % 2 === 0) ? 4 : 3;
            rows[qy][qx] = 'Q';
            
            title = `Queen Deflection Sacrifice #${idx + 1}`;
            description = `Deflect the Black Queen from defending the back-rank Rook on d8. Look for a powerful sacrifice.`;
            solution = `${files[qx]}${qy + 1}-d8`;
            hint = `Sacrifice your Queen on d8 to force the Black Queen to capture, leaving the back rank open for checkmate.`;
            reward = 25;
        }

        const fen = rowsToFen(rows);
        PUZZLES.push({
            id: `PZ-${String(count).padStart(3, '0')}`,
            title: title,
            description: description,
            fen: fen,
            solution: solution,
            hint: hint,
            reward: reward
        });
    }
})();

let activePuzzleId = "PZ-001";
let puzzleGame = null;
let selectedPuzzleSquare = null;

function initPuzzleGame() {
    const puzzle = PUZZLES.find(p => p.id === activePuzzleId);
    if (!puzzle) return;
    
    puzzleGame = new Chess(puzzle.fen);
    selectedPuzzleSquare = null;
    
    // Set UI descriptions
    document.getElementById('puzzle-title').innerText = puzzle.title;
    document.getElementById('puzzle-description').innerText = puzzle.description;
    document.getElementById('puzzle-hint-txt').innerText = puzzle.hint;
    document.getElementById('puzzle-hint-box').classList.add('hidden');
    
    // Update badge status based on user's solved state
    const currentUser = getCurrentUser();
    const isSolved = currentUser && currentUser.solvedPuzzles && currentUser.solvedPuzzles.includes(activePuzzleId);
    
    const badge = document.getElementById('puzzle-status-badge');
    if (isSolved) {
        badge.innerText = 'Dissolved';
        badge.className = 'px-3 py-1 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-full font-bold text-xs';
    } else {
        badge.innerText = 'Unsolved';
        badge.className = 'px-3 py-1 bg-amber-500/20 text-secondary border border-secondary/30 rounded-full font-bold text-xs';
    }
    
    renderPuzzleBoard();
    renderPuzzlesList();
}

function renderPuzzleBoard() {
    const boardEl = document.getElementById('puzzle-board');
    if (!boardEl) return;
    boardEl.innerHTML = '';
    
    updateOuterBoardCoordinates('puzzle-board', false);

    const board = puzzleGame.board();
    const columns = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];

    for (let r = 7; r >= 0; r--) {
        for (let c = 0; c < 8; c++) {
            const squareName = columns[c] + (r + 1);
            const piece = board[7 - r][c];

            const cell = document.createElement('div');
            cell.dataset.square = squareName;

            const isDark = (r + c) % 2 === 0;
            cell.className = `relative aspect-square flex items-center justify-center cursor-pointer transition-all duration-200 select-none `;

            const skinColors = BOARD_SKINS[activeBoardSkin] || BOARD_SKINS['green'];
            cell.style.backgroundColor = isDark ? skinColors.dark : skinColors.light;
            cell.style.color = isDark ? skinColors.darkText : skinColors.lightText;

            if (selectedPuzzleSquare === squareName) {
                cell.className += ' ring-4 ring-secondary/70 ring-inset bg-secondary/10';
            }

            if (piece) {
                const pieceKey = piece.color + piece.type;
                let pieceSvg = SVG_PIECES[pieceKey];
                if (pieceSvg) {
                    pieceSvg = pieceSvg.replace('<svg', '<svg class="w-full h-full"');
                    cell.innerHTML = `<div class="w-4/5 h-4/5 flex items-center justify-center">${pieceSvg}</div>`;
                }
            }

            if (selectedPuzzleSquare) {
                const moves = puzzleGame.moves({ square: selectedPuzzleSquare, verbose: true });
                const isPossibleMove = moves.some(m => m.to === squareName);
                if (isPossibleMove) {
                    const hint = document.createElement('div');
                    if (piece) {
                        hint.className = 'absolute inset-0 border-[3px] border-secondary rounded-full m-1 opacity-70';
                    } else {
                        hint.className = 'absolute w-4 h-4 bg-secondary rounded-full opacity-60';
                    }
                    cell.appendChild(hint);
                }
            }

            cell.onclick = () => handlePuzzleSquareClick(squareName);
            boardEl.appendChild(cell);
        }
    }
}

function handlePuzzleSquareClick(square) {
    const puzzle = PUZZLES.find(p => p.id === activePuzzleId);
    if (!puzzle) return;
    
    // Prevent moves if already solved
    const currentUser = getCurrentUser();
    const isSolved = currentUser && currentUser.solvedPuzzles && currentUser.solvedPuzzles.includes(activePuzzleId);
    if (isSolved) {
        showNotification("You have already solved this puzzle!", "info");
        return;
    }

    const piece = puzzleGame.get(square);
    const isUserPiece = piece && piece.color === 'w';

    if (isUserPiece) {
        selectedPuzzleSquare = square;
        renderPuzzleBoard();
    } else if (selectedPuzzleSquare) {
        const moveAttempt = `${selectedPuzzleSquare}-${square}`;
        
        if (moveAttempt === puzzle.solution) {
            const move = puzzleGame.move({
                from: selectedPuzzleSquare,
                to: square,
                promotion: 'q'
            });
            playMoveSoundForMove(move, puzzleGame);
            selectedPuzzleSquare = null;
            renderPuzzleBoard();
            
            // Mark puzzle as solved and reward ELO points
            markPuzzleSolved(puzzle);
        } else {
            showNotification("Incorrect move! Try again.", "error");
            selectedPuzzleSquare = null;
            renderPuzzleBoard();
        }
    }
}

function markPuzzleSolved(puzzle) {
    const currentUser = getCurrentUser();
    if (!currentUser) {
        showNotification("Correct Solution! Sign in to save progress and earn ELO.", "info");
        document.getElementById('puzzle-status-badge').innerText = 'Dissolved';
        document.getElementById('puzzle-status-badge').className = 'px-3 py-1 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-full font-bold text-xs';
        return;
    }
    
    if (!currentUser.solvedPuzzles) currentUser.solvedPuzzles = [];
    
    currentUser.solvedPuzzles.push(puzzle.id);
    currentUser.points += puzzle.reward;
    
    // Save to students list
    const students = getStudents();
    const idx = students.findIndex(s => s.id === currentUser.id);
    if (idx !== -1) {
        students[idx].points = currentUser.points;
        if (!students[idx].solvedPuzzles) students[idx].solvedPuzzles = [];
        students[idx].solvedPuzzles.push(puzzle.id);
        
        // Progression level checks using shared helper
        if (window.updateStudentProgression) {
            window.updateStudentProgression(students[idx]);
        }
        
        // Keep currentUser in sync with students array (badges/category may have been upgraded)
        currentUser.badges   = students[idx].badges;
        currentUser.category = students[idx].category;
        
        saveStudents(students);
    }
    
    setCurrentUser(currentUser);
    
    showNotification(`Correct Solution! +${puzzle.reward} ELO points earned.`, "success");
    
    document.getElementById('puzzle-status-badge').innerText = 'Dissolved';
    document.getElementById('puzzle-status-badge').className = 'px-3 py-1 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-full font-bold text-xs';
    
    renderPuzzlesList();
    renderDashboard();
    
    // Persist the solve to PostgreSQL immediately so it survives page refresh
    if (typeof window.syncUserStatsToServer === 'function') {
        window.syncUserStatsToServer(currentUser);
    }

    // Mark homework as complete if this puzzle was opened as a homework assignment
    const hwAssignmentId = window._pendingHomeworkAssignmentId;
    const hwStudentId = window._pendingHomeworkStudentId;
    if (hwAssignmentId && hwStudentId && puzzle.id === window.activePuzzleId) {
        window._pendingHomeworkAssignmentId = null;
        window._pendingHomeworkStudentId = null;
        if (typeof API !== 'undefined' && typeof API.completeHomework === 'function') {
            API.completeHomework(hwStudentId, hwAssignmentId).then(() => {
                showNotification('Homework marked as completed! 🎉', 'success');
                // Reload dashboard extras so the widget updates immediately
                if (typeof window.loadStudentDashboardExtras === 'function') {
                    window.loadStudentDashboardExtras(hwStudentId);
                }
            });
        }
    }
}

function resetPuzzleMatch() {
    initPuzzleGame();
    showNotification("Puzzle position reset.", "info");
}

function togglePuzzleHint() {
    const hintBox = document.getElementById('puzzle-hint-box');
    if (hintBox) {
        hintBox.classList.toggle('hidden');
    }
}

function renderPuzzlesList() {
    const container = document.getElementById('puzzles-list-container');
    if (!container) return;
    
    container.innerHTML = '';
    const currentUser = getCurrentUser();
    
    PUZZLES.forEach(p => {
        const isSolved = currentUser && currentUser.solvedPuzzles && currentUser.solvedPuzzles.includes(p.id);
        const isActive = p.id === activePuzzleId;
        
        const card = document.createElement('div');
        card.className = `p-3 rounded-xl border flex items-center justify-between gap-3 cursor-pointer transition-all ${
            isActive 
                ? 'bg-secondary/10 border-secondary text-secondary' 
                : 'bg-background/40 border-outline-variant/20 hover:border-secondary/50 text-on-surface-variant'
        }`;
        card.onclick = () => {
            activePuzzleId = p.id;
            initPuzzleGame();
        };
        
        card.innerHTML = `
            <div class="flex items-center gap-3">
                <span class="material-symbols-outlined text-md">${isActive ? 'radio_button_checked' : 'radio_button_unchecked'}</span>
                <div class="text-left">
                    <span class="text-xs font-semibold block">${p.title}</span>
                    <span class="text-[9px] block opacity-80">${p.reward} ELO Points Reward</span>
                </div>
            </div>
            ${isSolved 
                ? `<span class="material-symbols-outlined text-emerald-400 text-lg">check_circle</span>` 
                : `<span class="text-[9px] font-bold uppercase px-2 py-0.5 rounded bg-amber-500/10 text-secondary border border-secondary/20">Open</span>`
            }
        `;
        
        container.appendChild(card);
    });
}

// ==========================================
// ARENA SETTINGS: SKIN CUSTOMIZER, CLOCKS, PASS & PLAY
// ==========================================
// Board Skins Colors configuration
const BOARD_SKINS = {
    'green': {
        name: 'Classical Green',
        dark: '#769656',
        light: '#eeeed2',
        darkText: '#5d7e3e',
        lightText: '#c8d3b5',
        color3dDark: 0x769656,
        color3dLight: 0xeeeed2
    },
    'wood': {
        name: 'Wood',
        dark: '#b58863',
        light: '#f0d9b5',
        darkText: '#8f5c38',
        lightText: '#dcc6ab',
        color3dDark: 0xb58863,
        color3dLight: 0xf0d9b5
    },
    'blue': {
        name: 'Blue',
        dark: '#3b82f6',
        light: '#eef2f7',
        darkText: '#2e63bd',
        lightText: '#b0c5e8',
        color3dDark: 0x3b82f6,
        color3dLight: 0xeef2f7
    },
    'pink': {
        name: 'Pink',
        dark: '#e6889f',
        light: '#f0d2d8',
        darkText: '#b0596f',
        lightText: '#e8b8c2',
        color3dDark: 0xe6889f,
        color3dLight: 0xf0d2d8
    }
};

let activeBoardSkin = 'green';
let whiteTime = 0; 
let blackTime = 0; 
let selectedClockLimit = 0; // 0 means untimed
let clockTimerInterval = null;
let activeClockPlayer = 'w'; // 'w' or 'b'
let arenaGameMode = 'vs-computer'; // 'vs-computer', 'pass-play', 'review'

function changeBoardSkin(skin) {
    activeBoardSkin = skin;
    
    const skins = ['green', 'wood', 'blue', 'pink'];
    skins.forEach(s => {
        const btn = document.querySelector(`button[onclick="changeBoardSkin('${s}')"]`);
        if (btn) {
            if (s === skin) {
                btn.className = 'skin-btn py-2 rounded-xl text-xs font-semibold bg-secondary text-on-secondary border border-secondary/30 transition-all cursor-pointer';
            } else {
                btn.className = 'skin-btn py-2 rounded-xl text-xs font-semibold bg-surface-container-high text-on-surface border border-outline-variant hover:bg-surface-variant/30 transition-all cursor-pointer';
            }
        }
    });

    if (gameMode === '3D') {
        if (is3DInitialized && scene) {
            const columns = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
            const skinColors = BOARD_SKINS[skin] || BOARD_SKINS['green'];
            for (let r = 0; r < 8; r++) {
                for (let c = 0; c < 8; c++) {
                    const squareName = columns[c] + (r + 1);
                    const tile = boardTiles3D[squareName];
                    if (tile) {
                        const isDark = (r + c) % 2 === 0;
                        const colorHex = isDark ? skinColors.color3dDark : skinColors.color3dLight;

                        tile.material = new THREE.MeshStandardMaterial({
                            color: colorHex,
                            roughness: skin === 'wood' ? 0.45 : 0.30,
                            metalness: skin === 'wood' ? 0.05 : 0.05
                        });
                        // Keep defaultColor in sync so highlight restore works correctly
                        tile.userData.defaultColor = colorHex;
                    }
                }
            }
        }
    } else {
        renderBoard2D();
        if (typeof renderPuzzleBoard === 'function') renderPuzzleBoard();
        if (typeof renderVisionBoard === 'function') renderVisionBoard();
        if (typeof renderOpeningBoard === 'function') renderOpeningBoard();
    }
    showNotification(`Board skin updated to ${skin.toUpperCase()}`, "info");
}

function selectClockPreset(seconds) {
    selectedClockLimit = seconds;
    whiteTime = seconds;
    blackTime = seconds;

    const presets = [0, 60, 180, 600];
    presets.forEach(p => {
        const btn = document.querySelector(`button[onclick="selectClockPreset(${p})"]`);
        if (btn) {
            if (p === seconds) {
                btn.className = 'clock-preset-btn py-2 bg-secondary text-on-secondary rounded-xl text-xs font-semibold transition-all';
            } else {
                btn.className = 'clock-preset-btn py-2 bg-surface-container-high text-on-surface border border-outline-variant hover:bg-surface-variant/30 text-xs font-semibold rounded-xl transition-all';
            }
        }
    });

    const clocksCard = document.getElementById('arena-clocks-card');
    if (seconds > 0) {
        clocksCard.classList.remove('hidden');
        document.getElementById('timer-txt-white').innerText = formatTime(seconds);
        document.getElementById('timer-txt-black').innerText = formatTime(seconds);
        stopChessClock();
    } else {
        clocksCard.classList.add('hidden');
        stopChessClock();
    }
}

function formatTime(sec) {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function startChessClock() {
    if (selectedClockLimit <= 0) return;
    if (clockTimerInterval) clearInterval(clockTimerInterval);
    
    clockTimerInterval = setInterval(() => {
        let activeTime = 0;
        if (activeClockPlayer === 'w') {
            whiteTime--;
            activeTime = whiteTime;
            document.getElementById('timer-txt-white').innerText = formatTime(whiteTime);
            document.getElementById('clock-card-white').className = 'p-3 bg-secondary/20 rounded-xl border border-secondary text-center transition-all duration-300';
            document.getElementById('clock-card-black').className = 'p-3 bg-black/60 rounded-xl border border-outline-variant/20 text-center transition-all duration-300';
            if (whiteTime <= 0) {
                handleTimeout('w');
            }
        } else {
            blackTime--;
            activeTime = blackTime;
            document.getElementById('timer-txt-black').innerText = formatTime(blackTime);
            document.getElementById('clock-card-black').className = 'p-3 bg-secondary/20 rounded-xl border border-secondary text-center transition-all duration-300';
            document.getElementById('clock-card-white').className = 'p-3 bg-black/60 rounded-xl border border-outline-variant/20 text-center transition-all duration-300';
            if (blackTime <= 0) {
                handleTimeout('b');
            }
        }

        if (activeTime > 0) {
            if (activeTime <= 15) {
                playMoveSound('lowtime');
            } else {
                playMoveSound('tick');
            }
        }
    }, 1000);
}

function stopChessClock() {
    if (clockTimerInterval) {
        clearInterval(clockTimerInterval);
        clockTimerInterval = null;
    }
}

function handleTimeout(player) {
    stopChessClock();
    let statusText = 'Game Over! ';
    let statusBadge = document.getElementById('chess-status-badge');
    
    if (player === 'w') {
        statusText += 'Timeout! Black wins.';
        statusBadge.innerText = 'Defeat';
        statusBadge.className = 'px-3 py-1 bg-red-500/20 text-red-400 border border-red-500/30 rounded-full font-bold text-xs';
        recordGameResult('lose');
    } else {
        statusText += 'Timeout! White wins.';
        statusBadge.innerText = 'Victory';
        statusBadge.className = 'px-3 py-1 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-full font-bold text-xs';
        recordGameResult('win');
    }
    document.getElementById('chess-status').innerText = statusText;
}

function switchClockTurn() {
    if (selectedClockLimit <= 0) return;
    activeClockPlayer = chessGame.turn();
    startChessClock();
}

function changeArenaMode(mode) {
    arenaGameMode = mode;
    
    const clockSelector = document.getElementById('arena-clock-selector-box');
    const clocksCard = document.getElementById('arena-clocks-card');
    const reviewCard = document.getElementById('arena-review-card');
    const evalContainer = document.getElementById('arena-eval-bar-container');
    const difficultySection = document.getElementById('arena-difficulty-section');

    // Show/hide difficulty only for VS Computer mode
    if (difficultySection) {
        if (mode === 'vs-computer') {
            difficultySection.classList.remove('hidden');
        } else {
            difficultySection.classList.add('hidden');
        }
    }

    if (mode === 'review') {
        clockSelector.classList.add('hidden');
        clocksCard.classList.add('hidden');
        reviewCard.classList.remove('hidden');
        evalContainer.classList.remove('hidden');
        stopChessClock();
        initReviewMode();
    } else {
        clockSelector.classList.remove('hidden');
        reviewCard.classList.add('hidden');
        evalContainer.classList.add('hidden');
        
        if (selectedClockLimit > 0) {
            clocksCard.classList.remove('hidden');
        } else {
            clocksCard.classList.add('hidden');
        }

        resetChessMatch();
    }
    showNotification(`Arena Mode switched to: ${mode.replace('-', ' ').toUpperCase()}`, "info");
}


// ==========================================
// POST-GAME REVIEW & EVALUATIONS MODULE
// ==========================================
let reviewMoves = [];
let reviewIndex = 0;
let gameHistoryMoves = []; 

function getPositionEvalScore() {
    let score = evaluateBoard(chessGame.board());
    return score / 10; // return standard pawn units
}

function classifyMove(prevEval, currEval, move) {
    const evalDiff = currEval - prevEval;
    const isWhite = move.color === 'w';
    const relativeDiff = isWhite ? evalDiff : -evalDiff;
    
    const isSacrifice = ['q', 'r', 'n', 'b'].includes(move.piece) && relativeDiff >= -0.15;
    if (isSacrifice && Math.random() < 0.3) {
        return { name: 'Brilliant', color: 'text-cyan-400 border-cyan-500/30 bg-cyan-500/20', symbol: 'grade' };
    }
    
    if (relativeDiff >= -0.1) {
        return { name: 'Best Move', color: 'text-emerald-400 border-emerald-500/30 bg-emerald-500/20', symbol: 'check_circle' };
    } else if (relativeDiff >= -0.4) {
        return { name: 'Good', color: 'text-sky-400 border-sky-500/30 bg-sky-500/20', symbol: 'thumb_up' };
    } else if (relativeDiff >= -1.0) {
        return { name: 'Inaccuracy', color: 'text-amber-400 border-amber-500/30 bg-amber-500/20', symbol: 'info' };
    } else {
        return { name: 'Blunder', color: 'text-red-400 border-red-500/30 bg-red-500/20', symbol: 'error' };
    }
}

function initReviewMode() {
    reviewMoves = [...gameHistoryMoves];
    reviewIndex = 0;
    
    chessGame = new Chess();
    if (gameMode === '3D') {
        updateBoard3D();
    } else {
        renderBoard2D();
    }
    
    document.getElementById('arena-review-move-txt').innerText = `Move 0 / ${reviewMoves.length}`;
    document.getElementById('chess-status').innerText = 'Reviewing game moves. Step forward to begin.';
    
    document.getElementById('arena-eval-bar-white').style.height = '50%';
    document.getElementById('arena-eval-bar-black').style.height = '50%';
    document.getElementById('arena-eval-bar-text').innerText = '+0.0';

    if (typeof renderAdvantageGraph === 'function') renderAdvantageGraph();
}

function navigateReview(action) {
    if (reviewMoves.length === 0) {
        showNotification("No move history to review. Play a match first!", "warning");
        return;
    }

    if (action === 'first') {
        reviewIndex = 0;
    } else if (action === 'prev') {
        reviewIndex = Math.max(0, reviewIndex - 1);
    } else if (action === 'next') {
        reviewIndex = Math.min(reviewMoves.length, reviewIndex + 1);
    } else if (action === 'last') {
        reviewIndex = reviewMoves.length;
    }

    jumpToReviewIndex(reviewIndex);
}

function renderAdvantageGraph() {
    const svg = document.getElementById('review-svg-graph');
    if (!svg) return;

    // Clear dynamic elements
    const dynamicElements = svg.querySelectorAll('path, circle, rect:not([id])');
    dynamicElements.forEach(el => el.remove());

    if (reviewMoves.length === 0) return;

    const W = 500;
    const H = 100;
    const padding = 10;
    const graphWidth = W - padding * 2;

    const points = [];
    points.push({ x: padding, y: 50, eval: 0, moveName: 'Start', classification: null, index: 0 });

    for (let i = 0; i < reviewMoves.length; i++) {
        const m = reviewMoves[i];
        const evalVal = m.eval || 0;
        const x = padding + ((i + 1) / reviewMoves.length) * graphWidth;
        const y = Math.max(5, Math.min(95, 50 - (evalVal * 4.5)));
        
        let classification = null;
        if (i > 0) {
            classification = classifyMove(reviewMoves[i - 1].eval, evalVal, m.move);
        } else {
            classification = classifyMove(0, evalVal, m.move);
        }

        points.push({
            x,
            y,
            eval: evalVal,
            moveName: m.move.san,
            classification,
            index: i + 1
        });
    }

    // Generate Path string
    let pathD = `M ${points[0].x} ${points[0].y}`;
    for (let i = 1; i < points.length; i++) {
        pathD += ` L ${points[i].x} ${points[i].y}`;
    }

    // Generate Area fill string (for gradient)
    let areaD = `${pathD} L ${points[points.length - 1].x} 50 L ${points[0].x} 50 Z`;

    // Create area path
    const areaPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    areaPath.setAttribute('d', areaD);
    areaPath.setAttribute('fill', 'url(#eval-gradient)');
    svg.appendChild(areaPath);

    // Create line path
    const linePath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    linePath.setAttribute('d', pathD);
    linePath.setAttribute('fill', 'none');
    linePath.setAttribute('stroke', 'var(--color-secondary)');
    linePath.setAttribute('stroke-width', '2');
    svg.appendChild(linePath);

    // Add interactive circle nodes
    points.forEach((pt) => {
        let dotColor = '#ffffff';
        if (pt.classification) {
            if (pt.classification.name === 'Brilliant') dotColor = '#22d3ee'; // cyan
            else if (pt.classification.name === 'Best Move') dotColor = '#10b981'; // emerald
            else if (pt.classification.name === 'Inaccuracy') dotColor = '#fbbf24'; // amber
            else if (pt.classification.name === 'Blunder') dotColor = '#f87171'; // red
        }

        const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        circle.setAttribute('cx', pt.x);
        circle.setAttribute('cy', pt.y);
        circle.setAttribute('r', pt.index === reviewIndex ? '4.5' : '3.5');
        circle.setAttribute('fill', dotColor);
        circle.setAttribute('stroke', pt.index === reviewIndex ? 'var(--color-secondary)' : 'rgba(0,0,0,0.5)');
        circle.setAttribute('stroke-width', pt.index === reviewIndex ? '2' : '1');
        circle.style.cursor = 'pointer';

        const evalSign = pt.eval >= 0 ? '+' : '';
        const toolTxt = `Move ${pt.index}: ${pt.moveName} (${evalSign}${pt.eval.toFixed(1)}) ${pt.classification ? pt.classification.name : ''}`;
        circle.setAttribute('data-tooltip', toolTxt);
        circle.addEventListener('mouseover', (e) => {
            window.showGlobalTooltip(e, toolTxt);
        });
        circle.addEventListener('mouseout', () => {
            window.hideGlobalTooltip();
        });

        // Click to seek move index
        circle.addEventListener('click', () => {
            jumpToReviewIndex(pt.index);
        });

        svg.appendChild(circle);
    });
}

function jumpToReviewIndex(idx) {
    reviewIndex = idx;
    document.getElementById('arena-review-move-txt').innerText = `Move ${reviewIndex} / ${reviewMoves.length}`;

    const tempGame = new Chess();
    for (let i = 0; i < reviewIndex; i++) {
        tempGame.move(reviewMoves[i].move);
    }
    
    chessGame = tempGame;
    
    if (gameMode === '3D') {
        updateBoard3D();
    } else {
        renderBoard2D();
    }

    if (reviewIndex > 0) {
        const lastMoveData = reviewMoves[reviewIndex - 1];
        const lastMove = lastMoveData.move;
        
        const cells = document.querySelectorAll('#chess-board-2d > div');
        cells.forEach(c => {
            if (c.dataset.square === lastMove.from || c.dataset.square === lastMove.to) {
                c.className += ' ring-4 ring-cyan-400/50 ring-inset bg-cyan-500/10';
            }
        });

        const currentEval = lastMoveData.eval;
        const prevEval = reviewIndex > 1 ? reviewMoves[reviewIndex - 2].eval : 0;
        
        const destCell = document.querySelector(`#chess-board-2d > div[data-square="${lastMove.to}"]`);
        if (destCell) {
            // Remove previous badges
            const prevBadge = destCell.querySelector('.move-classification-badge');
            if (prevBadge) prevBadge.remove();

            const classification = classifyMove(prevEval, currentEval, lastMove);
            const badge = document.createElement('div');
            badge.className = `move-classification-badge absolute -top-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center border text-[10px] font-bold shadow-md ${classification.color}`;
            badge.innerHTML = `<span class="material-symbols-outlined text-[10px]">${classification.symbol}</span>`;
            badge.title = classification.name;
            destCell.appendChild(badge);

            // Blunder Highlighter: Highlight the actual best move squares if current move was suboptimal
            if (['Inaccuracy', 'Mistake', 'Blunder'].includes(classification.name)) {
                const searchGame = new Chess();
                for (let i = 0; i < reviewIndex - 1; i++) {
                    searchGame.move(reviewMoves[i].move);
                }
                const bestMove = selectBestMoveForGame(searchGame, 2);
                if (bestMove) {
                    cells.forEach(c => {
                        if (c.dataset.square === bestMove.from || c.dataset.square === bestMove.to) {
                            c.className += ' border-2 border-dashed border-amber-500 bg-amber-500/5';
                        }
                    });
                    document.getElementById('chess-status').innerHTML = `Replayed: ${lastMove.san} <span class="text-amber-500 font-bold block text-[10px] mt-0.5">💡 Missed Best Move: ${bestMove.san}</span>`;
                } else {
                    document.getElementById('chess-status').innerText = `Replayed: ${lastMove.san}`;
                }
            } else {
                document.getElementById('chess-status').innerText = `Replayed: ${lastMove.san}`;
            }
        }
        
        let whitePct = 50 + (currentEval * 10);
        whitePct = Math.max(5, Math.min(95, whitePct));
        document.getElementById('arena-eval-bar-white').style.height = `${whitePct}%`;
        document.getElementById('arena-eval-bar-black').style.height = `${100 - whitePct}%`;
        document.getElementById('arena-eval-bar-text').innerText = (currentEval >= 0 ? '+' : '') + currentEval.toFixed(1);
    } else {
        document.getElementById('chess-status').innerText = 'Start of game.';
        document.getElementById('arena-eval-bar-white').style.height = '50%';
        document.getElementById('arena-eval-bar-black').style.height = '50%';
        document.getElementById('arena-eval-bar-text').innerText = '+0.0';
    }

    renderAdvantageGraph();
}

// ==========================================
// COORDINATES VISION TRAINER MODULE
// ==========================================
let visionTimer = 30;
let visionScore = 0;
let visionActive = false;
let visionTargetSquare = null;
let visionInterval = null;

const ALL_COORDINATES = [];
const cols = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
for (let r = 1; r <= 8; r++) {
    cols.forEach(c => {
        ALL_COORDINATES.push(c + r);
    });
}

function initVisionTrainer() {
    visionActive = false;
    visionScore = 0;
    visionTimer = 30;
    
    document.getElementById('vision-score-txt').innerText = '0';
    document.getElementById('vision-target-txt').innerText = '-';
    document.getElementById('vision-timer-bar').style.width = '0%';
    document.getElementById('btn-vision-start').classList.remove('hidden');
    document.getElementById('btn-vision-stop').classList.add('hidden');
    
    const user = getCurrentUser();
    let hi = 0;
    if (user && user.visionHighScore) {
        hi = user.visionHighScore;
    }
    document.getElementById('vision-highscore-txt').innerText = hi;
    
    renderVisionBoard();
}

function renderVisionBoard() {
    const boardEl = document.getElementById('vision-board');
    if (!boardEl) return;
    boardEl.innerHTML = '';
    
    updateOuterBoardCoordinates('vision-board', false);

    const columns = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

    for (let r = 7; r >= 0; r--) {
        for (let c = 0; c < 8; c++) {
            const squareName = columns[c] + (r + 1);
            const cell = document.createElement('div');
            cell.dataset.square = squareName;
            
            const isDark = (r + c) % 2 === 0;
            cell.className = `relative aspect-square flex items-center justify-center cursor-pointer transition-all duration-150 select-none border border-outline-variant/10 `;
            
            const skinColors = BOARD_SKINS[activeBoardSkin] || BOARD_SKINS['green'];
            cell.style.backgroundColor = isDark ? skinColors.dark : skinColors.light;
            cell.style.color = isDark ? skinColors.darkText : skinColors.lightText;
            

            
            cell.onclick = () => handleVisionSquareClick(squareName, cell);
            boardEl.appendChild(cell);
        }
    }
}

function startVisionSession() {
    visionActive = true;
    visionScore = 0;
    visionTimer = 30;
    
    document.getElementById('vision-score-txt').innerText = '0';
    document.getElementById('btn-vision-start').classList.add('hidden');
    document.getElementById('btn-vision-stop').classList.remove('hidden');
    
    nextVisionTarget();
    
    if (visionInterval) clearInterval(visionInterval);
    visionInterval = setInterval(() => {
        visionTimer -= 0.1;
        const pct = (visionTimer / 30) * 100;
        document.getElementById('vision-timer-bar').style.width = `${pct}%`;
        
        if (visionTimer <= 0) {
            stopVisionSession();
        }
    }, 100);
}

function nextVisionTarget() {
    const unusedTargets = ALL_COORDINATES.filter(c => c !== visionTargetSquare);
    visionTargetSquare = unusedTargets[Math.floor(Math.random() * unusedTargets.length)];
    document.getElementById('vision-target-txt').innerText = visionTargetSquare.toUpperCase();
}

function handleVisionSquareClick(square, cellElement) {
    if (!visionActive) return;
    
    const cell = cellElement || document.querySelector(`#vision-board > div[data-square="${square}"]`);
    
    if (square === visionTargetSquare) {
        visionScore++;
        document.getElementById('vision-score-txt').innerText = visionScore;
        playMoveSound();
        
        if (cell) {
            cell.classList.add('bg-emerald-500/40', 'scale-95');
            setTimeout(() => {
                cell.classList.remove('bg-emerald-500/40', 'scale-95');
            }, 150);
        }
        
        nextVisionTarget();
    } else {
        playMoveSound('lowtime');
        if (cell) {
            cell.classList.add('bg-red-500/40');
            setTimeout(() => {
                cell.classList.remove('bg-red-500/40');
            }, 150);
        }
    }
}

function stopVisionSession() {
    visionActive = false;
    if (visionInterval) {
        clearInterval(visionInterval);
        visionInterval = null;
    }
    
    document.getElementById('vision-timer-bar').style.width = '0%';
    document.getElementById('btn-vision-start').classList.remove('hidden');
    document.getElementById('btn-vision-stop').classList.add('hidden');
    
    showNotification(`Training session completed! Score: ${visionScore}`, "success");
    
    const user = getCurrentUser();
    if (user) {
        if (!user.visionHighScore || visionScore > user.visionHighScore) {
            user.visionHighScore = visionScore;
            setCurrentUser(user);
            
            const students = getStudents();
            const idx = students.findIndex(s => s.id === user.id);
            if (idx !== -1) {
                students[idx].visionHighScore = visionScore;
                saveStudents(students);
            }
            
            showNotification(`New Vision Trainer High Score! 🎉`, "success");
            document.getElementById('vision-highscore-txt').innerText = visionScore;
        }
    }
    
    document.getElementById('vision-target-txt').innerText = '-';
}

// ==========================================
// OPENINGS THEORY EXPLORER MODULE
// ==========================================
const OPENINGS = [
    {
        id: "OP-001",
        title: "Sicilian Defense",
        description: "The most popular response to 1.e4. Black counters White's center control by establishing an asymmetrical c-pawn setup.",
        moves: [
            { from: "e2", to: "e4", hint: "Move White Pawn to e4", color: "w" },
            { from: "c7", to: "c5", hint: "Sicilian signature c5", color: "b" },
            { from: "g1", to: "f3", hint: "Develop Knight to f3", color: "w" },
            { from: "d7", to: "d6", hint: "Solidify center with d6", color: "b" }
        ]
    },
    {
        id: "OP-002",
        title: "Ruy Lopez",
        description: "An ancient classic development. White pressures Black's c6 knight which protects the critical center e5 square.",
        moves: [
            { from: "e2", to: "e4", hint: "Move White Pawn to e4", color: "w" },
            { from: "e7", to: "e5", hint: "Standard e5 symmetry", color: "b" },
            { from: "g1", to: "f3", hint: "Develop Knight to f3", color: "w" },
            { from: "b8", to: "c6", hint: "Develop Knight to c6", color: "b" },
            { from: "f1", to: "b5", hint: "Attack c6 Knight with Bb5", color: "w" }
        ]
    },
    {
        id: "OP-003",
        title: "Queen's Gambit",
        description: "White attacks the center by sacrificing a wing c-pawn to establish a stronger d-pawn base.",
        moves: [
            { from: "d2", to: "d4", hint: "Move Queen Pawn to d4", color: "w" },
            { from: "d7", to: "d5", hint: "Mirror match d5", color: "b" },
            { from: "c2", to: "c4", hint: "Offer Gambit c4 pawn", color: "w" }
        ]
    },
    {
        id: "OP-004",
        title: "French Defense",
        description: "Black sets up an e6 block, fighting for the center with a later d5. It often leads to closed, strategic games.",
        moves: [
            { from: "e2", to: "e4", hint: "Move White Pawn to e4", color: "w" },
            { from: "e7", to: "e6", hint: "French signature e6", color: "b" },
            { from: "d2", to: "d4", hint: "Establish center with d4", color: "w" },
            { from: "d7", to: "d5", hint: "Challenge e4 with d5", color: "b" }
        ]
    },
    {
        id: "OP-005",
        title: "Caro-Kann Defense",
        description: "A solid response to 1.e4. Similar to the French but Black keeps the light-squared bishop free by playing c6 first.",
        moves: [
            { from: "e2", to: "e4", hint: "Move White Pawn to e4", color: "w" },
            { from: "c7", to: "c6", hint: "Caro-Kann signature c6", color: "b" },
            { from: "d2", to: "d4", hint: "Establish center with d4", color: "w" },
            { from: "d7", to: "d5", hint: "Challenge e4 with d5", color: "b" }
        ]
    },
    {
        id: "OP-006",
        title: "King's Indian Defense",
        description: "A hypermodern defense. Black allows White to build a large pawn center, planning to counterattack it later.",
        moves: [
            { from: "d2", to: "d4", hint: "Move Queen Pawn to d4", color: "w" },
            { from: "g8", to: "f6", hint: "Develop Knight to f6", color: "b" },
            { from: "c2", to: "c4", hint: "Develop c4 pawn", color: "w" },
            { from: "g7", to: "g6", hint: "Prepare Kingside fianchetto", color: "b" },
            { from: "b1", to: "c3", hint: "Develop Knight to c3", color: "w" },
            { from: "f8", to: "g7", hint: "Fianchetto Bishop to g7", color: "b" }
        ]
    },
    {
        id: "OP-007",
        title: "Italian Game",
        description: "One of the oldest openings. White immediately targets Black's vulnerable f7 square with the light-squared bishop.",
        moves: [
            { from: "e2", to: "e4", hint: "Move White Pawn to e4", color: "w" },
            { from: "e7", to: "e5", hint: "Symmetrical center e5", color: "b" },
            { from: "g1", to: "f3", hint: "Develop Knight to f3", color: "w" },
            { from: "b8", to: "c6", hint: "Develop Knight to c6", color: "b" },
            { from: "f1", to: "c4", hint: "Italian Bishop to c4", color: "w" }
        ]
    },
    {
        id: "OP-008",
        title: "Scandinavian Defense",
        description: "Black immediately challenges White's e4 pawn. It leads to open lines and active piece play for both sides.",
        moves: [
            { from: "e2", to: "e4", hint: "Move White Pawn to e4", color: "w" },
            { from: "d7", to: "d5", hint: "Scandinavian signature d5", color: "b" }
        ]
    },
    {
        id: "OP-009",
        title: "Nimzo-Indian Defense",
        description: "A highly respected defense. Black pins White's c3 knight, stopping White from immediately playing e4.",
        moves: [
            { from: "d2", to: "d4", hint: "Move Queen Pawn to d4", color: "w" },
            { from: "g8", to: "f6", hint: "Develop Knight to f6", color: "b" },
            { from: "c2", to: "c4", hint: "Develop c4 pawn", color: "w" },
            { from: "e7", to: "e6", hint: "Open path for dark-squared bishop", color: "b" },
            { from: "b1", to: "c3", hint: "Develop Knight to c3", color: "w" },
            { from: "f8", to: "b4", hint: "Pin c3 Knight with Bb4", color: "b" }
        ]
    },
    {
        id: "OP-010",
        title: "King's Gambit",
        description: "An aggressive romantic opening. White sacrifices the f2 pawn to rapidly open the f-file and seize the center.",
        moves: [
            { from: "e2", to: "e4", hint: "Control the center", color: "w" },
            { from: "e7", to: "e5", hint: "Mirror the center", color: "b" },
            { from: "f2", to: "f4", hint: "King's Gambit – offer f4 pawn", color: "w" }
        ]
    },
    {
        id: "OP-011",
        title: "Pirc Defense",
        description: "A hypermodern defense. Black allows White to build a strong center, then attacks it with pieces and pawns from the flanks.",
        moves: [
            { from: "e2", to: "e4", hint: "Control the center", color: "w" },
            { from: "d7", to: "d6", hint: "Pirc signature d6", color: "b" },
            { from: "d2", to: "d4", hint: "Expand center with d4", color: "w" },
            { from: "g8", to: "f6", hint: "Develop Knight to f6", color: "b" },
            { from: "b1", to: "c3", hint: "Develop Knight to c3", color: "w" },
            { from: "g7", to: "g6", hint: "Fianchetto setup", color: "b" }
        ]
    },
    {
        id: "OP-012",
        title: "Dutch Defense",
        description: "Black immediately fights for the kingside with f5. A creative choice popular among attacking players.",
        moves: [
            { from: "d2", to: "d4", hint: "Advance Queen Pawn", color: "w" },
            { from: "f7", to: "f5", hint: "Dutch signature f5", color: "b" }
        ]
    },
    {
        id: "OP-013",
        title: "Grünfeld Defense",
        description: "A dynamic defense where Black surrenders the center, then attacks it with pieces and the c5/d5 breaks.",
        moves: [
            { from: "d2", to: "d4", hint: "Advance Queen Pawn", color: "w" },
            { from: "g8", to: "f6", hint: "Develop Knight to f6", color: "b" },
            { from: "c2", to: "c4", hint: "Develop c4 pawn", color: "w" },
            { from: "g7", to: "g6", hint: "Prepare fianchetto", color: "b" },
            { from: "b1", to: "c3", hint: "Develop Knight to c3", color: "w" },
            { from: "d7", to: "d5", hint: "Grünfeld pawn strike d5", color: "b" }
        ]
    },
    {
        id: "OP-014",
        title: "English Opening",
        description: "A flexible, positional opening. White controls the center from the flank with c4, delaying a direct central confrontation.",
        moves: [
            { from: "c2", to: "c4", hint: "English signature c4", color: "w" },
            { from: "e7", to: "e5", hint: "Claim the center", color: "b" }
        ]
    },
    {
        id: "OP-015",
        title: "London System",
        description: "A solid, systematic setup. White develops Nf3, Bf4, and e3 to build a robust structure without conceding central tension early.",
        moves: [
            { from: "d2", to: "d4", hint: "Advance Queen Pawn", color: "w" },
            { from: "d7", to: "d5", hint: "Control the center", color: "b" },
            { from: "g1", to: "f3", hint: "Develop Knight to f3", color: "w" },
            { from: "g8", to: "f6", hint: "Develop Knight to f6", color: "b" },
            { from: "c1", to: "f4", hint: "London Bishop to f4", color: "w" }
        ]
    },
    {
        id: "OP-016",
        title: "Slav Defense",
        description: "A solid reply to the Queen's Gambit. Black supports the d5 pawn with c6 while keeping the light-squared bishop free.",
        moves: [
            { from: "d2", to: "d4", hint: "Advance Queen Pawn", color: "w" },
            { from: "d7", to: "d5", hint: "Mirror d5", color: "b" },
            { from: "c2", to: "c4", hint: "Queen's Gambit offer", color: "w" },
            { from: "c7", to: "c6", hint: "Slav signature c6", color: "b" }
        ]
    },
    {
        id: "OP-017",
        title: "Vienna Game",
        description: "White develops the c3 knight early, supporting an eventual e4-e5 push or f4 advance for an aggressive center attack.",
        moves: [
            { from: "e2", to: "e4", hint: "Control the center", color: "w" },
            { from: "e7", to: "e5", hint: "Mirror the center", color: "b" },
            { from: "b1", to: "c3", hint: "Vienna signature Nc3", color: "w" }
        ]
    },
    {
        id: "OP-018",
        title: "Catalan Opening",
        description: "White combines the Queen's Gambit with a kingside fianchetto, exerting long-term pressure on the d5-e4 diagonal.",
        moves: [
            { from: "d2", to: "d4", hint: "Advance Queen Pawn", color: "w" },
            { from: "g8", to: "f6", hint: "Develop Knight to f6", color: "b" },
            { from: "c2", to: "c4", hint: "Develop c4 pawn", color: "w" },
            { from: "e7", to: "e6", hint: "Solid center with e6", color: "b" },
            { from: "g2", to: "g3", hint: "Catalan fianchetto setup", color: "w" }
        ]
    },
    {
        id: "OP-019",
        title: "Modern Benoni",
        description: "Black allows a powerful White center, then creates counterplay on the queenside and with piece activity.",
        moves: [
            { from: "d2", to: "d4", hint: "Advance Queen Pawn", color: "w" },
            { from: "g8", to: "f6", hint: "Develop Knight to f6", color: "b" },
            { from: "c2", to: "c4", hint: "Develop c4 pawn", color: "w" },
            { from: "c7", to: "c5", hint: "Benoni signature c5", color: "b" },
            { from: "d4", to: "d5", hint: "Advance pawn to d5", color: "w" }
        ]
    },
    {
        id: "OP-020",
        title: "Petroff Defense",
        description: "A sound and solid response to 1.e4. Black mirrors White's knight development, seeking early symmetry.",
        moves: [
            { from: "e2", to: "e4", hint: "Control the center", color: "w" },
            { from: "e7", to: "e5", hint: "Mirror the center", color: "b" },
            { from: "g1", to: "f3", hint: "Develop Knight to f3", color: "w" },
            { from: "g8", to: "f6", hint: "Petroff – mirror Nf6", color: "b" }
        ]
    },
    {
        id: "OP-021",
        title: "Trompowsky Attack",
        description: "White immediately pins Black's knight on f6 with the bishop, creating unusual structures and disrupting Black's typical plans.",
        moves: [
            { from: "d2", to: "d4", hint: "Advance Queen Pawn", color: "w" },
            { from: "g8", to: "f6", hint: "Develop Knight to f6", color: "b" },
            { from: "c1", to: "g5", hint: "Trompowsky – Bg5 pin", color: "w" }
        ]
    },
    {
        id: "OP-022",
        title: "Alekhine's Defense",
        description: "Black invites White to chase the knight and over-extend the center. A daring hypermodern counterattack strategy.",
        moves: [
            { from: "e2", to: "e4", hint: "Control the center", color: "w" },
            { from: "g8", to: "f6", hint: "Alekhine – Knight provokes e4", color: "b" },
            { from: "e4", to: "e5", hint: "Chase the Knight", color: "w" },
            { from: "f6", to: "d5", hint: "Retreat Knight to d5", color: "b" }
        ]
    },
    {
        id: "OP-023",
        title: "Benko Gambit",
        description: "Black sacrifices a queenside pawn to gain long-term queenside pressure and open files against White's king.",
        moves: [
            { from: "d2", to: "d4", hint: "Advance Queen Pawn", color: "w" },
            { from: "g8", to: "f6", hint: "Develop Knight to f6", color: "b" },
            { from: "c2", to: "c4", hint: "Develop c4 pawn", color: "w" },
            { from: "c7", to: "c5", hint: "Pressure center with c5", color: "b" },
            { from: "d4", to: "d5", hint: "Advance to d5", color: "w" },
            { from: "b7", to: "b5", hint: "Benko Gambit – offer b5 pawn", color: "b" }
        ]
    },
    {
        id: "OP-024",
        title: "Modern Defense",
        description: "Black develops the kingside bishop via g6 and g7 without committing a pawn to the center immediately.",
        moves: [
            { from: "e2", to: "e4", hint: "Control the center", color: "w" },
            { from: "g7", to: "g6", hint: "Modern signature g6", color: "b" },
            { from: "d2", to: "d4", hint: "Expand to d4", color: "w" },
            { from: "f8", to: "g7", hint: "Fianchetto Bishop to g7", color: "b" }
        ]
    },
    {
        id: "OP-025",
        title: "Réti Opening",
        description: "A hypermodern approach. White fianchettoes the kingside bishop, controls d5 from the flank rather than directly.",
        moves: [
            { from: "g1", to: "f3", hint: "Réti signature Nf3", color: "w" },
            { from: "d7", to: "d5", hint: "Claim the center", color: "b" },
            { from: "g2", to: "g3", hint: "Prepare kingside fianchetto", color: "w" }
        ]
    },
    {
        id: "OP-026",
        title: "Bishop's Opening",
        description: "An early Bc4 development that targets f7. Often transposes to the Italian Game or other e4 openings.",
        moves: [
            { from: "e2", to: "e4", hint: "Control the center", color: "w" },
            { from: "e7", to: "e5", hint: "Mirror the center", color: "b" },
            { from: "f1", to: "c4", hint: "Bishop's Opening – Bc4", color: "w" }
        ]
    },
    {
        id: "OP-027",
        title: "Four Knights Game",
        description: "Both sides develop both knights to their best squares. A classical and symmetrical development.",
        moves: [
            { from: "e2", to: "e4", hint: "Control the center", color: "w" },
            { from: "e7", to: "e5", hint: "Mirror the center", color: "b" },
            { from: "g1", to: "f3", hint: "Develop Knight to f3", color: "w" },
            { from: "b8", to: "c6", hint: "Develop Knight to c6", color: "b" },
            { from: "b1", to: "c3", hint: "Develop second Knight", color: "w" },
            { from: "g8", to: "f6", hint: "Develop second Knight to f6", color: "b" }
        ]
    },
    {
        id: "OP-028",
        title: "Scotch Game",
        description: "White immediately opens the center with d4. A direct approach that avoids the Ruy Lopez complexities.",
        moves: [
            { from: "e2", to: "e4", hint: "Control the center", color: "w" },
            { from: "e7", to: "e5", hint: "Mirror the center", color: "b" },
            { from: "g1", to: "f3", hint: "Develop Knight to f3", color: "w" },
            { from: "b8", to: "c6", hint: "Develop Knight to c6", color: "b" },
            { from: "d2", to: "d4", hint: "Scotch – open center d4", color: "w" }
        ]
    },
    {
        id: "OP-029",
        title: "Ponziani Opening",
        description: "One of the oldest openings. White plays c3 early to support an eventual d4 thrust in the center.",
        moves: [
            { from: "e2", to: "e4", hint: "Control the center", color: "w" },
            { from: "e7", to: "e5", hint: "Mirror the center", color: "b" },
            { from: "g1", to: "f3", hint: "Develop Knight to f3", color: "w" },
            { from: "b8", to: "c6", hint: "Develop Knight to c6", color: "b" },
            { from: "c2", to: "c3", hint: "Ponziani signature c3", color: "w" }
        ]
    },
    {
        id: "OP-030",
        title: "Budapest Gambit",
        description: "Black sacrifices a pawn immediately after 1.d4 Nf6 2.c4 to gain rapid piece activity and counterplay.",
        moves: [
            { from: "d2", to: "d4", hint: "Advance Queen Pawn", color: "w" },
            { from: "g8", to: "f6", hint: "Develop Knight to f6", color: "b" },
            { from: "c2", to: "c4", hint: "Develop c4 pawn", color: "w" },
            { from: "e7", to: "e5", hint: "Budapest Gambit – offer e5 pawn", color: "b" }
        ]
    },
    {
        id: "OP-031",
        title: "Torre Attack",
        description: "White deploys Nf3 and Bg5, creating a solid system that can be played against many Black setups.",
        moves: [
            { from: "d2", to: "d4", hint: "Advance Queen Pawn", color: "w" },
            { from: "g8", to: "f6", hint: "Develop Knight to f6", color: "b" },
            { from: "g1", to: "f3", hint: "Develop Knight to f3", color: "w" },
            { from: "d7", to: "d5", hint: "Control the center", color: "b" },
            { from: "c1", to: "g5", hint: "Torre – Bishop to g5", color: "w" }
        ]
    },
    {
        id: "OP-032",
        title: "Bird's Opening",
        description: "A flank opening where White immediately challenges Black's center with f4, aiming for control of the e5 square.",
        moves: [
            { from: "f2", to: "f4", hint: "Bird's signature f4", color: "w" },
            { from: "d7", to: "d5", hint: "Occupy the center with d5", color: "b" }
        ]
    },
    {
        id: "OP-033",
        title: "Evans Gambit",
        description: "White sacrifices the b4 pawn to gain rapid development and seize an imposing pawn center in the Italian Game.",
        moves: [
            { from: "e2", to: "e4", hint: "Control the center", color: "w" },
            { from: "e7", to: "e5", hint: "Mirror the center", color: "b" },
            { from: "g1", to: "f3", hint: "Develop Knight to f3", color: "w" },
            { from: "b8", to: "c6", hint: "Develop Knight to c6", color: "b" },
            { from: "f1", to: "c4", hint: "Italian Bishop to c4", color: "w" },
            { from: "f8", to: "c5", hint: "Develop Bishop to c5", color: "b" },
            { from: "b2", to: "b4", hint: "Evans Gambit – offer b4 pawn", color: "w" }
        ]
    },
    {
        id: "OP-034",
        title: "Sicilian Najdorf",
        description: "One of the sharpest continuations of the Sicilian. Black plays a6 to secure the b5 square and prepare counterplay.",
        moves: [
            { from: "e2", to: "e4", hint: "Control the center", color: "w" },
            { from: "c7", to: "c5", hint: "Sicilian – fight the center", color: "b" },
            { from: "g1", to: "f3", hint: "Develop Knight to f3", color: "w" },
            { from: "d7", to: "d6", hint: "Support center with d6", color: "b" },
            { from: "d2", to: "d4", hint: "Open the center with d4", color: "w" },
            { from: "c5", to: "d4", hint: "Exchange on d4", color: "b" },
            { from: "f3", to: "d4", hint: "Recapture Knight to d4", color: "w" },
            { from: "g8", to: "f6", hint: "Develop Knight to f6", color: "b" },
            { from: "b1", to: "c3", hint: "Develop Knight to c3", color: "w" },
            { from: "a7", to: "a6", hint: "Najdorf signature a6", color: "b" }
        ]
    }
];

let activeOpeningId = "OP-001";
let openingStepIndex = 0;
let openingGame = null;

function initOpeningsExplorer() {
    const opening = OPENINGS.find(o => o.id === activeOpeningId);
    if (!opening) return;

    openingGame = new Chess();
    openingStepIndex = 0;

    document.getElementById('opening-title').innerText = opening.title;
    document.getElementById('opening-description').innerText = opening.description;
    
    renderOpeningBoard();
    renderOpeningsSelector();
    updateOpeningGuideStep();
}

function renderOpeningBoard() {
    const boardEl = document.getElementById('opening-board');
    if (!boardEl) return;
    boardEl.innerHTML = '';
    
    updateOuterBoardCoordinates('opening-board', false);

    const board = openingGame.board();
    const columns = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];

    for (let r = 7; r >= 0; r--) {
        for (let c = 0; c < 8; c++) {
            const squareName = columns[c] + (r + 1);
            const piece = board[7 - r][c];
            const cell = document.createElement('div');
            cell.dataset.square = squareName;
            
            const isDark = (r + c) % 2 === 0;
            cell.className = `relative aspect-square flex items-center justify-center cursor-pointer transition-all duration-200 select-none `;
            
            const skinColors = BOARD_SKINS[activeBoardSkin] || BOARD_SKINS['green'];
            cell.style.backgroundColor = isDark ? skinColors.dark : skinColors.light;
            cell.style.color = isDark ? skinColors.darkText : skinColors.lightText;
            
            if (piece) {
                const pieceKey = piece.color + piece.type;
                let pieceSvg = SVG_PIECES[pieceKey];
                if (pieceSvg) {
                    pieceSvg = pieceSvg.replace('<svg', '<svg class="w-full h-full"');
                    cell.innerHTML = `<div class="w-4/5 h-4/5 flex items-center justify-center">${pieceSvg}</div>`;
                }
            }



            cell.onclick = () => handleOpeningSquareClick(squareName);
            boardEl.appendChild(cell);
        }
    }
}

let selectedOpeningSquare = null;

function handleOpeningSquareClick(square) {
    if (isCustomRepertoireMode) {
        const piece = openingGame.get(square);
        if (selectedOpeningSquare === null) {
            if (piece && piece.color === openingGame.turn()) {
                selectedOpeningSquare = square;
                const cell = document.querySelector(`#opening-board > div[data-square="${square}"]`);
                if (cell) cell.className += ' ring-4 ring-secondary/70 ring-inset';
            }
        } else {
            try {
                const move = openingGame.move({
                    from: selectedOpeningSquare,
                    to: square,
                    promotion: 'q'
                });
                if (move) {
                    playMoveSoundForMove(move, openingGame);
                    customRepertoireMoves.push({
                        from: selectedOpeningSquare,
                        to: square,
                        hint: `${move.san}`,
                        color: move.color
                    });
                    openingStepIndex++;
                    document.getElementById('opening-step-badge').innerText = `${customRepertoireMoves.length} Moves`;
                    document.getElementById('opening-hint-txt').innerText = `Recorded: ${move.san}`;
                }
            } catch (e) {
                showNotification("Invalid chess move!", "warning");
            }
            selectedOpeningSquare = null;
            renderOpeningBoard();
        }
        return;
    }

    const opening = OPENINGS.find(o => o.id === activeOpeningId);
    if (!opening) return;
    if (openingStepIndex >= opening.moves.length) return;

    const currentMove = opening.moves[openingStepIndex];
    const piece = openingGame.get(square);

    if (selectedOpeningSquare === null) {
        if (piece && piece.color === currentMove.color && square === currentMove.from) {
            selectedOpeningSquare = square;
            const cell = document.querySelector(`#opening-board > div[data-square="${square}"]`);
            if (cell) cell.className += ' ring-4 ring-secondary/70 ring-inset';
        } else {
            if (isMemoryTrainingMode) {
                showNotification("Incorrect move! Try again.", "warning");
                playMoveSound('lowtime');
            } else {
                showNotification(`Wrong piece selection! Follow the opening coordinates.`, "warning");
            }
        }
    } else {
        if (square === currentMove.to) {
            const move = openingGame.move({
                from: selectedOpeningSquare,
                to: square,
                promotion: 'q'
            });
            playMoveSoundForMove(move, openingGame);
            selectedOpeningSquare = null;
            openingStepIndex++;
            
            renderOpeningBoard();
            updateOpeningGuideStep();
        } else {
            if (isMemoryTrainingMode) {
                showNotification("Incorrect coordinate target! Try again.", "error");
                playMoveSound('lowtime');
            } else {
                showNotification("Incorrect coordinate target. Try again!", "error");
            }
            selectedOpeningSquare = null;
            renderOpeningBoard();
            updateOpeningGuideStep();
        }
    }
}

function updateOpeningGuideStep() {
    const opening = OPENINGS.find(o => o.id === activeOpeningId);
    if (!opening) return;

    const badge = document.getElementById('opening-step-badge');
    const hintBox = document.getElementById('opening-hint-txt');

    if (openingStepIndex >= opening.moves.length) {
        badge.innerText = 'Completed';
        badge.className = 'px-3 py-1 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-full font-bold text-xs';
        hintBox.innerText = 'Theory Mastered! Opening sequence finished.';
        showNotification("Opening Sequence Mastered! Good job.", "success");
        if (isMemoryTrainingMode) {
            toggleOpeningMemoryTraining();
        }
    } else {
        badge.innerText = `Step ${openingStepIndex + 1} / ${opening.moves.length}`;
        badge.className = 'px-3 py-1 bg-secondary/15 text-secondary border border-secondary/30 rounded-full font-bold text-xs';
        
        const currentMove = opening.moves[openingStepIndex];
        
        if (isMemoryTrainingMode) {
            hintBox.innerText = 'Memory Test Active! Execute the next move...';
        } else {
            hintBox.innerText = `Move: ${currentMove.from} to ${currentMove.to} (${currentMove.hint})`;
        }
        
        if (!isMemoryTrainingMode) {
            const cells = document.querySelectorAll('#opening-board > div');
            cells.forEach(c => {
                if (c.dataset.square === currentMove.from) {
                    c.className += ' ring-2 ring-primary/45 ring-inset bg-primary/10';
                }
                if (c.dataset.square === currentMove.to) {
                    c.className += ' ring-2 ring-secondary/45 ring-inset bg-secondary/10';
                }
            });
        }
    }
}

function resetOpeningExplorer() {
    initOpeningsExplorer();
    showNotification("Opening position reset.", "info");
}

function renderOpeningsSelector() {
    const container = document.getElementById('openings-list-container');
    if (!container) return;
    container.innerHTML = '';

    OPENINGS.forEach(o => {
        const isActive = o.id === activeOpeningId;
        const card = document.createElement('div');
        card.className = `p-3 rounded-xl border flex items-center justify-between gap-3 cursor-pointer transition-all ${
            isActive 
                ? 'bg-secondary/10 border-secondary text-secondary' 
                : 'bg-background/40 border-outline-variant/20 hover:border-secondary/50 text-on-surface-variant'
        }`;
        card.onclick = () => {
            if (isCustomRepertoireMode) cancelCustomRepertoireMode();
            activeOpeningId = o.id;
            initOpeningsExplorer();
        };

        card.innerHTML = `
            <div class="flex items-center gap-3">
                <span class="material-symbols-outlined text-md">${isActive ? 'radio_button_checked' : 'radio_button_unchecked'}</span>
                <div class="text-left">
                    <span class="text-xs font-semibold block">${o.title}</span>
                    <span class="text-[9px] block opacity-80">${o.moves.length} steps sequence</span>
                </div>
            </div>
            <span class="material-symbols-outlined text-lg opacity-60 flex-shrink-0">menu_book</span>
        `;
        container.appendChild(card);
    });
}

// ==========================================
// PGN & FEN IMPORT/EXPORT SYSTEM
// ==========================================
let activeModalFormat = 'FEN';
let activeModalMode = 'import';

function openImportModal() {
    activeModalMode = 'import';
    activeModalFormat = 'FEN';
    document.getElementById('pgn-fen-modal-title').innerText = 'Import FEN / PGN';
    document.getElementById('btn-modal-action').innerText = 'Load Position';
    document.getElementById('btn-modal-action').classList.remove('hidden');
    document.getElementById('btn-modal-copy').classList.add('hidden');
    document.getElementById('pgn-fen-textarea').value = '';
    document.getElementById('pgn-fen-textarea').removeAttribute('readonly');
    document.getElementById('pgn-fen-modal').classList.remove('hidden');
    selectModalFormat('FEN');
}

function exportCurrentPosition() {
    activeModalMode = 'export';
    document.getElementById('pgn-fen-modal-title').innerText = 'Export FEN / PGN';
    document.getElementById('btn-modal-action').classList.add('hidden');
    document.getElementById('btn-modal-copy').classList.remove('hidden');
    document.getElementById('pgn-fen-textarea').setAttribute('readonly', 'true');
    document.getElementById('pgn-fen-modal').classList.remove('hidden');
    selectModalFormat(activeModalFormat || 'FEN');
}

function closeImportExportModal() {
    document.getElementById('pgn-fen-modal').classList.add('hidden');
}

function selectModalFormat(format) {
    activeModalFormat = format;
    const btnFen = document.getElementById('btn-modal-format-fen');
    const btnPgn = document.getElementById('btn-modal-format-pgn');
    const inputLabel = document.getElementById('pgn-fen-input-label');
    const textarea = document.getElementById('pgn-fen-textarea');

    if (format === 'FEN') {
        btnFen.className = 'flex-1 py-2 bg-secondary text-on-secondary rounded-xl text-xs font-semibold transition-all';
        btnPgn.className = 'flex-1 py-2 bg-surface-variant border border-outline-variant text-on-surface rounded-xl text-xs font-semibold hover:bg-surface-bright transition-all';
        inputLabel.innerText = 'FEN String';
        textarea.placeholder = 'e.g. rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
        
        if (activeModalMode === 'export') {
            textarea.value = chessGame.fen();
        }
    } else {
        btnFen.className = 'flex-1 py-2 bg-surface-variant border border-outline-variant text-on-surface rounded-xl text-xs font-semibold hover:bg-surface-bright transition-all';
        btnPgn.className = 'flex-1 py-2 bg-secondary text-on-secondary rounded-xl text-xs font-semibold transition-all';
        inputLabel.innerText = 'PGN String';
        textarea.placeholder = 'e.g. 1. e4 e5 2. Nf3 Nc6';
        
        if (activeModalMode === 'export') {
            textarea.value = chessGame.pgn();
        }
    }
}

function applyModalImportExport() {
    const val = document.getElementById('pgn-fen-textarea').value.trim();
    if (!val) return;

    if (activeModalFormat === 'FEN') {
        const validate = chessGame.validate_fen(val);
        if (validate.valid) {
            chessGame.load(val);
            gameHistoryMoves = [];
            if (gameMode === '3D') {
                updateBoard3D();
            } else {
                renderBoard2D();
            }
            closeImportExportModal();
            showNotification("FEN Position loaded successfully!", "success");
        } else {
            showNotification(`Invalid FEN position: ${validate.error}`, "error");
        }
    } else {
        // PGN
        chessGame.reset();
        const success = chessGame.load_pgn(val);
        if (success) {
            gameHistoryMoves = [];
            const history = chessGame.history({ verbose: true });
            
            const temp = new Chess();
            history.forEach(m => {
                temp.move(m);
                gameHistoryMoves.push({
                    fen: temp.fen(),
                    move: m,
                    eval: evaluateBoard(temp.board()) / 10
                });
            });

            chessGame = temp;
            document.getElementById('arena-mode-select').value = 'review';
            changeArenaMode('review');

            closeImportExportModal();
            showNotification("PGN Moves loaded successfully. Switched to review mode!", "success");
        } else {
            showNotification("Invalid PGN format or moves!", "error");
        }
    }
}

function copyModalContent() {
    const textarea = document.getElementById('pgn-fen-textarea');
    textarea.select();
    navigator.clipboard.writeText(textarea.value);
    showNotification("Content copied to clipboard!", "success");
}

// ==========================================
// OPENINGS TRAINER & REPERTOIRE BUILDER
// ==========================================
let isMemoryTrainingMode = false;
let isCustomRepertoireMode = false;
let customRepertoireMoves = [];

function toggleOpeningMemoryTraining() {
    isMemoryTrainingMode = !isMemoryTrainingMode;
    const btn = document.getElementById('btn-train-memory');
    const badge = document.getElementById('opening-step-badge');
    const hintBox = document.getElementById('opening-hint-txt');

    if (isMemoryTrainingMode) {
        btn.innerHTML = `<span class="material-symbols-outlined text-sm font-semibold">check_circle</span> Explorer Mode`;
        btn.className = 'w-full py-2.5 bg-emerald-500 text-white font-semibold rounded-xl text-xs flex items-center justify-center gap-1.5 hover:scale-[1.02] transition-all duration-200';
        badge.innerText = 'Memory Test Active';
        badge.className = 'px-3 py-1 bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded-full font-bold text-xs';
        hintBox.innerText = 'Hints hidden! Make the opening moves from memory.';
        initOpeningsExplorer();
        showNotification("Memory test started! Play the moves without hints.", "info");
    } else {
        btn.innerHTML = `<span class="material-symbols-outlined text-sm font-semibold">psychology</span> Train Repertoire Memory`;
        btn.className = 'w-full py-2.5 bg-secondary text-on-secondary font-semibold rounded-xl text-xs flex items-center justify-center gap-1.5 hover:scale-[1.02] transition-all duration-200 shadow-md shadow-secondary/15';
        initOpeningsExplorer();
        showNotification("Explorer mode restored.", "info");
    }
}

function startCustomRepertoireMode() {
    isCustomRepertoireMode = true;
    customRepertoireMoves = [];
    
    openingGame = new Chess();
    openingStepIndex = 0;
    
    document.getElementById('custom-repertoire-form').classList.remove('hidden');
    document.getElementById('opening-title').innerText = 'Creating Custom Repertoire';
    document.getElementById('opening-description').innerText = 'Play moves on the board to define your repertoire lines. White and Black moves will be recorded.';
    document.getElementById('opening-step-badge').innerText = '0 Moves';
    document.getElementById('opening-hint-txt').innerText = 'Play the starting move on the board.';
    
    renderOpeningBoard();
}

function cancelCustomRepertoireMode() {
    isCustomRepertoireMode = false;
    document.getElementById('custom-repertoire-form').classList.add('hidden');
    initOpeningsExplorer();
}

function saveCustomRepertoire() {
    const name = document.getElementById('custom-repertoire-name').value.trim();
    const desc = document.getElementById('custom-repertoire-desc').value.trim() || 'Custom repertoire opening sequence.';
    
    if (!name) {
        showNotification("Please enter a name for your repertoire!", "error");
        return;
    }
    if (customRepertoireMoves.length === 0) {
        showNotification("Please play some moves on the board first!", "error");
        return;
    }

    const newOpening = {
        id: `OP-CUST-${Date.now()}`,
        title: name,
        description: desc,
        moves: customRepertoireMoves
    };

    OPENINGS.push(newOpening);
    const stored = JSON.parse(localStorage.getItem('mindsquare_custom_repertoires') || '[]');
    stored.push(newOpening);
    localStorage.setItem('mindsquare_custom_repertoires', JSON.stringify(stored));

    isCustomRepertoireMode = false;
    document.getElementById('custom-repertoire-form').classList.add('hidden');
    
    activeOpeningId = newOpening.id;
    initOpeningsExplorer();
    showNotification("Custom repertoire saved successfully!", "success");
}

(function loadCustomRepertoires() {
    try {
        const stored = JSON.parse(localStorage.getItem('mindsquare_custom_repertoires') || '[]');
        stored.forEach(o => {
            if (!OPENINGS.find(item => item.id === o.id)) {
                OPENINGS.push(o);
            }
        });
    } catch (e) {}
})();

// ================================================================
// ENDGAME TRAINER
// ================================================================
let endgameGame = null;
let activeEndgameId = 'kp-v-k';
let endgameSelectedSquare = null;

const ENDGAME_SCENARIOS = {
    'kp-v-k': {
        title: 'King & Pawn vs King',
        description: 'White to move and promote. Learn to guide your pawn using the concept of key squares and opposition.',
        fen: '8/8/3k4/8/3K1P2/8/8/8 w - - 0 1',
        instructions: 'Push your pawn forward, but remember to lead with your King first to secure the key squares.'
    },
    'kq-v-k': {
        title: 'King & Queen vs King Mate',
        description: 'Deliver checkmate with King and Queen in under 15 moves. Drive the enemy King to the edge.',
        fen: '8/8/8/3k4/8/8/3Q4/3K4 w - - 0 1',
        instructions: 'Coordinate your King and Queen. Remember not to stalemate the black King!'
    },
    'kr-v-k': {
        title: 'King & Rook vs King Mate',
        description: 'Deliver checkmate with King and Rook. Learn the box method to trap the black King.',
        fen: '8/8/8/3k4/8/8/3R4/3K4 w - - 0 1',
        instructions: 'Shrink the box around the Black King. White King must support the Rook to mate.'
    },
    'opposition': {
        title: 'Opposition Practice',
        description: 'White King must take opposition to push the pawn to promotion.',
        fen: '8/8/8/4k3/4P3/8/4K3/8 w - - 0 1',
        instructions: 'Step in front of the enemy King when they step in front of yours to take opposition.'
    }
};

function initEndgameTrainer() {
    const scenario = ENDGAME_SCENARIOS[activeEndgameId];
    if (!scenario) return;

    endgameGame = new Chess(scenario.fen);
    endgameSelectedSquare = null;

    const titleEl = document.getElementById('endgame-title');
    const instEl = document.getElementById('endgame-instructions');
    if (titleEl) titleEl.innerText = scenario.title;
    if (instEl) instEl.innerText = scenario.instructions;
    
    const badge = document.getElementById('endgame-status-badge');
    if (badge) {
        badge.innerText = 'Unsolved';
        badge.className = 'px-3 py-1 bg-amber-500/20 text-secondary border border-secondary/30 rounded-full font-bold text-xs';
    }

    const feedback = document.getElementById('endgame-feedback');
    if (feedback) feedback.classList.add('hidden');

    renderEndgameBoard();
}

function resetEndgameTrainer() {
    initEndgameTrainer();
    showNotification('Board reset!', 'info');
}

function loadEndgameScenario(val) {
    activeEndgameId = val;
    initEndgameTrainer();
}

function renderEndgameBoard() {
    const boardEl = document.getElementById('endgame-board');
    if (!boardEl) return;
    boardEl.innerHTML = '';
    
    updateOuterBoardCoordinates('endgame-board', false);

    const board = endgameGame.board();
    const columns = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];

    for (let r = 7; r >= 0; r--) {
        for (let c = 0; c < 8; c++) {
            const squareName = columns[c] + (r + 1);
            const piece = board[7 - r][c];
            const cell = document.createElement('div');
            cell.dataset.square = squareName;
            
            const isDark = (r + c) % 2 === 0;
            cell.className = `relative aspect-square flex items-center justify-center cursor-pointer transition-all duration-200 select-none `;
            
            const skinColors = BOARD_SKINS[activeBoardSkin] || BOARD_SKINS['green'];
            cell.style.backgroundColor = isDark ? skinColors.dark : skinColors.light;
            cell.style.color = isDark ? skinColors.darkText : skinColors.lightText;
            
            if (piece) {
                const pieceKey = piece.color + piece.type;
                let pieceSvg = SVG_PIECES[pieceKey];
                if (pieceSvg) {
                    pieceSvg = pieceSvg.replace('<svg', '<svg class="w-full h-full"');
                    cell.innerHTML = `<div class="w-4/5 h-4/5 flex items-center justify-center transform active:scale-95 transition-transform z-10">${pieceSvg}</div>`;
                }
            }

            // Highlights
            if (endgameSelectedSquare === squareName) {
                cell.classList.add('ring-4', 'ring-secondary', 'ring-inset');
            }

            cell.onclick = () => handleEndgameSquareClick(squareName);
            boardEl.appendChild(cell);
        }
    }
}

function handleEndgameSquareClick(square) {
    if (endgameGame.game_over()) return;
    if (endgameGame.turn() !== 'w') return; // Only allow player to move White pieces

    const piece = endgameGame.get(square);

    if (endgameSelectedSquare === null) {
        if (piece && piece.color === 'w') {
            endgameSelectedSquare = square;
            renderEndgameBoard();
        }
    } else {
        if (square === endgameSelectedSquare) {
            endgameSelectedSquare = null;
            renderEndgameBoard();
            return;
        }

        const move = {
            from: endgameSelectedSquare,
            to: square,
            promotion: 'q' // Auto-promote to Queen for simplicity
        };

        try {
            const result = endgameGame.move(move);
            if (result) {
                playMoveSoundForMove(result, endgameGame);
                endgameSelectedSquare = null;
                renderEndgameBoard();

                if (endgameGame.game_over()) {
                    checkEndgameStatus();
                } else {
                    // Computer replies
                    setTimeout(makeEndgameAIMove, 700);
                }
            } else {
                endgameSelectedSquare = null;
                renderEndgameBoard();
            }
        } catch (e) {
            endgameSelectedSquare = null;
            renderEndgameBoard();
        }
    }
}

function makeEndgameAIMove() {
    if (endgameGame.game_over()) return;

    // Use alpha-beta minimax from parent page by swapping references temporarily
    const tempGame = chessGame;
    chessGame = endgameGame;
    
    // Calculate AI reply (depth 3 is fast and challenging for endgames)
    const bestMove = selectBestMove(3);
    
    chessGame = tempGame; // restore original

    if (bestMove) {
        endgameGame.move(bestMove);
        playMoveSoundForMove(bestMove, endgameGame);
        renderEndgameBoard();
        checkEndgameStatus();
    }
}

function checkEndgameStatus() {
    const badge = document.getElementById('endgame-status-badge');
    const feedback = document.getElementById('endgame-feedback');
    if (!badge || !feedback) return;

    feedback.classList.remove('hidden');

    if (endgameGame.in_checkmate()) {
        if (endgameGame.turn() === 'b') {
            // White won! (It's Black's turn and Black is mated)
            badge.innerText = 'Solved ✅';
            badge.className = 'px-3 py-1 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-full font-bold text-xs';
            feedback.innerText = 'Excellent job! You successfully delivered checkmate. +15 ELO rewarded!';
            feedback.className = 'p-3 rounded-xl text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20';
            
            // Add points ELO to user
            const user = getCurrentUser();
            if (user) {
                const userPoints = (user.points || 0) + 15;
                if (typeof updateStudentStats === 'function') {
                    updateStudentStats({ points: userPoints });
                } else if (typeof updateStudentProgression === 'function') {
                    updateStudentProgression(user.id, 'points', 15);
                }
            }
            launchConfetti();
        } else {
            badge.innerText = 'Failed ❌';
            badge.className = 'px-3 py-1 bg-red-500/20 text-red-400 border border-red-500/30 rounded-full font-bold text-xs';
            feedback.innerText = 'Oh no! The computer delivered checkmate. Try again!';
            feedback.className = 'p-3 rounded-xl text-xs font-semibold bg-red-500/10 text-red-400 border border-red-500/20';
        }
    } else if (endgameGame.in_draw() || endgameGame.in_stalemate() || endgameGame.in_threefold_repetition()) {
        badge.innerText = 'Draw 🤝';
        badge.className = 'px-3 py-1 bg-slate-500/20 text-slate-400 border border-slate-500/30 rounded-full font-bold text-xs';
        feedback.innerText = 'The game ended in a draw or stalemate. Review key opposition rules!';
        feedback.className = 'p-3 rounded-xl text-xs font-semibold bg-slate-500/10 text-slate-400 border border-slate-500/20';
    }
}


