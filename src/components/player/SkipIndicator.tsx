import { AnimatePresence, motion } from 'framer-motion';
import { RotateCcw, RotateCw } from 'lucide-react';

interface Props {
  direction: 'back' | 'forward' | null;
}

export default function SkipIndicator({ direction }: Props) {
  return (
    <AnimatePresence>
      {direction && (
        <motion.div
          key={direction}
          className={`absolute top-1/2 -translate-y-1/2 z-20 pointer-events-none ${
            direction === 'back' ? 'left-8 sm:left-16' : 'right-8 sm:right-16'
          }`}
          initial={{ opacity: 0, scale: 0.5 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.5 }}
          transition={{ duration: 0.25 }}
        >
          <div className="flex flex-col items-center gap-1 bg-black/40 backdrop-blur-sm rounded-full p-4">
            {direction === 'back' ? (
              <RotateCcw className="w-7 h-7 text-white" />
            ) : (
              <RotateCw className="w-7 h-7 text-white" />
            )}
            <span className="text-white text-xs font-bold">10s</span>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
