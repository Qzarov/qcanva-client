import { unmapHtmlImageUrls } from '../canvas/imageUrls';
import { escapeJsonForScript } from './formStateSerialization';
import type { FrameScrollPosition } from './scrollRestoration';

export const PREVIEW_BRIDGE_CHANNEL = 'qcanva-html-preview';

export type PreviewBridgeEvent =
  | {
      channel: typeof PREVIEW_BRIDGE_CHANNEL;
      token: string;
      type: 'checklist-change';
      checkId: string;
      checked: boolean;
    }
  | {
      channel: typeof PREVIEW_BRIDGE_CHANNEL;
      token: string;
      type: 'image-error';
      src: string;
    }
  | {
      channel: typeof PREVIEW_BRIDGE_CHANNEL;
      token: string;
      type: 'state-captured';
      requestId: string;
      html: string;
      scroll: FrameScrollPosition;
    };

export function createPreviewBridgeToken(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `qcv-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

function buildBridgeScriptBody(token: string): string {
  const ch = escapeJsonForScript(JSON.stringify(PREVIEW_BRIDGE_CHANNEL));
  const tk = escapeJsonForScript(JSON.stringify(token));
  return `(function(){
var CH=${ch},TK=${tk};
function post(type,payload){
  if(!window.parent||window.parent===window)return;
  try{window.parent.postMessage(Object.assign({channel:CH,token:TK,type:type},payload),'*');}catch(e){/* parent unavailable */}
}
function findAnchor(frag){
  if(!frag)return null;
  var id=frag;
  try{id=decodeURIComponent(frag);}catch(e){/* keep raw fragment */}
  return document.getElementById(id)||document.getElementsByName(id)[0]||null;
}
document.addEventListener('click',function(ev){
  if(ev.defaultPrevented||ev.button!==0||ev.metaKey||ev.ctrlKey||ev.shiftKey||ev.altKey)return;
  var t=ev.target&&ev.target.closest?ev.target.closest('a[href]'):null;
  var href=t&&t.getAttribute('href');
  if(!href||href.charAt(0)!=='#')return;
  ev.preventDefault();
  var target=findAnchor(href.slice(1));
  if(target&&target.scrollIntoView)target.scrollIntoView({behavior:'smooth',block:'start'});
  else if(href==='#'||href==='#top')window.scrollTo({top:0,behavior:'smooth'});
});
document.addEventListener('change',function(ev){
  var t=ev.target;
  if(t&&t.tagName==='INPUT'&&t.type==='checkbox'&&t.dataset&&t.dataset.checkId){
    post('checklist-change',{checkId:String(t.dataset.checkId),checked:Boolean(t.checked)});
  }
});
document.addEventListener('error',function(ev){
  var t=ev.target;
  if(t&&t.tagName==='IMG'){
    var src=t.getAttribute('src')||t.src||'';
    if(src)post('image-error',{src:String(src)});
  }
},true);
var SAFE_KEY=/^[a-zA-Z0-9][a-zA-Z0-9._:-]{2,63}$/;
var RESERVED_KEY=/^(?:token|currentuser|userrole|accessmode|theme|locale|huburl|qcanva:|qspace:|auth|jwt|session)/i;
function escJson(s){
  return s.replace(/&/g,'\\\\u0026').replace(/</g,'\\\\u003c').replace(/>/g,'\\\\u003e').replace(/\\u2028/g,'\\\\u2028').replace(/\\u2029/g,'\\\\u2029');
}
function captureHtml(){
  var clone=document.documentElement.cloneNode(true);
  clone.querySelectorAll('script[data-qcanva-preview-bridge]').forEach(function(n){n.remove();});
  var sInputs=Array.from(document.querySelectorAll('input')),cInputs=Array.from(clone.querySelectorAll('input'));
  sInputs.forEach(function(inp,i){
    var tgt=cInputs[i];if(!tgt)return;
    var ty=(inp.type||'').toLowerCase();
    if(ty==='checkbox'||ty==='radio'){inp.checked?tgt.setAttribute('checked',''):tgt.removeAttribute('checked');}
    else if(ty==='file'){tgt.removeAttribute('value');}
    else{tgt.setAttribute('value',inp.value);}
  });
  var sTa=Array.from(document.querySelectorAll('textarea')),cTa=Array.from(clone.querySelectorAll('textarea'));
  sTa.forEach(function(ta,i){if(cTa[i])cTa[i].textContent=ta.value;});
  var sSel=Array.from(document.querySelectorAll('select')),cSel=Array.from(clone.querySelectorAll('select'));
  sSel.forEach(function(sel,i){
    var tgt=cSel[i];if(!tgt)return;
    var chosen=new Set(Array.from(sel.selectedOptions).map(function(o){return o.value;}));
    Array.from(tgt.options).forEach(function(o){chosen.has(o.value)?o.setAttribute('selected',''):o.removeAttribute('selected');});
  });
  var storageKey=null;
  Array.from(document.querySelectorAll('script')).forEach(function(sc){
    if(storageKey||sc.hasAttribute('data-qcanva-preview-bridge'))return;
    var txt=sc.textContent||'';
    if(txt.indexOf('function attachItem')===-1||txt.indexOf('comment-wrap')===-1)return;
    var m=txt.match(/STORAGE_KEY\\s*=\\s*['"]([^'"]+)['"]/);
    if(m&&m[1]&&SAFE_KEY.test(m[1])&&!RESERVED_KEY.test(m[1]))storageKey=m[1];
  });
  if(storageKey){
    var items={};
    document.querySelectorAll('li').forEach(function(li){
      var cb=li.querySelector('input.cb');
      var id=cb&&cb.dataset&&cb.dataset.id;if(!id)return;
      var cur={checked:Boolean(cb.checked)};
      var radio=Array.from(li.querySelectorAll('input[type="radio"]')).find(function(r){return r.checked;});
      if(radio&&radio.value)cur.status=radio.value;
      var cm=li.querySelector('textarea.comment-area');
      if(cm)cur.comment=cm.value;
      items[id]=cur;
    });
    clone.querySelectorAll('[data-qcanva-form-state],.comment-status-tag,.comment-wrap').forEach(function(n){n.remove();});
    var bar=clone.querySelector('#bar');if(bar)bar.innerHTML='';
    if(Object.keys(items).length){
      var seed=document.createElement('script');
      seed.setAttribute('data-qcanva-form-state',storageKey);
      seed.textContent='try{localStorage.setItem('+escJson(JSON.stringify(storageKey))+','+escJson(JSON.stringify(JSON.stringify({items:items})))+');}catch(e){/* storage unavailable */}';
      var firstSc=clone.querySelector('script');
      if(firstSc&&firstSc.parentNode)firstSc.parentNode.insertBefore(seed,firstSc);
      else(clone.querySelector('head')||clone).appendChild(seed);
    }
  }
  return '<!DOCTYPE html>\\n'+clone.outerHTML;
}
window.addEventListener('message',function(ev){
  if(ev.source!==window.parent)return;
  var d=ev.data;
  if(!d||typeof d!=='object'||d.channel!==CH||d.token!==TK)return;
  if(d.type==='restore-scroll'){
    window.scrollTo(Number(d.x)||0,Number(d.y)||0);
  }else if(d.type==='capture-state'&&typeof d.requestId==='string'){
    post('state-captured',{requestId:d.requestId,html:captureHtml(),scroll:{x:window.scrollX||0,y:window.scrollY||0}});
  }
});
})();`;
}

/**
 * Injects the sandboxed preview postMessage bridge into an HTML document string
 * so the parent app can interact with a null-origin `srcdoc` iframe (without
 * `allow-same-origin`) for anchor scrolling, checklist persistence, image token
 * refresh, scroll restoration, and form-state capture.
 */
export function injectPreviewBridge(rawHtml: string, token: string): string {
  const source = rawHtml || '';
  const tag = `<script data-qcanva-preview-bridge="1">${buildBridgeScriptBody(token)}</script>`;
  if (/<\/head>/i.test(source)) {
    return source.replace(/<\/head>/i, (match) => `${tag}${match}`);
  }
  if (/<body\b[^>]*>/i.test(source)) {
    return source.replace(/<body\b[^>]*>/i, (match) => `${match}${tag}`);
  }
  return `${tag}${source}`;
}

export function stripPreviewBridgeAndUnmapImages(html: string): string {
  const withoutBridge = html.replace(
    /<script\b[^>]*\bdata-qcanva-preview-bridge\b[^>]*>[\s\S]*?<\/script>/gi,
    '',
  );
  return unmapHtmlImageUrls(withoutBridge);
}

export function isBridgeMessageFromFrame(
  event: MessageEvent,
  frames: Array<HTMLIFrameElement | null | undefined>,
  token: string,
): event is MessageEvent<PreviewBridgeEvent> {
  if (!event.source) return false;
  const fromKnownFrame = frames.some(
    (frame) => frame?.contentWindow != null && event.source === frame.contentWindow,
  );
  if (!fromKnownFrame) return false;
  const data = event.data;
  if (!data || typeof data !== 'object') return false;
  return data.channel === PREVIEW_BRIDGE_CHANNEL && data.token === token;
}

export function extractImageIdFromSrc(src: string): string {
  const match = src.match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i);
  return match ? match[1]! : '';
}
