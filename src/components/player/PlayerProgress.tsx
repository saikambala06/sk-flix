import { useState, useRef, useCallback } from 'react';

interface Props {
  currentTime: number;
  duration: number;
  buffered: number;
  onSeek: (time: number) => void;
  formatTime: (s: number) => string;
}

export default function PlayerProgress({ currentTime, duration, buffered, onSeek, formatTime }: Props) {
  const barRef = useRef<HTMLDivElement>(null);
  const [hovering, setHovering] = useState(false);
  const [hoverX, setHoverX] = useState(0);
  const [dragging, setDragging] = useState(false);

  const getTimeFromX = useCallback((clientX: number) => {
    const rect = barRef.current?.getBoundingClientRect();
    if (!rect || !duration) return 0;
    const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    return pct * duration;
  }, [duration]);

  const handleMouseMove = (e: React.MouseEvent) => {
    setHoverX(e.clientX);
    if (dragging) onSeek(getTimeFromX(e.clientX));
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation();
    setDragging(true);
    onSeek(getTimeFromX(e.clientX));

    const moveHandler = (ev: MouseEvent) => onSeek(getTimeFromX(ev.clientX));
    const upHandler = () => { setDragging(false); window.removeEventListener('mousemove', moveHandler); window.removeEventListener('mouseup', upHandler); };
    window.addEventListener('mousemove', moveHandler);
    window.addEventListener('mouseup', upHandler);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    e.stopPropagation();
    onSeek(getTimeFromX(e.touches[0].clientX));
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    e.stopPropagation();
    onSeek(getTimeFromX(e.touches[0].clientX));
  };

  const progressPct = duration ? (currentTime / duration) * 100 : 0;
  const bufferedPct = duration ? (buffered / duration) * 100 : 0;
  const hoverRect = barRef.current?.getBoundingClientRect();
  const hoverPct = hoverRect ? Math.max(0, Math.min(1, (hoverX - hoverRect.left) / hoverRect.width)) : 0;
  const hoverTime = hoverPct * duration;

  return (
    <div className="relative group/progress">
      {/* Hover time tooltip */}
      {hovering && duration > 0 && (
        <div
          className="absolute -top-10 transform -translate-x-1/2 bg-black/90 backdrop-blur-sm text-white text-xs font-mono px-3 py-1.5 rounded-lg border border-white/10 pointer-events-none z-50 shadow-xl"
          style={{ left: `${hoverPct * 100}%` }}
        >
          {formatTime(hoverTime)}
        </div>
      )}

      {/* Bar */}
      <div
        ref={barRef}
        className="relative h-1.5 group-hover/progress:h-2.5 transition-all duration-200 cursor-pointer rounded-full overflow-hidden"
        onMouseEnter={() => setHovering(true)}
        onMouseLeave={() => { setHovering(false); if (!dragging) setDragging(false); }}
        onMouseMove={handleMouseMove}
        onMouseDown={handleMouseDown}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Background */}
        <div className="absolute inset-0 bg-white/15 rounded-full" />

        {/* Buffered */}
        <div
          className="absolute inset-y-0 left-0 bg-white/25 rounded-full transition-[width] duration-300"
          style={{ width: `${bufferedPct}%` }}
        />

        {/* Hover preview */}
        {hovering && (
          <div
            className="absolute inset-y-0 left-0 bg-white/10 rounded-full"
            style={{ width: `${hoverPct * 100}%` }}
          />
        )}

        {/* Progress */}
        <div
          className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-75"
          style={{
            width: `${progressPct}%`,
            background: 'linear-gradient(90deg, #ff4757, #ff6b81)'
          }}
        />

        {/* Thumb */}
        <div
          className="absolute top-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-white shadow-lg shadow-red-500/30 opacity-0 group-hover/progress:opacity-100 transition-opacity duration-200 pointer-events-none"
          style={{ left: `calc(${progressPct}% - 8px)` }}
        >
          <div className="absolute inset-1 rounded-full bg-[var(--red)]" />
        </div>
      </div>
    </div>
  );
}
