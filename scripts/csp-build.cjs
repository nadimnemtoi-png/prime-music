#!/usr/bin/env node
/* Prime School · conversie pentru CSP strict (script-src 'self', fără 'unsafe-inline').
   Rulare (din folderul proiectului):   node scripts/csp-build.cjs
   Ce face, pe public/app.js (în loc):
     1. orice  on<eveniment>="..."  scris în HTML-ul generat (string/template)
        devine  data-h=<cheia sesiunii> data-on<eveniment>="..."  (vezi __CSP în app.js);
     2. regenerează blocul __scope (variabilele let/const de nivel de sus, ca
        butoanele să le poată citi/scrie: A, TB, ...);
     3. verifică sintaxa și că nu a rămas niciun on*= neconvertit;
     4. actualizează ?v=<hash> la /app.js în index.html (forțează reîncărcarea).
   Sigur de rulat de mai multe ori. */
"use strict";
const fs=require("fs"), path=require("path"), crypto=require("crypto");
const ROOT=path.resolve(__dirname,"..");
const vm=require("vm");
const acorn=(function(){ const box={}; box.self=box; box.globalThis=box; vm.runInNewContext(fs.readFileSync(path.join(ROOT,"public/vendor/acorn-8.16.0.min.js"),"utf8"),box); return box.acorn; })();
const APP=path.join(ROOT,"public/app.js"), HTML=path.join(ROOT,"index.html");
const EVS="click|dblclick|change|input|keydown|keyup|keypress|focus|blur|mousedown|mouseup|mouseover|mouseout|mouseenter|mouseleave|mousemove|contextmenu|submit|load|error|scroll|wheel|pointerdown|pointerup|pointermove|touchstart|touchend|touchmove|paste|copy|cut|ended|play|pause|timeupdate|loadedmetadata|animationend|transitionend";
const RE=new RegExp("(^|[^\\w$.\\-])on("+EVS+")=(?=\\\\?[\"'])","g");

let src=fs.readFileSync(APP,"utf8");
const START="/*__SCOPE_START__*/", END="/*__SCOPE_END__*/";
if(!src.includes(START)||!src.includes(END)) throw new Error("lipsesc marcajele __scope din app.js");

// 1. on*= → data-h + data-on*=
const edits=[];
for(const t of acorn.tokenizer(src,{ecmaVersion:"latest"})){
  const lab=t.type.label;
  if(lab!=="string"&&lab!=="template") continue;
  const raw=src.slice(t.start,t.end);
  RE.lastIndex=0; let m;
  while((m=RE.exec(raw))){
    const at=t.start+m.index+m[1].length; // poziția lui "on"
    let ins;
    if(lab==="template") ins="data-h=${__HT} data-";
    else { const q=raw[0]; if(q!=="'"&&q!=='"') throw new Error("string neașteptat la "+t.start); ins="data-h="+q+"+__HT+"+q+" data-"; }
    edits.push({at,ins});
  }
}
edits.sort((a,b)=>b.at-a.at);
for(const e of edits) src=src.slice(0,e.at)+e.ins+src.slice(e.at);

// 2. __scope
const ast=acorn.parse(src,{ecmaVersion:"latest"});
const names=[];
function pat(p,kind){ if(!p)return;
  if(p.type==="Identifier") names.push({n:p.name,kind});
  else if(p.type==="ObjectPattern") p.properties.forEach(q=>pat(q.type==="RestElement"?q.argument:q.value,kind));
  else if(p.type==="ArrayPattern") p.elements.forEach(e=>pat(e,kind));
  else if(p.type==="RestElement") pat(p.argument,kind);
  else if(p.type==="AssignmentPattern") pat(p.left,kind); }
for(const n of ast.body){
  if(n.type==="VariableDeclaration"&&n.kind!=="var") n.declarations.forEach(d=>pat(d.id,n.kind));
  else if(n.type==="ClassDeclaration") names.push({n:n.id.name,kind:"class"});
}
const skip=new Set(["__HT","__CSP","__scope"]);
const parts=names.filter(x=>!skip.has(x.n)).map(x=>"get "+x.n+"(){return "+x.n+"}"+(x.kind==="let"?",set "+x.n+"(v){"+x.n+"=v}":""));
const block=START+"const __scope={"+parts.join(",")+"};"+END;
const i0=src.indexOf(START), i1=src.indexOf(END)+END.length;
src=src.slice(0,i0)+block+src.slice(i1);

// 3. verificări
acorn.parse(src,{ecmaVersion:"latest"});
let left=0;
for(const t of acorn.tokenizer(src,{ecmaVersion:"latest"})){
  if(t.type.label!=="string"&&t.type.label!=="template") continue;
  RE.lastIndex=0; const raw=src.slice(t.start,t.end); let m;
  while((m=RE.exec(raw))){ left++; console.error("NECONVERTIT:",raw.slice(Math.max(0,m.index-40),m.index+60)); }
}
if(left) throw new Error(left+" on*= neconvertite");
fs.writeFileSync(APP,src);

// 4. index.html ?v=
const v=crypto.createHash("sha1").update(src).digest("hex").slice(0,10);
let html=fs.readFileSync(HTML,"utf8");
const re2=/<script src="\/app\.js(\?v=[0-9a-f]*)?"><\/script>/;
if(!re2.test(html)) throw new Error("index.html nu încarcă /app.js");
html=html.replace(re2,'<script src="/app.js?v='+v+'"></script>');
fs.writeFileSync(HTML,html);
console.log("ok · convertite acum:",edits.length,"· __scope:",parts.length,"nume · app.js v="+v);
