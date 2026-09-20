import { AnimatePresence, motion } from 'framer-motion';

interface Props {
  message: string | null;
  highQuality: boolean;
}

export default function TurnBanner({ message, highQuality }: Props) {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', minHeight: 34 }}>
      <AnimatePresence mode="wait">
        {message && (
          <motion.div
            key={message}
            initial={highQuality ? { opacity: 0, y: -8, scale: 0.96 } : { opacity: 0 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={highQuality ? { opacity: 0, y: 6, scale: 0.98 } : { opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="panel"
            style={{
              padding: '7px 16px',
              fontSize: 13,
              color: 'var(--gold-bright)',
              fontWeight: 600,
              textAlign: 'center',
              maxWidth: 'min(560px, 92vw)',
            }}
          >
            {message}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
