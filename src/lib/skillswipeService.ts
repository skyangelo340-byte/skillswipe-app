import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  increment,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  startAfter,
  updateDoc,
  where,
  writeBatch,
  type QueryDocumentSnapshot,
  type DocumentData,
} from 'firebase/firestore';
import { deleteUser, reauthenticateWithPopup, type User } from 'firebase/auth';
import { auth, db, googleProvider, handleFirestoreError, OperationType } from './firebase';
import {
  getCanonicalMatchId,
  getSortedParticipants,
  LIMITS,
  SKILL_CATALOG,
  type ChatMessage,
  type MatchRecord,
  type PrivateUser,
  type ProfileStatus,
  type ProfileVisibility,
  type PublicProfile,
  type ReportReason,
  type SkillLevel,
  type SkillRole,
  type SwipeDecision,
  type UserSkill,
} from '../types/skillswipe';

export interface SkillDraftInput {
  skillId: string;
  skillName: string;
  role: SkillRole;
  level: SkillLevel;
  description: string;
  availability: string;
}

function clampString(val: string, max: number): string {
  return val.trim().slice(0, max);
}

function clampLanguages(languages: string[]): string[] {
  const unique = Array.from(
    new Set(
      languages
        .map((lang) => lang.trim().slice(0, 40))
        .filter((lang) => lang.length > 0)
    )
  );
  return unique.slice(0, LIMITS.LANGUAGES_MAX);
}

function defaultTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone.slice(0, LIMITS.TIMEZONE_MAX) || 'UTC';
  } catch {
    return 'UTC';
  }
}

/**
 * Fetches privateUsers/{uid} and publicProfiles/{uid} for an authenticated user.
 * Does NOT create ghost profiles if sign-in failed or was cancelled.
 */
export async function fetchUserAccountState(uid: string): Promise<{
  privateUser: PrivateUser | null;
  publicProfile: PublicProfile | null;
}> {
  const privatePath = `privateUsers/${uid}`;
  const publicPath = `publicProfiles/${uid}`;
  try {
    const [privateSnap, publicSnap] = await Promise.all([
      getDoc(doc(db, 'privateUsers', uid)),
      getDoc(doc(db, 'publicProfiles', uid)),
    ]);
    return {
      privateUser: privateSnap.exists() ? (privateSnap.data() as PrivateUser) : null,
      publicProfile: publicSnap.exists() ? (publicSnap.data() as PublicProfile) : null,
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, `${privatePath} | ${publicPath}`);
  }
}

/**
 * Idempotently initializes privateUsers/{uid} on first confirmed Google login
 * while keeping onboardingComplete = false until consent & skills are completed.
 */
