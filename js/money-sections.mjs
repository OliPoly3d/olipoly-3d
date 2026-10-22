export function sectionPreview(id,text){const span=document.getElementById(id+'Preview');if(span)span.textContent=text;}
export function revealSection(element){for(let node=element;node;node=node.parentElement)if(node.tagName==='DETAILS')node.open=true;}
export function setupSections(){
 const sections=()=>document.querySelectorAll('#app > details.section-panel');
 document.getElementById('collapseSections').onclick=()=>{for(const panel of sections())panel.open=false;};
 document.getElementById('expandSections').onclick=()=>{for(const panel of sections())panel.open=true;};
 document.addEventListener('click',event=>{const link=event.target.closest('a[href^="#"]');if(link){const target=document.getElementById(link.getAttribute('href').slice(1));if(target)revealSection(target);}});
 const hash=()=>{const target=document.getElementById(window.location.hash.slice(1));if(target)revealSection(target);};
 window.addEventListener('hashchange',hash);hash();
}
