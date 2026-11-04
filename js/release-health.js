(function(global){
  'use strict';
  const PAGE_BOOT_STARTED_AT=Date.now();
  const VERSION_RE=/^\d+\.\d+\.\d+$/;
  function cleanVersion(value){const v=String(value||'').trim();return VERSION_RE.test(v)?v:'';}
  function extractEntryVersion(html){const m=String(html||'').match(/<meta\s+name=["']ft-app-version["']\s+content=["']([^"']+)["']/i);return cleanVersion(m&&m[1]);}
  function validateMetadata(info,protocolVersion){
    if(!info||Number(info.protocolVersion)!==Number(protocolVersion)||!Array.isArray(info.shell)||typeof info.entry!=='string')throw new Error('unsupported update metadata');
    const version=cleanVersion(info.version);if(!version)throw new Error('invalid version');
    if(!info.hashes||typeof info.hashes!=='object'||typeof info.hashes[info.entry]!=='string')throw new Error('incomplete release metadata');
    return {...info,version};
  }
  function consistency(metadataVersion,entryVersion){
    const metadata=cleanVersion(metadataVersion),entry=cleanVersion(entryVersion);
    if(!metadata||!entry)return {ok:false,reason:'missing-version',metadataVersion:metadata||null,entryVersion:entry||null};
    if(metadata!==entry)return {ok:false,reason:'version-mismatch',metadataVersion:metadata,entryVersion:entry};
    return {ok:true,reason:'ok',metadataVersion:metadata,entryVersion:entry};
  }
  async function fetchLiveEntryVersion(entry='./index.html',timeoutMs=7000){
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs);
    try{
      const url=new URL(entry,location.href);url.searchParams.set('__ft_probe',String(Date.now()));
      const response=await fetch(url.href,{cache:'no-store',signal:controller.signal,headers:{'X-Fasting-Tracker-Probe':'1'}});
      if(!response.ok)throw new Error('entry probe failed');
      const version=extractEntryVersion(await response.text());if(!version)throw new Error('entry version missing');
      return version;
    }finally{clearTimeout(timer);}
  }
  function confirmReleaseAfterStartupIntegrity(){
    const meta=document.querySelector('meta[name="ft-app-version"]');
    const version=cleanVersion(meta&&meta.content);
    if(!version||!('serviceWorker' in navigator))return;
    let attempts=0;
    const timer=setInterval(()=>{
      attempts++;
      let appMeta=null;
      try{appMeta=JSON.parse(localStorage.getItem('fastingTracker.appMeta')||'null');}catch{}
      const good=appMeta&&appMeta.lastKnownGood;
      if(good&&good.version===version&&good.reason==='startup-integrity'&&Date.parse(good.at)>=PAGE_BOOT_STARTED_AT){
        clearInterval(timer);
        navigator.serviceWorker.ready.then(reg=>{
          const worker=navigator.serviceWorker.controller||reg.active;
          if(!worker)return;
          const channel=new MessageChannel();
          channel.port1.onmessage=()=>{try{channel.port1.close();}catch{}};
          worker.postMessage({type:'CONFIRM_RELEASE',version,protocolVersion:1},[channel.port2]);
        }).catch(()=>{});
      }else if(attempts>=600){
        clearInterval(timer);
      }
    },500);
  }
  if(document.readyState==='complete')confirmReleaseAfterStartupIntegrity();
  else window.addEventListener('load',confirmReleaseAfterStartupIntegrity,{once:true});

  global.FTReleaseHealth=Object.freeze({cleanVersion,extractEntryVersion,validateMetadata,consistency,fetchLiveEntryVersion});
})(window);
