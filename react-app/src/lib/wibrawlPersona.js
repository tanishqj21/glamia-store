import { useWibrawlCommerce } from './wibrawlStorefront';

const hubs = [
  ['/just-arrived','JUST SPAWNED','NEW SIGNING','Just Arrived — Fresh Drops & Latest Releases','Fresh drops / latest releases','Spawned','Signing'],
  ['/best-sellers','CURRENT META','TABLE LEADERS','Best Sellers — Top-Ranked Community Favorites','Best sellers / community favourites','Meta','Leaders'],
  ['/offers','LOOT','LOCKER ROOM DEALS','Special Offers — Limited-Time Price Drops & Deals','Offers / limited-time price drops','Loot','Deals'],
];
export function wibrawlPersona(value = 'gaming') {
  const mode = value === 'sports' ? 'sports' : 'gaming';
  const collections = hubs.map(([href,gaming,sports,tooltip,detail,gameShort,sportShort]) => ({href,title:mode === 'gaming' ? gaming : sports,tooltip,detail,short:mode === 'gaming' ? gameShort : sportShort}));
  return {mode,dark:mode === 'gaming',name:mode === 'gaming' ? 'Gaming Mode' : 'Sports Mode',deck:mode === 'gaming' ? 'Loadout' : 'Locker',collections,sections:{arrived:collections[0].title,best:collections[1].title,offers:collections[2].title},badge:mode === 'gaming' ? 'META' : 'LEADER',dealBadge:mode === 'gaming' ? 'LOOT' : 'DEAL'};
}
export function useWibrawlPersona(override) {const commerce = useWibrawlCommerce();return wibrawlPersona(override || commerce?.mode);}
