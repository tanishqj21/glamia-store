import { Link } from './Header';
import { Icon } from './Icon';
import { useWibrawlPersona } from '../lib/wibrawlPersona';
import { WibrawlHint } from './WibrawlHint';

export function WibrawlFooter({ storefront, onNavigate, mode }) {
  const persona = useWibrawlPersona(mode);
  const socials = Object.entries(storefront?.socials || {}).filter(([,url]) => typeof url === 'string' && /^https:\/\//.test(url));
  return <footer className="wb-stadium-footer"><div className="wb-footer-signature"><Link href="/" onNavigate={onNavigate} aria-label="Wibrawl"><span className="wb-logo-badge"><img alt="Wibrawl" src="/wibrawl/logo.svg?v=master-a" width="1025" height="815" loading="lazy" /></span></Link><p>Your vibe.<br />Your rules.</p><span className="wb-tech">INDEPENDENT EXPRESSION / EVERYDAY ROTATION</span></div><div className="wb-footer-routes"><nav aria-label="Explore Wibrawl">{persona.collections.map(hub => <WibrawlHint id={"wb-footer-"+hub.href.slice(1)} key={hub.href} label={hub.tooltip}><Link href={hub.href} onNavigate={onNavigate}>{hub.title}</Link></WibrawlHint>)}{[['/about','Our story'],['/support','Customer care'],['/track-order','Track an order']].map(([href,text]) => <Link key={href} href={href} onNavigate={onNavigate}>{text}</Link>)}</nav><nav aria-label="Policies">{[['/terms-and-conditions','Terms'],['/privacy-policy','Privacy'],['/return-policy','Returns'],['/refund-cancellation-policy','Refunds'],['/shipping-policy','Shipping']].map(([href,text]) => <Link key={href} href={href} onNavigate={onNavigate}>{text}</Link>)}</nav>{!!socials.length && <nav aria-label="Wibrawl social links">{socials.map(([name,url]) => <a href={url} target="_blank" rel="noopener noreferrer" key={name}><Icon name={name} size={16} />{name}</a>)}</nav>}</div><div className="wb-footer-baseline"><span className="wb-tech">NO FILTER. ALL YOU.</span><small>A brand from <a href="https://glamiastore.com">Glamia</a>.</small></div></footer>;
}
