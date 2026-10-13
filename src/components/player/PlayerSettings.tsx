import { motion } from 'framer-motion';
import { Gauge, Check } from 'lucide-react';

const SPEEDS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

interface Props {
  currentRate: number;
  onRateChange: (rate: number) => void;
  onClose: () => void;
}

export default function PlayerSettings({ currentRate, onRateChange, onClose }: Props) {
  return (
    <motion.div
      className="settings-panel absolute bottom-24 right-4 sm:right-8 z-50 pointer-events-auto"
      initial={{ opacity: 0, y: 10, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 10, scale: 0.95 }}
      transition={{ duration: 0.2 }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="bg-black/90 backdrop-blur-xl rounded-2xl border border-white/10 overflow-hidden shadow-2xl min-w-[200px]">
        <div className="px-4 py-3 border-b border-white/10 flex items-center gap-2">
          <Gauge className="w-4 h-4 text-[var(--gold)]" />
          <span className="text-sm font-semibold text-white">Playback Speed</span>
        </div>
        <div className="py-1">
          {SPEEDS.map((speed) => (
            <button
              key={speed}
              onClick={() => onRateChange(speed)}
              className={`w-full px-4 py-2.5 flex items-center justify-between text-sm transition-colors ${
                speed === currentRate
                  ? 'text-[var(--gold)] bg-[var(--gold)]/10'
                  : 'text-white/70 hover:text-white hover:bg-white/5'
              }`}
            >
              <span className={speed === currentRate ? 'font-bold' : 'font-medium'}>
                {speed === 1 ? 'Normal' : `${speed}x`}
              </span>
              {speed === currentRate && <Check className="w-4 h-4" />}
            </button>
          ))}
        </div>
      </div>
    </motion.div>
  );
}
