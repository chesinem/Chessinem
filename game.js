const boardElement = document.getElementById("board");
const statusElement = document.getElementById("status");

const symbols = {
    wp: "♙", wn: "♘", wb: "♗", wr: "♖", wq: "♕", wk: "♔",
    bp: "♟", bn: "♞", bb: "♝", br: "♜", bq: "♛", bk: "♚"
};

const values = {
    p: 100,
    n: 320,
    b: 330,
    r: 500,
    q: 900,
    k: 20000
};

let board = [];
let turn = "w";
let selected = null;
let mode = "computer";
let playerColor = "w";
let difficulty = "medium";
let thinking = false;
let gameOver = false;
let enPassant = null;

let castling = {
    wk: true,
    wq: true,
    bk: true,
    bq: true
};

const settings = {
    easy: {
        time: 150,
        depth: 2
    },
    medium: {
        time: 700,
        depth: 4
    },
    hard: {
        time: 3000,
        depth: 6
    }
};

function opposite(color) {
    return color === "w" ? "b" : "w";
}

function inside(r, c) {
    return r >= 0 && r < 8 && c >= 0 && c < 8;
}

function createInitialBoard() {
    return [
        ["br","bn","bb","bq","bk","bb","bn","br"],
        ["bp","bp","bp","bp","bp","bp","bp","bp"],
        [null,null,null,null,null,null,null,null],
        [null,null,null,null,null,null,null,null],
        [null,null,null,null,null,null,null,null],
        [null,null,null,null,null,null,null,null],
        ["wp","wp","wp","wp","wp","wp","wp","wp"],
        ["wr","wn","wb","wq","wk","wb","wn","wr"]
    ];
}

function renderBoard() {
    boardElement.innerHTML = "";

    const flipped =
        mode === "computer" &&
        playerColor === "b";

    for (let displayR = 0; displayR < 8; displayR++) {
        for (let displayC = 0; displayC < 8; displayC++) {

            const r = flipped
                ? 7 - displayR
                : displayR;

            const c = flipped
                ? 7 - displayC
                : displayC;

            const square = document.createElement("div");

            square.className =
                "square " +
                ((r + c) % 2 === 0
                    ? "light"
                    : "dark");

            square.dataset.row = r;
            square.dataset.col = c;

            const piece = board[r][c];

            if (piece) {
                square.textContent = symbols[piece];

                if (piece[0] === "w") {
                    square.classList.add("white-piece");
                } else {
                    square.classList.add("black-piece");
                }
            }

            if (
                selected &&
                selected.r === r &&
                selected.c === c
            ) {
                square.classList.add("selected");
            }

            square.addEventListener(
                "click",
                function() {
                    handleSquareClick(r, c);
                }
            );

            boardElement.appendChild(square);
        }
    }
}

function findKing(b, color) {
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            if (b[r][c] === color + "k") {
                return { r, c };
            }
        }
    }

    return null;
}

function isAttacked(b, r, c, color) {
    const pawnDirection = color === "w" ? -1 : 1;
    const pawnRow = r - pawnDirection;

    for (const dc of [-1, 1]) {
        const pc = c + dc;

        if (
            inside(pawnRow, pc) &&
            b[pawnRow][pc] === color + "p"
        ) {
            return true;
        }
    }

    const knightMoves = [
        [-2,-1],[-2,1],
        [-1,-2],[-1,2],
        [1,-2],[1,2],
        [2,-1],[2,1]
    ];

    for (const move of knightMoves) {
        const nr = r + move[0];
        const nc = c + move[1];

        if (
            inside(nr, nc) &&
            b[nr][nc] === color + "n"
        ) {
            return true;
        }
    }

    const diagonal = [
        [-1,-1],[-1,1],
        [1,-1],[1,1]
    ];

    for (const dir of diagonal) {
        let nr = r + dir[0];
        let nc = c + dir[1];

        while (inside(nr, nc)) {
            const piece = b[nr][nc];

            if (piece) {
                if (
                    piece[0] === color &&
                    (piece[1] === "b" || piece[1] === "q")
                ) {
                    return true;
                }

                break;
            }

            nr += dir[0];
            nc += dir[1];
        }
    }

    const straight = [
        [-1,0],[1,0],
        [0,-1],[0,1]
    ];

    for (const dir of straight) {
        let nr = r + dir[0];
        let nc = c + dir[1];

        while (inside(nr, nc)) {
            const piece = b[nr][nc];

            if (piece) {
                if (
                    piece[0] === color &&
                    (piece[1] === "r" || piece[1] === "q")
                ) {
                    return true;
                }

                break;
            }

            nr += dir[0];
            nc += dir[1];
        }
    }

    for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
            if (dr === 0 && dc === 0) continue;

            const nr = r + dr;
            const nc = c + dc;

            if (
                inside(nr, nc) &&
                b[nr][nc] === color + "k"
            ) {
                return true;
            }
        }
    }

    return false;
}

