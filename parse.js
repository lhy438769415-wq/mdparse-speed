// Original two-stage Markdown renderer: structural blocks, then contextual inlines.
const inlineCache=new Map();
const lazyLines=new WeakMap();function markLazy(a,i){let set=lazyLines.get(a);if(!set)lazyLines.set(a,set=new Set());set.add(i);}
const specialChars=new Uint8Array(128);for(const c of '&\\`<[!*_~\n')specialChars[c.charCodeAt(0)]=1;
const punctuation = /[\p{P}\p{S}]/u;
const escRE = /[&<>"']/g;
const replacements = {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'};
function escape(s, all=false) { if(!/[&<>"']/.test(s))return s;return (all?s:s.replace(/&(?!(?:#[0-9]{1,7}|#[xX][\da-fA-F]{1,6}|[a-zA-Z][\w]*);)/g,'&amp;')).replace(all?escRE:/[<>"']/g,c=>replacements[c]); }
function unescape(s){return s.replace(/\\([!"#$%&'()*+,\-./:;<=>?@[\]\\^_`{|}~])/g,'$1');}
function key(s){return s.toLowerCase().toUpperCase().toLowerCase().replace(/\s+/g,' ').trim();}
function href(s){try{return encodeURI(s).replace(/%25/g,'%')}catch{return null}}
const bullet=/^( {0,3})([*+-]|\d{1,9}[.)])(?:([ \t]+)(.*)|$)/;
const hr=/^ {0,3}(?:(?:\*[ \t]*){3,}|(?:-[ \t]*){3,}|(?:_[ \t]*){3,})$/;
const fence=/^( {0,3})(`{3,}|~{3,})([^\n]*)$/;
const heading=/^ {0,3}(#{1,6})(?:[ \t]+(.*)|[ \t]*)$/;
const setext=/^ {0,3}(=+|-+)[ \t]*$/;
const blockTags='address|article|aside|base|basefont|blockquote|body|caption|center|col|colgroup|dd|details|dialog|dir|div|dl|dt|fieldset|figcaption|figure|footer|form|frame|frameset|h[1-6]|head|header|hr|html|iframe|legend|li|link|main|menu|menuitem|nav|noframes|ol|optgroup|option|p|param|search|section|summary|table|tbody|td|tfoot|th|thead|title|tr|track|ul';
const htmlBlock=new RegExp('^ {0,3}</?(?:'+blockTags+')(?:[\\s/>]|$)','i');
const tagRE=/^(?:<!--(?:>|->|[\s\S]*?(?:-->|$))|<\?[\s\S]*?\?>|<![A-Z][\s\S]*?>|<!\[CDATA\[[\s\S]*?\]\]>|<\/[A-Za-z][\w-]*\s*>|<[A-Za-z][\w-]*(?:\s+[A-Za-z_:][\w.:-]*(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>`]+))?)*\s*\/?>)/;
function htmlKind(s, interrupt=false){
 if(/^ {0,3}<(script|pre|style|textarea)(?:\s|>|$)/i.test(s))return ['close',/^ {0,3}<(\w+)/.exec(s)[1]];
 if(/^ {0,3}<!--/.test(s))return ['end','-->'];
 if(/^ {0,3}<\?/.test(s))return ['end','?>'];
 if(/^ {0,3}<!\[CDATA\[/.test(s))return ['end',']]>'];
 if(/^ {0,3}<![A-Z]/.test(s))return ['end','>'];
 if(htmlBlock.test(s))return ['blank'];
 if(!interrupt && /^ {0,3}<\/?[A-Za-z]/.test(s)){const m=tagRE.exec(s.trimStart());if(m&&m[0].trim()===s.trim())return ['blank'];}
 return null;
}
function interrupt(s){const b=bullet.exec(s);return heading.test(s)||hr.test(s)||/^ {0,3}>/.test(s)||validFence(s)||htmlKind(s,true)||b&&(!/\d/.test(b[2])||+b[2].slice(0,-1)===1)&&!!b[4];}
function validFence(s){const m=fence.exec(s);return m&&!(m[2][0]==='`'&&m[3].includes('`'))?m:null;}
function splitCells(s){let a=[],v='',slash=0;for(const c of s.trim()){if(c==='|'&&slash%2===0){a.push(v.trim());v='';}else {if(c==='|'&&slash%2)v=v.slice(0,-1);v+=c;}slash=c==='\\'?slash+1:0;}a.push(v.trim());if(a[0]==='')a.shift();if(a.at(-1)==='')a.pop();return a;}
function tableAt(lines,i){if(i+1>=lines.length||!lines[i].includes('|'))return null;const a=splitCells(lines[i+1]);if(!a.length||!a.every(x=>/^:?-+:?$/.test(x)))return null;const h=splitCells(lines[i]);return h.length===a.length?{h,a:a.map(x=>x[0]===':'?(x.at(-1)===':'?'center':'left'):x.at(-1)===':'?'right':null)}:null;}
function definition(lines,i){
 if(!/^ {0,3}\[/.test(lines[i]))return null;
 let j=i+1;while(j<lines.length&&lines[j].trim())j++;
 const text=lines.slice(i,j).join('\n');const m=/^ {0,3}\[((?:\\.|[^\[\\])+?)\]:[ \t]*(?:\n[ \t]*)?/.exec(text);if(!m||!m[1].trim())return null;
 let p=m[0].length,start=p,url;
 if(text[p]==='<'){p++;start=p;while(p<text.length){if(text[p]==='\\'){p+=2;continue;}if(text[p]==='>')break;if(text[p]==='<'||text[p]==='\n')return null;p++;}if(p>=text.length)return null;url=text.slice(start,p++);}
 else {while(p<text.length&&!/\s/.test(text[p]))p++;url=text.slice(start,p);if(!url)return null;}
 const urlEnd=p;let title=null;
 while(/[ \t]/.test(text[p]||'\0'))p++;
 const sameLine=text[p]!==undefined&&text[p]!=='\n';
 if(text[p]==='\n'){p++;while(/[ \t]/.test(text[p]||'\0'))p++;}
 if(p>urlEnd&&/["'(]/.test(text[p]||'\0')){const close=text[p]==='('?')':text[p];start=++p;while(p<text.length){if(text[p]==='\\'){p+=2;continue;}if(text[p]===close)break;p++;}if(p<text.length){title=text.slice(start,p++);while(/[ \t]/.test(text[p]||'\0'))p++;if(text[p]!==undefined&&text[p]!=='\n'){if(sameLine)return null;title=null;p=urlEnd;}}else{if(sameLine)return null;p=urlEnd;}}
 else{if(sameLine)return null;p=urlEnd;}
 return {label:m[1],url,title,count:text.slice(0,p).split('\n').length};
}
function stripIndent(s,n){let i=0,c=0;while(i<s.length&&c<n){if(s[i]===' ')c++;else if(s[i]==='\t')c+=4-c%4;else break;i++;}return ' '.repeat(Math.max(0,c-n))+s.slice(i);}
function expandIndent(line){const m=/^[ \t]*/.exec(line)[0];let col=0,v='';for(const c of m){if(c==='\t'){let n=4-col%4;v+=' '.repeat(n);col+=n;}else{v+=c;col++;}}return v+line.slice(m.length);}
function expandMarker(s){let col=0;return s.replace(/^[ \t]*(?:[*+-]|\d+[.)])[ \t]*/,v=>[...v].map(c=>{if(c==='\t'){let n=4-col%4;col+=n;return ' '.repeat(n);}col++;return c;}).join(''));}
function endsParagraph(ns){const n=ns.at(-1);return n&&(n.t==='p'||n.t==='list'&&endsParagraph(n.items.at(-1).children)||n.t==='quote'&&endsParagraph(n.children));}
function parseList(lines,originals,i,refs,lazies,m){const ordered=/\d/.test(m[2]),delim=ordered?m[2].at(-1):m[2],start=ordered?+m[2].slice(0,-1):1;let items=[],loose=false,j=i;
 while(j<lines.length){const b=bullet.exec(lines[j]);if(!b||(ordered? !/\d/.test(b[2])||b[2].at(-1)!==delim:b[2]!==delim)||hr.test(lines[j]))break;
 let padding=(b[4]||'')?(b[3]||' ').length:1;if(padding>4)padding=1;const indent=b[1].length+b[2].length+padding;let text=b[4]?(b[3]||'').slice(padding)+b[4]:'';let a=[text],k=j+1,hadBlank=false,internalBlank=false;
 for(;k<lines.length;k++){const l=lazies.has(k)?lines[k].replace(/^ {4}/,''):lines[k];if(!text.trim()&&k===j+1&&!l.trim()){a.push('');k++;hadBlank=true;break;}if(!l.trim()){a.push('');hadBlank=true;continue;}
 const spaces=/^ */.exec(l)[0].length;const next=bullet.exec(l);
 if(spaces<indent){if(next||hr.test(l)||interrupt(l)||hadBlank)break;markLazy(a,a.length);if(validFence(a.at(-1)||'')&&blocks(a,new Map(),false).at(-1)?.s==='')break;a.push(l);}
 else {if(hadBlank)internalBlank=true;a.push(l.slice(indent));}hadBlank=false;
 }
 
 if(hadBlank&&k<lines.length){const nb=bullet.exec(lines[k]);if(nb&&(ordered?/\d/.test(nb[2])&&nb[2].at(-1)===delim:nb[2]===delim))loose=true;}
 while(a.length&&!a.at(-1).trim())a.pop();let task=/^\[([ xX])\][ \t]+/.exec(a[0]);if(task)a[0]=a[0].slice(task[0].length);
 const children=blocks(a,refs,false);if(children.some((n,idx)=>idx>0&&n.blankBefore)||internalBlank&&a.some(x=>/^ *\[[^\]]+\]:/.test(x)))loose=true;items.push({children,task:task?task[1]!==' ':null});j=k;
 }
 return {node:{t:'list',ordered,start,items,loose},end:j};
}

function blocks(lines,refs,top=true){const lazies=lazyLines.get(lines)||new Set();const originals=lines;lines=lines.map(expandIndent);let out=[],i=0;let separated=false;const emit=n=>{n.blankBefore=separated;out.push(n)};
 while(i<lines.length){let s=lines[i],m;if(bullet.test(s)&&/^[ \t]*(?:[*+-]|\d+[.)])[ \t]*\t/.test(s)){s=expandMarker(s);lines[i]=s;}separated=i>0&&!lines[i-1].trim();
 if(!s.trim()){i++;continue;}
 if((m=validFence(s))){let body=[],n=m[2][0]==='`'?m[1].length:0,mark=m[2],j=i+1;const end=new RegExp('^ {0,3}'+mark[0]+'{'+mark.length+',}[ \\t]*$');for(;j<lines.length&&!end.test(lines[j]);j++)body.push(n?originals[j].replace(new RegExp('^[ \t]{0,'+n+'}'),''):originals[j]);emit({t:'code',s:body.join('\n'),lang:unescape(m[3].trim()).split(/\s/)[0]});i=Math.min(j+1,lines.length);continue;}
 if(/^ {4}|^\t/.test(s)){let a=[],j=i;while(j<lines.length&&(!lines[j].trim()||/^ {4}|^\t/.test(lines[j]))){a.push(/^ {4}/.test(lines[j])?stripIndent(originals[j],4):'');j++;}while(a.length&&!a.at(-1).trim())a.pop();emit({t:'code',s:a.join('\n'),lang:''});i=j;continue;}
 if((m=heading.exec(s))){emit({t:'h',level:m[1].length,s:(m[2]||'').replace(/(?:^|[ \t]+)#+[ \t]*$/,'').trim()});i++;continue;}
 if(hr.test(s)){emit({t:'hr'});i++;continue;}
 if(/^ {0,3}>/.test(s)){let a=[],j=i,blank=false;for(;j<lines.length;j++){const quoteLine=lines[j].replace(/^( {0,3}>[ \t]*)/,v=>{let col=0;return [...v].map(c=>{if(c==='\t'){let n=4-col%4;col+=n;return ' '.repeat(n);}col++;return c;}).join('')});const q=/^ {0,3}>[ \t]?(.*)$/.exec(quoteLine);if(q){let raw=originals[j];let qm=/^ {0,3}> ?(.*)$/.exec(raw);a.push(qm&& !/^[ \t]*\t/.test(qm[1])?qm[1]:q[1]);blank=!q[1].trim();}else if(!blank&&lines[j].trim()&&!interrupt(lines[j])&&endsParagraph(blocks(a,new Map(),top))){markLazy(a,a.length);a.push(/^ {0,3}=+[ \t]*$/.test(lines[j])?'        '+lines[j]:'    '+lines[j].replace(/^ {4}/,''));}else break;}emit({t:'quote',children:blocks(a,refs,top)});i=j;continue;}
 if((m=bullet.exec(s))){const result=parseList(lines,originals,i,refs,lazies,m);emit(result.node);i=result.end;continue;}
 const kind=htmlKind(s);if(kind){let a=[],j=i;for(;j<lines.length;j++){if(kind[0]==='blank'&&!lines[j].trim())break;a.push(originals[j]);if(kind[0]==='end'&&lines[j].includes(kind[1])||kind[0]==='close'&&new RegExp('</'+kind[1]+'\\s*>','i').test(lines[j])){j++;break;}}emit({t:'html',s:a.join('\n')+(j<lines.length&&!(!lines[j].trim()&&j<lines.length-1&&(kind[0]==='blank'||!originals[j].length))?'\n':'')});i=j;continue;}
 // Definitions are collected globally before inline rendering.
 const def=definition(lines,i);if(def){const k=key(def.label);if(!refs.has(k))refs.set(k,{url:unescape(def.url),title:def.title===null?null:unescape(def.title)});i+=def.count;continue;}
 const tb=tableAt(lines,i);if(tb){let rows=[],j=i+2;while(j<lines.length&&originals[j].replace(/ /g,'').length>0&&!interrupt(lines[j])){rows.push(splitCells(lines[j]));j++;}emit({t:'table',...tb,rows});i=j;continue;}
 let a=[lazies.has(i)?s.replace(/^ {4}/,''):s],j=i+1;for(;j<lines.length&&(lines[j].trim()||lines[j].length>0&&j===lines.length-1);j++){if(!lazies.has(j)){if(setext.test(lines[j]))break;if(interrupt(lines[j])||!top&&bullet.test(lines[j])||tableAt(lines,j))break;}a.push(lazies.has(j)?lines[j].replace(/^ {4}/,''):lines[j]);}
 if(j<lines.length&&!lazies.has(j)&&(m=setext.exec(lines[j]))){emit({t:'h',level:m[1][0]==='='?1:2,s:a.join('\n').trim()});i=j+1;}else{emit({t:'p',s:a.join('\n')});i=j;}
 }return out;
}
function linkTarget(s,pos){let i=pos;while(/[ \t\n]/.test(s[i]||'\0'))i++;let url='',title=null;
 if(s[i]==='<'){let j=i+1;for(;j<s.length;j++){if(s[j]==='\\'){j++;continue;}if(s[j]==='>')break;}if(j>=s.length||/[\n<]/.test(s.slice(i+1,j)))return null;url=s.slice(i+1,j);i=j+1;}
 else {let start=i,depth=0;for(;i<s.length;i++){let c=s[i];if(c==='\\'&&i+1<s.length){i++;continue;}if(c==='(')depth++;if(c===')'){if(depth===0)break;depth--;}if(/[ \t\n]/.test(c))break;}if(depth)return null;url=s.slice(start,i);}
 let pre=i;while(/[ \t\n]/.test(s[i]||'\0'))i++;
 if(i>pre&&/["'(]/.test(s[i]||'\0')){const q=s[i]==='('?')':s[i];let j=i+1;for(;j<s.length;j++){if(s[j]==='\\'){j++;continue;}if(s[j]===q)break;}if(j>=s.length)return null;title=s.slice(i+1,j);i=j+1;while(/[ \t\n]/.test(s[i]||'\0'))i++;}
 if(s[i]!==')')return null;return {url:unescape(url),title:title===null?null:unescape(title),end:i+1};
}
function anchor(url,title,body,image=false){let u=href(url);if(u===null)return body;return image?'<img src="'+escape(u)+'" alt="'+body+'"'+(title!==null?' title="'+escape(title)+'"':'')+'>':'<a href="'+escape(u)+'"'+(title!==null?' title="'+escape(title)+'"':'')+'>'+body+'</a>';}
function findCodeMask(s){const codeMask=[];if(s.includes('`')){for(let p=0;p<s.length;p++){if(s[p]==='\\'){p++;continue;}if(s[p]!=='`')continue;let e=p;while(s[e]==='`')e++;let n=e-p,q=e,found=false;while(q<s.length){let k=s.indexOf('`',q);if(k<0)break;let z=k;while(s[z]==='`')z++;if(z-k===n){codeMask.push([p,z]);p=z-1;found=true;break;}q=z;}if(!found)p=e-1;}}return codeMask;}
function pairDelimiters(delims){
 // Pair delimiter runs using flanking and the multiple-of-three restriction.
 for(let ci=0;ci<delims.length;ci++){const closer=delims[ci];if(!closer.close)continue;for(let oi=ci-1;oi>=0&&closer.n>0;oi--){const opener=delims[oi];if(!opener.open||opener.ch!==closer.ch||!opener.n)continue;if((opener.close||closer.open)&&(opener.n+closer.n)%3===0&&(opener.n%3||closer.n%3))continue;
 if(opener.n===2&&closer.n===1&&!opener.after&&delims.slice(ci+1).some(d=>d.ch===opener.ch&&d.close&&d.n>=2))continue;const n=opener.n>=2&&closer.n>=2?2:1,tag=n===2?'strong':'em';opener.n-=n;closer.n-=n;if(n===2&&delims.slice(oi+1,ci).some(d=>d.n===0))closer.inside=true;if(closer.open&&!opener.close&&closer.n===0&&n===2){for(let k=oi-1;k>=0;k--)if(delims[k].ch===closer.ch&&delims[k].n===1&&delims[k].open){delims[k].open=false;for(let z=ci+1;z<delims.length;z++)if(delims[z].ch===closer.ch&&delims[z].n===1&&delims[z].close){delims[z].close=false;break;}break;}}opener.after='<'+tag+'>'+opener.after;closer.before+='</'+tag+'>';for(let k=oi+1;k<ci;k++){delims[k].open=false;delims[k].close=false;}if(opener.n&&closer.n)oi++;
 }}
}
function inline(s,refs,inLink=false,raw=false,tracker=null){const cacheable=s.length<200&&!inLink&&!raw&&!tracker&&!refs.inlineRaw&&!refs.inlineLink&&!/[<\[]/.test(s);if(cacheable&&inlineCache.has(s))return inlineCache.get(s);let tokens=[],delims=[],i=0;const codeMask=findCodeMask(s);let inRaw=raw||refs.inlineRaw||false,htmlLink=inLink||refs.inlineLink||false;
 const add=x=>tokens.push({s:x});
 while(i<s.length){const c=s[i],rest=s.slice(i);let m;
 if(c==='\\'&&i+1<s.length){if(s[i+1]==='\n'){add('<br>');i+=2;while(s[i]===' ')i++;continue;}if(/[!"#$%&'()*+,\-./:;<=>?@[\]\\^_`{|}~]/.test(s[i+1])){add(escape(s[i+1],true));i+=2;continue;}}
 if(c==='&'&&!inRaw&&(m=/^&#(?:([0-9]{1,7})|[xX]([0-9a-fA-F]{1,6}));/.exec(rest))){let num=m[1]?+m[1]:parseInt(m[2],16);if(!num||num>0x10ffff||num>=0xd800&&num<=0xdfff)num=0xfffd;add(escape(String.fromCodePoint(num),true));i+=m[0].length;continue;}
 if(c==='`'){const run=/^`+/.exec(rest)[0];let j=i+run.length,end=-1;while(j<s.length){const k=s.indexOf('`',j);if(k<0)break;let n=k;while(s[n]==='`')n++;if(n-k===run.length){end=k;break;}j=n;}if(end>=0){let text=s.slice(i+run.length,end).replace(/\n/g,' ');if(text.startsWith(' ')&&text.endsWith(' ')&&/[^ ]/.test(text))text=text.slice(1,-1);add('<code>'+escape(text,true)+'</code>');i=end+run.length;continue;}add(run);i+=run.length;continue;}
 if(c==='<' ){
 if((m=/^<([A-Za-z][\w+.-]{1,31}:[^\s<>]*|[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?)>/.exec(rest))){const email=!/^[A-Za-z][\w+.-]*:/.test(m[1]);add(anchor((email?'mailto:':'')+m[1],null,escape(m[1])));i+=m[0].length;continue;}
 if((m=tagRE.exec(rest))){const tag=m[0];add(tag);if(/^<a\s/i.test(tag))htmlLink=true;if(/^<\/a\s*>/i.test(tag))htmlLink=false;if(/^<(pre|code|kbd|script)(?:\s|>)/i.test(tag))inRaw=true;if(/^<\/(pre|code|kbd|script)\s*>/i.test(tag))inRaw=false;i+=tag.length;continue;}
 }
 if(c==='['||c==='!'&&s[i+1]==='['){let image=c==='!',start=i+(image?2:1),depth=1,j=start,invalidLabel=false;for(;j<s.length;j++){if(s[j]==='\\'){j++;continue;}if(s[j]==='<'){const h=tagRE.exec(s.slice(j))||/^<[^<>\s]+>/.exec(s.slice(j));if(h){j+=h[0].length-1;continue;}}if(s[j]==='`'){const r=/^`+/.exec(s.slice(j))[0];let k=s.indexOf(r,j+r.length);if(k>=0&&k<s.indexOf(']',j)){if(s.slice(j+r.length,k).includes('`')&&s[k+r.length]!==']')invalidLabel=true;j=k+r.length-1;continue;}if(r.length===1&&k>=0)invalidLabel=true;}if(s[j]==='[')depth++;if(s[j]===']'&&!--depth)break;}
 if(depth===0&&invalidLabel)codeMask.push([start,j]);if(depth===0&&!invalidLabel){let label=s.slice(start,j),target=null,end=j+1;if(s[end]==='(')target=linkTarget(s,end+1);if(target)end=target.end;
 else {let refLabel=label;if(s[end]==='['){let close=s.indexOf(']',end+1);if(close>=0){refLabel=s.slice(end+1,close)||label;end=close+1;}}const def=refs.get(key(refLabel));if(def)target=def;}
 if(target){const nested={explicit:false};let body=inline(label,refs,!image,false,nested);if(!image&&nested.explicit){add(escape(s.slice(i,start)));i=start;continue;}if(image)body=body.replace(/<img [^>]*alt="([^"]*)"[^>]*>/g,'$1').replace(/<[^>]*>/g,'');if(tracker&&!image)tracker.explicit=true;add(anchor(target.url,target.title,body,image));i=end;continue;}
 }
 }
 if((c==='*'||c==='_')&&!inRaw&&!codeMask.some(r=>i>=r[0]&&i<r[1])){const run=new RegExp('^'+(c==='*'?'\\*':'_')+'+').exec(rest)[0];const prev=i?s[i-1]:' ',next=s[i+run.length]||' ';const pw=/\s/.test(prev),nw=/\s/.test(next),pp=punctuation.test(prev),np=punctuation.test(next);let left=!nw&&(!np||pw||pp),right=!pw&&(!pp||nw||np);const d={s:run,ch:c,n:run.length,open:left&&(c!=='_'||!right||pp),close:right&&(c!=='_'||!left||np),before:'',after:''};tokens.push(d);delims.push(d);i+=run.length;continue;}
 if(c==='~'&&s[i-1]!=='~'&&!inRaw){const run=/^~{1,2}(?!~)/.exec(rest);if(run&&/\S/.test(s[i+run[0].length]||' ')){let n=run[0].length,depth=1,j=i+n;for(;j<s.length;j++){if(s[j]==='\\'){j++;continue;}if(s[j]!=='~')continue;const r=/^~+/.exec(s.slice(j))[0];if(r.length!==n){j+=r.length-1;continue;}const before=s[j-1]||' ',after=s[j+n]||' ';if(/\s/.test(before)&&!/\s/.test(after))depth++;else if(!/\s/.test(before)){depth--;if(!depth)break;}j+=n-1;}if(!depth){add('<del>'+inline(s.slice(i+n,j),refs,htmlLink,false,tracker)+'</del>');i=j+n;continue;}}}

 if(!htmlLink&&!inRaw&&c!=='_'&&c!=='*'&&(m=/^(?:(mailto:|xmpp:))?([A-Za-z0-9._+-]+@[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)+)(\/[A-Za-z0-9@._+-]+)?/.exec(rest))){let address=m[2],trail='';if(delims.some(d=>d.ch==='_'&&d.open&&d.n))address=address.replace(/_+$/,'');else address=address.replace(/_{2,}$/,'');while(address.endsWith('.')){address=address.slice(0,-1);trail+='.';}if(!/[-_]$/.test(address)){let text=(m[1]||'')+address+(m[1]==='xmpp:'?m[3]||'':'');add(anchor(m[1]?text:'mailto:'+text,null,escape(text)));i+=text.length;continue;}let n=m[0].length;add(escape(rest.slice(0,n)));i+=n;continue;}
 if(!htmlLink&&!inRaw&&!rest.startsWith('Www.')&&(m=/^(?:(?:https?:\/\/|ftp:\/\/|www\.)[^\s<]+)/i.exec(rest))){let text=m[0];const opens=[];for(let z=0;z<text.length;z++){if(text[z]==='(')opens.push(z);else if(text[z]===')'&&opens.length)opens.pop();}if(opens.length)text=text.slice(0,opens[0]);let old;do{old=text;text=text.replace(/(?:[?!.,:;*_~]|&(?:#\d+|#x[\da-f]+|\w+);)$/i,'');if(text.endsWith(')')){let balance=0;for(const c of text.slice(0,-1)){if(c==='(')balance++;else if(c===')'&&balance)balance--;}if(!balance)text=text.slice(0,-1);}}while(text!==old);if(text){const url=/^www\./i.test(text)?'http://'+text:!text.includes('://')?'mailto:'+text:text;add(anchor(url,null,escape(text)));i+=text.length;continue;}}
 if(c==='\n'){add('\n');i++;continue;}
 if(c===' '&&(m=/^ +\n/.exec(rest))){add(m[0].length>=3?'<br>':' \n');i+=m[0].length;if(m[0].length>=3)while(s[i]===' ')i++;continue;}
 // Consume ordinary text in one run, stopping at possible URL starts as well.
 let j=i+1;while(j<s.length&&!specialChars[s.charCodeAt(j)])j++;if(s[j]==='\n')while(j>i+1&&s[j-1]===' ')j--;
 let text=s.slice(i,j);if(!htmlLink&&!inRaw){const at=text.search(/(?:https?:\/\/|ftp:\/\/|www\.|(?:mailto:|xmpp:)?[A-Za-z0-9._+-]+@)/i);if(at>0){j=i+at;text=s.slice(i,j);}else if(at===0){const space=text.search(/\s/);if(space>0){j=i+space;text=s.slice(i,j);}}}
 add(inRaw?text:escape(text));i=j;
 }
 pairDelimiters(delims);
 if(!inLink){refs.inlineRaw=inRaw;refs.inlineLink=htmlLink;}const result=tokens.map(t=>t.ch?(t.inside?t.ch.repeat(t.n)+t.before:t.before+t.ch.repeat(t.n))+t.after:t.s).join('');if(cacheable){if(inlineCache.size>8192)inlineCache.clear();inlineCache.set(s,result);}return result;
}
function render(nodes,refs,tight=false){let out='';for(const n of nodes){switch(n.t){
 case 'p':out+=(tight?'':'<p>')+inline(n.s,refs)+(tight?'':'</p>\n');break;
 case 'h':out+='<h'+n.level+'>'+inline(n.s,refs)+'</h'+n.level+'>\n';break;
 case 'hr':out+='<hr>\n';break;
 case 'code':out+='<pre><code'+(n.lang?' class="language-'+escape(n.lang)+'"':'')+'>'+escape(n.s?n.s.replace(/\n$/,'')+'\n':'',true)+'</code></pre>\n';break;
 case 'html':out+=n.s;break;
 case 'quote':out+='<blockquote>\n'+render(n.children,refs)+'</blockquote>\n';break;
 case 'list':{const tag=n.ordered?'ol':'ul';out+='<'+tag+(n.ordered&&n.start!==1?' start="'+n.start+'"':'')+'>\n';for(const item of n.items){let html=render(item.children,refs,!n.loose);if(item.task!==null){const box='<input '+(item.task?'checked="" ':'')+'disabled="" type="checkbox"> ';if(n.loose&&html.startsWith('<p>'))html='<p>'+box+html.slice(3);else html=box+html;}
 out+='<li>'+html+(n.loose||!html.endsWith('\n')?'':'')+'</li>\n';}out+='</'+tag+'>\n';break;}
 case 'table':{out+='<table>\n<thead>\n<tr>\n';for(let c=0;c<n.h.length;c++)out+='<th'+(n.a[c]?' align="'+n.a[c]+'"':'')+'>'+inline(n.h[c],refs)+'</th>\n';out+='</tr>\n</thead>\n';if(n.rows.length){out+='<tbody>';for(const row of n.rows){out+='<tr>\n';for(let c=0;c<n.h.length;c++)out+='<td'+(n.a[c]?' align="'+n.a[c]+'"':'')+'>'+inline(row[c]||'',refs)+'</td>\n';out+='</tr>\n';}out+='</tbody>';}out+='</table>\n';break;}
 }}return out;}
export function parse(markdown){const refs=new Map();const normalized=markdown.replace(/\r\n?/g,'\n');const lines=normalized.split('\n');return render(blocks(lines,refs),refs);}
