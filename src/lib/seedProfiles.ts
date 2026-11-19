import type { User } from 'firebase/auth';
import { doc, getDoc, serverTimestamp, writeBatch } from 'firebase/firestore';
import { db } from './firebase';
import { SKILL_CATALOG, type SkillLevel } from '../types/skillswipe';

export const ADMIN_EMAIL = 'skyangelo340@gmail.com';

interface SeedSkillSpec {
  skillId: string;
  level: SkillLevel;
  description: string;
  availability?: string;
}

interface SeedPeerSpec {
  uid: string;
  displayName: string;
  bio: string;
  languages: string[];
  timezone: string;
  availability: string;
  skills: SeedSkillSpec[];
  likesAdmin?: boolean;
}

const SKILL_NAME_MAP = new Map<string, string>(
  SKILL_CATALOG.map((item) => [item.skillId, item.name])
);

export const DEMO_PEER_PROFILES: SeedPeerSpec[] = [
  {
    uid: 'demo_peer_01',
    displayName: 'Mikael Santos',
    bio: 'Acoustic fingerstyle guitarist and weekend coffee brewer in Quezon City. Looking to swap guitar sessions for coding, design, or a new language.',
    languages: ['English', 'Tagalog / Filipino'],
    timezone: 'Asia/Manila',
    availability: 'Weekday evenings',
    likesAdmin: true,
    skills: [
      {
        skillId: 'guitar',
        level: 'advanced',
        description:
          'Fingerstyle arrangements, barre chord transitions, rhythm strumming, and clean acoustic tone for beginners to intermediate players.',
      },
      {
        skillId: 'vocals',
        level: 'intermediate',
        description:
          'Breath support and pitch control while singing and playing guitar at the same time.',
      },
    ],
  },
  {
    uid: 'demo_peer_02',
    displayName: 'Haruka Tanaka',
    bio: 'Bilingual product designer based in Tokyo. Happy to help with practical Japanese conversation and hiragana reading in exchange for creative or tech skills.',
    languages: ['Japanese', 'English'],
    timezone: 'Asia/Tokyo',
    availability: 'Weekends',
    skills: [
      {
        skillId: 'japanese',
        level: 'advanced',
        description:
          'Everyday natural Japanese conversation, polite vs casual speech, travel phrases, and JLPT N5-N3 grammar drills.',
      },
      {
        skillId: 'ui_design',
        level: 'intermediate',
        description:
          'Figma auto-layout, mobile typography hierarchy, and clean component libraries.',
      },
    ],
  },
  {
    uid: 'demo_peer_03',
    displayName: 'Camille Reyes',
    bio: 'Frontend engineer in Makati who loves mentoring React beginners and exploring music or visual arts after work.',
    languages: ['English', 'Tagalog / Filipino'],
    timezone: 'Asia/Manila',
    availability: 'Weekday evenings',
    likesAdmin: true,
    skills: [
      {
        skillId: 'typescript_react',
        level: 'advanced',
        description:
          'React hooks, TypeScript patterns, responsive Tailwind layouts, and building clean portfolio apps from scratch.',
      },
    ],
  },
  {
    uid: 'demo_peer_04',
    displayName: 'Mateo Navarro',
    bio: 'Documentary photographer and cycling fan from Madrid. Always excited to trade photography fundamentals for music or programming.',
    languages: ['Spanish', 'English'],
    timezone: 'Europe/Madrid',
    availability: 'Weekends',
    skills: [
      {
        skillId: 'photography',
        level: 'advanced',
        description:
          'Manual exposure triangle, natural portrait lighting, street composition, and Lightroom color workflows.',
      },
      {
        skillId: 'spanish',
        level: 'advanced',
        description:
          'Conversational Spanish for everyday situations, pronunciation coaching, and listening practice.',
      },
    ],
  },
  {
    uid: 'demo_peer_05',
    displayName: 'Jian Carlo Bautista',
    bio: 'UI/UX designer from Cebu City. I enjoy structured 45-minute skill swap sessions with practical mini-projects.',
    languages: ['English', 'Tagalog / Filipino'],
    timezone: 'Asia/Manila',
    availability: 'Flexible schedule',
    likesAdmin: true,
    skills: [
      {
        skillId: 'ui_design',
        level: 'advanced',
        description:
          'Mobile-first UX wireframing, Figma prototyping, design systems, and portfolio case study feedback.',
      },
      {
        skillId: 'drawing_art',
        level: 'intermediate',
        description:
          'Clean character sketching, perspective basics, and digital brush control.',
      },
    ],
  },
  {
    uid: 'demo_peer_06',
    displayName: 'Priya Nair',
    bio: 'Data scientist in Singapore who builds automation tools by day and practices classical piano on weekends.',
    languages: ['English', 'Hindi'],
    timezone: 'Asia/Singapore',
    availability: 'Weekday evenings',
    skills: [
      {
        skillId: 'python',
        level: 'advanced',
        description:
          'Python fundamentals, automation scripts, pandas data analysis, and clean problem-solving habits.',
      },
    ],
  },
  {
    uid: 'demo_peer_07',
    displayName: 'Daniela Mendoza',
    bio: 'Home baker and Filipino-Spanish comfort food cook from Davao. Eager to learn coding, design, or guitar!',
    languages: ['English', 'Tagalog / Filipino', 'Spanish'],
    timezone: 'Asia/Manila',
    availability: 'Weekends',
    skills: [
      {
        skillId: 'cooking',
        level: 'advanced',
        description:
          'Knife skills, flavor balancing, weeknight meal prep, and foolproof sourdough and pastry techniques.',
      },
    ],
  },
  {
    uid: 'demo_peer_08',
    displayName: 'Kenji Watanabe',
    bio: 'Android developer in Osaka building Kotlin & Jetpack Compose apps. Looking for friendly peers to swap tech and language skills.',
    languages: ['Japanese', 'English'],
    timezone: 'Asia/Tokyo',
    availability: 'Weekday evenings',
    likesAdmin: true,
    skills: [
      {
        skillId: 'kotlin_android',
        level: 'advanced',
        description:
          'Kotlin coroutines, Jetpack Compose UI state, clean architecture, and debugging real Android apps.',
      },
    ],
  },
  {
    uid: 'demo_peer_09',
    displayName: 'Sofia Alcaraz',
    bio: 'Contemporary pianist and music theory tutor from Manila. Patient step-by-step sessions tailored to your favorite songs.',
    languages: ['English', 'Tagalog / Filipino'],
    timezone: 'Asia/Manila',
    availability: 'Short 30-min sessions',
    skills: [
      {
        skillId: 'piano',
        level: 'advanced',
        description:
          'Chord voicings, pop & ballad accompaniment, sight-reading basics, and two-hand coordination drills.',
      },
    ],
  },
  {
    uid: 'demo_peer_10',
    displayName: 'Lucas Ferreira',
    bio: 'Short-form filmmaker and video editor in São Paulo. I love turning raw clips into crisp, well-paced stories.',
    languages: ['Portuguese', 'English'],
    timezone: 'America/Sao_Paulo',
    availability: 'Flexible schedule',
    skills: [
      {
        skillId: 'video_editing',
        level: 'advanced',
        description:
          'Story pacing, J/L cuts, clean audio mixing, and DaVinci Resolve color grading for YouTube and short reels.',
      },
    ],
  },
  {
    uid: 'demo_peer_11',
    displayName: 'Min-ji Park',
    bio: 'Digital illustrator in Seoul sketching cozy urban scenes and stylized portraits. Happy to swap art critiques for spoken English or coding.',
    languages: ['Korean', 'English'],
    timezone: 'Asia/Seoul',
    availability: 'Weekends',
    skills: [
      {
        skillId: 'drawing_art',
        level: 'advanced',
        description:
          'Portrait proportions, light & shadow studies, color palettes, and Procreate digital painting workflows.',
      },
    ],
  },
  {
    uid: 'demo_peer_12',
    displayName: 'Rafael Villanueva',
    bio: 'Tournament chess player (1950 FIDE) and math enthusiast from Iloilo. Let us trade practical skills in relaxed 1-on-1 calls.',
    languages: ['English', 'Tagalog / Filipino'],
    timezone: 'Asia/Manila',
    availability: 'Weekday evenings',
    likesAdmin: true,
    skills: [
      {
        skillId: 'chess',
        level: 'advanced',
        description:
          'Opening principles without memorization, tactical pattern recognition, game review, and practical endgame technique.',
      },
      {
        skillId: 'mathematics',
        level: 'intermediate',
        description:
          'Intuitive algebra, calculus problem-solving, and probability fundamentals.',
      },
    ],
  },
  {
    uid: 'demo_peer_13',
    displayName: 'Hannah Brooks',
    bio: 'Communications coach in London helping non-native speakers present clearly at work and in interviews.',
    languages: ['English'],
    timezone: 'Europe/London',
    availability: 'Weekday mornings',
    skills: [
      {
        skillId: 'public_speaking',
        level: 'advanced',
        description:
          'Structuring persuasive talks, calming stage nerves, vocal pacing, and crisp Q&A storytelling.',
      },
      {
        skillId: 'english_speaking',
        level: 'advanced',
        description:
          'Natural business English fluency, pronunciation clarity, and interview rehearsal.',
      },
    ],
  },
  {
    uid: 'demo_peer_14',
    displayName: 'Nicolette Cruz',
    bio: 'Vocalist and choir arranger in Baguio. I help shy singers unlock comfortable range and healthy resonance.',
    languages: ['English', 'Tagalog / Filipino'],
    timezone: 'Asia/Manila',
    availability: 'Weekends',
    skills: [
      {
        skillId: 'vocals',
        level: 'advanced',
        description:
          'Warm-up routines, diaphragmatic breathing, smooth chest-to-head transitions, and acoustic song phrasing.',
      },
    ],
  },
  {
    uid: 'demo_peer_15',
    displayName: 'Ethan Morales',
    bio: 'Certified mobility & calisthenics coach in Pasig. Great for desk workers wanting better posture and pain-free strength.',
    languages: ['English', 'Tagalog / Filipino'],
    timezone: 'Asia/Manila',
    availability: 'Short 30-min sessions',
    likesAdmin: true,
    skills: [
      {
        skillId: 'fitness_mobility',
        level: 'advanced',
        description:
          'Thoracic & hip mobility routines, bodyweight strength progressions, and sustainable 20-minute home workouts.',
      },
    ],
  },
  {
    uid: 'demo_peer_16',
    displayName: 'Claire Tremblay',
    bio: 'University calculus tutor in Toronto who enjoys making tricky math concepts feel visual and approachable.',
    languages: ['English', 'French'],
    timezone: 'America/Toronto',
    availability: 'Flexible schedule',
    skills: [
      {
        skillId: 'mathematics',
        level: 'advanced',
        description:
          'Calculus derivatives and integrals, linear algebra intuition, and exam problem-solving frameworks.',
      },
    ],
  },
  {
    uid: 'demo_peer_17',
    displayName: 'Diego Castillo',
    bio: 'Language tutor from Mexico City passionate about cultural exchange, podcasts, and learning creative hobbies.',
    languages: ['Spanish', 'English'],
    timezone: 'America/Mexico_City',
    availability: 'Weekday evenings',
    skills: [
      {
        skillId: 'spanish',
        level: 'advanced',
        description:
          'Relaxed Spanish conversation practice, real-world idioms, verb conjugation shortcuts, and pronunciation feedback.',
      },
    ],
  },
  {
    uid: 'demo_peer_18',
    displayName: 'Aisha Lim',
    bio: 'Filipino language and culture enthusiast in Taguig. Happy to guide beginners through natural conversational Tagalog.',
    languages: ['Tagalog / Filipino', 'English', 'Mandarin'],
    timezone: 'Asia/Manila',
    availability: 'Flexible schedule',
    skills: [
      {
        skillId: 'tagalog',
        level: 'advanced',
        description:
          'Everyday conversational Tagalog, Taglish flow, focus verbs made simple, and friendly pronunciation drills.',
      },
    ],
  },
  {
    uid: 'demo_peer_19',
    displayName: 'Liam OConnor',
    bio: 'Full-stack Python & backend builder in Sydney. Always keen to trade coding help for music, chess, or cooking.',
    languages: ['English'],
    timezone: 'Australia/Sydney',
    availability: 'Weekends',
    skills: [
      {
        skillId: 'python',
        level: 'intermediate',
        description:
          'APIs with FastAPI, scripting daily tasks, Git workflows, and writing readable beginner-friendly Python.',
      },
      {
        skillId: 'photography',
        level: 'intermediate',
        description:
          'Travel and landscape composition, golden hour lighting, and simple mobile editing.',
      },
    ],
  },
  {
    uid: 'demo_peer_20',
    displayName: 'Mei-Ling Chen',
    bio: 'IELTS speaking coach and presentation mentor in Taipei. Let us swap structured 30-minute practice sessions!',
    languages: ['Mandarin', 'English'],
    timezone: 'Asia/Taipei',
    availability: 'Short 30-min sessions',
    skills: [
      {
        skillId: 'english_speaking',
        level: 'advanced',
        description:
          'Conversational confidence, IELTS speaking mock feedback, clear articulation, and natural phrasing.',
      },
      {
        skillId: 'public_speaking',
        level: 'intermediate',
        description:
          'Slide design clarity and confident 5-minute lightning talks.',
      },
    ],
  },
];