function inCheck(b, color) {
    const king = findKing(b, color);

    if (!king) {
        return true;
    }

    return isAttacked(
        b,
        king.r,
        king.c,
        opposite(color)
    );
}

function generateMoves(b, color, rights, ep) {
    const moves = [];

    const knightDirs = [
        [-2,-1],[-2,1],[-1,-2],[-1,2],
        [1,-2],[1,2],[2,-1],[2,1]
    ];

    const bishopDirs = [
        [-1,-1],[-1,1],[1,-1],[1,1]
    ];

    const rookDirs = [
        [-1,0],[1,0],[0,-1],[0,1]
    ];

    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            const piece = b[r][c];

            if (!piece || piece[0] !== color) {
                continue;
            }

            const type = piece[1];

            if (type === "p") {
                const dir = color === "w" ? -1 : 1;
                const startRow = color === "w" ? 6 : 1;
                const promotionRow = color === "w" ? 0 : 7;

                const oneRow = r + dir;

                if (
                    inside(oneRow, c) &&
                    !b[oneRow][c]
                ) {
                    if (oneRow === promotionRow) {
                        for (const promotion of ["q","r","b","n"]) {
                            moves.push({
                                from: {r, c},
                                to: {r: oneRow, c},
                                promotion
                            });
                        }
                    } else {
                        moves.push({
                            from: {r, c},
                            to: {r: oneRow, c}
                        });
                    }

                    const twoRow = r + dir * 2;

                    if (
                        r === startRow &&
                        !b[twoRow][c]
                    ) {
                        moves.push({
                            from: {r, c},
                            to: {r: twoRow, c}
                        });
                    }
                }

                for (const dc of [-1, 1]) {
                    const nc = c + dc;

                    if (!inside(oneRow, nc)) {
                        continue;
                    }

                    const target = b[oneRow][nc];

                    if (
                        target &&
                        target[0] !== color
                    ) {
                        if (oneRow === promotionRow) {
                            for (const promotion of ["q","r","b","n"]) {
                                moves.push({
                                    from: {r, c},
                                    to: {r: oneRow, c: nc},
                                    promotion
                                });
                            }
                        } else {
                            moves.push({
                                from: {r, c},
                                to: {r: oneRow, c: nc}
                            });
                        }
                    }

                    if (
                        ep &&
                        ep.r === oneRow &&
                        ep.c === nc
                    ) {
                        moves.push({
                            from: {r, c},
                            to: {r: oneRow, c: nc},
                            enPassant: true
                        });
                    }
                }
            }

            if (type === "n") {
                for (const dir of knightDirs) {
                    const nr = r + dir[0];
                    const nc = c + dir[1];

                    if (!inside(nr, nc)) {
                        continue;
                    }

                    if (
                        !b[nr][nc] ||
                        b[nr][nc][0] !== color
                    ) {
                        moves.push({
                            from: {r, c},
                            to: {r: nr, c: nc}
                        });
                    }
                }
            }

            if (
                type === "b" ||
                type === "r" ||
                type === "q"
            ) {
                let directions = [];

                if (type === "b") {
                    directions = bishopDirs;
                }

                if (type === "r") {
                    directions = rookDirs;
                }

                if (type === "q") {
                    directions =
                        bishopDirs.concat(rookDirs);
                }

                for (const dir of directions) {
                    let nr = r + dir[0];
                    let nc = c + dir[1];

                    while (inside(nr, nc)) {
                        if (!b[nr][nc]) {
                            moves.push({
                                from: {r, c},
                                to: {r: nr, c: nc}
                            });
                        } else {
                            if (b[nr][nc][0] !== color) {
                                moves.push({
                                    from: {r, c},
                                    to: {r: nr, c: nc}
                                });
                            }

                            break;
                        }

                        nr += dir[0];
                        nc += dir[1];
                    }
                }
            }

            if (type === "k") {
                for (let dr = -1; dr <= 1; dr++) {
                    for (let dc = -1; dc <= 1; dc++) {
                        if (dr === 0 && dc === 0) {
                            continue;
                        }

                        const nr = r + dr;
                        const nc = c + dc;

                        if (!inside(nr, nc)) {
                            continue;
                        }

                        if (
                            !b[nr][nc] ||
                            b[nr][nc][0] !== color
                        ) {
                            moves.push({
                                from: {r, c},
                                to: {r: nr, c: nc}
                            });
                        }
                    }
                }

                if (
                    color === "w" &&
                    r === 7 &&
                    c === 4
                ) {
                    if (
                        rights.wk &&
                        b[7][5] === null &&
                        b[7][6] === null &&
                        b[7][7] === "wr" &&
                        !isAttacked(b,7,4,"b") &&
                        !isAttacked(b,7,5,"b") &&
                        !isAttacked(b,7,6,"b")
                    ) {
                        moves.push({
                            from: {r, c},
                            to: {r: 7, c: 6},
                            castle: "k"
                        });
                    }

                    if (
                        rights.wq &&
                        b[7][1] === null &&
                        b[7][2] === null &&
                        b[7][3] === null &&
                        b[7][0] === "wr" &&
                        !isAttacked(b,7,4,"b") &&
                        !isAttacked(b,7,3,"b") &&
                        !isAttacked(b,7,2,"b")
                    ) {
                        moves.push({
                            from: {r, c},
                            to: {r: 7, c: 2},
                            castle: "q"
                        });
                    }
                }

                if (
                    color === "b" &&
                    r === 0 &&
                    c === 4
                ) {
                    if (
                        rights.bk &&
                        b[0][5] === null &&
                        b[0][6] === null &&
                        b[0][7] === "br" &&
                        !isAttacked(b,0,4,"w") &&
                        !isAttacked(b,0,5,"w") &&
                        !isAttacked(b,0,6,"w")
                    ) {
                        moves.push({
                            from: {r, c},
                            to: {r: 0, c: 6},
                            castle: "k"
                        });
                    }

                    if (
                        rights.bq &&
                        b[0][1] === null &&
                        b[0][2] === null &&
                        b[0][3] === null &&
                        b[0][0] === "br" &&
                        !isAttacked(b,0,4,"w") &&
                        !isAttacked(b,0,3,"w") &&
                        !isAttacked(b,0,2,"w")
                    ) {
                        moves.push({
                            from: {r, c},
                            to: {r: 0, c: 2},
                            castle: "q"
                        });
                    }
                }
            }
        }
    }

    return moves;
}

