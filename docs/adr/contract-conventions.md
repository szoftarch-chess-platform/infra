# ADR-8: Data conventions of the contracts

**Related:** F-2, F-3, F-5, F-6, NF-8, X-1, [ADR-4](authentication.md), [ADR-6](service-communication.md), [ADR-7](contracts.md), [ADR-9](chess-rules.md), [ADR-10](live-game.md), PS-ADR-2, PS-ADR-5

## Context

The contracts are read and written in three languages. If every contract had its own style for names, times, ids, errors and chess notation, every consumer would have to convert, and the same game would look different in the Socket.IO events, in the broker event and in the history API.

## Decision

- **Names:** JSON fields, the values of enums and the names of the Socket.IO events are camelCase, such as `startedAt`, `threefoldRepetition` and `makeMove`.
- **Missing values:** a field without a value is left out, and `null` is not sent. A reader treats `null` like a missing field.
- **Times:** a timestamp is an RFC 3339 string. The writer sends it in UTC, and the reader accepts any offset. A duration is an integer number of milliseconds, and its name ends in `Ms`.
- **Ids:** UUIDs in lowercase canonical form. The ids of the users come from ADR-4. The game-service creates the id of a game as a UUID v7 when the game starts, and the id of an event is a UUID v7 too.
- **Errors of the HTTP APIs:** ProblemDetails of RFC 9457 in `application/problem+json`. The 401 of the gateway for a missing or invalid token and its 429 of the rate limit have no specified body.
- **Errors of Socket.IO:** the acknowledgement of a client event is `{ "ok": true, … }` or `{ "ok": false, "error": { "code": …, "message": … } }`. The `code` is a value from the list of the contract, and the `message` is English text for the logs.
- **Position:** FEN with all six fields.
- **Move:** UCI notation, which is the start square and the target square, such as `e2e4`. A promotion adds the new piece in lowercase, such as `e7e8q`, and castling is the move of the king, such as `e1g1`. A move history is the list of its UCI moves in order. SAN does not appear in the contracts.
- **Variant:** the messages about a game carry `variant`, whose only value is `standard`. The move request of the engine carries only the position, as ADR-6 decides.
- **Player:** an object with a `kind`. A user is `{ "kind": "user", "userId": …, "name": … }` with the user name, and the computer opponent is `{ "kind": "bot", "name": "Stockfish bot" }`.
- **Result:** `result` is `whiteWon`, `blackWon`, `draw` or `aborted`, and `reason` says why the game ended. ADR-10 decides the reasons.
- **Clock:** the time control is `{ "initialMs": … }`. A message sends the clock as the remaining time of each user at the moment of sending, with the color whose clock runs.

## Rationale

- camelCase is the usual style of JSON in JavaScript, and PS-ADR-2 already uses it for the fields. With the same style for the values of enums and for the events there is only one rule, and System.Text.Json writes enums this way with its camelCase naming policy.
- `JSON.stringify` drops fields without a value, and System.Text.Json can skip `null` when it writes. A reader that also accepts `null` works with both.
- `toISOString` of JavaScript writes `Z`, while System.Text.Json writes `+00:00` for a `DateTimeOffset` in UTC. Both are valid RFC 3339, so the reader has to accept any offset.
- Milliseconds as integers match `Date.now` and the timers of JavaScript, and they need no parsing.
- A UUID v7 is ordered by time like the user ids of ADR-4, and any instance of the game-service can create one without a central sequence.
- The platform-service already answers with ProblemDetails (PS-ADR-5), so both HTTP APIs have one error format. The gateway answers 401 itself without reaching a service, and the client reacts to the status only, as ADR-4 describes.
- Socket.IO has no status codes. The client has to react to some refusals, for example by putting the piece back after `illegalMove`, so it needs a fixed list of codes.
- chess.js reads and writes FEN, and its verbose moves carry the UCI form of the move in `lan`. Stockfish speaks UCI. So the client move, the engine move and the stored history have the same form, and no service converts between notations.
- The team does not show SAN in the first version. The frontend can derive it from the moves with chess.js if it is needed later.
- A new game mode adds a value of `variant` and an optional field to the move request, which are compatible changes by ADR-7 (NF-8).
- The bot is not a user and has no id. Its name contains a space, which the user name rule of ADR-4 does not allow, so no user can appear as the bot.
- The clients count down from the moment the message arrives, so the clocks of the machines do not have to agree. A deadline as a timestamp of the server would need synchronized clocks.

## Rejected alternatives

- **PascalCase enum values, as the platform-service writes them now:** the readers in JavaScript would need a second naming rule.
- **`null` for missing values:** two ways to say the same thing.
- **Results in PGN form, such as `1-0`:** familiar to chess players, but they cannot express an aborted game, and `1/2-1/2` is awkward as an enum value.
- **Move as an object with `from`, `to` and `promotion`:** closer to the API of chess.js, but it would be a second notation next to the UCI of the engine.
- **SAN in the history:** the platform-service would need a chess library in C#, or the game-service would have to compute it for every move.
- **Clock as deadlines in server time:** it would need synchronized clocks on the client machines.

## Consequences

- The platform-service writes its enums in camelCase, which PS-ADR-2 follows.
- The frontend replays the UCI moves with chess.js to show a position or a move list (ADR-9).
- A second kind of computer opponent, such as a bot of another strength, needs a new `name` or a new field of the bot player, which is a compatible change.

## Sources

- RFC 3339, Date and Time on the Internet: https://www.rfc-editor.org/rfc/rfc3339
- RFC 9457, Problem Details for HTTP APIs: https://www.rfc-editor.org/rfc/rfc9457
- RFC 9562, UUID v7: https://www.rfc-editor.org/rfc/rfc9562
- Enums as strings in System.Text.Json: https://learn.microsoft.com/dotnet/standard/serialization/system-text-json/customize-properties#enums-as-strings
- Socket.IO acknowledgements: https://socket.io/docs/v4/emitting-events/#acknowledgements
- chess.js documentation: https://jhlywa.github.io/chess.js/
- Forsyth-Edwards Notation: https://www.chessprogramming.org/Forsyth-Edwards_Notation
- UCI: https://www.chessprogramming.org/UCI
