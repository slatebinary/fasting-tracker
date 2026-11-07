(function(global){
  'use strict';
  function errorCategory(value){
    const text=String(value&&value.message||value||'').toLowerCase();
    if(text.includes('quota')||text.includes('storage'))return 'storage';
    if(text.includes('indexeddb')||text.includes('transaction'))return 'indexeddb';
    if(text.includes('service worker')||text.includes('cache'))return 'serviceworker';
    if(text.includes('network')||text.includes('fetch')||text.includes('offline'))return 'network';
    if(text.includes('notification'))return 'notification';
    if(text.includes('import')||text.includes('backup'))return 'backup';
    if(text.includes('snapshot'))return 'snapshot';
    if(text.includes('update')||text.includes('release'))return 'update';
    return 'ui';
  }
  function shareCapabilities(){
    return {webShare:typeof navigator.share==='function',fileShare:typeof navigator.canShare==='function',downloads:'download' in HTMLAnchorElement.prototype};
  }
  async function queryStorageProtection({request=false}={}){
    const result={supported:false,persistent:null,requestSupported:false,attempted:!!request,used:null,quota:null,error:false};
    const storage=typeof navigator!=='undefined'?navigator.storage:null;
    if(!storage||typeof storage.persisted!=='function')return result;
    result.supported=true;
    result.requestSupported=typeof storage.persist==='function';
    try{
      let persistent=await storage.persisted();
      if(request&&!persistent&&result.requestSupported)persistent=await storage.persist();
      result.persistent=!!persistent;
      if(typeof storage.estimate==='function'){
        try{
          const estimate=await storage.estimate();
          if(Number.isFinite(estimate?.usage))result.used=estimate.usage;
          if(Number.isFinite(estimate?.quota))result.quota=estimate.quota;
        }catch{}
      }
      return result;
    }catch{
      result.error=true;
      result.persistent=null;
      return result;
    }
  }
  global.FTPlatform=Object.freeze({errorCategory,shareCapabilities,queryStorageProtection});
})(window);
