import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { motion } from 'framer-motion';

export default function RoomQrCode({ url }: { url: string }) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(url, { margin: 1, width: 220, color: { dark: '#1a2b20', light: '#f4ecd8' } })
      .then((d) => !cancelled && setDataUrl(d))
      .catch((e) => console.error('[qrcode] failed to render', e));
    return () => {
      cancelled = true;
    };
  }, [url]);

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      style={{ overflow: 'hidden', display: 'flex', justifyContent: 'center' }}
    >
      <div style={{ padding: 12, background: 'var(--card-white)', borderRadius: 14, marginTop: 4, marginBottom: 4 }}>
        {dataUrl ? (
          <img src={dataUrl} alt="QR code to join the room" width={180} height={180} style={{ display: 'block' }} />
        ) : (
          <div style={{ width: 180, height: 180 }} />
        )}
      </div>
    </motion.div>
  );
}
