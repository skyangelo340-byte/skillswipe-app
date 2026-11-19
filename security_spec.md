# SkillSwipe Security Specification (Phase 0 — Payload-First TDD)

## 1. Data Invariants
1. **PII Isolation**: `privateUsers/{uid}` (containing `email`, `ageConfirmed18Plus`, `termsAccepted`) is strictly owner-only (`request.auth.uid == uid`). No email or auth token is ever stored in `publicProfiles/{uid}` or `userSkills/{id}`.
2. **Verified Identity**: All write operations require `request.auth != null && request.auth.token.email_verified == true`.
3. **Deterministic Pair Swipes**: `swipes/{actorUid}_{targetUid}` can only be created by `actorUid == request.auth.uid`, cannot target self (`actorUid != targetUid`), and private `pass` decisions are never readable by the target user.
4. **Canonical Mutual Skill-Swap Matching**: `matches/{minUid}_{maxUid}` can only be created when:
   - Both `swipes/{user1Uid}_{user2Uid}` (`decision == 'like'`) and `swipes/{user2Uid}_{user1Uid}` (`decision == 'like'`) exist, meaning each person wants to learn the other person's skill.
   - Neither user has blocked the other (`blocks/{user1}_{user2}` and `blocks/{user2}_{user1}` do not exist).
   - `matchId` matches the exact canonical sorted key `${user1Uid}_${user2Uid}` where `user1Uid < user2Uid`.
5. **Master Gate Messaging & Calls**: Reading or sending messages in `matches/{matchId}/messages/{messageId}` and signaling calls in `calls/{callId}` require the parent match to exist with `status == 'active'` and `request.auth.uid in participantIds`.
6. **Terminal State Locking**: Once a `match` reaches `status: 'unmatched'` or `'blocked'`, or a `call` reaches `'declined' | 'ended' | 'timeout' | 'busy' | 'failed'`, no subsequent client mutations are permitted.
7. **Strict Timestamps & Schema**: Every `createdAt` must equal `request.time`, every `updatedAt` must equal `request.time`, every string has explicit `.size()` bounds, and every document enforces strict `hasAll` + `hasOnly` / `affectedKeys().hasOnly()`.

## 2. The "Dirty Dozen" Adversarial Payloads (Must Return PERMISSION_DENIED)
1. **PII Read Leak**: User B calls `get /privateUsers/userA` -> DENIED.
2. **Shadow Field Injection on Profile**: User A creates `/publicProfiles/userA` with extra field `isVerified: true` -> DENIED (`hasOnly`).
3. **Forged Swipe (Identity Spoofing)**: User A tries to create `/swipes/userB_userA_guitar` with `actorUid: "userB"` -> DENIED.
4. **Self-Swipe**: User A creates `/swipes/userA_userA_guitar` -> DENIED (`targetUid != actorUid`).
5. **Peeking at Private Pass**: User B tries to `get /swipes/userA_userB_guitar` where `decision == "pass"` -> DENIED.
6. **One-Sided Match Forgery**: User A likes User B for `guitar`, User B has NOT liked User A, and User A tries to `create /matches/userA_userB_guitar` -> DENIED.
7. **Wrong-Skill Match Forgery**: User A likes User B for `guitar`, User B likes User A for `python`, and User A tries to `create /matches/userA_userB_guitar` -> DENIED.
8. **Same-Role Match Forgery**: Both User A and User B swipe right as `learner` for `guitar` and attempt to create a match -> DENIED (complementary roles required).
9. **Third-Account Chat Eavesdropping**: User C (not in `participantIds`) attempts to read or write `/matches/userA_userB_guitar/messages/m1` -> DENIED.
10. **Post-Unmatch Messaging**: Match status is `'unmatched'`, User A tries to send a message or reactivate the match to `'active'` -> DENIED (Master Gate + Terminal State Lock).
11. **Unauthorized Video Call Signaling**: User C or an unmatched user attempts to create `/calls/call1` or add ICE candidate `/calls/call1/signals/s1` -> DENIED.
12. **Resource Exhaustion / ID Poisoning**: User A submits a 2,500-character chat message or a 200-character junk document ID -> DENIED (`isValidId` & `.size()` bounds).
