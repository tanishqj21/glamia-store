import React from 'react';
import { collectionNames } from '../../../src/storefront-identity.js';
import { Link } from './Header';

export function WibrawlHome({ theme, onNavigate, children }) {
  const names = collectionNames(theme);
  const gaming = theme === 'gaming';
  const campaign = gaming ? 'gaming' : 'sports';
  return <div className={`wibrawl-home wibrawl-home-${theme}`}>
    <section className="wibrawl-hero" aria-labelledby="wibrawl-title">
      <div className="wibrawl-hero-copy">
        <p className="wibrawl-kicker">Pick your side.</p>
        <h1 id="wibrawl-title"><span className="wibrawl-hero-line">WEAR YOUR</span><span>WORLD.</span></h1>
        <p className="wibrawl-hero-intro">From late-night lobbies to matchday. Tees for everything you're into.</p>
        <div className="wibrawl-hero-actions">
          <Link className="wibrawl-primary-action" href="/just-arrived" onNavigate={onNavigate}>Shop {names.arrived}</Link>
          <Link className="wibrawl-secondary-action" href="/best-sellers" onNavigate={onNavigate}>{names.best}</Link>
        </div>
      </div>
      <figure className="wibrawl-hero-visual">
        <img key={campaign} src={`/wibrawl/${campaign}-campaign-960.webp`} srcSet={`/wibrawl/${campaign}-campaign-640.webp 640w, /wibrawl/${campaign}-campaign-960.webp 960w`} sizes="(max-width: 700px) 100vw, 50vw" width="960" height="1200" alt={gaming ? 'Wibrawl campaign concept: original manga artwork on a black graphic tee.' : 'Wibrawl campaign concept: original manga basketball artwork on a light graphic tee.'} fetchPriority="high" decoding="async" />
      </figure>
    </section>
    <div className="wibrawl-culture-strip" aria-label="Made for your interests">
      {['Gaming', 'Anime', 'Sports', 'Movies', 'Music', 'Memes'].map(interest => <span key={interest}>{interest}</span>)}
    </div>
    <nav className="wibrawl-collection-nav" aria-label="Discover collections">
      <Link href="/just-arrived" onNavigate={onNavigate}><span className="wibrawl-collection-symbol" aria-hidden="true">+</span><div><h2>{names.arrived}</h2><p>{gaming ? 'Fresh out of the lobby.' : 'Fresh additions to your line-up.'}</p></div></Link>
      <Link href="/best-sellers" onNavigate={onNavigate}><span className="wibrawl-collection-symbol" aria-hidden="true">*</span><div><h2>{names.best}</h2><p>The crowd favourites.</p></div></Link>
      <Link href="/offers" onNavigate={onNavigate}><span className="wibrawl-collection-symbol wibrawl-percent" aria-hidden="true">%</span><div><h2>{names.offers}</h2><p>More tee. Less spend.</p></div></Link>
    </nav>
    {children}
    <section className="wibrawl-manifesto" aria-labelledby="wibrawl-manifesto-title">
      <p>Whatever you're into,<br />you're in.</p>
      <div><h2 id="wibrawl-manifesto-title">NO SINGLE<br />PLAYER ENERGY.</h2><p>For the fandoms, the rivalries, the playlists, and the inside jokes. Wear what brings you together.</p><Link className="wibrawl-secondary-action" href="/about" onNavigate={onNavigate}>Meet Wibrawl</Link></div>
    </section>
  </div>;
}

export function WibrawlAbout({ onNavigate }) {
  return <main className="page-main wibrawl-about"><p className="wibrawl-kicker">Meet Wibrawl</p><h1>YOUR INTERESTS.<br /><span>YOUR IDENTITY.</span></h1><p>Wibrawl brings gaming, anime, sports, movies, music, and internet culture into everyday graphic tees.</p><p>Some days it's your favourite game. Some days it's your team, a lyric, or a joke only your friends get. You don't have to choose one world.</p><Link className="wibrawl-primary-action" href="/just-arrived" onNavigate={onNavigate}>Explore the tees</Link><p className="wibrawl-about-origin">A brand from <a href="https://glamiastore.com">Glamia</a>.</p></main>;
}
