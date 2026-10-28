# Security Specification (`security_spec.md`)

## 1. Data Invariants
1. **Global Default Deny**: Any path not explicitly matched in `firestore.rules` is denied for both `read` and `write`.
2. **Verified Authentication**: All write operations require `request.auth != null && request.auth.token.email_verified == true`.
3. **CloudSave Isolation (`/saves/{userId}`)**:
   - Only the authenticated owner (`request.auth.uid == userId`) can `get`, `create`, `update`, or `delete` their save document.
   - `list` is completely disabled on `/saves/{userId}` to prevent scraping player save states.
   - `uid` and `createdAt` are immutable across updates; `updatedAt` must equal `request.time`.
   - Zero PII (`email`, `phone`, `address`) is stored in `/saves/{userId}`.
4. **Leaderboard Integrity (`/leaderboard/{entryId}`)**:
   - `get` and `list` require `resource.data.score >= 0 && resource.data.score <= 100000000`.
   - `create` and `update` require verified auth, `incoming().uid == request.auth.uid`, valid schema bounds, and `request.time` timestamps.
   - On `update`, `uid` and `createdAt` are immutable and only allowlisted score/run fields can change via `affectedKeys().hasOnly(...)`.
5. **Chat Message Integrity (`/chatMessages/{messageId}`)**:
   - `get` and `list` require `resource.data.channel in ['global', 'gilde', 'ereignisse']`.
   - `create` requires verified auth, `incoming().uid == request.auth.uid`, `text.size() >= 1 && text.size() <= 280`, and `incoming().createdAt == request.time`.
   - Chat messages are immutable once posted (`allow update: if false`), and only the author can `delete` their own message.

## 2. The "Dirty Dozen" Payloads
1. **Unauthenticated CloudSave Write**: `auth = null` attempting `setDoc('/saves/user_1', validSave)` -> `PERMISSION_DENIED`.
2. **Unverified Email Write**: `auth = { uid: 'user_1', email_verified: false }` attempting `setDoc('/saves/user_1', validSave)` -> `PERMISSION_DENIED`.
3. **Cross-User CloudSave Read (PII/Privacy Guard)**: `auth = { uid: 'attacker', email_verified: true }` attempting `getDoc('/saves/victim')` -> `PERMISSION_DENIED`.
4. **Identity Spoofing on Leaderboard**: `auth = { uid: 'attacker' }` creating `/leaderboard/run_1` with `uid: 'victim'` -> `PERMISSION_DENIED`.
5. **Shadow Field Injection ("Ghost Field")**: Adding `isAdmin: true` to `/saves/user_1` on create or update -> `PERMISSION_DENIED`.
6. **Denial-of-Wallet Oversized ID**: Creating `/chatMessages/` with a 300-character ID or invalid characters (`id.matches('^[a-zA-Z0-9_\\-]+$')` violation) -> `PERMISSION_DENIED`.
7. **Denial-of-Wallet 1MB String Payload**: Creating `/chatMessages/msg_1` with a 5000-character `text` string (`maxLength: 280`) -> `PERMISSION_DENIED`.
8. **Timestamp Forgery (Temporal Integrity)**: Creating `/leaderboard/run_1` with a past or future client `createdAt` instead of `request.time` -> `PERMISSION_DENIED`.
9. **Immortal Field Mutation**: Updating `/saves/user_1` while mutating `createdAt` or `uid` -> `PERMISSION_DENIED`.
10. **Value Poisoning on Update**: Updating `/leaderboard/run_1` with `score: "not-a-number"` or negative `score: -500` -> `PERMISSION_DENIED`.
11. **Chat Message Mutation**: Attempting to `updateDoc` an existing `/chatMessages/msg_1` document -> `PERMISSION_DENIED`.
12. **Unbounded Collection Scraping**: Attempting to `list` `/saves` collection -> `PERMISSION_DENIED`.
