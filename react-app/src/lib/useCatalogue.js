import { useEffect, useState } from 'react';
import { apiFetch } from './api';
import { normalizeProduct } from './productPresentation';

export function useCatalogue({enabled,category,subcategory,subsubcategory,query,color,size,minPrice,maxPrice,sort,mode,initial=null}){
  const [page,setPage]=useState(1),[version,setVersion]=useState(0);
  const params=new URLSearchParams({view:'cards',include_stock:'1',limit:'24',sort,facets:'1'});
  for(const [key,value]of Object.entries({category:category==='All'?'':category,subcategory,subsubcategory,q:query,color_family:color,size,min_price:minPrice,max_price:maxPrice,offers:mode==='/offers'?'1':'',featured:mode==='/best-sellers'?'1':''}))if(value!==''&&value!=null)params.set(key,value);
  const identity=params.toString();
  const [result,setResult]=useState(()=>{
    let seed=initial;
    if(!seed&&typeof document!=='undefined')try{
      const data=JSON.parse(document.getElementById('glamia-catalogue-bootstrap')?.textContent||'null');
      if(data?.path===window.location.pathname&&!window.location.search)seed=data.catalogue;
    }catch{/* Unavailable bootstrap uses the normal API path. */}
    return seed?.identity===identity
      ?{...seed,products:(seed.products||[]).map(normalizeProduct),loading:false,error:''}
      :{products:[],loading:true,error:'',pagination:null,facets:{colors:[],sizes:[]},identity:''};
  });
  const [lastIdentity,setLastIdentity]=useState(identity);
  if(lastIdentity!==identity){setLastIdentity(identity);setPage(1);}
  useEffect(()=>{
    if(!enabled)return;
    const controller=new AbortController();let active=true;
    setResult(current=>({...current,loading:page>1||current.identity!==identity||!current.products.length,error:'',...(page===1&&current.identity!==identity?{products:[]}: {})}));
    const timer=setTimeout(async()=>{
      const timeout=setTimeout(()=>controller.abort(),20000);
      try{
        const response=await apiFetch(`/api/products?${identity}&page=${page}`,{signal:controller.signal,cacheTtl:30000});
        const data=await response.json();if(!response.ok)throw Error(data.error||'Collection unavailable');
        if(active)setResult(current=>({products:page===1?(data.products||[]).map(normalizeProduct):[...current.products,...(data.products||[]).map(normalizeProduct)].filter((item,index,all)=>all.findIndex(p=>p.id===item.id)===index),loading:false,error:'',pagination:data.pagination,facets:data.facets||current.facets,identity}));
      }catch(error){if(active)setResult(current=>({...current,loading:false,error:error.name==='AbortError'?'Collection check timed out. Try again.':error.message}));}
      finally{clearTimeout(timeout);}
    },200);
    return()=>{active=false;clearTimeout(timer);controller.abort();};
  },[enabled,identity,page,version]);
  return {...result,loadMore:()=>setPage(value=>value+1),retry:()=>setVersion(value=>value+1)};
}
