import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Play, Pause, SkipBack, SkipForward, Volume2, VolumeX, Maximize, Minimize, Settings, Gauge, PictureInPicture2, ChevronLeft } from 'lucide-react';
import type { Movie } from '@/lib/api';
import { saveWatchProgress } from '@/lib/store';
import PlayerProgress from './player/PlayerProgress';
import PlayerSettings from './player/PlayerSettings';
import SkipIndicator from './player/SkipIndicator';

interface Props {
  movie: Movie;
  resumeTime?: number;
  onClose: () => void;
}

declare global {
  interface Window { Hls: any; }
}

export default function VideoPlayer({ movie, resumeTime = 0, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const hlsRef = useRef<any>(null);
  const idleTimer = useRef<ReturnType<typeof setTimeout>>();
  const saveTimer = useRef<number>(0);

  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [idle, setIdle] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [skipDir, setSkipDir] = useState<'back' | 'forward' | null>(null);
  const [showCenterIcon, setShowCenterIcon] = useState<'play' | 'pause' | null>(null);

  // Load HLS.js dynamically
  useEffect(() => {
    if (window.Hls) return;
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/hls.js@latest/dist/hls.min.js';
    document.head.appendChild(script);
  }, []);

  // Load HLS.js dynamically
  useEffect(() => {
    if (window.Hls) return;
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/hls.js@latest/dist/hls.min.js';
    document.head.appendChild(script);
  }, []);

  // Load video
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const src = movie.hlsUrl || movie.videoUrl || '';
    setLoading(true);

    if (src.includes('.m3u8') && window.Hls?.isSupported()) {
      const hls = new window.Hls({ enableWorker: true });
      hlsRef.current = hls;
      hls.loadSource(src);
      hls.attachMedia(video);
      hls.on(window.Hls.Events.MANIFEST_PARSED, () => {
        if (resumeTime > 0) video.currentTime = resumeTime;
        video.play().catch(() => {});
      });
    } else {
      video.src = src;
      video.addEventListener('loadedmetadata', () => {
        if (resumeTime > 0) video.currentTime = resumeTime;
        video.play().catch(() => {});
      }, { once: true });
    }

    return () => {
      if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null; }
      saveWatchProgress(movie, video.currentTime, video.duration || 0);
    };
  }, [movie, resumeTime]);

  // Keyboard controls
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const video = videoRef.current;
      if (!video) return;
      switch (e.key) {
        case ' ': case 'k': e.preventDefault(); togglePlay(); break;
        case 'ArrowLeft': e.preventDefault(); skip(-10); break;
        case 'ArrowRight': e.preventDefault(); skip(10); break;
        case 'ArrowUp': e.preventDefault(); setVolume(v => { const n = Math.min(1, v + 0.1); video.volume = n; return n; }); break;
        case 'ArrowDown': e.preventDefault(); setVolume(v => { const n = Math.max(0, v - 0.1); video.volume = n; return n; }); break;
        case 'f': e.preventDefault(); toggleFullscreen(); break;
        case 'm': e.preventDefault(); toggleMute(); break;
        case 'Escape': e.preventDefault(); onClose(); break;
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // Idle detection
  const resetIdle = useCallback(() => {
    setIdle(false);
    clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(() => { if (videoRef.current && !videoRef.current.paused) setIdle(true); }, 3000);
  }, []);

  useEffect(() => { resetIdle(); return () => clearTimeout(idleTimer.current); }, [resetIdle]);

  const togglePlay = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) { v.play(); flashCenter('play'); } else { v.pause(); flashCenter('pause'); }
  };

  const flashCenter = (icon: 'play' | 'pause') => {
    setShowCenterIcon(icon);
    setTimeout(() => setShowCenterIcon(null), 600);
  };

  const skip = (seconds: number) => {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = Math.max(0, Math.min(v.duration || 0, v.currentTime + seconds));
    setSkipDir(seconds < 0 ? 'back' : 'forward');
    setTimeout(() => setSkipDir(null), 500);
    resetIdle();
  };

  const toggleMute = () => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = !v.muted;
    setMuted(v.muted);
  };

  const handleVolume = (val: number) => {
    const v = videoRef.current;
    if (!v) return;
    v.volume = val;
    v.muted = val === 0;
    setVolume(val);
    setMuted(val === 0);
  };

  const toggleFullscreen = async () => {
    const el = containerRef.current;
    if (!el) return;
    if (!document.fullscreenElement) {
      await el.requestFullscreen?.().catch(() => {});
    } else {
      await document.exitFullscreen?.().catch(() => {});
    }
  };

  const togglePiP = async () => {
    const v = videoRef.current;
    if (!v) return;
    if (document.pictureInPictureElement) await document.exitPictureInPicture();
    else await v.requestPictureInPicture?.().catch(() => {});
  };

  const handleRateChange = (rate: number) => {
    const v = videoRef.current;
    if (!v) return;
    v.playbackRate = rate;
    setPlaybackRate(rate);
    setShowSettings(false);
  };

  const seek = (time: number) => {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = time;
  };

  // Video events
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const onPlay = () => { setPlaying(true); setLoading(false); resetIdle(); };
    const onPause = () => { setPlaying(false); setIdle(false); clearTimeout(idleTimer.current); };
    const onTime = () => {
      setCurrent(v.currentTime);
      if (v.currentTime - saveTimer.current >= 5) {
        saveTimer.current = v.currentTime;
        saveWatchProgress(movie, v.currentTime, v.duration || 0);
      }
    };
    const onDur = () => setDuration(v.duration || 0);
    const onWait = () => setLoading(true);
    const onCanPlay = () => setLoading(false);
    const onBuf = () => {
      if (v.buffered.length > 0) setBuffered(v.buffered.end(v.buffered.length - 1));
    };
    const onFs = () => setFullscreen(!!document.fullscreenElement);

    v.addEventListener('play', onPlay);
    v.addEventListener('pause', onPause);
    v.addEventListener('timeupdate', onTime);
    v.addEventListener('durationchange', onDur);
    v.addEventListener('loadedmetadata', onDur);
    v.addEventListener('waiting', onWait);
    v.addEventListener('canplay', onCanPlay);
    v.addEventListener('playing', onCanPlay);
    v.addEventListener('progress', onBuf);
    document.addEventListener('fullscreenchange', onFs);

    return () => {
      v.removeEventListener('play', onPlay);
      v.removeEventListener('pause', onPause);
      v.removeEventListener('timeupdate', onTime);
      v.removeEventListener('durationchange', onDur);
      v.removeEventListener('loadedmetadata', onDur);
      v.removeEventListener('waiting', onWait);
      v.removeEventListener('canplay', onCanPlay);
      v.removeEventListener('playing', onCanPlay);
      v.removeEventListener('progress', onBuf);
      document.removeEventListener('fullscreenchange', onFs);
    };
  }, [movie, resetIdle]);

  const handleClose = () => {
    const v = videoRef.current;
    if (v && v.currentTime > 5) saveWatchProgress(movie, v.currentTime, v.duration || 0);
    if (v) v.pause();
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null; }
    onClose();
  };

  const fmt = (s: number) => {
    if (!s || !isFinite(s)) return '0:00';
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = Math.floor(s % 60);
    return h > 0 ? `${h}:${m < 10 ? '0' : ''}${m}:${sec < 10 ? '0' : ''}${sec}` : `${m}:${sec < 10 ? '0' : ''}${sec}`;
  };

  const episodeTitle = (movie as any)._episodeTitle;

  return (
    <motion.div
      ref={containerRef}
      className="fixed inset-0 z-[3000] bg-black flex items-center justify-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
      onMouseMove={resetIdle}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest('.player-controls-area') || (e.target as HTMLElement).closest('.settings-panel')) return;
        togglePlay();
      }}
    >
      {/* Video */}
      <video ref={videoRef} className="w-full h-full object-contain" playsInline />

      {/* Loading Spinner */}
      <AnimatePresence>
        {loading && (
          <motion.div
            className="absolute inset-0 flex flex-col items-center justify-center z-10 pointer-events-none"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <div className="relative w-16 h-16">
              <div className="absolute inset-0 rounded-full border-2 border-white/10 border-t-[var(--gold)] animate-[spin-loader_0.8s_linear_infinite]" />
              <div className="absolute inset-2 rounded-full border-2 border-white/5 border-b-[var(--cyan)] animate-[spin-loader_1.2s_linear_infinite_reverse]" />
            </div>
            <p className="text-white/40 text-sm mt-4 font-medium tracking-wider">Loading...</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Center Play/Pause flash */}
      <AnimatePresence>
        {showCenterIcon && (
          <motion.div
            className="absolute inset-0 flex items-center justify-center z-20 pointer-events-none"
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.5 }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
          >
            <div className="w-20 h-20 rounded-full bg-black/50 backdrop-blur-md flex items-center justify-center border border-white/20">
              {showCenterIcon === 'play' ? <Play className="w-8 h-8 text-white fill-white ml-1" /> : <Pause className="w-8 h-8 text-white fill-white" />}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Skip indicators */}
      <SkipIndicator direction={skipDir} />

      {/* Controls overlay */}
      <motion.div
        className="player-controls-area absolute inset-0 flex flex-col justify-between z-30 pointer-events-none"
        animate={{ opacity: idle && playing ? 0 : 1 }}
        transition={{ duration: 0.4 }}
        style={{ cursor: idle && playing ? 'none' : 'default' }}
      >
        {/* Top bar */}
        <div className="pointer-events-auto p-4 sm:p-6 bg-gradient-to-b from-black/80 via-black/30 to-transparent">
          <div className="flex items-center justify-between">
            <button
              onClick={(e) => { e.stopPropagation(); handleClose(); }}
              className="flex items-center gap-2 text-white hover:text-[var(--gold)] transition-all group"
            >
              <ChevronLeft className="w-6 h-6 group-hover:-translate-x-1 transition-transform" />
              <div className="hidden sm:block">
                <p className="text-sm font-semibold leading-tight">{movie.title}</p>
                {episodeTitle && <p className="text-xs text-white/50">{episodeTitle}</p>}
              </div>
            </button>
            <div className="flex items-center gap-2">
              {playbackRate !== 1 && (
                <span className="text-xs font-bold text-[var(--gold)] bg-[var(--gold)]/15 px-2 py-1 rounded-full">
                  {playbackRate}x
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Center play button when paused */}
        {!playing && !loading && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-auto" onClick={(e) => { e.stopPropagation(); togglePlay(); }}>
            <motion.div
              className="w-20 h-20 rounded-full bg-white/90 flex items-center justify-center shadow-2xl cursor-pointer hover:scale-110 transition-transform"
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
            >
              <Play className="w-9 h-9 text-black fill-black ml-1" />
            </motion.div>
          </div>
        )}

        {/* Bottom controls */}
        <div className="pointer-events-auto bg-gradient-to-t from-black/90 via-black/50 to-transparent pt-16 pb-4 sm:pb-6 px-4 sm:px-8">
          {/* Progress bar */}
          <PlayerProgress
            currentTime={currentTime}
            duration={duration}
            buffered={buffered}
            onSeek={seek}
            formatTime={fmt}
          />

          {/* Control buttons */}
          <div className="flex items-center gap-3 sm:gap-5 mt-3">
            {/* Play/Pause */}
            <button onClick={(e) => { e.stopPropagation(); togglePlay(); }} className="text-white hover:text-[var(--gold)] transition-colors">
              {playing ? <Pause className="w-6 h-6 sm:w-7 sm:h-7 fill-current" /> : <Play className="w-6 h-6 sm:w-7 sm:h-7 fill-current ml-0.5" />}
            </button>

            {/* Skip back */}
            <button onClick={(e) => { e.stopPropagation(); skip(-10); }} className="text-white hover:text-[var(--gold)] transition-colors hidden sm:block" title="Rewind 10s">
              <SkipBack className="w-5 h-5" />
            </button>

            {/* Skip forward */}
            <button onClick={(e) => { e.stopPropagation(); skip(10); }} className="text-white hover:text-[var(--gold)] transition-colors hidden sm:block" title="Forward 10s">
              <SkipForward className="w-5 h-5" />
            </button>

            {/* Volume */}
            <div className="hidden sm:flex items-center gap-2 group">
              <button onClick={(e) => { e.stopPropagation(); toggleMute(); }} className="text-white hover:text-[var(--gold)] transition-colors">
                {muted || volume === 0 ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
              </button>
              <div className="w-0 overflow-hidden group-hover:w-20 transition-all duration-300">
                <input
                  type="range" min="0" max="1" step="0.05"
                  value={muted ? 0 : volume}
                  onChange={(e) => { e.stopPropagation(); handleVolume(parseFloat(e.target.value)); }}
                  onClick={(e) => e.stopPropagation()}
                  className="w-20 h-1 accent-[var(--gold)] cursor-pointer"
                />
              </div>
            </div>

            {/* Time */}
            <div className="text-white text-xs sm:text-sm font-mono tracking-wide flex-1">
              <span className="text-white/90">{fmt(currentTime)}</span>
              <span className="text-white/40 mx-1">/</span>
              <span className="text-white/50">{fmt(duration)}</span>
            </div>

            {/* Speed indicator */}
            <button
              onClick={(e) => { e.stopPropagation(); setShowSettings(!showSettings); }}
              className="text-white hover:text-[var(--gold)] transition-colors relative"
              title="Settings"
            >
              <Settings className={`w-5 h-5 transition-transform ${showSettings ? 'rotate-90' : ''}`} />
            </button>

            {/* PiP */}
            <button onClick={(e) => { e.stopPropagation(); togglePiP(); }} className="text-white hover:text-[var(--gold)] transition-colors hidden sm:block" title="Picture in Picture">
              <PictureInPicture2 className="w-5 h-5" />
            </button>

            {/* Fullscreen */}
            <button onClick={(e) => { e.stopPropagation(); toggleFullscreen(); }} className="text-white hover:text-[var(--gold)] transition-colors" title="Fullscreen">
              {fullscreen ? <Minimize className="w-5 h-5" /> : <Maximize className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </motion.div>

      {/* Settings panel */}
      <AnimatePresence>
        {showSettings && (
          <PlayerSettings
            currentRate={playbackRate}
            onRateChange={handleRateChange}
            onClose={() => setShowSettings(false)}
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
}
