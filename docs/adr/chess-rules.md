# ADR-9: chess.js for the rules of chess

**Related:** F-3, F-4, F-5, F-6, NF-8, [ADR-1](microservices.md), [ADR-8](contract-conventions.md), [ADR-10](live-game.md)

## Context

ADR-1 decides that an external library checks the rules of chess, and that the game-service is the authority on the state of a game. F-5 requires that the board highlights the legal moves of a selected piece, and F-6 that a user can view a past game with its moves. The game-service and the frontend are both written in TypeScript.

## Decision

- The game-service and the frontend use chess.js 1.x, and they upgrade it together.
- The game-service checks every move with chess.js, keeps the position with it, and decides with it whether the game has ended.
- The frontend computes the legal moves of the selected piece with chess.js, and it replays the moves of a game to show its positions. It does not decide on legality, so the game-service can still reject a move that the frontend offered.
- The contracts carry no list of legal moves.

## Rationale

- The team decided that the game-service only checks the moves, and the frontend computes the moves that it highlights.
- chess.js is written in TypeScript and ships its types. It supports ESM and CommonJS, it is under the BSD-2-Clause license, and it is maintained, with version 1.4.0 in June 2026.
- It recognizes checkmate, stalemate, threefold repetition, the fifty-move rule and insufficient material, which ADR-10 needs. It validates FEN, lists the legal moves of one square, and throws on an illegal move.
- With the same library on both sides, the highlighted moves are the moves that the game-service accepts.
- The highlight needs no round trip to the server, and the messages stay small.

## Rejected alternatives

- **chessops:** also TypeScript, and it supports variants such as Chess960, which are not needed. It is under GPL-3.0-or-later, while the images of the services are published.
- **Legal moves from the game-service with every position:** the frontend would need no chess library, but every message would grow, and the frontend would still have to replay the moves of a past game.

## Consequences

- The documentation of chess.js mentions no Chess960. A new variant of NF-8 may need another library or an extension of it.
- `isDraw()` covers the fifty-move rule and insufficient material but not threefold repetition, so the game-service checks `isThreefoldRepetition()` too, or it uses `isGameOver()`.
- `move()` throws on an illegal move, and the game-service answers it with `illegalMove`.
- chess.js does not know the clock, so the game-service decides the end on time by ADR-10 on its own.
- To do: chess.js goes into the game-service and the frontend.

## Sources

- chess.js: https://github.com/jhlywa/chess.js
- chess.js documentation: https://jhlywa.github.io/chess.js/
- chess.js releases: https://github.com/jhlywa/chess.js/releases
- chessops: https://github.com/niklasf/chessops
