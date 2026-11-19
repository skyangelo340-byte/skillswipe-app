import { useState } from 'react';
import { getInitials } from '../types/skillswipe';

interface AvatarProps {
  name: string;
  photoUrl?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  tone?: 'auto' | 'violet' | 'midnight' | 'mint' | 'coral';
  className?: string;
}

const SIZE_CLASSES: Record<NonNullable<AvatarProps['size']>, string> = {
  xs: 'w-8 h-8 text-[11px]',
  sm: 'w-9 h-9 text-xs',
  md: 'w-11 h-11 text-sm',
  lg: 'w-16 h-16 text-xl',
  xl: 'w-20 h-20 text-2xl',
};

const TONE_CLASSES: Record<Exclude<NonNullable<AvatarProps['tone']>, 'auto'>, string> = {
  violet: 'bg-gradient-to-br from-[#8C6BFF] via-[#6D4CFF] to-[#4A2CD6] text-white',
  midnight: 'bg-gradient-to-br from-[#2B3E73] via-[#1B274C] to-[#0F172F] text-white',
  mint: 'bg-gradient-to-br from-[#B4F5E3] via-[#76DFC2] to-[#39B596] text-[#093D31]',
  coral: 'bg-gradient-to-br from-[#FF99A8] via-[#F2677B] to-[#D13E57] text-white',
};

const AUTO_PALETTE = [
  'bg-gradient-to-br from-[#8C6BFF] via-[#6A48F5] to-[#4829C8] text-white',
  'bg-gradient-to-br from-[#3AD2B8] via-[#1E9E8E] to-[#136B68] text-white',
  'bg-gradient-to-br from-[#FF7B93] via-[#E55170] to-[#B83254] text-white',
  'bg-gradient-to-br from-[#5A8CFF] via-[#3A65E0] to-[#2442A6] text-white',
  'bg-gradient-to-br from-[#FFA25B] via-[#E57838] to-[#B84F1E] text-white',
  'bg-gradient-to-br from-[#62C78E] via-[#379C6E] to-[#206F4E] text-white',
];

function pickToneForName(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) {
    hash = (hash * 31 + name.charCodeAt(i)) | 0;
  }
  return AUTO_PALETTE[Math.abs(hash) % AUTO_PALETTE.length];
}

export function Avatar({
  name,
  photoUrl,
  size = 'md',
  tone = 'auto',
  className = '',
}: AvatarProps) {
  const [imgFailed, setImgFailed] = useState(false);
  const showImage = Boolean(photoUrl && photoUrl.trim().length > 0 && !imgFailed);

  if (showImage) {
    return (
      <img
        src={photoUrl}
        alt={`${name} profile`}
        referrerPolicy="no-referrer"
        onError={() => setImgFailed(true)}
        className={`rounded-full object-cover shrink-0 ring-2 ring-white/80 dark:ring-white/20 shadow-sm ${SIZE_CLASSES[size]} ${className}`}
      />
    );
  }

  const toneStyle = tone === 'auto' ? pickToneForName(name) : TONE_CLASSES[tone];

  return (
    <div
      aria-label={`${name} avatar`}
      className={`rounded-full flex items-center justify-center font-display font-bold tracking-tight shrink-0 select-none ring-1 ring-inset ring-white/25 shadow-sm ${SIZE_CLASSES[size]} ${toneStyle} ${className}`}
    >
      {getInitials(name)}
    </div>
  );
}