function applyMove(b, move, rights, ep) {
    const next = b.map(row => row.slice());
    const newRights = {...rights};

    const piece =
        next[move.from.r][move.from.c];

    const captured =
        next[move.to.r][move.to.c];

    next[move.from.r][move.from.c] = null;
    next[move.to.r][move.to.c] = piece;

    if (move.enPassant) {
        const capturedRow =
            piece[0] === "w"
                ? move.to.r + 1
                : move.to.r - 1;

        next[capturedRow][move.to.c] = null;
    }

    if (move.promotion) {
        next[move.to.r][move.to.c] =
            piece[0] + move.promotion;
    }

    if (move.castle === "k") {
        const row = piece[0] === "w" ? 7 : 0;

        next[row][5] = next[row][7];
        next[row][7] = null;
    }

    if (move.castle === "q") {
        const row = piece[0] === "w" ? 7 : 0;

        next[row][3] = next[row][0];
        next[row][0] = null;
    }

    if (piece === "wk") {
        newRights.wk = false;
        newRights.wq = false;
    }

    if (piece === "bk") {
        newRights.bk = false;
        newRights.bq = false;
    }

    if (piece === "wr") {
        if (move.from.r === 7 && move.from.c === 0) {
            newRights.wq = false;
        }

        if (move.from.r === 7 && move.from.c === 7) {
            newRights.wk = false;
        }
    }

    if (piece === "br") {
        if (move.from.r === 0 && move.from.c === 0) {
            newRights.bq = false;
        }

        if (move.from.r === 0 && move.from.c === 7) {
            newRights.bk = false;
        }
    }

    if (captured === "wr") {
        if (move.to.r === 7 && move.to.c === 0) {
            newRights.wq = false;
        }

        if (move.to.r === 7 && move.to.c === 7) {
            newRights.wk = false;
        }
    }

    if (captured === "br") {
        if (move.to.r === 0 && move.to.c === 0) {
            newRights.bq = false;
        }

        if (move.to.r === 0 && move.to.c === 7) {
            newRights.bk = false;
        }
    }

    let newEp = null;

    if (
        piece[1] === "p" &&
        Math.abs(move.to.r - move.from.r) === 2
    ) {
        newEp = {
            r: (move.from.r + move.to.r) / 2,
            c: move.from.c
        };
    }

    return {
        board: next,
        rights: newRights,
        ep: newEp
    };
}

