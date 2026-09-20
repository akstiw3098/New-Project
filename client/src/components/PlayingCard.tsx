import { motion } from 'framer-motion';
import { Card, SUIT_RED, SUIT_SYMBOL, rankLabel } from '../game/types';
import { CardSkin } from '../store/settings';

interface Props {
  card?: Card | null;
  faceDown?: boolean;
  selected?: boolean;
  dim?: boolean;
  skin: CardSkin;
  highQuality: boolean;
  width?: number;
  onClick?: () => void;
  layoutId?: string;
  title?: string;
}

const W = 64;
const H = 90;

export default function PlayingCard({
  card,
  faceDown,
  selected,
  dim,
  skin,
  highQuality,
  width = W,
  onClick,
  layoutId,
  title,
}: Props) {
  const scale = width / W;
  const height = H * scale;

  const content = faceDown || !card ? (
    <CardBackFace skin={skin} highQuality={highQuality} />
  ) : (
    <CardFace card={card} skin={skin} />
  );

  return (
    <motion.div
      layout={highQuality}
      layoutId={layoutId}
      onClick={onClick}
      title={title}
      initial={highQuality ? { opacity: 0, y: 14, scale: 0.92 } : false}
      animate={{
        opacity: dim ? 0.45 : 1,
        y: selected ? -14 : 0,
        scale: 1,
      }}
      whileHover={onClick ? { y: -8, transition: { duration: 0.12 } } : undefined}
      transition={highQuality ? { type: 'spring', stiffness: 420, damping: 30 } : { duration: 0.12 }}
      style={{
        width,
        height,
        borderRadius: 8 * scale,
        cursor: onClick ? 'pointer' : 'default',
        position: 'relative',
        boxShadow: selected
          ? `0 0 0 2px var(--gold-bright), 0 10px 18px rgba(0,0,0,0.5)`
          : highQuality
          ? '0 3px 8px rgba(0,0,0,0.45)'
          : '0 2px 4px rgba(0,0,0,0.35)',
        userSelect: 'none',
      }}
    >
      {content}
    </motion.div>
  );
}

function CardFace({ card, skin }: { card: Card; skin: CardSkin }) {
  const red = SUIT_RED[card.suit];
  const color = red ? 'var(--card-red)' : 'var(--card-black)';
  const label = rankLabel(card.rank);
  const symbol = SUIT_SYMBOL[card.suit];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="100%" style={{ display: 'block' }}>
      <defs>
        <linearGradient id={`face-${skin}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="1" stopColor="#f3efe2" />
        </linearGradient>
      </defs>
      <rect x="0.5" y="0.5" width={W - 1} height={H - 1} rx="7" fill={`url(#face-${skin})`} stroke="#d8d2bf" />
      {skin === 'royal' && (
        <rect x="4" y="4" width={W - 8} height={H - 8} rx="4" fill="none" stroke="var(--gold)" strokeWidth="0.8" />
      )}
      <text x="6" y="16" fontSize="13" fontWeight="700" fill={color} fontFamily="Georgia, serif">
        {label}
      </text>
      <text x="6" y="27" fontSize="11" fill={color}>
        {symbol}
      </text>
      <text x={W - 6} y={H - 8} fontSize="13" fontWeight="700" fill={color} fontFamily="Georgia, serif" textAnchor="end" transform={`rotate(180 ${W - 6} ${H - 8})`}>
        {label}
      </text>
      <text x={W - 6} y={H - 19} fontSize="11" fill={color} textAnchor="end" transform={`rotate(180 ${W - 6} ${H - 19})`}>
        {symbol}
      </text>
      <text x={W / 2} y={H / 2 + (skin === 'minimal' ? 6 : 8)} fontSize={skin === 'minimal' ? 22 : 28} fill={color} textAnchor="middle" opacity={skin === 'minimal' ? 0.85 : 0.92}>
        {symbol}
      </text>
    </svg>
  );
}

function CardBackFace({ skin, highQuality }: { skin: CardSkin; highQuality: boolean }) {
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="100%" style={{ display: 'block' }}>
      <defs>
        <linearGradient id={`back-${skin}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#0f3d28" />
          <stop offset="1" stopColor="#0a2a1b" />
        </linearGradient>
        <pattern id={`pat-${skin}`} width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="8" height="8" fill="transparent" />
          <circle cx="4" cy="4" r="1.1" fill="rgba(212,175,106,0.35)" />
        </pattern>
      </defs>
      <rect x="0.5" y="0.5" width={W - 1} height={H - 1} rx="7" fill={`url(#back-${skin})`} stroke="#1c5c3a" />
      <rect x="5" y="5" width={W - 10} height={H - 10} rx="4" fill={highQuality ? `url(#pat-${skin})` : 'none'} stroke="var(--gold)" strokeWidth="1" opacity="0.9" />
      <text x={W / 2} y={H / 2 + 5} fontSize="16" fill="var(--gold-bright)" textAnchor="middle" opacity="0.85" fontFamily="Georgia, serif">
        S
      </text>
    </svg>
  );
}
