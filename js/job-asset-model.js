(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.OliPolyJobAssets=api;})(typeof self!=='undefined'?self:this,function(){
  'use strict';
  const MAX_FILE_SIZE=100*1024*1024;
  const EXTENSIONS=new Set(['f3d','f3z','step','stp','stl','3mf','png','jpg','jpeg','webp','pdf','svg','dxf','dwg','ai','eps','zip','txt','md','doc','docx']);
  const CATEGORIES=Object.freeze(['fusion_source','step','stl','slicer_project','reference_image','finished_photo','assembly_instructions','packaging_template','customer_artwork','production_document','other']);
  const LINK_TYPES=new Set(['recipe','quote','order','production_job','customer']);
  const clean=value=>String(value??'').trim();
  const extension=name=>{const value=clean(name).toLowerCase(),index=value.lastIndexOf('.');return index<1?'':value.slice(index+1)};
  function validateFile(file){if(!file||!clean(file.name)||!Number(file.size))throw new Error('Choose a non-empty file.');if(Number(file.size)>MAX_FILE_SIZE)throw new Error('File exceeds the 100 MB limit.');if(!EXTENSIONS.has(extension(file.name)))throw new Error('This file type is not allowed.');return true;}
  function safeStoragePath(userId,assetId,revision,filename){
    const owner=clean(userId).toLowerCase();if(!/^[0-9a-f-]{20,}$/.test(owner))throw new Error('A valid authenticated owner is required.');
    const id=clean(assetId).toLowerCase();if(!/^[0-9a-f-]{20,}$/.test(id))throw new Error('A valid asset ID is required.');
    const ext=extension(filename);if(!EXTENSIONS.has(ext))throw new Error('This file type is not allowed.');
    const version=Math.max(1,parseInt(revision,10)||1);return `${owner}/${id}/r${version}/${id}.${ext}`;
  }
  function normalizeLinks(links){const seen=new Set();return (Array.isArray(links)?links:[]).map(link=>({record_type:clean(link.record_type),record_key:clean(link.record_key),asset_revision_id:clean(link.asset_revision_id)||null})).filter(link=>LINK_TYPES.has(link.record_type)&&link.record_key&&(!seen.has(`${link.record_type}:${link.record_key}`)&&seen.add(`${link.record_type}:${link.record_key}`)));}
  function buildMetadata(input){const now=input.uploaded_at||new Date().toISOString(),revision=Math.max(1,parseInt(input.revision,10)||1),links=normalizeLinks(input.links);if(!CATEGORIES.includes(input.category))throw new Error('Choose a valid asset category.');if(!links.length)throw new Error('Link the asset to at least one record.');return Object.freeze({id:clean(input.id),owner_id:clean(input.owner_id),filename:clean(input.filename),storage_path:clean(input.storage_path),mime_type:clean(input.mime_type)||'application/octet-stream',category:input.category,file_size:Number(input.file_size),revision,revision_group_id:clean(input.revision_group_id)||clean(input.id),description:clean(input.description)||null,uploaded_at:now,uploaded_by:clean(input.uploaded_by)||null,status:input.status==='archived'?'archived':'active',designation:input.designation==='customer_supplied'?'customer_supplied':'internal',sha256:clean(input.sha256),links});}
  function currentVersions(rows){const selected=new Map();for(const row of rows||[]){if(row.status==='archived')continue;const key=row.revision_group_id||row.id,current=selected.get(key);if(!current||Number(row.revision)>Number(current.revision)||(Number(row.revision)===Number(current.revision)&&String(row.uploaded_at)>String(current.uploaded_at)))selected.set(key,row);}return [...selected.values()];}
  function nextRevision(previous,changes){if(!previous?.id)throw new Error('A previous asset revision is required.');return {...previous,...changes,id:clean(changes?.id),revision_group_id:previous.revision_group_id||previous.id,revision:Number(previous.revision||1)+1,status:'active',supersedes_asset_id:previous.id,uploaded_at:changes?.uploaded_at||new Date().toISOString()};}
  function archive(row,archived=true){return {...row,status:archived?'archived':'active',archived_at:archived?new Date().toISOString():null};}
  function deepLink(link){const key=encodeURIComponent(link.record_key);return {recipe:`product-recipes.html?recipe=${key}`,quote:`quote.html?quote=${key}`,order:`orders-admin.html?order=${key}`,production_job:`production-control.html?job=${key}`,customer:`customer-360.html?search=${key}`}[link.record_type]||null;}
  function duplicateKey(row){return [row.owner_id,row.sha256,row.file_size,row.revision_group_id||'',row.status==='archived'?'archived':'active'].join(':');}
  return Object.freeze({MAX_FILE_SIZE,CATEGORIES,LINK_TYPES:Object.freeze([...LINK_TYPES]),validateFile,safeStoragePath,normalizeLinks,buildMetadata,currentVersions,nextRevision,archive,deepLink,duplicateKey});
});
