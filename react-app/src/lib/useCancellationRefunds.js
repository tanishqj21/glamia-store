import { useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch } from './api';

export function useCancellationRefunds(orders,setOrders) {
  const [error,setError]=useState('');
  const readRef=useRef(null);
  const activeKey=orders.filter(order=>['approved','submitting','pending','reconciliation_required'].includes(order.cancellation_refund?.state)).map(order=>order.id).sort().join(',');
  const refresh=useCallback(()=>readRef.current?.(),[]);
  useEffect(()=>{
    let disposed=false,pending=false,timer,controller,failures=0,expired=false;
    const available=()=>document.visibilityState==='visible'&&navigator.onLine&&!expired;
    async function read() {
      clearTimeout(timer);
      if(disposed||pending||!available())return;
      pending=true;controller=new AbortController();
      const timeout=setTimeout(()=>controller.abort(),15000);
      try {
        const response=await apiFetch('/api/orders?cancellation_updates=1',{cache:'no-store',signal:controller.signal});
        if([401,403].includes(response.status)){expired=true;throw Error('Sign in again to view cancellation refund updates.');}
        if(!response.ok)throw Error('Could not refresh cancellation refunds. Shown statuses are the last known updates.');
        const data=await response.json();
        if(!Array.isArray(data.orders))throw Error('Could not refresh cancellation refunds.');
        if(!disposed){const updates=new Map(data.orders.map(order=>[order.id,order]));setOrders(current=>current.map(order=>updates.get(order.id)||order));setError('');failures=0;}
      }catch(cause){if(!disposed){failures++;setError(cause.message);}}
      finally{clearTimeout(timeout);pending=false;if(!disposed&&activeKey&&available())timer=setTimeout(read,Math.min(300000,60000*2**Math.min(failures,3)));}
    }
    function resume(){clearTimeout(timer);if(activeKey&&available())read();}
    readRef.current=read;
    if(activeKey)read();
    document.addEventListener('visibilitychange',resume);window.addEventListener('online',resume);window.addEventListener('offline',resume);
    return()=>{disposed=true;clearTimeout(timer);controller?.abort();readRef.current=null;document.removeEventListener('visibilitychange',resume);window.removeEventListener('online',resume);window.removeEventListener('offline',resume);};
  },[activeKey,setOrders]);
  return {error,refresh};
}
