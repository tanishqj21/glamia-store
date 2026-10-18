/** @jsxRuntime automatic */
import { Link } from './Header';
import { useWibrawlClock, wibrawlCountdown } from '../lib/wibrawlStorefront';
import { formatIST } from '../lib/commerce';

export function WibrawlCampaign({ campaign, onNavigate }) {
  const now = useWibrawlClock(Boolean(campaign?.active && campaign.show_on_home !== false));
  if (!campaign || campaign.show_on_home === false || now == null) return null;
  const starts = Date.parse(campaign.starts_at || ''), ends = Date.parse(campaign.ends_at || '');
  if (!campaign.active || (Number.isFinite(starts) && starts > now) || (Number.isFinite(ends) && ends <= now)) return null;
  const href = String(campaign.cta_href || '/offers');
  const safeHref = /^\/(?!\/)/.test(href) ? href : '/offers';
  return <section className="wb-campaign" aria-label={campaign.name || 'Live event'}><div><p className="wibrawl-kicker"><span className="wb-live-dot" /> LIVE / {campaign.name}</p><h2>{campaign.headline || campaign.name}</h2>{campaign.message && <p>{campaign.message}</p>}</div><div className="wb-campaign-action">{Number.isFinite(ends) && <span className="wb-campaign-timer">ENDS IN {wibrawlCountdown(campaign.ends_at, now)}<small>{formatIST(campaign.ends_at, { dateStyle: 'medium', timeStyle: 'medium' })} IST</small></span>}<Link href={safeHref} className="wibrawl-primary-action" onNavigate={onNavigate}>{campaign.cta_label || 'Explore the event'}</Link></div></section>;
}
