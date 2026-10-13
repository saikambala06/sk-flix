export default function Footer() {
  return (
    <footer className="bg-[var(--bg2)] border-t border-white/[.07] px-4 sm:px-14 pt-14 pb-7 mt-16">
      <div className="flex flex-wrap gap-14 mb-11">
        <div className="max-w-[300px]">
          <div className="font-['Bebas_Neue'] text-2xl tracking-[3px] mb-3">SK<span className="text-[var(--gold)]">FLIP</span></div>
          <p className="text-white/40 text-sm leading-relaxed">The next generation streaming platform. Movies, series, and originals — anywhere, anytime.</p>
        </div>
        <div className="flex gap-11 flex-wrap flex-1">
          <div className="flex flex-col gap-2.5 min-w-[120px]">
            <h4 className="text-xs font-bold tracking-widest uppercase mb-1">Browse</h4>
            {['Movies', 'Series', 'Originals', 'Genres'].map(l => (
              <span key={l} className="text-white/40 text-sm cursor-pointer hover:text-[var(--gold)] transition-colors">{l}</span>
            ))}
          </div>
          <div className="flex flex-col gap-2.5 min-w-[120px]">
            <h4 className="text-xs font-bold tracking-widest uppercase mb-1">Legal</h4>
            {['Privacy Policy', 'Terms of Use', 'Cookie Settings'].map(l => (
              <span key={l} className="text-white/40 text-sm cursor-pointer hover:text-[var(--gold)] transition-colors">{l}</span>
            ))}
          </div>
        </div>
      </div>
      <div className="border-t border-white/[.07] pt-5 flex justify-between flex-wrap gap-2">
        <p className="text-white/30 text-xs">© 2025 SkFlip. All rights reserved.</p>
        <p className="text-white/30 text-xs">Made with ❤️ for cinema lovers</p>
      </div>
    </footer>
  );
}
