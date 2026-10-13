import { useState, useEffect } from 'react';
import { Search, Heart, Settings, LogOut, Menu, X } from 'lucide-react';
import { useApp } from '@/lib/AppContext';

interface Props {
  onSearch: () => void;
  onAuth: (tab: 'login' | 'signup') => void;
  onWishlist: () => void;
  onAdmin: () => void;
  onNav: (section: string) => void;
}

export default function Navbar({ onSearch, onAuth, onWishlist, onAdmin, onNav }: Props) {
  const { user, logout } = useApp();
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [userMenu, setUserMenu] = useState(false);

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 30);
    window.addEventListener('scroll', handler, { passive: true });
    return () => window.removeEventListener('scroll', handler);
  }, []);

  const navItems = [
    { label: 'Home', key: 'home' },
    { label: 'Movies', key: 'movies' },
    { label: 'Series', key: 'series' },
    { label: 'Originals', key: 'originals' },
    { label: 'Genres', key: 'genres' },
  ];

  return (
    <nav className={`fixed top-0 left-0 right-0 z-[1000] flex items-center justify-between px-4 sm:px-8 lg:px-14 h-[var(--nav-h)] transition-all duration-300 ${scrolled ? 'bg-[var(--bg)]/95 backdrop-blur-xl border-b border-white/[.07]' : ''}`}>
      <div className="font-['Bebas_Neue'] text-2xl sm:text-3xl tracking-[3px] cursor-pointer" onClick={() => onNav('home')}>
        SK<span className="text-[var(--gold)]">FLIP</span>
      </div>

      {/* Desktop nav */}
      <ul className="hidden md:flex gap-4 lg:gap-8 list-none absolute left-1/2 -translate-x-1/2">
        {navItems.map(n => (
          <li key={n.key}>
            <button onClick={() => onNav(n.key)} className="text-[var(--muted-foreground)] hover:text-white text-sm font-medium tracking-wider transition-colors relative group">
              {n.label}
              <span className="absolute -bottom-1 left-0 right-0 h-0.5 bg-[var(--gold)] rounded-full scale-x-0 group-hover:scale-x-100 origin-left transition-transform" />
            </button>
          </li>
        ))}
      </ul>

      <div className="flex items-center gap-3">
        <button onClick={onSearch} className="p-2 text-[var(--muted-foreground)] hover:text-white transition-colors rounded-lg hover:bg-white/[.07]">
          <Search className="w-5 h-5" />
        </button>

        {user ? (
          <div className="relative">
            <button
              onClick={() => setUserMenu(!userMenu)}
              className="w-9 h-9 rounded-full bg-gradient-to-br from-[var(--gold)] to-orange-500 flex items-center justify-center font-bold text-sm text-black border-2 border-transparent hover:border-[var(--gold)] transition-colors"
            >
              {(user.name || 'U').slice(0, 2).toUpperCase()}
            </button>
            {userMenu && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setUserMenu(false)} />
                <div className="absolute right-0 top-12 bg-[var(--bg3)] border border-white/[.07] rounded-xl p-1.5 min-w-[210px] z-20 shadow-2xl">
                  <div className="px-3 py-2 border-b border-white/[.07] mb-1">
                    <p className="text-sm font-semibold">{user.name}</p>
                    <p className="text-xs text-[var(--muted-foreground)] break-all">{user.email}</p>
                    {user.role === 'admin' && <span className="text-[.65rem] font-bold tracking-wider px-1.5 py-0.5 rounded bg-[var(--gold)]/15 text-[var(--gold)] mt-1 inline-block">ADMIN</span>}
                  </div>
                  <button onClick={() => { onWishlist(); setUserMenu(false); }} className="w-full text-left px-3 py-2 rounded-lg text-sm text-[var(--muted-foreground)] hover:text-white hover:bg-white/5 flex items-center gap-2">
                    <Heart className="w-4 h-4" /> Wishlist
                  </button>
                  {user.role === 'admin' && (
                    <button onClick={() => { onAdmin(); setUserMenu(false); }} className="w-full text-left px-3 py-2 rounded-lg text-sm text-[var(--muted-foreground)] hover:text-white hover:bg-white/5 flex items-center gap-2">
                      <Settings className="w-4 h-4" /> Admin Portal
                    </button>
                  )}
                  <button onClick={() => { logout(); setUserMenu(false); }} className="w-full text-left px-3 py-2 rounded-lg text-sm text-[var(--red)] hover:bg-[var(--red)]/10 flex items-center gap-2">
                    <LogOut className="w-4 h-4" /> Sign Out
                  </button>
                </div>
              </>
            )}
          </div>
        ) : (
          <button onClick={() => onAuth('login')} className="hidden sm:block bg-[var(--gold)] text-black px-5 py-2 rounded-full text-sm font-bold hover:bg-[var(--gold2)] transition-all hover:-translate-y-0.5">
            Sign In
          </button>
        )}

        <button className="md:hidden p-2 text-white" onClick={() => setMenuOpen(!menuOpen)}>
          {menuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </div>

      {/* Mobile menu */}
      {menuOpen && (
        <div className="fixed top-0 right-0 bottom-0 w-[270px] bg-[var(--bg)]/98 backdrop-blur-xl border-l border-white/[.07] md:hidden z-[1001] flex flex-col justify-center gap-6 px-7">
          {navItems.map(n => (
            <button key={n.key} onClick={() => { onNav(n.key); setMenuOpen(false); }} className="text-white/70 hover:text-white text-lg font-medium text-left">
              {n.label}
            </button>
          ))}
          {!user && (
            <button onClick={() => { onAuth('login'); setMenuOpen(false); }} className="bg-[var(--gold)] text-black px-5 py-3 rounded-full text-sm font-bold mt-4">
              Sign In
            </button>
          )}
        </div>
      )}
    </nav>
  );
}
