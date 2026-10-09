const key='glamia-recently-viewed';
export function recentProductIds(){
  try{const ids=JSON.parse(localStorage.getItem(key)||'[]');return Array.isArray(ids)?ids.filter(id=>typeof id==='string'&&id.length<150).slice(0,12):[];}catch{return [];}
}
export function rememberProduct(id){try{localStorage.setItem(key,JSON.stringify([id,...recentProductIds().filter(value=>value!==id)].slice(0,12)));}catch{/* Browsing works without persistent storage. */}}