function getLegalMoves(b, color, rights, ep) {
    const pseudo =
        generateMoves(
            b,
            color,
            rights,
            ep
        );

    const legal = [];

    for (const move of pseudo) {
        const state =
            applyMove(
                b,
                move,
                rights,
                ep
            );

        if (!inCheck(state.board, color)) {
            legal.push(move);
        }
    }

    return legal;
}

function evaluate(b) {
    let score = 0;

    const pieceTables = {
        p: [
             0,  0,  0,  0,  0,  0,  0,  0,
            50, 50, 50, 50, 50, 50, 50, 50,
            10, 10, 20, 30, 30, 20, 10, 10,
             5,  5, 10, 25, 25, 10,  5,  5,
             0,  0,  0, 20, 20,  0,  0,  0,
             5, -5,-10,  0,  0,-10, -5,  5,
             5, 10, 10,-20,-20, 10, 10,  5,
             0,  0,  0,  0,  0,  0,  0,  0
        ],

        n: [
            -50,-40,-30,-30,-30,-30,-40,-50,
            -40,-20,  0,  0,  0,  0,-20,-40,
            -30,  0, 10, 15, 15, 10,  0,-30,
            -30,  5, 15, 20, 20, 15,  5,-30,
            -30,  0, 15, 20, 20, 15,  0,-30,
            -30,  5, 10, 15, 15, 10,  5,-30,
            -40,-20,  0,  5,  5,  0,-20,-40,
            -50,-40,-30,-30,-30,-30,-40,-50
        ],

        b: [
            -20,-10,-10,-10,-10,-10,-10,-20,
            -10,  0,  0,  0,  0,  0,  0,-10,
            -10,  0,  5, 10, 10,  5,  0,-10,
            -10,  5,  5, 10, 10,  5,  5,-10,
            -10,  0, 10, 10, 10, 10,  0,-10,
            -10, 10, 10, 10, 10, 10, 10,-10,
            -10,  5,  0,  0,  0,  0,  5,-10,
            -20,-10,-10,-10,-10,-10,-10,-20
        ],

        r: [
             0,  0,  0,  5,  5,  0,  0,  0,
            -5,  0,  0,  0,  0,  0,  0, -5,
            -5,  0,  0,  0,  0,  0,  0, -5,
            -5,  0,  0,  0,  0,  0,  0, -5,
            -5,  0,  0,  0,  0,  0,  0, -5,
            -5,  0,  0,  0,  0,  0,  0, -5,
             5, 10, 10, 10, 10, 10, 10,  5,
             0,  0,  0,  0,  0,  0,  0,  0
        ],

        q: [
            -20,-10,-10, -5, -5,-10,-10,-20,
            -10,  0,  0,  0,  0,  0,  0,-10,
            -10,  0,  5,  5,  5,  5,  0,-10,
             -5,  0,  5,  5,  5,  5,  0, -5,
              0,  0,  5,  5,  5,  5,  0, -5,
            -10,  5,  5,  5,  5,  5,  0,-10,
            -10,  0,  5,  0,  0,  0,  0,-10,
            -20,-10,-10, -5, -5,-10,-10,-20
        ],

        k: [
            -30,-40,-40,-50,-50,-40,-40,-30,
            -30,-40,-40,-50,-50,-40,-40,-30,
            -30,-40,-40,-50,-50,-40,-40,-30,
            -30,-40,-40,-50,-50,-40,-40,-30,
            -20,-30,-30,-40,-40,-30,-30,-20,
            -10,-20,-20,-20,-20,-20,-20,-10,
             20, 20,  0,  0,  0,  0, 20, 20,
             20, 30, 10,  0,  0, 10, 30, 20
        ]
    };

    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            const piece = b[r][c];

            if (!piece) continue;

            const type = piece[1];
            const color = piece[0];

            const index =
                color === "w"
                    ? r * 8 + c
                    : (7 - r) * 8 + c;

            let value =
                values[type] +
                pieceTables[type][index];

            if (color === "w") {
                score += value;
            } else {
                score -= value;
            }
        }
    }

    return score;
}

