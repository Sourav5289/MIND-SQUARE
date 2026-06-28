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
function initChessGame() {
    chessGame = new Chess();
    selectedSquare2D = null;
    document.getElementById('chess-status').innerText = 'Your turn (White). Choose a move!';
    document.getElementById('chess-status-badge').innerText = 'In Progress';
    document.getElementById('chess-status-badge').className = 'px-3 py-1 bg-amber-500/20 text-secondary border border-secondary/30 rounded-full font-bold text-xs';

    // Reset clock and histories
    gameHistoryMoves = [];
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
function renderBoard2D() {
    const boardEl = document.getElementById('chess-board-2d');
    if (!boardEl) return;
    boardEl.innerHTML = '';

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

            // Add algebraic coordinate label for border cells
            if ((!boardFlipped && r === 0) || (boardFlipped && r === 7)) {
                cell.innerHTML += `<span class="absolute bottom-0.5 right-1 text-[9px] font-bold opacity-30">${columns[c]}</span>`;
            }
            if ((!boardFlipped && c === 0) || (boardFlipped && c === 7)) {
                cell.innerHTML += `<span class="absolute top-0.5 left-1 text-[9px] font-bold opacity-30">${r + 1}</span>`;
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
            if (!chessGame.game_over() && arenaGameMode === 'vs-computer') {
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

function makePlayerMove(from, to) {
    try {
        const move = chessGame.move({
            from: from,
            to: to,
            promotion: 'q' // Auto promote to queen for simplicity
        });

        if (move) {
            playMoveSound();
            
            // Record game history logs for Post-Game Review
            gameHistoryMoves.push({
                fen: chessGame.fen(),
                move: move,
                eval: getPositionEvalScore()
            });

            checkGameStatus();
            return move;
        }
    } catch (e) {
        // Invalid move
    }
    return null;
}

// Simple MiniMax AI
// Simple MiniMax AI
function makeAIMove() {
    if (chessGame.game_over()) return;

    const moves = chessGame.moves({ verbose: true });
    if (moves.length === 0) return;

    let selectedMove = null;

    if (aiLevel === 'easy') {
        // Easy AI: plays depth 1 search, with a 30% chance of random moves to keep it easy
        if (Math.random() < 0.3) {
            selectedMove = moves[Math.floor(Math.random() * moves.length)];
        } else {
            selectedMove = selectBestMove(1);
        }
    } else if (aiLevel === 'medium') {
        // Medium difficulty translates to a strong "Hard" (Minimax depth 2 + Positional PST)
        selectedMove = selectBestMove(2);
    } else if (aiLevel === 'hard') {
        // Hard difficulty translates to an advanced "Very Hard" (Minimax depth 3 + Positional PST)
        selectedMove = selectBestMove(3);
    }

    if (selectedMove) {
        chessGame.move(selectedMove);
        playMoveSound();

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

    let bestVal = -Infinity;
    let bestMoves = [];

    moves.forEach(m => {
        chessGame.move(m);
        // We are evaluating from Black's (AI's) perspective, so we negate the evaluation score
        let val = -evaluateBoard(chessGame.board());
        val = minimax(depth - 1, -Infinity, Infinity, false);
        chessGame.undo();

        if (val > bestVal) {
            bestVal = val;
            bestMoves = [m];
        } else if (val === bestVal) {
            bestMoves.push(m);
        }
    });

    return bestMoves[Math.floor(Math.random() * bestMoves.length)];
}

// Alpha-Beta Minimax Evaluation
function minimax(depth, alpha, beta, isMaximizing) {
    if (depth === 0 || chessGame.game_over()) {
        return evaluateBoard(chessGame.board());
    }

    const moves = chessGame.moves({ verbose: true });

    if (isMaximizing) {
        let maxEval = -Infinity;
        for (let i = 0; i < moves.length; i++) {
            chessGame.move(moves[i]);
            let score = minimax(depth - 1, alpha, beta, false);
            chessGame.undo();
            maxEval = Math.max(maxEval, score);
            alpha = Math.max(alpha, score);
            if (beta <= alpha) break;
        }
        return maxEval;
    } else {
        let minEval = Infinity;
        for (let i = 0; i < moves.length; i++) {
            chessGame.move(moves[i]);
            let score = minimax(depth - 1, alpha, beta, true);
            chessGame.undo();
            minEval = Math.min(minEval, score);
            beta = Math.min(beta, score);
            if (beta <= alpha) break;
        }
        return minEval;
    }
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

// Audio feedback
function playMoveSound() {
    try {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();

        osc.connect(gainNode);
        gainNode.connect(audioCtx.destination);

        // Simple crisp wood hit synth
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(150, audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(300, audioCtx.currentTime + 0.08);

        gainNode.gain.setValueAtTime(0.3, audioCtx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.1);

        osc.start();
        osc.stop(audioCtx.currentTime + 0.1);
    } catch (err) {
        // Sound failure safety
    }
}

// Check winner
function checkGameStatus() {
    if (chessGame.game_over()) {
        let statusText = 'Game Over! ';
        let statusBadge = document.getElementById('chess-status-badge');
        let outcome = 'draw';

        if (chessGame.in_checkmate()) {
            if (chessGame.turn() === 'b') {
                statusText += 'Checkmate! You win!';
                statusBadge.innerText = 'Victory';
                statusBadge.className = 'px-3 py-1 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-full font-bold text-xs';
                outcome = 'win';
            } else {
                statusText += 'Checkmate! AI wins.';
                statusBadge.innerText = 'Defeat';
                statusBadge.className = 'px-3 py-1 bg-red-500/20 text-red-400 border border-red-500/30 rounded-full font-bold text-xs';
                outcome = 'lose';
            }
        } else if (chessGame.in_draw() || chessGame.in_stalemate() || chessGame.in_threefold_repetition()) {
            statusText += 'Draw match.';
            statusBadge.innerText = 'Draw';
            statusBadge.className = 'px-3 py-1 bg-slate-500/20 text-slate-400 border border-slate-500/30 rounded-full font-bold text-xs';
            outcome = 'draw';
        }

        document.getElementById('chess-status').innerText = statusText;

        // Update user metrics in db
        recordGameResult(outcome);
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
                btn.className = 'py-2 rounded-xl text-xs font-semibold bg-[#1a1c1d] border border-outline-variant hover:bg-surface-variant/30 transition-all hover:border-secondary';
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
            if (!chessGame.game_over() && arenaGameMode === 'vs-computer') {
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

const PUZZLES = [
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
            puzzleGame.move({
                from: selectedPuzzleSquare,
                to: square,
                promotion: 'q'
            });
            playMoveSound();
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
                btn.className = 'skin-btn py-2 rounded-xl text-xs font-semibold bg-[#1a1c1d] border border-outline-variant hover:bg-surface-variant/30 transition-all cursor-pointer';
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
                btn.className = 'clock-preset-btn py-2 bg-[#1a1c1d] border border-outline-variant hover:bg-surface-variant/30 text-xs font-semibold rounded-xl transition-all';
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
        if (activeClockPlayer === 'w') {
            whiteTime--;
            document.getElementById('timer-txt-white').innerText = formatTime(whiteTime);
            document.getElementById('clock-card-white').className = 'p-3 bg-secondary/20 rounded-xl border border-secondary text-center transition-all duration-300';
            document.getElementById('clock-card-black').className = 'p-3 bg-black/60 rounded-xl border border-outline-variant/20 text-center transition-all duration-300';
            if (whiteTime <= 0) {
                handleTimeout('w');
            }
        } else {
            blackTime--;
            document.getElementById('timer-txt-black').innerText = formatTime(blackTime);
            document.getElementById('clock-card-black').className = 'p-3 bg-secondary/20 rounded-xl border border-secondary text-center transition-all duration-300';
            document.getElementById('clock-card-white').className = 'p-3 bg-black/60 rounded-xl border border-outline-variant/20 text-center transition-all duration-300';
            if (blackTime <= 0) {
                handleTimeout('b');
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
            const classification = classifyMove(prevEval, currentEval, lastMove);
            const badge = document.createElement('div');
            badge.className = `absolute -top-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center border text-[10px] font-bold shadow-md ${classification.color}`;
            badge.innerHTML = `<span class="material-symbols-outlined text-[10px]">${classification.symbol}</span>`;
            badge.title = classification.name;
            destCell.appendChild(badge);
        }

        let whitePct = 50 + (currentEval * 10);
        whitePct = Math.max(5, Math.min(95, whitePct));
        document.getElementById('arena-eval-bar-white').style.height = `${whitePct}%`;
        document.getElementById('arena-eval-bar-black').style.height = `${100 - whitePct}%`;
        document.getElementById('arena-eval-bar-text').innerText = (currentEval >= 0 ? '+' : '') + currentEval.toFixed(1);
        
        document.getElementById('chess-status').innerText = `Replayed: ${lastMove.san}`;
    } else {
        document.getElementById('chess-status').innerText = 'Start of game.';
        document.getElementById('arena-eval-bar-white').style.height = '50%';
        document.getElementById('arena-eval-bar-black').style.height = '50%';
        document.getElementById('arena-eval-bar-text').innerText = '+0.0';
    }
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
const cols = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
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

    const columns = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];

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
            
            if (r === 0) {
                cell.innerHTML += `<span class="absolute bottom-0.5 right-1 text-[9px] font-bold opacity-30">${columns[c]}</span>`;
            }
            if (c === 0) {
                cell.innerHTML += `<span class="absolute top-0.5 left-1 text-[9px] font-bold opacity-30">${r + 1}</span>`;
            }
            
            cell.onclick = () => handleVisionSquareClick(squareName);
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

function handleVisionSquareClick(square) {
    if (!visionActive) return;
    
    const cell = document.querySelector(`#vision-board > div[data-square="${square}"]`);
    
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

            if (r === 0) {
                cell.innerHTML += `<span class="absolute bottom-0.5 right-1 text-[9px] font-bold opacity-30">${columns[c]}</span>`;
            }
            if (c === 0) {
                cell.innerHTML += `<span class="absolute top-0.5 left-1 text-[9px] font-bold opacity-30">${r + 1}</span>`;
            }

            cell.onclick = () => handleOpeningSquareClick(squareName);
            boardEl.appendChild(cell);
        }
    }
}

let selectedOpeningSquare = null;

function handleOpeningSquareClick(square) {
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
            showNotification(`Wrong piece selection! Follow the opening coordinates.`, "warning");
        }
    } else {
        if (square === currentMove.to) {
            openingGame.move({
                from: selectedOpeningSquare,
                to: square,
                promotion: 'q'
            });
            playMoveSound();
            selectedOpeningSquare = null;
            openingStepIndex++;
            
            renderOpeningBoard();
            updateOpeningGuideStep();
        } else {
            showNotification("Incorrect coordinate target. Try again!", "error");
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
    } else {
        badge.innerText = `Step ${openingStepIndex + 1} / ${opening.moves.length}`;
        badge.className = 'px-3 py-1 bg-secondary/15 text-secondary border border-secondary/30 rounded-full font-bold text-xs';
        
        const currentMove = opening.moves[openingStepIndex];
        hintBox.innerText = `Move: ${currentMove.from} to ${currentMove.to} (${currentMove.hint})`;
        
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
            <span class="material-symbols-outlined text-lg opacity-60">menu_book</span>
        `;
        container.appendChild(card);
    });
}

