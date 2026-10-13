import { Heart, Play } from 'lucide-react';
import { useApp } from '@/lib/AppContext';
import { isInWishlist } from '@/lib/store';
import type { Movie } from '@/lib/api';

interface Props {
  movie: Movie;
  showBelow?: boolean;
}

export default function MovieCard({ movie, showBelow = true }: Props) {
  const { openDetail, toggleWishlist, openPlayer } = useApp();
  const inW = isInWishlist(movie._id);
  const typeClass = movie.type === 'original' ? 'bg-[var(--cyan)]' : movie.type === 'series' ? 'bg-[var(--green)]' : 'bg-[var(--gold)]';
  const typeLabel = movie.type?.toUpperCase() || 'MOVIE';
  const hasImg = movie.posterUrl?.startsWith('http');
  const genres = movie._genres_normalized || [];

  return (
    <div
      className="flex-shrink-0 w-[clamp(130px,15vw,190px)] relative cursor-pointer rounded-xl overflow-visible transition-all duration-300 hover:scale-[1.07] hover:-translate-y-1 hover:shadow-2xl hover:z-10 group"
      onClick={() => openDetail(movie)}
    >
      <span className={`absolute top-2 left-2 z-10 ${typeClass} text-black text-[.62rem] font-bold tracking-wider px-1.5 py-0.5 rounded`}>{typeLabel}</span>
      {movie.rating && <span className="absolute top-2 right-2 z-10 bg-black/75 backdrop-blur text-[var(--gold)] text-[.7rem] font-bold px-1.5 py-0.5 rounded-md">⭐ {movie.rating}</span>}

      <button
        className={`absolute top-2 left-1/2 -translate-x-1/2 z-10 w-8 h-8 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 -translate-y-3 group-hover:translate-y-0 transition-all border-none ${inW ? 'bg-black/80 text-[var(--gold)]' : 'bg-black/70 text-white/60 hover:text-white'}`}
        onClick={(e) => { e.stopPropagation(); toggleWishlist(movie._id); }}
      >
        <Heart className="w-3.5 h-3.5" fill={inW ? 'currentColor' : 'none'} />
      </button>

      <div className="rounded-xl overflow-hidden relative">
        {hasImg ? (
          <img src={movie.posterUrl} alt={movie.title} loading="lazy" className="w-full aspect-[2/3] object-cover bg-[var(--surface)] transition-all duration-300 group-hover:brightness-[.65]" />
        ) : (
          <div className="w-full aspect-[2/3] bg-[var(--surface)] flex items-center justify-center text-xs text-white/40 p-2 text-center">{movie.title}</div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/30 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-3">
          <div
            className="hidden sm:flex w-10 h-10 bg-[var(--gold)] rounded-full items-center justify-center mx-auto mb-2 shadow-lg shadow-[var(--gold)]/50 hover:scale-110 transition-transform"
            onClick={(e) => { e.stopPropagation(); openPlayer(movie); }}
          >
            <Play className="w-4 h-4 text-black fill-black ml-0.5" />
          </div>
          <p className="text-[.7rem] text-white/60 text-center">{movie.releaseYear || ''}{genres[0] ? ' · ' + genres[0] : ''}</p>
        </div>
      </div>

      {showBelow && (
        <p className="text-[.75rem] font-semibold text-center pt-1.5 px-1 line-clamp-2 sm:hidden">{movie.title}</p>
      )}
    </div>
  );
}
