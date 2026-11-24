(() => {
  const form=document.getElementById('website-request');
  const output=document.getElementById('intake-result');
  const key='olipoly.website-intake.pending';
  let submissionId=sessionStorage.getItem(key) || crypto.randomUUID();
  let attempted=false;
  let originalData=null;
  sessionStorage.setItem(key,submissionId);
  form.addEventListener('input',()=>{
    if (attempted) {
      output.textContent='A previous attempt is awaiting confirmation. Retry the original request, or email OliPoly if you need to change it.';
    }
  });
  form.addEventListener('submit',async event=>{
    event.preventDefault();
    const data=originalData || new FormData(form);
    data.set('submissionId',submissionId);
    originalData=data;
    form.inert=true;
    output.textContent='Saving your request…';
    attempted=true;
    try {
      const endpoint=form.dataset.endpoint || '/api/intake';
      const response=await fetch(endpoint,{method:'POST',body:data,credentials:new URL(endpoint,location.href).origin===location.origin?'same-origin':'omit'});
      const result=await response.json();
      if (!response.ok) throw Object.assign(Error(result.error || 'Unable to save the request.'),{canEdit:result.canEdit===true});
      form.hidden=true;
      const heading=document.createElement('h2');heading.textContent=`Request ${result.reference} received.`;
      const detail=document.createElement('p');detail.textContent='Your details are saved. OliPoly will review the request and follow up by email.';
      const link=document.createElement('a');link.href=form.dataset.newRequestUrl || 'start-project.html';link.textContent='Start another request';
      output.replaceChildren(heading,detail,link);
      sessionStorage.removeItem(key);
    } catch(error) {
      output.textContent=error.canEdit ? `${error.message} Correct the form and submit again.` : `${error.message} Your original details and files are preserved in this tab. Retry this request using the same details. Email OliPoly if you need to change an interrupted request.`;
      form.inert=false;
      form.querySelectorAll('input,select,textarea').forEach(field=>{field.disabled=!error.canEdit;});
      form.querySelector('[type="submit"]').textContent=error.canEdit?'Send project request':'Retry this request';
      if(error.canEdit) {originalData=null;attempted=false;}
    }
  });
})();
