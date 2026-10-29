const preference='money_hide_debt';
export const debtHidden=()=>document.getElementById('app')?.dataset.debtHidden==='true';
export function setupDebtPrivacy(){
 const app=document.getElementById('app'),button=document.getElementById('debtPrivacy');
 const apply=(hidden,remember=false)=>{
  app.dataset.debtHidden=String(hidden);button.textContent=hidden?'Show debt':'Hide debt';button.setAttribute('aria-pressed',String(hidden));
  document.getElementById('debtPrivacyState').hidden=!hidden;
  document.dispatchEvent(new window.CustomEvent('money-privacy-changed',{detail:{hidden}}));
  if(remember)try{window.localStorage.setItem(preference,hidden?'1':'0');}catch{}
 };
 let hidden=false;try{hidden=window.localStorage.getItem(preference)==='1';}catch{}
 apply(hidden);button.onclick=()=>apply(!debtHidden(),true);
 window.addEventListener('storage',event=>{if(event.key===preference)apply(event.newValue==='1');});
}
