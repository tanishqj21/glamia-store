import React, {useEffect,useState} from 'react';
import {apiFetch} from '../lib/api';
import {recentProductIds} from '../lib/recentlyViewed';
import {money,productUrl,sellingPrice} from '../lib/commerce';

export function RecentlyViewed({onNavigate}){
  const [products,setProducts]=useState([]);
  useEffect(()=>{
    const ids=recentProductIds().slice(0,6);if(!ids.length)return;
    const controller=new AbortController();
    apiFetch('/api/products?'+new URLSearchParams({ids:ids.join(','),view:'cards',limit:'6'}),{signal:controller.signal,cacheTtl:60000}).then(async response=>{if(!response.ok)return;const data=await response.json();if(!controller.signal.aborted)setProducts(ids.map(id=>(data.products||[]).find(p=>p.id===id)).filter(Boolean));}).catch(()=>{});
    return()=>controller.abort();
  },[]);
  if(!products.length)return null;
  return <section className="recently-viewed" aria-label="Recently viewed"><h2>Recently viewed</h2><div className="recently-viewed-list">{products.map(product=><button type="button" key={product.id} onClick={()=>onNavigate(productUrl(product))}>{product.image_url&&<img src={product.image_url} alt="" loading="lazy"/>}<span>{product.name}</span><small>{money(sellingPrice(product))}</small></button>)}</div></section>;
}
