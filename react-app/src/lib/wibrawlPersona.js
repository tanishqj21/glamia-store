import { useWibrawlCommerce } from './wibrawlStorefront';

const hubs = [
  ['/just-arrived','JUST SPAWNED','Just Arrived — Fresh Drops & Latest Releases','Fresh drops / latest releases','Spawned'],
  ['/best-sellers','CURRENT META','Best Sellers — Top-Ranked Community Favorites','Best sellers / community favourites','Meta'],
  ['/offers','LOOT','Special Offers — Limited-Time Price Drops & Deals','Offers / limited-time price drops','Loot'],
];
export function wibrawlPersona(value = 'gaming') {
  const mode = value === 'sports' ? 'sports' : 'gaming';
  const collections = hubs.map(([href,title,tooltip,detail,short]) => ({href,title,tooltip,detail,short}));
  return {mode,dark:mode === 'gaming',name:mode === 'gaming' ? 'Gaming Mode' : 'Sports Mode',deck:'The edit',collections,sections:{arrived:collections[0].title,best:collections[1].title,offers:collections[2].title},badge:'META',dealBadge:'LOOT'};
}
export function useWibrawlPersona(override) {const commerce = useWibrawlCommerce();return wibrawlPersona(override || commerce?.mode);}
