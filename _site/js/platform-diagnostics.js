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
  global.FTPlatform=Object.freeze({errorCategory,shareCapabilities});
})(window);