function moveValue(b, move) {
    let score = 0;

    const attacker =
        b[move.from.r][move.from.c];

    const victim =
        b[move.to.r][move.to.c];

    if (victim) {
        score +=
            values[victim[1]] * 10 -
            values[attacker[1]];
    }

    if (move.enPassant) {
        score += 1000;
    }

    if (move.promotion) {
        score += values[move.promotion];
    }

    if (move.castle) {
        score += 50;
    }

    return score;
}

function orderMoves(b, moves) {
    return moves
        .map(move => ({
            move: move,
            score: moveValue(b, move)
        }))
        .sort((a, b) => b.score - a.score)
        .map(item => item.move);
}

let searchStart = 0;
let searchStopped = false;
let searchNodes = 0;

function minimax(
    b,
    color,
    rights,
    ep,
    depth,
    alpha,
    beta
) {
    searchNodes++;

    if (
        searchNodes % 300 === 0 &&
        performance.now() - searchStart >
        settings[difficulty].time
    ) {
        searchStopped = true;
        return 0;
    }

    const moves =
        getLegalMoves(
            b,
            color,
            rights,
            ep
        );

    if (moves.length === 0) {
        if (inCheck(b, color)) {
            if (color === "w") {
                return -1000000 - depth;
            }

            return 1000000 + depth;
        }

        return 0;
    }

    if (depth <= 0) {
        return evaluate(b);
    }

    const ordered =
        orderMoves(b, moves);

    if (color === "w") {
        let best = -Infinity;

        for (const move of ordered) {
            const state =
                applyMove(
                    b,
                    move,
                    rights,
                    ep
                );

            const score =
                minimax(
                    state.board,
                    "b",
                    state.rights,
                    state.ep,
                    depth - 1,
                    alpha,
                    beta
                );

            if (searchStopped) {
                return 0;
            }

            best = Math.max(best, score);
            alpha = Math.max(alpha, score);

            if (beta <= alpha) {
                break;
            }
        }

        return best;
    }

    let best = Infinity;

    for (const move of ordered) {
        const state =
            applyMove(
                b,
                move,
                rights,
                ep
            );

        const score =
            minimax(
                state.board,
                "w",
                state.rights,
                state.ep,
                depth - 1,
                alpha,
                beta
            );

        if (searchStopped) {
            return 0;
        }

        best = Math.min(best, score);
        beta = Math.min(beta, score);

        if (beta <= alpha) {
            break;
        }
    }

    return best;
}

function getBestMove() {
    const moves =
        getLegalMoves(
            board,
            turn,
            castling,
            enPassant
        );

    if (moves.length === 0) {
        return null;
    }

    searchStart = performance.now();
    searchStopped = false;
    searchNodes = 0;

    const ordered =
        orderMoves(board, moves);

    let bestMove = ordered[0];

    let bestScore =
        turn === "w"
            ? -Infinity
            : Infinity;

    const maxDepth =
        settings[difficulty].depth;

    for (
        let depth = 1;
        depth <= maxDepth;
        depth++
    ) {
        let currentBest = null;

        let currentScore =
            turn === "w"
                ? -Infinity
                : Infinity;

        for (const move of ordered) {
            const state =
                applyMove(
                    board,
                    move,
                    castling,
                    enPassant
                );

            const score =
                minimax(
                    state.board,
                    opposite(turn),
                    state.rights,
                    state.ep,
                    depth - 1,
                    -Infinity,
                    Infinity
                );

            if (searchStopped) {
                break;
            }

            if (turn === "w") {
                if (score > currentScore) {
                    currentScore = score;
                    currentBest = move;
                }
            } else {
                if (score < currentScore) {
                    currentScore = score;
                    currentBest = move;
                }
            }
        }

        if (searchStopped) {
            break;
        }

        if (currentBest) {
            bestMove = currentBest;
            bestScore = currentScore;
        }

        if (Math.abs(bestScore) > 900000) {
            break;
        }
    }

    if (difficulty === "easy") {
        const choices =
            ordered.slice(
                0,
                Math.min(4, ordered.length)
            );

        if (Math.random() < 0.35) {
            bestMove =
                choices[
                    Math.floor(
                        Math.random() *
                        choices.length
                    )
                ];
        }
    }

    return bestMove;
}

function makeMove(move) {
    const state = applyMove(
        board,
        move,
        castling,
        enPassant
    );

    board = state.board;
    castling = state.rights;
    enPassant = state.ep;

    turn = opposite(turn);
    selected = null;

    renderBoard();
    updateGame();
}

