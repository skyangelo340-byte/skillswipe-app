/**
 * SkillSwipe Firestore Security Rules — Phase 0 Payload-First TDD Test Specification
 * Verifies all "Dirty Dozen" adversarial payloads and core SkillSwipe invariants.
 * Run against the Firebase Emulator Suite (`firebase emulators:exec`) during CI/local security audits.
 */

export interface SecurityTestCase {
  id: number;
  name: string;
  actorUid: string | null;
  emailVerified: boolean;
  operation: 'get' | 'list' | 'create' | 'update' | 'delete';
  path: string;
  payload?: Record<string, unknown>;
  expected: 'PERMISSION_DENIED' | 'ALLOW';
  pillar: string;
}

export const DIRTY_DOZEN_SECURITY_TESTS: SecurityTestCase[] = [
  {
    id: 1,
    name: 'PII Read Leak — non-owner reading privateUsers/{uid}',
    actorUid: 'userB',
    emailVerified: true,
    operation: 'get',
    path: 'privateUsers/userA',
    expected: 'PERMISSION_DENIED',
    pillar: 'Pillar 6: PII Isolation',
  },
  {
    id: 2,
    name: 'Shadow Field Injection — extra isVerified field on publicProfiles',
    actorUid: 'userA',
    emailVerified: true,
    operation: 'create',
    path: 'publicProfiles/userA',
    payload: {
      uid: 'userA',
      displayName: 'Alex Rivera',
      bio: 'Learning acoustic guitar',
      photoUrl: '',
      useGooglePhoto: false,
      status: 'active',
      visibility: 'visible',
      languages: ['English'],
      timezone: 'UTC',
      availability: 'Weekends',
      isVerified: true,
    },
    expected: 'PERMISSION_DENIED',
    pillar: 'Pillar 2: Validation Blueprints (hasOnly)',
  },
  {
    id: 3,
    name: 'Forged Swipe — userA creating swipe on behalf of userB',
    actorUid: 'userA',
    emailVerified: true,
    operation: 'create',
    path: 'swipes/userB_userA_guitar',
    payload: {
      actorUid: 'userB',
      targetUid: 'userA',
      skillId: 'guitar',
      actorRole: 'mentor',
      decision: 'like',
    },
    expected: 'PERMISSION_DENIED',
    pillar: 'Pillar 2: Identity Integrity',
  },
  {
    id: 4,
    name: 'Self-Swipe — userA swiping right on themselves',
    actorUid: 'userA',
    emailVerified: true,
    operation: 'create',
    path: 'swipes/userA_userA_guitar',
    payload: {
      actorUid: 'userA',
      targetUid: 'userA',
      skillId: 'guitar',
      actorRole: 'learner',
      decision: 'like',
    },
    expected: 'PERMISSION_DENIED',
    pillar: 'Pillar 2: Validation Blueprints',
  },
  {
    id: 5,
    name: 'Peeking at Private Pass — userB reading userA pass swipe',
    actorUid: 'userB',
    emailVerified: true,
    operation: 'get',
    path: 'swipes/userA_userB_guitar',
    expected: 'PERMISSION_DENIED',
    pillar: 'Blueprint Invariant: Private Pass',
  },
  {
    id: 6,
    name: 'One-Sided Match Forgery — creating match without reciprocal like',
    actorUid: 'userA',
    emailVerified: true,
    operation: 'create',
    path: 'matches/userA_userB_guitar',
    payload: {
      matchId: 'userA_userB_guitar',
      participantIds: ['userA', 'userB'],
      mentorUid: 'userB',
      learnerUid: 'userA',
      mentorName: 'Sam',
      learnerName: 'Alex',
      skillId: 'guitar',
      skillName: 'Guitar',
      status: 'active',
    },
    expected: 'PERMISSION_DENIED',
    pillar: 'Blueprint Invariant: Mutual Consent',
  },
  {
    id: 7,
    name: 'Wrong-Skill Match Forgery — mismatched skills across swipes',
    actorUid: 'userA',
    emailVerified: true,
    operation: 'create',
    path: 'matches/userA_userB_guitar',
    expected: 'PERMISSION_DENIED',
    pillar: 'Blueprint Invariant: Same-Skill Match',
  },
  {
    id: 8,
    name: 'Same-Role Match Forgery — two learners trying to form a match',
    actorUid: 'userA',
    emailVerified: true,
    operation: 'create',
    path: 'matches/userA_userB_guitar',
    expected: 'PERMISSION_DENIED',
    pillar: 'Blueprint Invariant: Complementary Roles',
  },
  {
    id: 9,
    name: 'Third-Account Chat Eavesdropping — userC reading match messages',
    actorUid: 'userC',
    emailVerified: true,
    operation: 'list',
    path: 'matches/userA_userB_guitar/messages',
    expected: 'PERMISSION_DENIED',
    pillar: 'Pillar 1: Master Gate',
  },
  {
    id: 10,
    name: 'Post-Unmatch Messaging & Terminal State Bypass',
    actorUid: 'userA',
    emailVerified: true,
    operation: 'update',
    path: 'matches/userA_userB_guitar',
    payload: {
      status: 'active',
    },
    expected: 'PERMISSION_DENIED',
    pillar: 'Phase 4: Terminal State Locking',
  },
  {
    id: 11,
    name: 'Unauthorized Video Call Signaling — non-participant creating call',
    actorUid: 'userC',
    emailVerified: true,
    operation: 'create',
    path: 'calls/call_unauth_1',
    payload: {
      callId: 'call_unauth_1',
      matchId: 'userA_userB_guitar',
      initiatorUid: 'userC',
      recipientUid: 'userB',
      status: 'ringing',
    },
    expected: 'PERMISSION_DENIED',
    pillar: 'Pillar 1: Master Gate',
  },
  {
    id: 12,
    name: 'Resource Exhaustion — 2500-char chat message exceeding 1000-char limit',
    actorUid: 'userA',
    emailVerified: true,
    operation: 'create',
    path: 'matches/userA_userB_guitar/messages/msg_overflow',
    payload: {
      messageId: 'msg_overflow',
      senderUid: 'userA',
      text: 'x'.repeat(2500),
      type: 'text',
      clientNonce: 'nonce-1',
    },
    expected: 'PERMISSION_DENIED',
    pillar: 'Pillar 3: Boundary & Size Limits',
  },
];