export interface SeedResult {
  createdProfiles: number;
  createdSkills: number;
  createdSwipes: number;
}

export async function seedDemoProfilesIfAdmin(
  user: User,
  adminPrimarySkill?: { skillId: string; skillName: string }
): Promise<SeedResult> {
  if (!user.emailVerified || user.email !== ADMIN_EMAIL) {
    return { createdProfiles: 0, createdSkills: 0, createdSwipes: 0 };
  }

  const targetSkillId =
    adminPrimarySkill?.skillId && /^[a-z0-9_-]{1,64}$/.test(adminPrimarySkill.skillId)
      ? adminPrimarySkill.skillId
      : 'guitar';
  const targetSkillName =
    adminPrimarySkill?.skillName?.trim().slice(0, 60) || 'Guitar';

  // Check existing docs in parallel so seeding is 100% idempotent
  const profileSnaps = await Promise.all(
    DEMO_PEER_PROFILES.map((peer) => getDoc(doc(db, 'publicProfiles', peer.uid)))
  );

  const skillEntries = DEMO_PEER_PROFILES.flatMap((peer) =>
    peer.skills.map((skill) => ({
      peer,
      skill,
      docId: `${peer.uid}_${skill.skillId}_mentor`,
    }))
  );

  const skillSnaps = await Promise.all(
    skillEntries.map((entry) => getDoc(doc(db, 'userSkills', entry.docId)))
  );

  const reciprocalPeers = DEMO_PEER_PROFILES.filter((p) => p.likesAdmin);
  const swipeSnaps = await Promise.all(
    reciprocalPeers.map((peer) =>
      getDoc(doc(db, 'swipes', `${peer.uid}_${user.uid}`))
    )
  );

  const batch = writeBatch(db);
  let createdProfiles = 0;
  let createdSkills = 0;
  let createdSwipes = 0;

  DEMO_PEER_PROFILES.forEach((peer, idx) => {
    if (!profileSnaps[idx].exists()) {
      batch.set(doc(db, 'publicProfiles', peer.uid), {
        uid: peer.uid,
        displayName: peer.displayName,
        bio: peer.bio,
        photoUrl: '',
        useGooglePhoto: false,
        status: 'active',
        visibility: 'visible',
        languages: peer.languages,
        timezone: peer.timezone,
        availability: peer.availability,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      createdProfiles += 1;
    }
  });

  skillEntries.forEach((entry, idx) => {
    if (!skillSnaps[idx].exists()) {
      const skillName = SKILL_NAME_MAP.get(entry.skill.skillId) || entry.skill.skillId;
      batch.set(doc(db, 'userSkills', entry.docId), {
        uid: entry.peer.uid,
        skillId: entry.skill.skillId,
        skillName,
        role: 'mentor',
        level: entry.skill.level,
        description: entry.skill.description,
        availability: entry.skill.availability || entry.peer.availability,
        languages: entry.peer.languages,
        timezone: entry.peer.timezone,
        displayName: entry.peer.displayName,
        photoUrl: '',
        bio: entry.peer.bio,
        visible: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      createdSkills += 1;
    }
  });

  reciprocalPeers.forEach((peer, idx) => {
    if (!swipeSnaps[idx].exists()) {
      batch.set(doc(db, 'swipes', `${peer.uid}_${user.uid}`), {
        actorUid: peer.uid,
        targetUid: user.uid,
        skillId: targetSkillId,
        skillName: targetSkillName,
        decision: 'like',
        createdAt: serverTimestamp(),
      });
      createdSwipes += 1;
    }
  });

  if (createdProfiles > 0 || createdSkills > 0 || createdSwipes > 0) {
    await batch.commit();
  }

  return { createdProfiles, createdSkills, createdSwipes };
}