export async function ensureInitialPrivateRecord(user: User): Promise<PrivateUser> {
  const ref = doc(db, 'privateUsers', user.uid);
  const path = `privateUsers/${user.uid}`;
  try {
    const snap = await getDoc(ref);
    if (snap.exists()) {
      return snap.data() as PrivateUser;
    }
    const payload = {
      uid: user.uid,
      email: clampString(user.email || '', 160),
      ageConfirmed18Plus: false,
      termsAccepted: false,
      onboardingComplete: false,
      notificationsEnabled: true,
      reducedMotion: false,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    await setDoc(ref, payload);
    const created = await getDoc(ref);
    return created.data() as PrivateUser;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

/**
 * Atomically completes onboarding: updates privateUsers/{uid}, creates/updates
 * publicProfiles/{uid}, and publishes all chosen learn/teach userSkills cards.
 */
export async function completeUserOnboarding(params: {
  user: User;
  displayName: string;
  bio: string;
  useGooglePhoto: boolean;
  languages: string[];
  timezone: string;
  availability: string;
  skills: SkillDraftInput[];
  ageConfirmed18Plus: boolean;
  termsAccepted: boolean;
}): Promise<void> {
  const { user } = params;
  const uid = user.uid;
  const displayName = clampString(params.displayName, LIMITS.DISPLAY_NAME_MAX);
  if (displayName.length < LIMITS.DISPLAY_NAME_MIN) {
    throw new Error('Display name must be at least 2 characters.');
  }
  if (!params.ageConfirmed18Plus || !params.termsAccepted) {
    throw new Error('18+ age confirmation and community terms acceptance are required.');
  }
  if (params.skills.length === 0) {
    throw new Error('Add at least one skill to learn or teach.');
  }

  const bio = clampString(params.bio, LIMITS.BIO_MAX);
  const photoUrl = params.useGooglePhoto ? clampString(user.photoURL || '', 500) : '';
  const languages = clampLanguages(params.languages.length > 0 ? params.languages : ['English']);
  const timezone = clampString(params.timezone || defaultTimezone(), LIMITS.TIMEZONE_MAX);
  const availability = clampString(params.availability || 'Flexible schedule', LIMITS.AVAILABILITY_MAX);

  try {
    const [existingPrivate, existingPublic] = await Promise.all([
      getDoc(doc(db, 'privateUsers', uid)),
      getDoc(doc(db, 'publicProfiles', uid)),
    ]);

    const batch = writeBatch(db);

    if (existingPrivate.exists()) {
      batch.update(doc(db, 'privateUsers', uid), {
        email: clampString(user.email || '', 160),
        ageConfirmed18Plus: true,
        termsAccepted: true,
        onboardingComplete: true,
        updatedAt: serverTimestamp(),
      });
    } else {
      batch.set(doc(db, 'privateUsers', uid), {
        uid,
        email: clampString(user.email || '', 160),
        ageConfirmed18Plus: true,
        termsAccepted: true,
        onboardingComplete: true,
        notificationsEnabled: true,
        reducedMotion: false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }

    if (existingPublic.exists()) {
      batch.update(doc(db, 'publicProfiles', uid), {
        displayName,
        bio,
        photoUrl,
        useGooglePhoto: params.useGooglePhoto,
        status: 'active',
        visibility: 'visible',
        languages,
        timezone,
        availability,
        updatedAt: serverTimestamp(),
      });
    } else {
      batch.set(doc(db, 'publicProfiles', uid), {
        uid,
        displayName,
        bio,
        photoUrl,
        useGooglePhoto: params.useGooglePhoto,
        status: 'active',
        visibility: 'visible',
        languages,
        timezone,
        availability,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }

    for (const skill of params.skills) {
      const docId = `${uid}_${skill.skillId}_${skill.role}`;
      const existingSkill = await getDoc(doc(db, 'userSkills', docId));
      const skillAvail = clampString(skill.availability || availability, LIMITS.AVAILABILITY_MAX);
      const skillDesc = clampString(skill.description, LIMITS.SKILL_DESC_MAX);
      if (existingSkill.exists()) {
        batch.update(doc(db, 'userSkills', docId), {
          skillName: clampString(skill.skillName, 60),
          level: skill.level,
          description: skillDesc,
          availability: skillAvail,
          languages,
          timezone,
          displayName,
          photoUrl,
          bio,
          visible: true,
          updatedAt: serverTimestamp(),
        });
      } else {
        batch.set(doc(db, 'userSkills', docId), {
          uid,
          skillId: skill.skillId,
          skillName: clampString(skill.skillName, 60),
          role: skill.role,
          level: skill.level,
          description: skillDesc,
          availability: skillAvail,
          languages,
          timezone,
          displayName,
          photoUrl,
          bio,
          visible: true,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
    }

    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `onboarding/${uid}`);
  }
}

export async function updatePublicProfileAndSyncSkills(params: {
  uid: string;
  googlePhotoUrl: string;
  displayName: string;
  bio: string;
  useGooglePhoto: boolean;
  status: ProfileStatus;
  visibility: ProfileVisibility;
  languages: string[];
  timezone: string;
  availability: string;
  mySkills: UserSkill[];
}): Promise<void> {
  const { uid } = params;
  const displayName = clampString(params.displayName, LIMITS.DISPLAY_NAME_MAX);
  const bio = clampString(params.bio, LIMITS.BIO_MAX);
  const photoUrl = params.useGooglePhoto ? clampString(params.googlePhotoUrl, 500) : '';
  const languages = clampLanguages(params.languages.length > 0 ? params.languages : ['English']);
  const timezone = clampString(params.timezone || defaultTimezone(), LIMITS.TIMEZONE_MAX);
  const availability = clampString(params.availability, LIMITS.AVAILABILITY_MAX);
  const isDiscoverable = params.status === 'active' && params.visibility === 'visible';

  try {
    const batch = writeBatch(db);
    batch.update(doc(db, 'publicProfiles', uid), {
      displayName,
      bio,
      photoUrl,
      useGooglePhoto: params.useGooglePhoto,
      status: params.status,
      visibility: params.visibility,
      languages,
      timezone,
      availability,
      updatedAt: serverTimestamp(),
    });

    for (const skill of params.mySkills) {
      const docId = `${uid}_${skill.skillId}_${skill.role}`;
      batch.update(doc(db, 'userSkills', docId), {
        displayName,
        photoUrl,
        bio,
        languages,
        timezone,
        visible: isDiscoverable,
        updatedAt: serverTimestamp(),
      });
    }

    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `publicProfiles/${uid}`);
  }
}

export async function upsertUserSkill(
  profile: PublicProfile,
  draft: SkillDraftInput
): Promise<void> {
  const docId = `${profile.uid}_${draft.skillId}_${draft.role}`;
  const path = `userSkills/${docId}`;
  const visible = profile.status === 'active' && profile.visibility === 'visible';

  try {
    const ref = doc(db, 'userSkills', docId);
    const snap = await getDoc(ref);
    if (snap.exists()) {
      await updateDoc(ref, {
        skillName: clampString(draft.skillName, 60),
        level: draft.level,
        description: clampString(draft.description, LIMITS.SKILL_DESC_MAX),
        availability: clampString(draft.availability || profile.availability, LIMITS.AVAILABILITY_MAX),
        languages: clampLanguages(profile.languages),
        timezone: clampString(profile.timezone, LIMITS.TIMEZONE_MAX),
        displayName: clampString(profile.displayName, LIMITS.DISPLAY_NAME_MAX),
        photoUrl: clampString(profile.photoUrl, 500),
        bio: clampString(profile.bio, LIMITS.BIO_MAX),
        visible,
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(ref, {
        uid: profile.uid,
        skillId: draft.skillId,
        skillName: clampString(draft.skillName, 60),
        role: draft.role,
        level: draft.level,
        description: clampString(draft.description, LIMITS.SKILL_DESC_MAX),
        availability: clampString(draft.availability || profile.availability, LIMITS.AVAILABILITY_MAX),
        languages: clampLanguages(profile.languages),
        timezone: clampString(profile.timezone, LIMITS.TIMEZONE_MAX),
        displayName: clampString(profile.displayName, LIMITS.DISPLAY_NAME_MAX),
        photoUrl: clampString(profile.photoUrl, 500),
        bio: clampString(profile.bio, LIMITS.BIO_MAX),
        visible,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function removeUserSkill(uid: string, skillId: string, role: SkillRole): Promise<void> {
  const docId = `${uid}_${skillId}_${role}`;
  try {
    await deleteDoc(doc(db, 'userSkills', docId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `userSkills/${docId}`);
  }
}

export async function updatePrivatePreferences(
  uid: string,
  prefs: { notificationsEnabled: boolean; reducedMotion: boolean }
): Promise<void> {
  try {
    await updateDoc(doc(db, 'privateUsers', uid), {
      notificationsEnabled: prefs.notificationsEnabled,
      reducedMotion: prefs.reducedMotion,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `privateUsers/${uid}`);
  }
}

/**
 * Core Mutual Skill-Swap Matching Engine:
 * - Persists actor's swipe at swipes/{actorUid}_{targetUid}.
 * - Left swipe (pass): private, silent, no notification, no match.
 * - Right swipe (like): means actor wants to learn target's skill.
 *   Checks if target also swiped right on actor (swipes/{targetUid}_{actorUid}).
 *   If both liked each other and neither blocked, creates ONE deterministic canonical
 *   match at matches/{user1Uid}_{user2Uid} recording both users' shared skills.
 */
export async function submitSwipeAndCheckMatch(params: {
  actorProfile: PublicProfile;
  actorPrimarySkillName: string;
  targetCard: UserSkill;
  decision: SwipeDecision;
}): Promise<{ matched: boolean; match?: MatchRecord }> {
  const { actorProfile, actorPrimarySkillName, targetCard, decision } = params;
  const actorUid = actorProfile.uid;
  const targetUid = targetCard.uid;

  if (actorUid === targetUid) {
    throw new Error('Cannot swipe on your own card.');
  }

  const swipeId = `${actorUid}_${targetUid}`;
  const swipeRef = doc(db, 'swipes', swipeId);

  try {
    const existingSwipe = await getDoc(swipeRef);
    if (!existingSwipe.exists()) {
      await setDoc(swipeRef, {
        actorUid,
        targetUid,
        skillId: targetCard.skillId,
        skillName: clampString(targetCard.skillName, 60),
        decision,
        createdAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `swipes/${swipeId}`);
  }

  if (decision === 'pass') {
    return { matched: false };
  }

  // Check reciprocal swipe: rules allow reading ONLY if target already liked actor
  const reciprocalSwipeId = `${targetUid}_${actorUid}`;
  let reciprocalLikeSkillName = '';
  try {
    const reciprocalSnap = await getDoc(doc(db, 'swipes', reciprocalSwipeId));
    if (!reciprocalSnap.exists() || reciprocalSnap.data().decision !== 'like') {
      return { matched: false };
    }
    reciprocalLikeSkillName = clampString(
      String(reciprocalSnap.data().skillName || actorPrimarySkillName || 'Skill exchange'),
      60
    );
  } catch {
    // Permission denied means target passed or has not liked us — never expose their private decision
    return { matched: false };
  }

  // Deterministic canonical pair match creation
  const matchId = getCanonicalMatchId(actorUid, targetUid);
  const matchRef = doc(db, 'matches', matchId);
  const participantIds = getSortedParticipants(actorUid, targetUid);

  const actorIsUser1 = participantIds[0] === actorUid;
  const actorName = clampString(actorProfile.displayName, LIMITS.DISPLAY_NAME_MAX);
  const targetName = clampString(targetCard.displayName, LIMITS.DISPLAY_NAME_MAX);
  const actorSkill = clampString(
    reciprocalLikeSkillName || actorPrimarySkillName || 'Skill exchange',
    60
  );
  const targetSkill = clampString(targetCard.skillName || 'Skill exchange', 60);

  const user1Uid = participantIds[0];
  const user2Uid = participantIds[1];
  const user1Name = actorIsUser1 ? actorName : targetName;
  const user2Name = actorIsUser1 ? targetName : actorName;
  const user1SkillName = actorIsUser1 ? actorSkill : targetSkill;
  const user2SkillName = actorIsUser1 ? targetSkill : actorSkill;
  const skillSwapLabel = clampString(`${user1SkillName} ↔ ${user2SkillName}`, 130);

  try {
    const existingMatch = await getDoc(matchRef);
    if (existingMatch.exists()) {
      const data = existingMatch.data() as MatchRecord;
      return { matched: data.status === 'active', match: data };
    }

    const matchPayload = {
      matchId,
      participantIds,
      user1Uid,
      user2Uid,
      user1Name,
      user2Name,
      user1SkillName,
      user2SkillName,
      skillSwapLabel,
      status: 'active' as const,
      lastMessageText: '',
      lastMessageSenderUid: '',
      lastMessageAt: serverTimestamp(),
      user1UnreadCount: 0,
      user2UnreadCount: 0,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    await setDoc(matchRef, matchPayload);
    const createdSnap = await getDoc(matchRef);
    return {
      matched: true,
      match: createdSnap.data() as MatchRecord,
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.toLowerCase().includes('permission')) {
      return { matched: false };
    }
    handleFirestoreError(error, OperationType.CREATE, `matches/${matchId}`);
  }
}

/**
 * Deletes only the user's own 'pass' swipes so they can revisit passed profiles.
 */
export async function resetPassedSwipes(uid: string): Promise<number> {
  try {
    const q = query(collection(db, 'swipes'), where('actorUid', '==', uid));
    const snap = await getDocs(q);
    const passDocs = snap.docs.filter((d) => d.data().decision === 'pass');
    if (passDocs.length === 0) return 0;

    const batch = writeBatch(db);
    passDocs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
    return passDocs.length;
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `swipes?actorUid=${uid}`);
  }
}

/**
 * Sends a text message to an active mutual match and atomically updates match summary + unread count.
 */
export async function sendChatMessage(params: {
  match: MatchRecord;
  senderUid: string;
  text: string;
  clientNonce: string;
}): Promise<string> {
  const { match, senderUid, clientNonce } = params;
  const trimmed = clampString(params.text, LIMITS.MESSAGE_MAX);
  if (trimmed.length < LIMITS.MESSAGE_MIN) {
    throw new Error('Message cannot be empty.');
  }

  const messageId = `msg_${Date.now()}_${clientNonce.slice(0, 16).replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const msgRef = doc(db, 'matches', match.matchId, 'messages', messageId);
  const matchRef = doc(db, 'matches', match.matchId);

  const isSenderUser1 = senderUid === match.user1Uid;
  const preview = trimmed.slice(0, LIMITS.LAST_MESSAGE_PREVIEW_MAX);

  try {
    const batch = writeBatch(db);
    batch.set(msgRef, {
      messageId,
      senderUid,
      text: trimmed,
      type: 'text',
      clientNonce: clampString(clientNonce, 80),
      createdAt: serverTimestamp(),
    });

    batch.update(matchRef, {
      lastMessageText: preview,
      lastMessageSenderUid: senderUid,
      lastMessageAt: serverTimestamp(),
      user1UnreadCount: isSenderUser1 ? match.user1UnreadCount : increment(1),
      user2UnreadCount: isSenderUser1 ? increment(1) : match.user2UnreadCount,
      updatedAt: serverTimestamp(),
    });

    await batch.commit();
    return messageId;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `matches/${match.matchId}/messages/${messageId}`);
  }
}

/**
 * Loads an older page of messages for chat history pagination.
 */
export async function fetchOlderMessages(
  matchId: string,
  oldestDoc: QueryDocumentSnapshot<DocumentData>,
  pageSize = 25
): Promise<{ messages: ChatMessage[]; lastDoc: QueryDocumentSnapshot<DocumentData> | null }> {
  try {
    const q = query(
      collection(db, 'matches', matchId, 'messages'),
      orderBy('createdAt', 'desc'),
      startAfter(oldestDoc),
      limit(pageSize)
    );
    const snap = await getDocs(q);
    const messages = snap.docs
      .map((d) => ({ ...(d.data() as ChatMessage), localStatus: 'sent' as const }))
      .reverse();
    return {
      messages,
      lastDoc: snap.docs.length > 0 ? snap.docs[snap.docs.length - 1] : null,
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, `matches/${matchId}/messages`);
  }
}

export async function markMatchAsRead(match: MatchRecord, viewerUid: string): Promise<void> {
  if (match.status !== 'active') return;
  const isUser1 = viewerUid === match.user1Uid;
  const currentUnread = isUser1 ? match.user1UnreadCount : match.user2UnreadCount;
  if (currentUnread === 0) return;

  try {
    await updateDoc(doc(db, 'matches', match.matchId), {
      ...(isUser1 ? { user1UnreadCount: 0 } : { user2UnreadCount: 0 }),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `matches/${match.matchId}`);
  }
}

export async function unmatchConversation(matchId: string): Promise<void> {
  try {
    await updateDoc(doc(db, 'matches', matchId), {
      status: 'unmatched',
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `matches/${matchId}`);
  }
}

export async function blockUserAndRevokeMatches(params: {
  blockerUid: string;
  blockedUid: string;
  blockedName: string;
  activeMatchesWithUser: MatchRecord[];
}): Promise<void> {
  const { blockerUid, blockedUid, blockedName, activeMatchesWithUser } = params;
  const blockId = `${blockerUid}_${blockedUid}`;

  try {
    const batch = writeBatch(db);
    const blockRef = doc(db, 'blocks', blockId);
    const existingBlock = await getDoc(blockRef);
    if (!existingBlock.exists()) {
      batch.set(blockRef, {
        blockerUid,
        blockedUid,
        blockedName: clampString(blockedName, LIMITS.DISPLAY_NAME_MAX),
        createdAt: serverTimestamp(),
      });
    }

    for (const m of activeMatchesWithUser) {
      if (m.status === 'active') {
        batch.update(doc(db, 'matches', m.matchId), {
          status: 'blocked',
          updatedAt: serverTimestamp(),
        });
      }
    }

    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `blocks/${blockId}`);
  }
}

export async function unblockUser(blockerUid: string, blockedUid: string): Promise<void> {
  const blockId = `${blockerUid}_${blockedUid}`;
  try {
    await deleteDoc(doc(db, 'blocks', blockId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `blocks/${blockId}`);
  }
}

export async function submitSafetyReport(params: {
  reporterUid: string;
  targetUid: string;
  matchId?: string;
  reason: ReportReason;
  details: string;
}): Promise<void> {
  const reportId = `rep_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  try {
    await setDoc(doc(db, 'reports', reportId), {
      reporterUid: params.reporterUid,
      targetUid: params.targetUid,
      matchId: clampString(params.matchId || '', 128),
      reason: params.reason,
      details: clampString(params.details, LIMITS.REPORT_DETAILS_MAX),
      status: 'open',
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `reports/${reportId}`);
  }
}

/**
 * Verified account deletion workflow:
 * 1. Unmatches active matches so peers cannot keep messaging/calling.
 * 2. Deletes userSkills, swipes, blocks, publicProfiles/{uid}, privateUsers/{uid}.
 * 3. Deletes Firebase Auth user (reauthenticating with Google if recent login required).
 */
export async function deleteAccountAndCleanup(user: User, activeMatches: MatchRecord[]): Promise<void> {
  const uid = user.uid;

  try {
    // Re-authenticate first if needed when deleting Firebase Auth account
    const batch = writeBatch(db);

    for (const match of activeMatches) {
      if (match.status === 'active') {
        batch.update(doc(db, 'matches', match.matchId), {
          status: 'unmatched',
          updatedAt: serverTimestamp(),
        });
      }
    }

    const [skillsSnap, swipesSnap, blocksSnap] = await Promise.all([
      getDocs(query(collection(db, 'userSkills'), where('uid', '==', uid))),
      getDocs(query(collection(db, 'swipes'), where('actorUid', '==', uid))),
      getDocs(query(collection(db, 'blocks'), where('blockerUid', '==', uid))),
    ]);

    skillsSnap.docs.forEach((d) => batch.delete(d.ref));
    swipesSnap.docs.forEach((d) => batch.delete(d.ref));
    blocksSnap.docs.forEach((d) => batch.delete(d.ref));

    batch.delete(doc(db, 'publicProfiles', uid));
    batch.delete(doc(db, 'privateUsers', uid));

    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `accountCleanup/${uid}`);
  }

  try {
    await deleteUser(user);
  } catch (error) {
    const code = (error as { code?: string })?.code;
    if (code === 'auth/requires-recent-login') {
      await reauthenticateWithPopup(user, googleProvider);
      await deleteUser(user);
    } else {
      throw error;
    }
  }
}

/**
 * Bootstraps the skill catalog in Firestore when admin signs in.
 */
export async function seedSkillCatalogIfAdmin(user: User): Promise<void> {
  if (!user.emailVerified || user.email !== 'skyangelo340@gmail.com') return;
  try {
    const snap = await getDocs(query(collection(db, 'skills'), where('active', '==', true), limit(1)));
    if (!snap.empty) return;
    const batch = writeBatch(db);
    for (const item of SKILL_CATALOG) {
      batch.set(doc(db, 'skills', item.skillId), item);
    }
    await batch.commit();
  } catch {
    // Non-fatal; built-in catalog remains active
  }
}

export function getAuthUser() {
  return auth.currentUser;
}
