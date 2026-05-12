# Security Specification: QuizSpark

## Data Invariants
1. A **Question** must always belong to a **Quiz**.
2. A **Player** must have a unique ID (UID) within a **GameSession**.
3. A **Response** must link a **Player UID** and a **Question Index**.
4. **Scores** can only increase (except by admins if that feature existed).
5. **Game PINs** must be 6 digits and active only in the `LOBBY` state.
6. **Timestamps** (create/update) must use server time.

## The Dirty Dozen (Attack Scenarios)

1. **Identity Spoofing**: Player A submits a response for Player B by changing the `uid` in the payload.
2. **Score Inflation**: Player submits a response with `score: 999999`.
3. **State Skip**: Player joins a game that is already in `QUESTION` state instead of `LOBBY`.
4. **Orphaned Write**: Player submits a response for a `sessionID` that doesn't exist.
5. **Ghost Field Injection**: Adding a `isAdmin: true` field to a Player document.
6. **Self-Promotion**: A player document update that changes its own name after joining.
7. **Time Travel**: Submitting a response after the `questionEndsAt` timestamp.
8. **Double Answer**: Submitting two responses for the same question index.
9. **Unauthorized State Control**: Player A tries to update `game_session.status` to `FINAL`.
10. **Quiz Piracy**: Deleting a Quiz created by another user.
11. **Resource Exhaustion**: Creating a player name that is 1MB in size.
12. **Id Poisoning**: Using a 2KB junk string as a `sessionId`.

## Validation Logic Requirements
- `isValidQuiz`: Title length <= 200, creatorId matches auth.
- `isValidSession`: Pin logic, status enum, hostId match auth.
- `isValidPlayer`: Name length <= 64, initial score 0.
- `isValidResponse`: Correct types, question index match, timestamp logic.
