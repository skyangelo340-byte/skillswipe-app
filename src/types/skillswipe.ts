import type { Timestamp } from 'firebase/firestore';

export type SkillRole = 'learner' | 'mentor';
export type SkillLevel = 'beginner' | 'intermediate' | 'advanced';
export type ProfileStatus = 'active' | 'paused';
export type ProfileVisibility = 'visible' | 'hidden';
export type SwipeDecision = 'like' | 'pass';
export type MatchStatus = 'active' | 'unmatched' | 'blocked';
export type CallStatus =
  | 'ringing'
  | 'accepted'
  | 'connecting'
  | 'active'
  | 'declined'
  | 'ended'
  | 'timeout'
  | 'busy'
  | 'failed';
export type ReportReason =
  | 'harassment'
  | 'inappropriate_skill'
  | 'spam'
  | 'underage'
  | 'other';

export interface PublicProfile {
  uid: string;
  displayName: string;
  bio: string;
  photoUrl: string;
  useGooglePhoto: boolean;
  status: ProfileStatus;
  visibility: ProfileVisibility;
  languages: string[];
  timezone: string;
  availability: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface PrivateUser {
  uid: string;
  email: string;
  ageConfirmed18Plus: boolean;
  termsAccepted: boolean;
  onboardingComplete: boolean;
  notificationsEnabled: boolean;
  reducedMotion: boolean;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface SkillCatalogItem {
  skillId: string;
  name: string;
  category: string;
  active: boolean;
  tags: string[];
}

export interface UserSkill {
  id?: string;
  uid: string;
  skillId: string;
  skillName: string;
  role: SkillRole;
  level: SkillLevel;
  description: string;
  availability: string;
  languages: string[];
  timezone: string;
  displayName: string;
  photoUrl: string;
  bio: string;
  visible: boolean;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface SwipeRecord {
  id?: string;
  actorUid: string;
  targetUid: string;
  skillId: string;
  skillName: string;
  decision: SwipeDecision;
  createdAt?: Timestamp;
}

export interface MatchRecord {
  matchId: string;
  participantIds: [string, string];
  user1Uid: string;
  user2Uid: string;
  user1Name: string;
  user2Name: string;
  user1SkillName: string;
  user2SkillName: string;
  skillSwapLabel: string;
  status: MatchStatus;
  lastMessageText: string;
  lastMessageSenderUid: string;
  lastMessageAt?: Timestamp;
  user1UnreadCount: number;
  user2UnreadCount: number;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface MatchPeerView {
  peerUid: string;
  peerName: string;
  mySkillName: string;
  peerSkillName: string;
  unreadCount: number;
}

export function getMatchPeerView(match: MatchRecord, currentUid: string): MatchPeerView {
  const isUser1 = match.user1Uid === currentUid;
  return {
    peerUid: isUser1 ? match.user2Uid : match.user1Uid,
    peerName: isUser1 ? match.user2Name : match.user1Name,
    mySkillName: isUser1 ? match.user1SkillName : match.user2SkillName,
    peerSkillName: isUser1 ? match.user2SkillName : match.user1SkillName,
    unreadCount: isUser1 ? match.user1UnreadCount || 0 : match.user2UnreadCount || 0,
  };
}

export interface ChatMessage {
  messageId: string;
  senderUid: string;
  text: string;
  type: 'text';
  clientNonce: string;
  createdAt?: Timestamp;
  localStatus?: 'pending' | 'sent' | 'failed';
  localCreatedAtMs?: number;
}

export interface VideoCallRecord {
  callId: string;
  matchId: string;
  skillId: string;
  skillName: string;
  initiatorUid: string;
  initiatorName: string;
  recipientUid: string;
  recipientName: string;
  participantIds: [string, string];
  status: CallStatus;
  offerSdp: string;
  answerSdp: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface BlockRecord {
  id?: string;
  blockerUid: string;
  blockedUid: string;
  blockedName: string;
  createdAt?: Timestamp;
}

export interface SafetyReport {
  id?: string;
  reporterUid: string;
  targetUid: string;
  matchId: string;
  reason: ReportReason;
  details: string;
  status: 'open' | 'reviewed' | 'resolved';
  createdAt?: Timestamp;
}

// Validation limits synced verbatim with firebase-blueprint.json & firestore.rules
export const LIMITS = {
  DISPLAY_NAME_MIN: 2,
  DISPLAY_NAME_MAX: 60,
  BIO_MAX: 400,
  SKILL_DESC_MAX: 350,
  AVAILABILITY_MAX: 120,
  TIMEZONE_MAX: 80,
  LANGUAGES_MAX: 8,
  MESSAGE_MIN: 1,
  MESSAGE_MAX: 1000,
  REPORT_DETAILS_MAX: 800,
  LAST_MESSAGE_PREVIEW_MAX: 200,
} as const;

export const SKILL_CATALOG: SkillCatalogItem[] = [
  { skillId: 'guitar', name: 'Guitar', category: 'Music', active: true, tags: ['acoustic', 'electric', 'chords', 'fingerstyle'] },
  { skillId: 'piano', name: 'Piano & Keyboard', category: 'Music', active: true, tags: ['music theory', 'classical', 'pop'] },
  { skillId: 'vocals', name: 'Singing & Vocals', category: 'Music', active: true, tags: ['breath', 'pitch', 'voice'] },
  { skillId: 'typescript_react', name: 'TypeScript & React', category: 'Coding', active: true, tags: ['web', 'frontend', 'javascript'] },
  { skillId: 'python', name: 'Python Programming', category: 'Coding', active: true, tags: ['automation', 'data', 'scripting'] },
  { skillId: 'kotlin_android', name: 'Kotlin & Android', category: 'Coding', active: true, tags: ['mobile', 'compose', 'apps'] },
  { skillId: 'spanish', name: 'Spanish Conversation', category: 'Languages', active: true, tags: ['speaking', 'grammar', 'fluency'] },
  { skillId: 'japanese', name: 'Japanese', category: 'Languages', active: true, tags: ['hiragana', 'kanji', 'conversation'] },
  { skillId: 'english_speaking', name: 'English Speaking', category: 'Languages', active: true, tags: ['pronunciation', 'ielts', 'business'] },
  { skillId: 'tagalog', name: 'Tagalog / Filipino', category: 'Languages', active: true, tags: ['filipino', 'conversation'] },
  { skillId: 'photography', name: 'Photography', category: 'Creative', active: true, tags: ['portrait', 'lighting', 'composition'] },
  { skillId: 'drawing_art', name: 'Drawing & Illustration', category: 'Creative', active: true, tags: ['sketching', 'digital art', 'procreate'] },
  { skillId: 'ui_design', name: 'UI & Product Design', category: 'Creative', active: true, tags: ['figma', 'typography', 'systems'] },
  { skillId: 'video_editing', name: 'Video Editing', category: 'Creative', active: true, tags: ['color', 'storytelling', 'cuts'] },
  { skillId: 'mathematics', name: 'Mathematics & Calculus', category: 'Academics', active: true, tags: ['algebra', 'calculus', 'statistics'] },
  { skillId: 'public_speaking', name: 'Public Speaking', category: 'Communication', active: true, tags: ['presentations', 'storytelling', 'confidence'] },
  { skillId: 'chess', name: 'Chess Strategy', category: 'Strategy', active: true, tags: ['openings', 'tactics', 'endgame'] },
  { skillId: 'fitness_mobility', name: 'Fitness & Mobility', category: 'Wellness', active: true, tags: ['bodyweight', 'posture', 'stretching'] },
  { skillId: 'cooking', name: 'Home Cooking', category: 'Lifestyle', active: true, tags: ['techniques', 'meal prep', 'baking'] },
];

export const LANGUAGES_LIST = [
  'English',
  'Tagalog / Filipino',
  'Spanish',
  'Japanese',
  'Mandarin',
  'Korean',
  'French',
  'German',
  'Portuguese',
  'Hindi',
  'Indonesian',
  'Vietnamese',
];

export const AVAILABILITY_PRESETS = [
  'Weekday evenings',
  'Weekends',
  'Weekday mornings',
  'Flexible schedule',
  'Short 30-min sessions',
];

export const REPORT_REASONS: { value: ReportReason; label: string; helper: string }[] = [
  { value: 'harassment', label: 'Harassment or disrespect', helper: 'Unwanted advances, abusive language, or boundary violations.' },
  { value: 'inappropriate_skill', label: 'Prohibited or dangerous skill', helper: 'Illegal, unsafe, or non-educational content.' },
  { value: 'spam', label: 'Spam or solicitation', helper: 'Unsolicited sales, scams, or external payment pressure.' },
  { value: 'underage', label: 'Underage concern (under 18)', helper: 'Suspected violation of the 18+ requirement.' },
  { value: 'other', label: 'Other safety concern', helper: 'Any other issue affecting a safe learning space.' },
];

export function getCanonicalMatchId(uidA: string, uidB: string): string {
  const [first, second] = uidA < uidB ? [uidA, uidB] : [uidB, uidA];
  return `${first}_${second}`;
}

export function getSortedParticipants(uidA: string, uidB: string): [string, string] {
  return uidA < uidB ? [uidA, uidB] : [uidB, uidA];
}

export function formatSkillLevel(level: SkillLevel): string {
  if (level === 'beginner') return 'Beginner';
  if (level === 'intermediate') return 'Intermediate';
  return 'Advanced';
}

export function getInitials(name: string): string {
  const cleaned = name.trim();
  if (!cleaned) return 'SS';
  const parts = cleaned.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}
