// An independent block scanner and inline delimiter renderer.
const punctuation = /[!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~]/;
const white = /\s/u;
const punct = /[\p{P}\p{S}]/u;
const escapeHTML = s => s.replace(/&(?!(?:#\d{1,7}|#x[\da-fA-F]{1,6}|[a-zA-Z][\da-zA-Z]*);)|[<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const escapeCode = s => s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const unescape = s => s.replace(/\\([!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~])/g, '$1');
const decodeNumeric = s => !s.includes('&#') ? s : s.replace(/&#(x[\da-fA-F]{1,6}|X[\da-fA-F]{1,6}|[0-9]{1,7});/g, (_, n) => { const v = /^[xX]/.test(n) ? parseInt(n.slice(1), 16) : +n; return v > 0 && v <= 0x10ffff && !(v >= 0xd800 && v <= 0xdfff) ? String.fromCodePoint(v) : '\ufffd'; });
const label = s => s.replace(/\s+/g, ' ').trim().toLowerCase().replace(/ß/g, 'ss');
const blockTags = 'address article aside base basefont blockquote body caption center col colgroup dd details dialog dir div dl dt fieldset figcaption figure footer form frame frameset h1 h2 h3 h4 h5 h6 head header hr html iframe legend li link main menu menuitem nav noframes ol optgroup option p param search section summary table tbody td tfoot th thead title tr track ul'.split(' ');
const blockTagPattern = new RegExp('^ {0,3}</?(?:' + blockTags.join('|') + ')(?:\\s|/?>|$)', 'i');
function destination(s, start) {
  let i = start;
  while (/[ \t\n\r]/.test(s[i] || '') && i < s.length) i++;
  let url = '', title = '';
  if (s[i] === '<') {
    const begin = ++i;
    while (i < s.length && s[i] !== '>') {
      if (s[i] === '\n' || s[i] === '<') return null;
      if (s[i] === '\\') i++;
      i++;
    }
    if (s[i] !== '>') return null;
    url = s.slice(begin, i++);
  } else {
    const begin = i;
    let depth = 0;
    for (; i < s.length; i++) {
      const c = s[i];
      if (c === '\\' && punctuation.test(s[i + 1] || '')) { i++; continue; }
      if (/[ \t\n\r]/.test(c)) break;
      if (c === '(') depth++;
      if (c === ')') { if (!depth) break; depth--; }
    }
    if (depth) return null;
    url = s.slice(begin, i);
  }
  const before = i;
  while (/[ \t\n\r]/.test(s[i] || '') && i < s.length) i++;
  if (i > before && /["'(]/.test(s[i] || '')) {
    const end = s[i] === '(' ? ')' : s[i], begin = ++i;
    for (; i < s.length && s[i] !== end; i++) if (s[i] === '\\') i++;
    if (i === s.length) return null;
    title = s.slice(begin, i++);
    while (/[ \t\n\r]/.test(s[i] || '') && i < s.length) i++;
  }
  return { url: unescape(url), title: unescape(title), end: i };
}
function href(s) {
  try { return encodeURI(s).replace(/%25/g, '%'); } catch { return null; }
}
function inline(source, refs, inLink = refs.linkState || false, raw = refs.rawState || false, info = null) {
  if (info || !refs.inlineCache || source.includes('<') && /<\/?(?:a|pre|code|kbd|script)(?:\s|>|\/)/i.test(source)) return inlineImpl(source,refs,inLink,raw,info);
  const key = (inLink ? '1' : '0') + (raw ? '1' : '0') + source;
  const found = refs.inlineCache.get(key);
  if (found) return found.html;
  const html=inlineImpl(source,refs,inLink,raw,info);
  refs.inlineCache.set(key,{html,link:refs.linkState,raw:refs.rawState});
  return html;
}
function inlineImpl(source, refs, inLink = refs.linkState || false, raw = refs.rawState || false, info = null) {
  if (!/[\\`<!\[*_~\n@]/.test(source) && (inLink || !/(?:https?:\/\/|ftp:\/\/|www\.|mailto:|xmpp:)/i.test(source))) return raw ? source : escapeHTML(decodeNumeric(source));
  const tokens = [];
  const autoPositions = [];
  if (!inLink) { const pattern=/(?:https?:\/\/|ftp:\/\/|www\.|mailto:|xmpp:|[A-Za-z0-9._+-]+@)/gi; let hit; while((hit=pattern.exec(source))) autoPositions.push(hit.index); }
  let autoCursor=0;
  const textStop = /[\\`<!\[*_~\n]| {2,}(?=\n)/g;
  const codeRanges = [];
  const tickPattern = /`+/g; let tick;
  while (source.includes('[') && (tick = tickPattern.exec(source))) { let slashes=0; for(let k=tick.index-1;k>=0 && source[k]==='\\';k--) slashes++; if(slashes%2) continue; const r = tick[0]; let e=tick.index+r.length; while ((e=source.indexOf(r,e))>=0 && (source[e-1]==='`' || source[e+r.length]==='`')) e+=r.length; if(e>=0) {codeRanges.push([tick.index,e+r.length]); tickPattern.lastIndex=e+r.length;} }
  let i = 0, noEmphasisUntil = -1;
  const emit = html => tokens.push({ html });
  while (i < source.length) {
    const rest = source.slice(i), c = source[i];
    let m;
    if (c === '\\' && (m = /^\\([!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~]|\n)/.exec(rest))) {
      emit(m[1] === '\n' ? '<br>' : escapeCode(m[1])); i += m[0].length; if (m[1] === '\n') { while (/[ \t]/.test(source[i] || '') && i < source.length) i++; } continue;
    }
    if (c === '`') {
      const run = /^`+/.exec(rest)[0];
      let end = i + run.length;
      while ((end = source.indexOf(run, end)) >= 0) {
        if (source[end - 1] !== '`' && source[end + run.length] !== '`') break;
        end += run.length;
      }
      if (end >= 0) {
        let content = source.slice(i + run.length, end).replace(/\n/g, ' ');
        if (/^ .* $/.test(content) && /[^ ]/.test(content)) content = content.slice(1, -1);
        emit('<code>' + escapeCode(content) + '</code>'); i = end + run.length; continue;
      }
      emit(run); i += run.length; continue;
    }
    if (c === '<') {
      if ((m = /^<([a-zA-Z][\w+.-]{1,31}:[^\s<>]*)>/.exec(rest))) {
        const u = escapeHTML(href(m[1])); emit('<a href="' + u + '">' + escapeHTML(m[1]) + '</a>'); i += m[0].length; continue;
      }
      if ((m = /^<([a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9.-]*[a-zA-Z0-9])?)>/.exec(rest))) {
        emit('<a href="mailto:' + m[1] + '">' + m[1] + '</a>'); i += m[0].length; continue;
      }
      m = /^(?:<!--(?:>|->|[\s\S]*?-->)|<\?[\s\S]*?\?>|<![A-Z][\s\S]*?>|<!\[CDATA\[[\s\S]*?\]\]>|<\/[a-zA-Z][\w-]*\s*>|<[a-zA-Z][\w-]*(?:\s+[a-zA-Z_:][\w.:-]*(?:\s*=\s*(?:[^\s"'=<>`]+|'[^']*'|"[^"]*"))?)*\s*\/?>)/.exec(rest);
      if (m) {
        emit(m[0]);
        if (/^<\/?a(?:\s|>)/i.test(m[0])) inLink = refs.linkState = !/^<\//.test(m[0]);
        if (/^<(pre|code|kbd|script)(?:\s|>)/i.test(m[0])) raw = refs.rawState = true;
        if (/^<\/(pre|code|kbd|script)>/i.test(m[0])) raw = refs.rawState = false;
        i += m[0].length; continue;
      }
    }
    if (c === '[' || (c === '!' && source[i + 1] === '[')) {
      const image = c === '!', begin = i + (image ? 2 : 1);
      let j = begin, depth = 1, bracketTicksBlocked = false;
      for (; j < source.length; j++) {
        if (source[j] === '\\') { j++; continue; }
        if (!bracketTicksBlocked && source[j] === '`' && (j === begin || source[j-1] !== '`')) {
          const r = /^`+/.exec(source.slice(j))[0]; let e = j + r.length;
          while ((e = source.indexOf(r,e)) >= 0 && (source[e-1] === '`' || source[e+r.length] === '`')) e += r.length;
          if (e >= 0 && !(r.length > 1 && source.indexOf(']',j) < e)) { j = e + r.length - 1; continue; }
          if (r.length > 1) bracketTicksBlocked = true;
          j += r.length - 1; continue;
        }
        if (source[j] === '<') { const tag = /^(?:<!--(?:>|->|[\s\S]*?-->)|<[^>\n]+>)/.exec(source.slice(j)); if (tag) { j += tag[0].length - 1; continue; } }
        if (source[j] === '[') depth++;
        if (source[j] === ']' && --depth === 0) break;
        if (source[j] !== ']') { if (source[j] !== '[') depth = depth; }
      }
      // Closing brackets alone change the bracket depth.
      const complexSpan = /`{2,}[^`]*`[^`]+`{2,}.+/.test(source.slice(begin,j));
      if (complexSpan) noEmphasisUntil = j;
      if (j < source.length && !complexSpan) {
        let d = null, end = j + 1;
        if (source[end] === '(') {
          d = destination(source, end + 1);
          if (!d || source[d.end] !== ')') { d = refs.get(label(source.slice(begin, j))) || null; }
          else end = d.end + 1;
        } else {
          let key = source.slice(begin, j);
          if (source[end] === '[') {
            const close = source.indexOf(']', end + 1);
            if (close >= 0) { key = source.slice(end + 1, close) || key; end = close + 1; }
          }
          d = refs.get(label(key)) || null;
        }
        const savedLink = refs.linkState, savedRaw = refs.rawState;
        const nestedInfo = { link: false };
        let nestedText;
        if (d && !image && source.slice(begin, j).includes('[')) nestedText = inline(source.slice(begin, j), refs, false, false, nestedInfo);
        refs.linkState = savedLink; refs.rawState = savedRaw;
        if (d && !nestedInfo.link) {
          for (const range of codeRanges) if (range[0] >= begin && range[0] < j && range[1] > j) noEmphasisUntil = Math.max(noEmphasisUntil,range[1]);
          if (!image && info) info.link = true;
          const u = href(d.url), title = d.title ? ' title="' + escapeHTML(d.title) + '"' : '';
          if (u !== null) {
            const text = inline(source.slice(begin, j), refs, image ? false : true);
            emit(image ? '<img src="' + escapeHTML(u) + '" alt="' + text.replace(/<img [^>]*alt="([^"]*)"[^>]*>/g, '$1').replace(/<[^>]*>/g, '') + '"' + title + '>' : '<a href="' + escapeHTML(u) + '"' + title + '>' + text + '</a>');
            i = end; continue;
          }
        }
      }
    }
    if (!inLink && (m = /^(?:(?:https?:\/\/|ftp:\/\/|www\.)[^\s<]+|(?:mailto:|xmpp:)?[A-Za-z0-9._+-]+@(?:[A-Za-z0-9-]+\.)+[A-Za-z]+(?:\/[A-Za-z0-9@._+-]+)?)(?![A-Za-z0-9-]|\.[A-Za-z0-9])/i.exec(rest))) {
      let text = m[0];
      const nestedUrl = text.search(/\((?:https?:\/\/|ftp:\/\/|\.\/)/i); if (nestedUrl >= 0 && (text.slice(nestedUrl).match(/\(/g)||[]).length > (text.slice(nestedUrl).match(/\)/g)||[]).length) text = text.slice(0,nestedUrl);
      if (text.includes('@') && !/^(?:https?:|ftp:|www\.)/i.test(text) && (source[i+text.length] === '-' || (source[i+text.length] === '_' && !tokens.some(t => t.marker === '_' && t.open && t.count)))) { emit(escapeHTML(text)); i += text.length; continue; }
      for (;;) {
        const old = text;
        text = text.replace(/&(?:#\d+|#x[\da-f]+|\w+);$/i, '');
        text = text.replace(/[?!.,:;*_~]+$/, '');
        if (text.endsWith(')') && (text.slice(nestedUrl >= 0 ? nestedUrl : 0).match(/\)/g) || []).length > (text.slice(nestedUrl >= 0 ? nestedUrl : 0).match(/\(/g) || []).length) text = text.slice(0, -1);
        text = text.replace(/&(?:#\d+|#x[\da-f]+|\w+);$/i, '');
        if (old === text) break;
      }
      if (/^www\./i.test(text) && !text.startsWith('www.')) { emit(escapeHTML(text)); i += text.length; continue; }
      const email = !/^(?:https?:|ftp:|www\.|mailto:|xmpp:)/i.test(text);
      const u = email ? 'mailto:' + text : text.toLowerCase().startsWith('www.') ? 'http://' + text : text;
      emit('<a href="' + escapeHTML(href(u)) + '">' + escapeHTML(text) + '</a>'); i += text.length; continue;
    }
    if ((c === '*' || c === '_' || c === '~') && i > noEmphasisUntil ) {
      let runEnd = i+1; while(source[runEnd] === c) runEnd++; const run = source.slice(i,runEnd);
      const prev = i ? source[i - 1] : '\n', next = source[i + run.length] || '\n';
      const left = !white.test(next) && (!punct.test(next) || white.test(prev) || punct.test(prev));
      const right = !white.test(prev) && (!punct.test(prev) || white.test(next) || punct.test(next));
      tokens.push({ html: run, marker: c, originalCount: run.length, count: run.length, open: c === '_' ? left && (!right || punct.test(prev)) : left, close: c === '_' ? right && (!left || punct.test(next)) : right });
      i += run.length; continue;
    }
    if ((c === ' ' || c === '\n') && (m = /^(?: {2,}\n[ \t]*|\n)/.exec(rest))) {
      emit(m[0].startsWith('  ') ? '<br>' : '\n'); i += m[0].length; continue;
    }
    textStop.lastIndex = i + 1;
    const stop = textStop.exec(source);
    let end = stop ? stop.index : source.length;
    while (autoCursor < autoPositions.length && autoPositions[autoCursor] <= i) autoCursor++;
    if (autoCursor < autoPositions.length && autoPositions[autoCursor] < end) end = autoPositions[autoCursor];
    emit(raw ? source.slice(i, end) : escapeHTML(decodeNumeric(source.slice(i, end)))); i = end;
  }
  for (let b = 0; b < tokens.length; b++) {
    const closer = tokens[b];
    if (!closer.close) continue;
    for (let a = b - 1; a >= 0 && closer.count; a--) {
      const opener = tokens[a];
      if (!opener.open || !opener.count || opener.marker !== closer.marker) continue;
      if (closer.marker === '~' && (opener.count > 2 || closer.count > 2 || opener.count !== closer.count)) continue;
      if (closer.marker !== '~' && closer.open && closer.close && tokens.slice(a+1,b).some(t=>t.marker===closer.marker && t.wasAmbiguous && (t.originalCount+opener.count)%3===0)) continue;
      if (closer.marker !== '~' && (opener.close || closer.open) && (opener.count + closer.count) % 3 === 0 && (opener.count % 3 !== 0 || closer.count % 3 !== 0)) continue;
      if (closer.marker !== '~' && tokens.slice(a+1,b).some(t => t.marker === closer.marker && t.wasAmbiguous && (t.originalCount + opener.count) % 3 === 0) && closer.count <= opener.count && !tokens.slice(a+1,b).some(t => t.marker === closer.marker && t.close && !t.open && (t.count || t.originalCount > opener.count))) { if (opener.count === 1) opener.open = false; break; }
      if (closer.open && closer.close && !opener.close) closer.wasAmbiguous = true;
      const n = closer.marker === '~' ? opener.count : opener.count >= 2 && closer.count >= 2 ? 2 : 1;
      const tag = closer.marker === '~' ? 'del' : n === 2 ? 'strong' : 'em';
      opener.count -= n; closer.count -= n;
      opener.html = opener.marker.repeat(opener.count) + '<' + tag + '>' + (opener.tail || '');
      opener.tail = '<' + tag + '>' + (opener.tail || '');
      closer.head = (closer.head || '') + '</' + tag + '>';
      closer.html = closer.head + closer.marker.repeat(closer.count);
      if (n === 2 && closer.count && tokens.slice(a+1,b).some(t=>t.wasAmbiguous && t.originalCount===1)) { closer.html = closer.marker.repeat(closer.count) + closer.head; closer.count = 0; }
      for (let k = a + 1; k < b; k++) tokens[k].open = tokens[k].close = false;
      if (opener.count && closer.count) a++;
    }
  }
  return tokens.map(t => t.html).join('');
}
const fence = line => /^ {0,3}(`{3,}|~{3,})([^\n]*)$/.exec(line);
const heading = line => /^ {0,3}(#{1,6})(?:[ \t]+(.*)|[ \t]*)$/.exec(line);
const thematic = line => /^ {0,3}(?:(?:\*[ \t]*){3,}|(?:_[ \t]*){3,}|(?:-[ \t]*){3,})$/.test(line);
const listMarker = line => /^ {0,3}((?:\d{1,9}[.)])|[-+*])(?:([ \t]+)(.*)|$)/.exec(line);
function htmlKind(line) {
  if (/^ {0,3}<(script|pre|style|textarea)(?:\s|>|$)/i.test(line)) return 1;
  if (/^ {0,3}<!--/.test(line)) return 2;
  if (/^ {0,3}<\?/.test(line)) return 3;
  if (/^ {0,3}<![A-Z]/.test(line)) return 4;
  if (/^ {0,3}<!\[CDATA\[/.test(line)) return 5;
  if (blockTagPattern.test(line)) return 6;
  if (/^ {0,3}(?:<[a-zA-Z][\w-]*(?:\s+[a-zA-Z_:][\w.:-]*(?:\s*=\s*(?:[^\s"'=<>`]+|'[^']*'|"[^"]*"))?)*\s*\/?>|<\/[a-zA-Z][\w-]*\s*>)\s*$/.test(line)) return 7;
  return 0;
}
function interrupt(line) {
  const f = fence(line), lm = listMarker(line);
  return !!(heading(line) || thematic(line) || /^ {0,3}>/.test(line) || (f && (f[1][0] !== '`' || !f[2].includes('`'))) || (htmlKind(line) && htmlKind(line) !== 7) || (lm && lm[3] && (!/^\d/.test(lm[1]) || parseInt(lm[1]) === 1)));
}
function splitCells(line) {
  line = line.trim().replace(/^\|/, '').replace(/(?<!\\)\|$/, '');
  const out = []; let start = 0;
  for (let i = 0; i < line.length; i++) if (line[i] === '|') {
    let n = 0; for (let k = i - 1; k >= 0 && line[k] === '\\'; k--) n++;
    if (n % 2) continue;
    out.push(line.slice(start, i).trim().replace(/\\\|/g, '|')); start = i + 1;
  }
  out.push(line.slice(start).trim().replace(/\\\|/g, '|')); return out;
}
function openFence(body) {
  let opened = null;
  for (let k=0;k<body.length;k++) {
    const m = fence(body[k]);
    if (!m) continue;
    if (!opened && (m[1][0] !== '`' || !m[2].includes('`'))) opened = { marker: m[1][0], size: m[1].length, index: k };
    else if (opened && m[1][0] === opened.marker && m[1].length >= opened.size && !m[2].trim()) opened = null;
  }
  return opened && body.length > opened.index + 1;
}
function stripIndent(row, width) { return row.includes('\t') ? expandIndent(row).slice(width) : row.slice(width); }
function expandIndent(line, offset = 0) {
  if (!line.includes('\t')) return line;
  return line.replace(/^[ \t]+/, run => { let col = offset; for (const c of run) col += c === '\t' ? 4 - col % 4 : 1; return ' '.repeat(col - offset); });
}
function endsInParagraph(nodes) { const node = nodes.at(-1); return node?.type === 'paragraph' || (node?.type === 'quote' && endsInParagraph(node.children)) || (node?.type === 'list' && endsInParagraph(node.items.at(-1).children)); }
function blocks(lines, refs, top = true, quote = false) {
  const nodes = [];
  let blockStart = 0, i = 0;
  const append = node => { node.sourceStart = blockStart; let end = i; while (end > blockStart && !lines[end-1].trim()) end--; node.end = end; nodes.push(node); };
  for (; i < lines.length;) {
    blockStart = i;
    if (/^ {0,3}\t/.test(lines[i])) lines[i] = lines[i].replace(/^( *)\t/, (_,a)=>' '.repeat(a.length+4-a.length%4));
    if (/^ {0,3}(?:[-+*]|\d{1,9}[.)])[ \t]/.test(lines[i]) && lines[i].includes('\t')) { let col = 0; lines[i] = lines[i].replace(/^( *[^ \t]+)([ \t]+)/, (_, a, b) => { col = a.length; let pad = ''; for (const c of b) { const n = c === '\t' ? 4 - col % 4 : 1; pad += ' '.repeat(n); col += n; } return a + pad; }); }
    const line = lines[i]; let m;
    if (!line.trim()) { i++; continue; }
    if ((m = fence(line)) && (m[1][0] !== '`' || !m[2].includes('`'))) {
      const body = [], marker = m[1][0], size = m[1].length, indent = quote && m[1][0] === '~' ? 0 : /^ */.exec(line)[0].length;
      i++;
      while (i < lines.length && !new RegExp('^ {0,3}' + (marker === '`' ? '`' : '~') + '{' + size + ',}[ \\t]*$').test(lines[i])) { let row = lines[i++]; if (indent && new RegExp('^ {0,'+(indent-1)+'}\\t').test(row)) row = row.replace(/^([ \t]+)/, run => ' '.repeat(run.replace(/\t/g, ' '.repeat(indent)).length)); body.push(row.replace(new RegExp('^ {0,' + indent + '}'), '')); }
      if (i < lines.length) i++;
      append({ type: 'code', text: body.join('\n').replace(/\n$/, ''), nonempty: body.length > 1, lang: unescape(m[2].trim()).split(/\s/)[0] }); continue;
    }
    if (/^ {4}/.test(line)) {
      const body = [];
      while (i < lines.length) {
        if (/^ {0,3}\t/.test(lines[i])) lines[i] = lines[i].replace(/^( *)\t/, (_,a)=>' '.repeat(a.length+4-a.length%4));
        if (!/^ {4}/.test(lines[i]) && lines[i].trim()) break;
        body.push(lines[i].trim() ? lines[i++].replace(/^ {4}/, '') : lines[i++].replace(/^ {0,4}/, ''));
      }
      while (body.length && !body.at(-1).trim()) body.pop();
      append({ type: 'code', text: body.join('\n'), lang: '' }); continue;
    }
    if ((m = heading(line))) {
      append({ type: 'heading', depth: m[1].length, text: (m[2] || '').replace(/(?:^|[ \t]+)#+[ \t]*$/, '').trim() }); i++; continue;
    }
    if (thematic(line)) { append({ type: 'hr' }); i++; continue; }
    if (/^ {0,3}>/.test(line)) {
      const body = [];
      while (i < lines.length) {
        if (/^ {0,3}>/.test(lines[i])) body.push(lines[i++].replace(/^( {0,3})>([ \t]?)(.*)$/, (_, a, sp, rest) => sp === '\t' ? expandIndent(' '.repeat(4 - (a.length + 1) % 4 - 1) + rest, a.length + 2) : expandIndent(rest, a.length + 2)));
        else if (lines[i].trim() && body.at(-1)?.trim() && !interrupt(lines[i]) && endsInParagraph(blocks(body.slice(), new Map(refs), top))) body.push(/^ {0,3}(?:=+|-+)[ \t]*$/.test(lines[i]) ? '    ' + lines[i++] : lines[i++]);
        else break;
      }
      append({ type: 'quote', children: blocks(body, refs, top, true) }); continue;
    }
    if ((m = listMarker(line))) {
      const ordered = /^\d/.test(m[1]), delimiter = ordered ? m[1].at(-1) : m[1], items = [];
      const start = ordered ? parseInt(m[1]) : 1;
      let loose = false;
      while (i < lines.length) {
        const mark = listMarker(lines[i]);
        if (!mark || /^\d/.test(mark[1]) !== ordered || (ordered ? mark[1].at(-1) : mark[1]) !== delimiter || thematic(lines[i])) break;
        const leading = /^ */.exec(lines[i])[0].length;
        const spaces = mark[3] ? (mark[2] || ' ').length : 1;
        const width = leading + mark[1].length + (spaces > 4 ? 1 : spaces);
        let content = mark[3] || '';
        if (spaces > 4) content = ' '.repeat(spaces - 1) + content;
        const body = [content]; i++;
        let blank = false;
        while (i < lines.length) {
          if (!lines[i].trim()) { if (!content && body.length === 1 && !listMarker(lines[i+1] || '')) break; body.push(''); blank = true; i++; continue; }
          const indent = /^ */.exec(expandIndent(lines[i]))[0].length;
          if (indent >= width) { body.push(stripIndent(lines[i], width)); blank = false; i++; continue; }
          if (!blank && openFence(body)) { body.push(lines[i++]); continue; }
          if (listMarker(lines[i]) || interrupt(lines[i]) || blank || !endsInParagraph(blocks(body.slice(), new Map(refs), false))) break;
          body.push((leading && /^ {4}/.test(lines[i]) && listMarker(lines[i].trimStart())) ? '    ' + lines[i++].trimStart() : /^ {4}/.test(lines[i]) ? lines[i++].slice(4) : lines[i++]);
        }
        const children = blocks(body, refs, false);
        if (children.some((child,k) => k > 0 && child.sourceStart > children[k-1].end) || body.some((row,k) => !row && /^ *\[[^\]]+\]:/.test(body[k+1] || ''))) loose = true;
        const nextMark = listMarker(lines[i] || '');
        if (body.length > 1 && body.at(-1) === '' && nextMark && /^\d/.test(nextMark[1]) === ordered && (ordered ? nextMark[1].at(-1) : nextMark[1]) === delimiter) loose = true;
        while (body.length && !body.at(-1).trim()) body.pop();
        let task = null;
        const taskMatch = /^\[([ xX])\] +/.exec(body[0] || '');
        if (taskMatch) { task = taskMatch[1] !== ' '; body[0] = body[0].slice(taskMatch[0].length); }
        items.push({ children: taskMatch ? blocks(body, refs, false) : children, task });
      }
      append({ type: 'list', ordered, start, loose, items }); continue;
    }
    const kind = htmlKind(line);
    if (kind) {
      const body = [];
      const endPattern = kind === 1 ? /<\/(?:script|pre|style|textarea)>/i : kind === 2 ? /-->/ : kind === 3 ? /\?>/ : kind === 4 ? />/ : /\]\]>/;
      while (i < lines.length) {
        if (kind >= 6 && !lines[i].trim()) break;
        const current = lines[i++]; body.push(current);
        if (kind < 6 && endPattern.test(current)) break;
      }
      append({ type: 'html', text: body.join('\n') + ((kind < 6 && i < lines.length && lines[i] !== '') || (i === lines.length && lines.finalNewline) ? '\n' : '') }); continue;
    }
    if (/^ {0,3}\[/.test(line)) {
      let combined = line, count = 1;
      while (i + count < lines.length && lines[i + count].trim() && count < 32) combined += '\n' + lines[i + count++];
      let found = false;
      const fragments = combined.split('\n');
      for (let size = fragments.length; size > 0; size--) {
        const candidate = fragments.slice(0,size).join('\n');
        const definition = /^ {0,3}\[((?:\\.|[^\[\]\\])+)]:(?:[ \t]*)([\s\S]*)$/.exec(candidate);
        if (!definition || !label(definition[1]) || !definition[2].trim()) continue;
        const d = destination(definition[2], 0);
        if (!d || definition[2].slice(d.end).trim()) continue;
        if (!refs.has(label(definition[1]))) refs.set(label(definition[1]), d);
        i += size; found = true; break;
      }
      if (found) continue;
    }
    if (i + 1 < lines.length && line.includes('|') && /^ {0,3}\|?\s*:?-+:?\s*(?:\|\s*:?-+:?\s*)*\|?\s*$/.test(lines[i + 1])) {
      const header = splitCells(line), align = splitCells(lines[i + 1]);
      if (header.length === align.length) {
        const rows = []; i += 2;
        while (i < lines.length && !/^[ ]*$/.test(lines[i]) && !interrupt(lines[i])) rows.push(splitCells(lines[i++]));
        append({ type: 'table', header, align: align.map(a => a.startsWith(':') && a.endsWith(':') ? 'center' : a.endsWith(':') ? 'right' : a.startsWith(':') ? 'left' : ''), rows }); continue;
      }
    }
    const body = [line]; i++;
    let setext = 0;
    while (i < lines.length && (lines[i].trim() || (lines[i] !== '' && i === lines.length - 1))) {
      if (/^ {0,3}(?:=+|-+)[ \t]*$/.test(lines[i])) { setext = lines[i].trim()[0] === '=' ? 1 : 2; i++; break; }
      if (interrupt(lines[i]) || (!top && listMarker(lines[i]))) break;
      if (i + 1 < lines.length && lines[i].includes('|') && /^ {0,3}\|?\s*:?-+:?\s*(?:\|\s*:?-+:?\s*)*\|?\s*$/.test(lines[i + 1])) break;
      body.push(lines[i++]);
    }
    append({ type: setext ? 'heading' : top ? 'paragraph' : 'paragraph', depth: setext, text: setext ? body.join('\n').trim() : body.map((row,k) => k && /^ {4}/.test(row) && listMarker(row.trimStart()) ? row.trimStart() : row).join('\n') });
  }
  return nodes;
}
function render(nodes, refs, tight = false) {
  let html = '';
  for (const n of nodes) {
    if (n.type === 'paragraph') html += tight ? inline(n.text, refs) : '<p>' + inline(n.text, refs) + '</p>\n';
    else if (n.type === 'heading') html += '<h' + n.depth + '>' + inline(n.text, refs) + '</h' + n.depth + '>\n';
    else if (n.type === 'hr') html += '<hr>\n';
    else if (n.type === 'html') html += n.text;
    else if (n.type === 'code') html += '<pre><code' + (n.lang ? ' class="language-' + escapeHTML(n.lang) + '"' : '') + '>' + escapeCode(n.text + (n.text || n.nonempty ? '\n' : '')) + '</code></pre>\n';
    else if (n.type === 'quote') html += '<blockquote>\n' + render(n.children, refs) + '</blockquote>\n';
    else if (n.type === 'list') {
      const tag = n.ordered ? 'ol' : 'ul';
      html += '<' + tag + (n.ordered && n.start !== 1 ? ' start="' + n.start + '"' : '') + '>\n';
      for (const item of n.items) {
        let body = render(item.children, refs, !n.loose);
        if (item.task !== null) {
          const checkbox = '<input ' + (item.task ? 'checked="" ' : '') + 'disabled="" type="checkbox"> ';
          body = n.loose && body.startsWith('<p>') ? '<p>' + checkbox + body.slice(3) : checkbox + body;
        }
        html += '<li>' + '' + body + '</li>\n';
      }
      html += '</' + tag + '>\n';
    } else if (n.type === 'table') {
      const cell = (value, k, tag) => '<' + tag + (n.align[k] ? ' align="' + n.align[k] + '"' : '') + '>' + inline(value || '', refs) + '</' + tag + '>\n';
      html += '<table>\n<thead>\n<tr>\n' + n.header.map((v, k) => cell(v, k, 'th')).join('') + '</tr>\n</thead>\n';
      if (n.rows.length) html += '<tbody>' + n.rows.map(row => '<tr>\n' + n.header.map((_, k) => cell(row[k], k, 'td')).join('') + '</tr>\n').join('') + '</tbody>';
      html += '</table>\n';
    }
  }
  return html;
}
export function parse(markdown) {
  const refs = new Map();
  const source = markdown.replace(/\r\n?/g, '\n');
  const lines = source.split('\n');
  lines.finalNewline = source.endsWith('\n');
  if (lines.finalNewline) lines.pop();
  const tree = blocks(lines, refs);
  refs.inlineCache = new Map();
  return render(tree, refs);
}