function choosePromotion() {
    const answer = prompt(
        "Promote to Queen, Rook, Bishop, or Knight:",
        "Queen"
    );

    if (!answer) {
        return "q";
    }

    const value = answer.toLowerCase();

    if (value.startsWith("r")) {
        return "r";
    }

    if (value.startsWith("b")) {
        return "b";
    }

    if (value.startsWith("n")) {
        return "n";
    }

    return "q";
}

function handleSquareClick(r, c) {
    if (gameOver || thinking) {
        return;
    }

    if (
        mode === "computer" &&
        turn !== playerColor
    ) {
        return;
    }

    const piece = board[r][c];

    if (selected) {
        const moves =
            getLegalMoves(
                board,
                turn,
                castling,
                enPassant
            );

        const move = moves.find(m =>
            m.from.r === selected.r &&
            m.from.c === selected.c &&
            m.to.r === r &&
            m.to.c === c
        );

        if (move) {
            if (move.promotion) {
                move.promotion =
                    choosePromotion();
            }

            makeMove(move);
            return;
        }

        if (
            piece &&
            piece[0] === turn
        ) {
            selected = {r, c};
            renderBoard();
            return;
        }

        selected = null;
        renderBoard();
        return;
    }

    if (
        piece &&
        piece[0] === turn
    ) {
        selected = {r, c};
        renderBoard();
    }
}

function updateGame() {
    const moves =
        getLegalMoves(
            board,
            turn,
            castling,
            enPassant
        );

    if (moves.length === 0) {
        gameOver = true;

        if (inCheck(board, turn)) {
            const winner =
                turn === "w"
                    ? "Black"
                    : "White";

            statusElement.textContent =
                "Checkmate — " +
                winner +
                " wins!";
        } else {
            statusElement.textContent =
                "Draw — Stalemate";
        }

        return;
    }

    if (inCheck(board, turn)) {
        statusElement.textContent =
            turn === playerColor
                ? "Check! Your turn"
                : "Check! Computer thinking...";
    } else {
        if (
            mode === "pvp" ||
            turn === playerColor
        ) {
            statusElement.textContent =
                "Your turn — " +
                (turn === "w"
                    ? "White"
                    : "Black");
        } else {
            statusElement.textContent =
                "Computer thinking...";
        }
    }

    if (
        mode === "computer" &&
        turn !== playerColor &&
        !thinking &&
        !gameOver
    ) {
        thinking = true;

        setTimeout(function() {
            const move = getBestMove();

            if (move && !gameOver) {
                makeMove(move);
            }

            thinking = false;

            if (!gameOver) {
                updateGame();
            }
        }, 80);
    }
}

function setGameMode(newMode) {
    mode = newMode;

    document
        .getElementById("computerMode")
        .classList.toggle(
            "active",
            mode === "computer"
        );

    document
        .getElementById("pvpMode")
        .classList.toggle(
            "active",
            mode === "pvp"
        );

    const options =
        document.getElementById(
            "computerOptions"
        );

    options.style.display =
        mode === "computer"
            ? "block"
            : "none";

    newGame();
}

function setPlayerColor(color) {
    playerColor = color;

    document
        .getElementById("white")
        .classList.toggle(
            "active",
            color === "w"
        );

    document
        .getElementById("black")
        .classList.toggle(
            "active",
            color === "b"
        );

    newGame();
}

function setDifficulty(level) {
    difficulty = level;

    document
        .getElementById("easy")
        .classList.toggle(
            "active",
            level === "easy"
        );

    document
        .getElementById("medium")
        .classList.toggle(
            "active",
            level === "medium"
        );

    document
        .getElementById("hard")
        .classList.toggle(
            "active",
            level === "hard"
        );

    newGame();
}

function newGame() {
    board = createInitialBoard();

    turn = "w";
    selected = null;
    thinking = false;
    gameOver = false;
    enPassant = null;

    castling = {
        wk: true,
        wq: true,
        bk: true,
        bq: true
    };

    renderBoard();

    if (
        mode === "computer" &&
        playerColor === "b"
    ) {
        statusElement.textContent =
            "Computer thinking...";

        thinking = true;

        setTimeout(function() {
            const move = getBestMove();

            if (move) {
                makeMove(move);
            }

            thinking = false;

            if (!gameOver) {
                updateGame();
            }
        }, 300);
    } else {
        statusElement.textContent =
            "Your turn — White";
    }
}

newGame();