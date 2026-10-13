import { useState } from 'react';
import { motion } from 'framer-motion';
import { ChevronLeft, Play, Heart, ThumbsUp, ThumbsDown, Share2, RotateCcw } from 'lucide-react';
import { useApp } from '@/lib/AppContext';
import { isInWishlist } from '@/lib/store';
import type { Movie, Episode } from '@/lib/api';
import MovieCard from './MovieCard';
import { toast } from 'sonner';

interface Props {
  movie: Movie;
  onClose: () => void;
}

export default function DetailOverlay({ movie, onClose }: Props) {
  const { openPlayer, toggleWishlist, allContent } = useApp();
  const [descExpanded, setDescExpanded] = useState(false);
  const inW = isInWishlist(movie._id);
  const isSeries = movie.type === 'series' || movie.type === 'original';
  const genres = movie._genres_normalized || [];
  const hasVideo = !!(movie.videoUrl || movie.hlsUrl);
  const episodes = Array.isArray(movie.episodes) ? movie.episodes : [];
  const seasons = new Map<number, Episode[]>();
  episodes.forEach(ep => {
    const s = ep.season || ep.seasonNumber || 1;
    if (!seasons.has(s)) seasons.set(s, []);
    seasons.get(s)!.push(ep);
  });
  const [activeSeason, setActiveSeason] = useState(seasons.size > 0 ? Math.min(...seasons.keys()) : 1);
  const seasonEps = (seasons.get(activeSeason) || []).sort((a, b) => (a.episodeNumber || 0) - (b.episodeNumber || 0));

  const similar = allContent.filter(m => m._id !== movie._id && genres.some(g => (m._genres_normalized || []).some(mg => mg.toLowerCase() === g.toLowerCase()))).slice(0, 15);

  const playFirst = () => {
    const ep = episodes.find(e => e.videoUrl || e.hlsUrl);
    if (ep) openPlayer({ ...movie, videoUrl: ep.videoUrl || '', hlsUrl: ep.hlsUrl || '', _episodeTitle: ep.title } as any);
    else if (hasVideo) openPlayer(movie);
    else toast.info('No video available');
  };

  const hasImg = movie.backdropUrl?.startsWith('http') || movie.posterUrl?.startsWith('http');
  const imgSrc = movie.backdropUrl || movie.posterUrl || '';

  return (
    <motion.div
      className="fixed inset-0 z-[2000] bg-[#0a0a12] overflow-y-auto"
      initial={{ opacity: 0, y: 32 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 32 }}
      transition={{ duration: 0.32 }}
    >
      <div className="max-w-[780px] mx-auto w-full pb-20">
        {/* Backdrop */}
        {hasImg && (
          <div className="relative w-full aspect-video overflow-hidden bg-black/50">
            <img src={imgSrc} alt={movie.title} className="w-full h-full object-cover object-top" />
            <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-[#0a0a12]" />
            <button onClick={onClose} className="absolute top-4 left-4 z-10 w-10 h-10 rounded-full bg-black/60 backdrop-blur-lg flex items-center justify-center text-white hover:bg-white/20 transition-all hover:-translate-x-0.5">
              <ChevronLeft className="w-5 h-5" />
            </button>
          </div>
        )}
        {!hasImg && (
          <div className="h-16 relative">
            <button onClick={onClose} className="absolute top-3 left-4 w-10 h-10 rounded-full bg-black/60 flex items-center justify-center text-white hover:bg-white/20 transition-all">
              <ChevronLeft className="w-5 h-5" />
            </button>
          </div>
        )}

        <div className="px-5">
          <h1 className="font-['Bebas_Neue'] text-[clamp(2.2rem,8vw,3.2rem)] tracking-wider leading-tight mb-1">{movie.title}</h1>

          {isSeries && (
            <p className="text-sm text-white/50 mb-3">
              {movie.seasonCount ? `${movie.seasonCount} Season${movie.seasonCount > 1 ? 's' : ''}` : ''}
              {episodes.length ? ` · ${episodes.length} Episode${episodes.length !== 1 ? 's' : ''}` : ''}
            </p>
          )}

          <span className="inline-flex items-center gap-1.5 bg-[var(--cyan)]/10 border border-[var(--cyan)]/25 text-[var(--cyan)] px-3 py-1 rounded-md text-xs font-semibold tracking-wider mb-5">
            ✓ SkFlip {isSeries ? 'Series' : 'Films'}
          </span>

          {/* Play button */}
          <button
            onClick={isSeries ? playFirst : () => openPlayer(movie)}
            disabled={!hasVideo && !episodes.some(e => e.videoUrl || e.hlsUrl)}
            className="w-full flex items-center justify-center gap-2.5 bg-white text-black py-4 rounded-xl font-bold text-base hover:bg-white/90 transition-colors disabled:opacity-30 disabled:cursor-not-allowed mb-6"
          >
            <Play className="w-5 h-5 fill-current" />
            {isSeries ? 'Play Episode 1' : hasVideo ? 'Play Now' : 'No Video Available'}
          </button>

          {/* Action buttons */}
          <div className="flex items-start gap-7 mb-6 pb-5 border-b border-white/[.07] overflow-x-auto">
            {[
              { icon: <RotateCcw className="w-[18px] h-[18px]" />, label: 'Start over', action: isSeries ? playFirst : () => openPlayer(movie) },
              { icon: <Heart className="w-[18px] h-[18px]" fill={inW ? 'currentColor' : 'none'} />, label: inW ? 'Wishlisted' : 'Watchlist', action: () => toggleWishlist(movie._id), active: inW },
              { icon: <ThumbsUp className="w-[18px] h-[18px]" />, label: 'Like', action: () => toast.success('Thanks!') },
              { icon: <ThumbsDown className="w-[18px] h-[18px]" />, label: 'Not for me', action: () => toast.info('Noted') },
              { icon: <Share2 className="w-[18px] h-[18px]" />, label: 'Share', action: () => { navigator.clipboard?.writeText(window.location.href); toast.success('Link copied!'); } },
            ].map((btn, i) => (
              <button key={i} onClick={btn.action} className={`flex flex-col items-center gap-1.5 flex-shrink-0 transition-colors ${btn.active ? 'text-[var(--gold)]' : 'text-white hover:text-[var(--gold)]'}`}>
                <div className={`w-11 h-11 rounded-full flex items-center justify-center transition-colors ${btn.active ? 'bg-[var(--gold)]/15' : 'bg-white/[.07] hover:bg-white/[.13]'}`}>
                  {btn.icon}
                </div>
                <span className="text-[.72rem] text-white/50 whitespace-nowrap">{btn.label}</span>
              </button>
            ))}
          </div>

          {/* Description */}
          {movie.description && (
            <>
              <p className={`text-sm text-white/70 leading-relaxed mb-2 ${descExpanded ? '' : 'line-clamp-3'}`}>{movie.description}</p>
              <button onClick={() => setDescExpanded(!descExpanded)} className="text-[var(--cyan)] text-sm mb-4">{descExpanded ? 'less' : 'more details'}</button>
            </>
          )}

          {/* Meta */}
          {genres.length > 0 && <p className="text-sm text-white/50 mb-2">{genres.join(' • ')}</p>}
          <div className="flex items-center gap-3 flex-wrap mb-4">
            {movie.rating && <span className="text-sm font-semibold">IMDb <span className="text-[var(--gold)]">{movie.rating}</span></span>}
            {movie.releaseYear && <span className="text-sm text-white/50">{movie.releaseYear}</span>}
          </div>

          {/* Episodes */}
          {isSeries && seasons.size > 0 && (
            <div className="mt-6">
              {seasons.size > 1 && (
                <div className="flex gap-0 border-b-2 border-white/[.08] mb-4">
                  {[...seasons.keys()].sort().map(s => (
                    <button
                      key={s}
                      onClick={() => setActiveSeason(s)}
                      className={`px-4 py-3 text-sm font-semibold border-b-[3px] -mb-[2px] transition-colors ${s === activeSeason ? 'text-white border-[var(--cyan)]' : 'text-white/40 border-transparent hover:text-white/60'}`}
                    >
                      Season {s}
                    </button>
                  ))}
                </div>
              )}
              <div className="flex flex-col">
                {seasonEps.map(ep => {
                  const hasVid = !!(ep.videoUrl || ep.hlsUrl);
                  return (
                    <div
                      key={ep.episodeNumber}
                      onClick={() => hasVid && openPlayer({ ...movie, videoUrl: ep.videoUrl || '', hlsUrl: ep.hlsUrl || '', _episodeTitle: ep.title } as any)}
                      className={`flex items-center gap-3.5 py-3.5 border-b border-white/5 rounded-lg transition-colors ${hasVid ? 'cursor-pointer hover:bg-white/[.03] hover:pl-2' : 'opacity-40'}`}
                    >
                      <div className={`w-11 h-11 rounded-full flex-shrink-0 flex items-center justify-center ${hasVid ? 'bg-white/10' : 'bg-white/5'}`}>
                        <Play className="w-4 h-4 fill-current ml-0.5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold">
                          <span className="text-white/40 mr-1.5 text-xs">EP {ep.episodeNumber}</span>
                          {ep.title || `Episode ${ep.episodeNumber}`}
                        </p>
                        <p className="text-xs text-white/40">{ep.duration ? ep.duration + ' min' : ''}{ep.airDate ? ' · ' + ep.airDate : ''}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* More Like This */}
          {similar.length > 0 && (
            <div className="mt-8">
              <h3 className="text-sm font-semibold text-white/60 tracking-wider uppercase mb-4">More Like This</h3>
              <div className="card-row">
                {similar.map(m => <MovieCard key={m._id} movie={m} />)}
              </div>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}
