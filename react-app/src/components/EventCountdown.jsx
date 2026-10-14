import React, { useEffect, useState } from 'react';
import { countdownText } from '../lib/countdown';

export function EventCountdown({ endsAt }) {
  const [now,setNow]=useState(null);
  useEffect(()=>{
    if(!endsAt)return;
    let timer;
    const update=()=>{
      window.clearTimeout(timer);
      const time=Date.now();setNow(time);
      if(Date.parse(endsAt)>time&&!document.hidden)timer=window.setTimeout(update,1000-time%1000);
    };
    update();document.addEventListener('visibilitychange',update);
    return()=>{window.clearTimeout(timer);document.removeEventListener('visibilitychange',update);};
  },[endsAt]);
  const text=now===null?'':countdownText(endsAt,now);
  return text?<span className="event-countdown" aria-live="off">{text}</span>:null;
}
