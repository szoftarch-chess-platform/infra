# ADR-10: Rules of a live game

**Related:** F-2, F-4, F-6, NF-3, X-1, [ADR-1](microservices.md), [ADR-3](api-gateway.md), [ADR-6](service-communication.md), [ADR-7](contracts.md), [ADR-8](contract-conventions.md), [ADR-9](chess-rules.md), ES-ADR-2

## Context

The specification requires that a user can play a random online user or the AI (F-2), and that every event of the game follows the rules of chess (F-4). It does not say how many games a user may play at once, how draws are decided, or what happens when a player leaves. These rules shape the events of the game-service and the reasons of the end in the history.

## Decision

- **One game at a time:** a user is free, waits in the queue, or plays one game. A user who waits or plays can neither join the queue nor start a game against the bot.
- **Pairing:** the queue pairs the two users who have waited the longest. A waiting user can leave the queue at any time, and leaves it when the last connection of the user closes, so a reload or a short loss of the connection also ends the waiting.
- **Game against the bot:** it starts at once. The bot is the engine of ES-ADR-2 behind the engine-service.
- **Colors:** drawn at random for every game, also against the bot.
- **Clock:** every user has 10 minutes for the whole game, without increment. The clock of white starts with the game, and after every move the clock of the other side runs. The bot has no clock, and the clock of its opponent stops while the bot thinks.
- **End on time:** a user whose time runs out loses. The game is a draw instead if the opponent has only the king, or the king and a single bishop or knight.
- **Leaving:** a disconnected player has no rule of its own. The clock of the player runs on, and the player can connect again and continue.
- **Draws:** stalemate, threefold repetition, the fifty-move rule and insufficient material end the game as a draw at once. There are no draw offers and no claims.
- **Resignation:** a player can resign at any time, against the bot too.
- **Failure of the engine:** if the engine-service does not answer the repeated request either (ADR-6), the game ends as aborted.
- **Connections:** a user can have several connections, for example in several tabs. Every connection gets the events of the game, and a move counts from any of them.
- **History:** every finished game goes into the history of its players, the games against the bot and the aborted games included.
- **Reasons of the end:** `checkmate`, `resignation`, `timeout`, `stalemate`, `threefoldRepetition`, `fiftyMoveRule`, `insufficientMaterial` and `engineFailure`. A timeout is a win or a draw, as the result says.

## Rationale

- The team decided on one game at a time, on leaving the queue, also with the last connection, on random colors, on a clock instead of a separate rule for leaving, on automatic draws by threefold repetition, on resignation without draw offers, and on games against the bot in the history like the other games.
- With one game at a time, the client never has to switch between games, and `getState` returns at most one game.
- The clock is the X-1 extra feature. With it, a player who has left loses on time, and the game-service does not have to know who is connected to a game. 10 minutes without increment is the simplest time control that leaves time for thinking.
- A user who closes the tab or signs out while waiting would still be paired, and the opponent would wait up to 10 minutes for an absent player. The game-service learns when a connection closes, and it checks then whether the user has another one.
- The engine may think up to 10 seconds per move by its contract, which would use up a fixed clock in a long game. The opponent of the bot does not lose time while waiting for it.
- Article 6.9 of the FIDE Laws of Chess draws the game when the opponent cannot checkmate by any series of legal moves. A lone king, or a king with a single bishop or knight, is the simple and safe part of that rule.
- The FIDE Laws draw by threefold repetition and by the fifty-move rule only on a claim (9.2 and 9.3), and automatically only after five repetitions or 75 moves (9.6). Without claims a player could not end such a game, so both rules end it at once. chess.js reports both.
- Without a clock for the bot, a game whose engine does not answer would wait forever. As an aborted game it ends, and it shows up in the history.
- A reload or a second tab works without a special case, because the events of a game go to every connection of its players.

## Rejected alternatives

- **Keeping the place in the queue for a few seconds after the last connection closes:** a reload would keep the waiting, but ADR-3 keeps no state in the memory of the process, so the delayed removal would need a timer in Redis that any instance runs, and in those seconds an absent user could still be paired.
- **Leaving the queue only with `leaveQueue`:** a closed tab would leave its user in the queue.
- **Losing after 30 seconds of inactivity or disconnection:** the game-service would have to follow on every instance who is connected, and the clock already ends an abandoned game.
- **A limit of 30 seconds per move:** simpler than a clock, but it is not the chess clock of X-1.
- **A clock for the bot too:** the fixed thinking time of the engine would decide long games on time.
- **Draw claims as in the FIDE Laws:** they would need new events and controls for a rare situation.
- **Draw offers:** the team does not need them for now. They can come later as new events, which are compatible by ADR-7.

## Consequences

- X-1 is part of the first version (ADR-1).
- The game-service has to end a game whose clock runs out even if no event arrives. ADR-3 keeps no state in the memory of the process, so any instance has to be able to do it.
- A user whose opponent has left waits until the time of the opponent runs out, at most 10 minutes, or resigns.
- After a reload or a lost connection the user finds the lobby free and joins the queue again.
- With several instances the game-service sees the connections of a user on the other instances only through the Redis adapter of ADR-3. Without it a user with connections on two instances leaves the queue when one of them closes.
- The 10 minutes are a value of the game-service. Other time controls would come with the `timeControl` of the contracts.

## Sources

- FIDE Laws of Chess taking effect from 1 January 2023: https://handbook.fide.com/chapter/E012023
