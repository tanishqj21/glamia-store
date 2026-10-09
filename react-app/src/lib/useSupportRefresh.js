import { useEffect, useRef, useState } from 'react';
import { apiFetch } from './api';

// Only the selected conversation refreshes. Hidden/offline tabs do no work.
export function useSupportRefresh(path, onData, onError) {
  const dataRef=useRef(onData),errorRef=useRef(onError);
  useEffect(()=>{dataRef.current=onData;errorRef.current=onError;},[onData,onError]);
  const [version,setVersion]=useState(0);
  useEffect(()=>{
    if(!path)return;
    let disposed=false,inFlight=false,timer,controller,failures=0,expired=false;
    async function refresh(){
      clearTimeout(timer);
      if(disposed||expired||inFlight||document.hidden||!navigator.onLine)return;
      inFlight=true;controller=new AbortController();
      const timeout=setTimeout(()=>controller.abort(),15000);
      try{
        const response=await apiFetch(path,{signal:controller.signal});
        if([401,403].includes(response.status)){expired=true;if(!disposed)dataRef.current({tickets:[],messages:[]});throw Error('Sign in again to view support conversations.');}
        const data=await response.json();
        if(!response.ok)throw Error(data.error||'Could not refresh support');
        if(!disposed){dataRef.current(data);failures=0;}
      }catch(error){if(!disposed){failures++;errorRef.current(error.message);}}
      finally{clearTimeout(timeout);inFlight=false;if(!disposed&&!expired)timer=setTimeout(refresh,Math.min(300000,30000*2**failures));}
    }
    const resume=()=>{if(!document.hidden&&navigator.onLine)refresh();};
    refresh();document.addEventListener('visibilitychange',resume);window.addEventListener('online',resume);
    return()=>{disposed=true;clearTimeout(timer);controller?.abort();document.removeEventListener('visibilitychange',resume);window.removeEventListener('online',resume);};
  },[path,version]);
  return ()=>setVersion(value=>value+1);
}
