// Desenele animate pentru „Conceptul săptămânii”: portativ, claviatură, gât de chitară, tabulatură, ritm,
// metronom, dinamică, scară (gamă), drum (repetiții), mână, pedale, cercul cvintelor.
// window.PSVZ.html(spec) → HTML;  PSVZ.bind(el, play) → claviatura și chitara se pot apăsa (play({i,m}))
// Sincronizare cu sunetul: PSVZ.sync(el, events, bpm, total) — luminează notele/clapele pe rând.
(function(){
const NB={C:0,D:2,E:4,F:5,G:7,A:9,B:11}, LET="CDEFGAB", RO={C:"Do",D:"Re",E:"Mi",F:"Fa",G:"Sol",A:"La",B:"Si"};
const P=n=>{ const m=/^([A-G])(#|b|n)?(\d)$/.exec(n); if(!m) return null; return {L:m[1],acc:m[2]||"",o:+m[3],
  step:LET.indexOf(m[1])+(+m[3])*7, midi:(+m[3]+1)*12+NB[m[1]]+(m[2]==="#"?1:m[2]==="b"?-1:0)}; };
const roName=n=>{ const p=P(n); return p?RO[p.L]+(p.acc==="#"?"♯":p.acc==="b"?"♭":""):n; };
const esc=s=>String(s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const CSS=`.vz{margin:4px 0 14px;background:#fbf8f0;border-radius:18px;padding:12px 10px;color:#222;position:relative;overflow:hidden}
.vz.dk{background:#1f1f1f;border:1px solid #2c2c2c;color:#eee}
.vz svg{display:block;width:100%;height:auto;overflow:visible}.vz svg.ly{color:#1a1a1a}.vz svg.ly text{font-family:system-ui,-apple-system,sans-serif}
.vz .cap{text-align:center;font-size:12.5px;font-weight:700;color:#6a4fa8;margin-top:6px}.vz.dk .cap{color:#c58cff}
.vz .ap{opacity:0;animation:vzin .45s cubic-bezier(.2,1.3,.4,1) forwards}
@keyframes vzin{from{opacity:0;transform:translateY(-10px)}to{opacity:1;transform:none}}
.vz .glow{animation:vzglow 1.6s ease-in-out infinite}@keyframes vzglow{50%{opacity:.35}}
.vz .nh.hit,.vz .nh.hit *,.vz .seq.hit *{fill:#7b3fe4!important;stroke:#7b3fe4!important}
.vz .kbw{fill:#fff;stroke:#333;stroke-width:1.2;cursor:pointer;transition:fill .12s}.vz .kbb{fill:#222;cursor:pointer;transition:fill .12s}
.vz .kbw.on{fill:#e9dcff}.vz .kbb.on{fill:#9a6ae6}.vz .kbw.hit{fill:#c58cff}.vz .kbb.hit{fill:#c58cff}
.vz .str{transition:stroke .12s}.vz .str.hit{stroke:#c58cff!important}
.vz .dot{cursor:pointer}.vz .dot.hit circle{fill:#c58cff}
.vz .rh{display:flex;align-items:stretch;gap:3px;height:46px;margin:6px 0;position:relative}
.vz .rh b svg{width:auto!important;height:28px!important;flex:none}.vz .rh b{min-width:0;overflow:hidden;display:flex;align-items:center;justify-content:center;border-radius:9px;background:#efe6ff;border:1.5px solid #c9b2f5;font-size:20px;color:#3a1d6e;font-family:serif;opacity:0;animation:vzin .4s forwards}
.vz .rh b.r{background:#f1f1f1;border-style:dashed;border-color:#bbb;color:#888}.vz .rh b.acc{background:#ffe27a;border-color:#e0a800}
.vz .rh .ph{position:absolute;top:-4px;bottom:-4px;width:3px;border-radius:2px;background:#e53935;left:0;opacity:0}
.vz .rh .ph.run{opacity:1;animation:vzph linear forwards}@keyframes vzph{from{left:0}to{left:100%}}
.vz .rl{font-size:11px;font-weight:800;color:#6a4fa8;margin-top:2px}.vz .bn{display:flex;font-size:11px;color:#888;font-weight:700}.vz .bn span{flex:1;text-align:center}
.vz .met{transform-origin:50% 92%;animation:vzmet 1.33s ease-in-out infinite alternate}@keyframes vzmet{from{transform:rotate(-24deg)}to{transform:rotate(24deg)}}
.vz .db{transform-origin:50% 100%;animation:vzbar .7s cubic-bezier(.2,1.3,.4,1) backwards}@keyframes vzbar{from{transform:scaleY(0)}}
.vz .st{opacity:0;animation:vzin .35s forwards}.vz .st.hit rect{fill:#c58cff}
.vz .fb{transition:all .2s}.vz .fb.cur rect{fill:#ffe27a;stroke:#e0a800}
.vz .tk{fill:#3a1d6e;font-weight:800;font-family:system-ui}
.vz .cf .k{cursor:default;transition:all .2s}.vz .cf .k.on circle{fill:#c58cff}`;
function css(){ if(document.getElementById('vz-css')) return; const s=document.createElement('style'); s.id='vz-css'; s.textContent=CSS; document.head.appendChild(s); }

// ── PORTATIV ──
// note: "E4/q" "F#4/h." "C4+E4+G4/w" "r/q" "|" "||" "|]" "|:" ":|"; după durată: ~Etichetă, !s staccato !a accent !f fermata !t legătură !( !) legato !3( !3) triolet !h evidențiat
function staff(sp){
  // portativele gravate cu LilyPond (vendor/concepte-portative.js); desenul de mai jos rămâne doar ca rezervă
  const lk=`${sp.clef===undefined?"g":(sp.clef||"")}|${sp.key||""}|${sp.time||""}|${sp.n||""}`;
  if(window.PS_STAFF_SVG&&window.PS_STAFF_SVG[lk]) return window.PS_STAFF_SVG[lk].replace('<svg class="ly" ',`<svg class="ly" style="max-height:${sp.small?110:sp.nums?150:165}px" `);
  const toks=(sp.n||"").trim()?sp.n.trim().split(/\s+/):[], clef=sp.clef===undefined?"g":sp.clef;
  const LS=10, top=34, bottomY=top+4*LS, base=clef==="f"?18:30;   // treapta liniei de jos: Sol2 (f) / Mi4 (g)
  const yOf=st=>bottomY-(st-base)*LS/2;
  let x=10, out=[], extra=[], i=0, seqI=0;
  // linii (+ numere)
  const W0=Math.max(220,60+toks.length*38+(sp.key?40:0)+(sp.time?24:0));
  if(clef==="g") out.push(`<text x="${x}" y="${bottomY+9}" font-size="62" font-family="'Bravura','Noto Music','Segoe UI Symbol','Apple Symbols',serif">𝄞</text>`), x+=40;
  else if(clef==="f") out.push(`<text x="${x+2}" y="${top+30}" font-size="44" font-family="'Bravura','Noto Music','Segoe UI Symbol','Apple Symbols',serif">𝄢</text>`), x+=40;
  else x+=8;
  if(sp.key){ const sh=sp.key[0]==="#", k=+sp.key.slice(1), ord=sh?["F5","C5","G5","D5","A4","E5","B4"]:["B4","E5","A4","D5","G4","C5","F4"];
    const shiftF=clef==="f"?-14:0;
    for(let j=0;j<k;j++){ const st=P(ord[j]).step+shiftF; out.push(`<text class="${sp.seqKey?"ap":""}" style="animation-delay:${.3+j*.25}s" x="${x+j*9}" y="${yOf(st)+6}" font-size="20" font-weight="700">${sh?"♯":"♭"}</text>`); }
    x+=k*9+10; }
  if(sp.time){ const [a,b]=sp.time.split("/"); out.push(`<text x="${x}" y="${top+19}" font-size="22" font-weight="900" font-family="Georgia,serif">${a}</text><text x="${x}" y="${top+39}" font-size="22" font-weight="900" font-family="Georgia,serif">${b}</text>`); x+=26; }
  const notes=[];
  toks.forEach(t=>{
    if(/^(\||\|\||\|\]|\|:|:\|)$/.test(t)){ const bx=x+2;
      if(t==="|") out.push(`<line x1="${bx}" y1="${top}" x2="${bx}" y2="${bottomY}" stroke="#222" stroke-width="1.3"/>`);
      else if(t==="||") out.push(`<line x1="${bx}" y1="${top}" x2="${bx}" y2="${bottomY}" stroke="#222" stroke-width="1.3"/><line x1="${bx+4}" y1="${top}" x2="${bx+4}" y2="${bottomY}" stroke="#222" stroke-width="1.3"/>`);
      else if(t==="|]") out.push(`<line x1="${bx}" y1="${top}" x2="${bx}" y2="${bottomY}" stroke="#222" stroke-width="1.3"/><rect x="${bx+4}" y="${top}" width="4" height="${4*LS}" fill="#222"/>`);
      else if(t==="|:") out.push(`<rect x="${bx}" y="${top}" width="4" height="${4*LS}" fill="#222"/><line x1="${bx+7}" y1="${top}" x2="${bx+7}" y2="${bottomY}" stroke="#222" stroke-width="1.3"/><circle cx="${bx+12}" cy="${top+15}" r="2.2"/><circle cx="${bx+12}" cy="${top+25}" r="2.2"/>`);
      else out.push(`<circle cx="${bx}" cy="${top+15}" r="2.2"/><circle cx="${bx}" cy="${top+25}" r="2.2"/><line x1="${bx+5}" y1="${top}" x2="${bx+5}" y2="${bottomY}" stroke="#222" stroke-width="1.3"/><rect x="${bx+8}" y="${top}" width="4" height="${4*LS}" fill="#222"/>`);
      x+=t==="|"?14:20; return; }
    let [body,...mods]=t.split("!"); let lab=null; const ti=body.indexOf("~"); if(ti>=0){ lab=body.slice(ti+1).replace(/_/g," "); body=body.slice(0,ti); }
    mods.forEach((m,k)=>{ const li=m.indexOf("~"); if(li>=0){ lab=m.slice(li+1).replace(/_/g," "); mods[k]=m.slice(0,li); } });
    const [pn,dRaw]=body.split("/"), dot=(dRaw||"q").endsWith("."), d=(dRaw||"q").replace(".","");
    if(/^[A-G](#|b|n)/.test(pn)||/\+[A-G](#|b|n)/.test(pn)) x+=12;   // loc pentru ♯ ♭ ♮
    if(lab&&notes.length&&notes[notes.length-1].lab){ const need=Math.max(0,(lab.length+notes[notes.length-1].lab.length)*3.6-34); x+=need; }
    const delay=sp.seq===false?0:.15+i*.22; i++;
    const g=[]; let stemUp=true, headX=x+14;
    if(pn==="r"){ const RG={w:"𝄻",h:"𝄼",q:"𝄽",e:"𝄾",s:"𝄿"};
      if(d==="w") g.push(`<rect x="${headX-6}" y="${top+10}" width="13" height="5" fill="#222"/>`);
      else if(d==="h") g.push(`<rect x="${headX-6}" y="${top+15}" width="13" height="5" fill="#222"/>`);
      else g.push(`<text x="${headX-7}" y="${top+29}" font-size="30" font-family="'Bravura','Noto Music','Segoe UI Symbol','Apple Symbols',serif">${RG[d]}</text>`);
      if(dot) g.push(`<circle cx="${headX+12}" cy="${top+15}" r="2"/>`);
      notes.push({x:headX,rest:1,yTop:top+8,yBot:top+30,stemUp:true}); }
    else {
      const ps=pn.split("+").map(P).filter(Boolean); const avg=ps.reduce((a,p)=>a+p.step,0)/ps.length; stemUp=avg<base+4;
      const hollow=d==="w"||d==="h";
      ps.forEach(p=>{ const y=yOf(p.step);
        // linii suplimentare
        for(let s=base-2;s>=p.step;s-=2) g.push(`<line x1="${headX-11}" x2="${headX+11}" y1="${yOf(s)}" y2="${yOf(s)}" stroke="#222" stroke-width="1.3"/>`);
        for(let s=base+10;s<=p.step;s+=2) g.push(`<line x1="${headX-11}" x2="${headX+11}" y1="${yOf(s)}" y2="${yOf(s)}" stroke="#222" stroke-width="1.3"/>`);
        if(p.acc) g.push(`<text x="${headX-22}" y="${y+6}" font-size="18" font-weight="700">${p.acc==="#"?"♯":p.acc==="b"?"♭":"♮"}</text>`);
        g.push(`<ellipse class="nh" data-m="${p.midi}" cx="${headX}" cy="${y}" rx="${d==="w"?7.5:6.3}" ry="4.6" transform="rotate(-20 ${headX} ${y})" fill="${hollow?"#fbf8f0":"#222"}" stroke="#222" stroke-width="${hollow?2.2:1}"/>`);
        if(dot) g.push(`<circle cx="${headX+12}" cy="${y-(p.step%2===0?4:0)}" r="2.1"/>`); });
      const yTop=Math.min(...ps.map(p=>yOf(p.step))), yBot=Math.max(...ps.map(p=>yOf(p.step)));
      if(d!=="w"){ const sx=stemUp?headX+5.8:headX-5.8, y1=stemUp?yBot:yTop, y2=stemUp?yTop-32:yBot+32;
        g.push(`<line x1="${sx}" x2="${sx}" y1="${y1}" y2="${y2}" stroke="#222" stroke-width="1.4"/>`);
        notes.push({x:headX,sx,y2,d,stemUp,ps,yTop,yBot}); }
      else notes.push({x:headX,d,ps,yTop,yBot});
    }
    const n=notes[notes.length-1]; n.mods=mods; n.lab=lab; n.delay=delay;
    const hl=mods.includes("h");
    out.push(`<g class="seq ap${hl?" hlg":""}" data-i="${pn==="r"?-1:seqI}" style="animation-delay:${delay}s">${hl?`<rect x="${headX-15}" y="${top-28}" width="30" height="${4*LS+56}" rx="10" fill="#c58cff" opacity=".22" class="glow"/>`:""}${g.join("")}</g>`);
    if(pn!=="r") seqI++;
    x+=(d==="w"?44:d==="h"?38:d==="e"||d==="s"?30:34)+(dot?8:0);
  });
  const W=Math.max(W0,x+8);
  // grupare optimi/șaisprezecimi (bare)
  let grp=[]; const flush=()=>{ if(grp.length>1){ const up=grp.filter(n=>n.stemUp).length>=grp.length/2, a=grp[0], b=grp[grp.length-1];
      const yb=up?Math.min(...grp.map(n=>n.yTop))-30:Math.max(...grp.map(n=>n.yBot))+30, sx=n=>up?n.x+5.8:n.x-5.8;
      grp.forEach(n=>{ const y1=up?n.yBot:n.yTop; extra.push(`<line x1="${sx(n)}" x2="${sx(n)}" y1="${y1}" y2="${yb}" stroke="#222" stroke-width="1.4"/>`); n.beamed=1; });
      extra.push(`<line x1="${sx(a)}" x2="${sx(b)}" y1="${yb}" y2="${yb}" stroke="#222" stroke-width="5"/>`);
      if(grp[0].d==="s") extra.push(`<line x1="${sx(a)}" x2="${sx(b)}" y1="${yb+(up?8:-8)}" y2="${yb+(up?8:-8)}" stroke="#222" stroke-width="5"/>`); }
    else if(grp.length===1) grp[0].solo=1; grp=[]; };
  toks.forEach((t,k)=>{}); // (ordinea notelor e în notes)
  notes.forEach(n=>{ const m=n.mods||[]; if(m.includes("3(")) flush(); if(!n.rest&&(n.d==="e"||n.d==="s")&&!(sp.flags)){ grp.push(n); if(grp.length===4||m.includes("3)")) flush(); } else flush(); }); flush();
  notes.forEach(n=>{ if(!n.rest&&(n.d==="e"||n.d==="s")&&!n.beamed){ const f=n.stemUp?`M${n.sx} ${n.y2} q 9 8 8 20`:`M${n.sx} ${n.y2} q 9 -8 8 -20`;
      extra.push(`<path d="${f}" fill="none" stroke="#222" stroke-width="2"/>`); if(n.d==="s") extra.push(`<path d="${f}" transform="translate(0 ${n.stemUp?8:-8})" fill="none" stroke="#222" stroke-width="2"/>`); } });
  // semne: staccato, accent, fermata, etichete, legături, triolete
  let slur=null, tri=null;
  notes.forEach((n,k)=>{ const m=n.mods||[], above=n.yTop-14, below=n.yBot+16;
    if(m.includes("s")) extra.push(`<circle cx="${n.x}" cy="${n.stemUp===false?above+2:below-2}" r="2.4" fill="#d02a2a"/>`);
    if(m.includes("a")) extra.push(`<path d="M${n.x-7} ${Math.min(above,top-8)-6} l14 4 l-14 4" fill="none" stroke="#d02a2a" stroke-width="2"/>`);
    if(m.includes("f")) extra.push(`<path d="M${n.x-10} ${top-10} a10 10 0 0 1 20 0" fill="none" stroke="#d02a2a" stroke-width="2.2"/><circle cx="${n.x}" cy="${top-13}" r="2.2" fill="#d02a2a"/>`);
    if(m.includes("t")&&notes[k+1]) { const b=notes[k+1], y=n.yBot+10; extra.push(`<path d="M${n.x+3} ${y} Q ${(n.x+b.x)/2} ${y+12} ${b.x-3} ${y}" fill="none" stroke="#d02a2a" stroke-width="2"/>`); }
    if(m.includes("(")) slur=n; if(m.includes(")")&&slur){ const y=Math.max(slur.yBot,n.yBot)+(slur.stemUp?14:44); extra.push(`<path d="M${slur.x} ${y} Q ${(slur.x+n.x)/2} ${y+22} ${n.x} ${y}" fill="none" stroke="#d02a2a" stroke-width="2"/>`); slur=null; }
    if(m.includes("3(")) tri=n; if(m.includes("3)")&&tri){ const y=Math.min(...notes.slice(notes.indexOf(tri),k+1).map(z=>z.yTop))-40; extra.push(`<path d="M${tri.x} ${y+6} v-6 H${n.x} v6" fill="none" stroke="#d02a2a" stroke-width="1.6"/><text x="${(tri.x+n.x)/2-4}" y="${y-3}" font-size="14" font-weight="800" fill="#d02a2a">3</text>`); tri=null; }
    if(n.lab) extra.push(`<text class="ap" style="animation-delay:${n.delay+.15}s" x="${n.x}" y="${Math.max(bottomY+30,n.yBot+(n.stemUp?26:44))}" text-anchor="middle" font-size="13" font-weight="800" fill="#6a2fc9">${esc(n.lab)}</text>`);
  });
  const lines=[0,1,2,3,4].map(k=>{ const y=bottomY-k*LS, h=sp.hlLine===k+1;
    return `<line x1="4" x2="${W-4}" y1="${y}" y2="${y}" stroke="${h?"#7b3fe4":"#222"}" stroke-width="${h?3:1.2}" ${h?'class="glow"':""}/>`+(sp.nums?`<text class="ap" style="animation-delay:${.2+k*.25}s" x="${W+4}" y="${y+4}" font-size="11" font-weight="800" fill="#7b3fe4">${k+1}</text>`:""); }).join("");
  const H=bottomY+54;
  return `<svg viewBox="0 ${top-34} ${W+(sp.nums?16:0)} ${H-top+34}" style="max-height:${sp.small?120:170}px">${lines}${out.join("")}${extra.join("")}</svg>`;
}

// ── CLAVIATURĂ ──
function kb(sp){
  const a=P(sp.from||"C4").midi, b=P(sp.to||"B4").midi, whites=[];
  for(let m=a;m<=b;m++) if([0,2,4,5,7,9,11].includes(m%12)) whites.push(m);
  const WW=34, H=120, BH=74, BW=22, hl=new Set((sp.hl||[]).map(n=>P(n).midi)), lab=sp.lab||"hl";
  const nm=m=>{ const pc=m%12, o=Math.floor(m/12)-1, w={0:"C",2:"D",4:"E",5:"F",7:"G",9:"A",11:"B"}[pc]; return w?w+o:null; };
  const RO12=["Do","Do♯","Re","Mi♭","Mi","Fa","Fa♯","Sol","La♭","La","Si♭","Si"], RO2={1:"Do♯ Re♭",3:"Re♯ Mi♭",6:"Fa♯ Sol♭",8:"Sol♯ La♭",10:"La♯ Si♭"};
  const xs={}; let o=[], ob=[], ex=[];
  whites.forEach((m,i)=>{ xs[m]=i*WW; const on=hl.has(m), name=RO12[m%12];
    o.push(`<rect class="kbw${on?" on":""}" data-m="${m}" x="${i*WW}" y="0" width="${WW}" height="${H}" rx="4"/>`);
    const L=sp.labs&&sp.labs[nm(m)]; const show=L||lab==="w"||lab==="all"||(lab==="hl"&&on);
    if(show) o.push(`<text x="${i*WW+WW/2}" y="${H-10}" text-anchor="middle" font-size="${L&&L.length>4?9.5:12}" font-weight="800" fill="${on?"#5a24b8":"#555"}" pointer-events="none">${esc(L||name)}</text>`); });
  for(let m=a;m<=b;m++) if(![0,2,4,5,7,9,11].includes(m%12)){ const left=xs[m-1]; if(left===undefined) continue; const x=left+WW-BW/2, on=hl.has(m);
    xs[m]=x-WW+BW/2;
    ob.push(`<rect class="kbb${on?" on":""}" data-m="${m}" x="${x}" y="0" width="${BW}" height="${BH}" rx="3"/>`);
    if(sp.grp){ const g2=[1,3].includes(m%12); ob.push(`<rect x="${x}" y="${BH-12}" width="${BW}" height="12" rx="3" fill="${g2?"#ffb020":"#3ec96b"}" pointer-events="none" class="ap" style="animation-delay:.3s"/>`); }
    const L=sp.labs&&sp.labs[Object.keys(sp.labs).find(k=>P(k)&&P(k).midi===m)];
    if(L||(on&&lab!=="none")||lab==="all") { const t=L||(sp.dbl?RO2[m%12]:RO12[m%12]); const pr=sp.dbl&&!L?t.split(" "):[t]; pr.forEach((q,j)=>ob.push(`<text x="${x+BW/2}" y="${-6-(pr.length-1-j)*12}" text-anchor="middle" font-size="10" font-weight="800" fill="#5a24b8">${esc(q)}</text>`)); } }
  const cx=m=>{ const pc=m%12; return [0,2,4,5,7,9,11].includes(pc)?xs[m]+WW/2:xs[m]+WW-BW/2+BW/2+ (WW-BW)/2 - (WW-BW)/2; };
  const kx=m=>[0,2,4,5,7,9,11].includes(m%12)?xs[m]+WW/2:(xs[m-1]+WW);
  (sp.mark||[]).forEach(([p,q,t],k)=>{ const x1=kx(P(p).midi), x2=kx(P(q).midi), y=H+10; ex.push(`<g class="ap" style="animation-delay:${.5+k*.35}s"><path d="M${x1} ${y} Q ${(x1+x2)/2} ${y+18} ${x2} ${y}" fill="none" stroke="#d02a2a" stroke-width="2.4"/><text x="${(x1+x2)/2}" y="${y+28}" text-anchor="middle" font-size="13" font-weight="900" fill="#d02a2a">${esc(t)}</text></g>`); });
  (sp.arrow||[]).forEach(([p,q],k)=>{ const x1=kx(P(p).midi), x2=kx(P(q).midi); ex.push(`<g class="ap" style="animation-delay:${.6+k*.3}s"><line x1="${x1}" y1="${-22}" x2="${x2}" y2="${-22}" stroke="#d02a2a" stroke-width="2.6"/><path d="M${x2} -22 l${x2>x1?-7:7} -5 v10 z" fill="#d02a2a"/></g>`); });
  Object.entries(sp.num||{}).forEach(([n,t],k)=>{ const x=kx(P(n).midi); ex.push(`<g class="ap" style="animation-delay:${.2+k*.18}s"><circle cx="${x}" cy="-18" r="8.5" fill="#7b3fe4"/><text x="${x}" y="-14.5" text-anchor="middle" font-size="11" font-weight="900" fill="#fff">${esc(t)}</text></g>`); });
  (sp.zone||[]).forEach(([p,q,t])=>{ const x1=xs[P(p).midi], x2=xs[P(q).midi]+WW; ex.push(`<g class="ap" style="animation-delay:.3s"><rect x="${x1+2}" y="${H+6}" width="${x2-x1-4}" height="30" rx="10" fill="#7b3fe4"/><text x="${(x1+x2)/2}" y="${H+27}" text-anchor="middle" font-size="19" font-weight="800" fill="#fff">${esc(t)}</text></g>`); });
  const W=whites.length*WW, top=sp.dbl?-40:(sp.num||sp.arrow||lab==="all"||(sp.hl||[]).some(n=>P(n).acc))?-34:-4, bot=H+((sp.mark||[]).length?38:(sp.zone||[]).length?40:4);
  return `<svg class="kb" viewBox="-2 ${top} ${W+4} ${bot-top}" style="max-height:${sp.small?120:190}px">${o.join("")}${ob.join("")}${ex.join("")}</svg>`;
}

// ── CHITARĂ: gât (coarda 1 sus) și tabulatură ──
const OPEN=[64,59,55,50,45,40], SN=["Mi","Si","Sol","Re","La","Mi"];
function fret(sp){ const F=sp.frets||5, X0=46, FW=52, top=14, SG=22, W=X0+F*FW+10, H=top+5*SG+30, o=[];
  o.push(`<rect x="${X0}" y="${top-6}" width="${F*FW}" height="${5*SG+12}" rx="4" fill="#5a3a22"/>`);
  o.push(`<rect x="${X0-5}" y="${top-6}" width="6" height="${5*SG+12}" fill="#eee"/>`);
  for(let f=1;f<=F;f++) o.push(`<line x1="${X0+f*FW}" x2="${X0+f*FW}" y1="${top-6}" y2="${top+5*SG+6}" stroke="#c9c9c9" stroke-width="2"/>`);
  [3,5,7,9].forEach(f=>{ if(f<=F) o.push(`<circle cx="${X0+(f-.5)*FW}" cy="${top+2.5*SG}" r="5" fill="#d8c8a8" opacity=".6"/>`); });
  if(sp.capo) o.push(`<rect class="ap" style="animation-delay:.3s" x="${X0+(sp.capo-.5)*FW-7}" y="${top-12}" width="14" height="${5*SG+24}" rx="6" fill="#222"/><text class="ap" style="animation-delay:.3s" x="${X0+(sp.capo-.5)*FW}" y="${top+5*SG+28}" text-anchor="middle" font-size="11" font-weight="800" fill="#d02a2a">capo</text>`);
  for(let s=0;s<6;s++){ const y=top+s*SG, w=1+s*.55, hl=(sp.hlStr||[]).includes(s+1);
    o.push(`<line class="str" data-m="${OPEN[s]}" x1="${X0-5}" x2="${X0+F*FW}" y1="${y}" y2="${y}" stroke="${hl?"#c58cff":"#d9d9d9"}" stroke-width="${w+(hl?1.5:0)}"/>`);
    o.push(`<rect class="hitz" data-s="${s+1}" data-f="0" x="0" y="${y-SG/2}" width="${X0}" height="${SG}" fill="transparent" style="cursor:pointer"/>`);
    if(sp.names!==false) o.push(`<text x="${X0-12}" y="${y+4}" text-anchor="end" font-size="11.5" font-weight="800" fill="#ddd">${sp.nums?(s+1)+" · ":""}${SN[s]}</text>`); }
  for(let f=1;f<=F;f++) o.push(`<text x="${X0+(f-.5)*FW}" y="${top+5*SG+20}" text-anchor="middle" font-size="10" fill="#999">${f}</text>`);
  (sp.dots||[]).forEach(([s,f,t],k)=>{ const x=f===0?X0-26:X0+(f-.5)*FW, y=top+(s-1)*SG;
    o.push(`<g class="dot ap" data-s="${s}" data-f="${f}" data-m="${OPEN[s-1]+f}" style="animation-delay:${.25+k*.2}s">${f===0?`<circle cx="${x}" cy="${y}" r="8" fill="none" stroke="#c58cff" stroke-width="2.5"/>`:`<circle cx="${x}" cy="${y}" r="10" fill="#7b3fe4"/>`}<text x="${x}" y="${y+4}" text-anchor="middle" font-size="10.5" font-weight="900" fill="#fff" pointer-events="none">${esc(t||"")}</text></g>`); });
  return `<svg class="fr" viewBox="-6 0 ${W+6} ${H}" style="max-height:200px">${o.join("")}</svg>`; }
function tab(sp){ const cols=sp.cols||[], X0=34, CW=40, top=16, SG=17, W=X0+Math.max(4,cols.length)*CW+12, o=[];
  o.push(`<text x="4" y="${top+2.5*SG+6}" font-size="15" font-weight="900" fill="#555" font-family="Georgia,serif">TAB</text>`);
  for(let s=0;s<6;s++) o.push(`<line x1="${X0}" x2="${W-6}" y1="${top+s*SG}" y2="${top+s*SG}" stroke="#666" stroke-width="1.2"/><text x="${W}" y="${top+s*SG+4}" font-size="10" font-weight="800" fill="#7b3fe4">${sp.names?SN[s]:""}</text>`);
  cols.forEach((c,i)=>{ const x=X0+16+i*CW; c.forEach((v,s)=>{ if(v===""||v==null) return; const m=OPEN[s]+(+v);
    o.push(`<g class="seq ap" data-i="${i}" style="animation-delay:${.2+i*.25}s"><rect x="${x-9}" y="${top+s*SG-9}" width="18" height="18" rx="5" fill="#fbf8f0"/><text class="tk nh" data-m="${m}" x="${x}" y="${top+s*SG+5}" text-anchor="middle" font-size="15">${v}</text></g>`); }); });
  return `<svg viewBox="0 0 ${W+20} ${top+5*SG+16}" style="max-height:150px">${o.join("")}</svg>`; }

// ── RITM: blocuri proporționale cu durata + cursor care merge odată cu sunetul ──
const DU={w:4,h:2,q:1,e:.5,s:.25,t:1/3};
function ico(d,rest){ if(rest) return `<svg viewBox="0 0 20 34" width="14" height="26"><path d="M7 4 l7 8 -6 6 7 10 c-6-3-10 0-6 6 -9-5-4-12 3-9 L4 13 l6-6z" fill="#888"/></svg>`;
  const hollow=d==="w"||d==="h", stem=d!=="w", fl=d==="e"||d==="t"?1:d==="s"?2:0;
  return `<svg viewBox="0 0 22 36" width="16" height="28"><ellipse cx="8" cy="28" rx="6.5" ry="4.6" transform="rotate(-20 8 28)" fill="${hollow?"none":"#3a1d6e"}" stroke="#3a1d6e" stroke-width="2.2"/>${stem?`<line x1="14" y1="27" x2="14" y2="3" stroke="#3a1d6e" stroke-width="2"/>`:""}${fl?`<path d="M14 3 q8 6 6 15" fill="none" stroke="#3a1d6e" stroke-width="2.2"/>`:""}${fl>1?`<path d="M14 9 q8 6 6 15" fill="none" stroke="#3a1d6e" stroke-width="2.2"/>`:""}</svg>`; }
function rhythm(sp){ const beats=sp.beats||4, bars=sp.bars||1, tot=beats*bars;
  return (sp.rows||[]).map((r,ri)=>{ let acc=0;
    const cells=r.map((c,k)=>{ const rest=c[0]==="r", ac=c.endsWith("!"), cc=c.replace("r","").replace("!",""), dot=cc.endsWith("."), d=cc.replace(".",""), v=DU[d]*(dot?1.5:1); acc+=v;
      return `<b class="${rest?"r":""}${ac?" acc":""}" style="flex:${v};animation-delay:${.1+k*.08+ri*.15}s">${ico(d,rest)}${dot?"<span style='font-size:20px;margin-left:1px'>·</span>":""}${d==="t"?"<sup style='font-size:10px;font-family:system-ui;font-weight:800'>3</sup>":""}</b>`; }).join("");
    return `${sp.lab&&sp.lab[ri]?`<div class="rl">${esc(sp.lab[ri])}</div>`:""}<div class="rh" data-row="${ri}">${cells}<i class="ph"></i></div>`; }).join("")
    +(sp.nums!==false?`<div class="bn">${Array.from({length:tot},(_,i)=>`<span>${(i%beats)+1}</span>`).join("")}</div>`:""); }

// ── METRONOM ──
function metro(sp){ const per=60/(sp.bpm||90);
  return `<svg viewBox="0 0 200 170" style="max-height:170px"><path d="M60 160 L80 20 H120 L140 160 Z" fill="#3a1d6e"/><path d="M70 150 L86 34 H114 L130 150 Z" fill="#5e2989"/>
  <g class="met" style="animation-duration:${per}s"><line x1="100" y1="150" x2="100" y2="30" stroke="#ffc90e" stroke-width="4"/><rect x="91" y="${70-(sp.bpm||90)/6}" width="18" height="14" rx="3" fill="#fff"/></g>
  <circle cx="100" cy="150" r="7" fill="#ffc90e"/><text class="bpm" x="100" y="14" text-anchor="middle" font-size="14" font-weight="900" fill="#5e2989">${sp.bpm||90} BPM</text></svg>`; }

// ── DINAMICĂ: bare de volum ──
function dyn(sp){ const it=sp.items||[], W=it.length*46;
  return `<svg viewBox="0 0 ${W} 150" style="max-height:160px">${it.map(([t,v],k)=>{ const h=Math.max(8,v*110);
    return `<g><rect class="db" style="animation-delay:${k*.12}s" x="${k*46+8}" y="${120-h}" width="30" height="${h}" rx="6" fill="${v>.7?"#e53935":v>.45?"#ff9a1f":"#7b3fe4"}"/><text x="${k*46+23}" y="142" text-anchor="middle" font-size="16" font-weight="900" font-style="italic" font-family="Georgia,serif" fill="#3a1d6e">${esc(t)}</text></g>`; }).join("")}
  ${sp.hair?`<path class="ap" style="animation-delay:.8s" d="${sp.hair==="<"?`M8 10 L${W-8} 2 M8 10 L${W-8} 18`:`M8 2 L${W-8} 10 M8 18 L${W-8} 10`}" stroke="#d02a2a" stroke-width="3" fill="none"/>`:""}</svg>`; }

// ── SCARĂ (gama, pași T/S) ──
function stairs(sp){ const n=sp.notes||[], st=sp.steps||[], m=sp.m||[]; let h=20, xs=[]; const o=[];
  n.forEach((t,k)=>{ if(k>0) h+=st[k-1]==="T"?16:8; const x=k*40;
    o.push(`<g class="st" data-m="${m[k]?P(m[k]).midi:""}" style="animation-delay:${.15+k*.18}s"><rect x="${x+2}" y="${150-h}" width="36" height="${h}" rx="6" fill="#e9dcff" stroke="#7b3fe4" stroke-width="1.5"/><text x="${x+20}" y="${144}" text-anchor="middle" font-size="11.5" font-weight="800" fill="#3a1d6e">${esc(t)}</text></g>`);
    if(k>0) o.push(`<text class="st" style="animation-delay:${.15+k*.18}s" x="${x}" y="${150-h-8}" text-anchor="middle" font-size="13" font-weight="900" fill="${st[k-1]==="S"?"#d02a2a":"#2a8a44"}">${st[k-1]}</text>`); });
  return `<svg viewBox="0 0 ${n.length*40} 160" style="max-height:180px">${o.join("")}</svg>`; }

// ── DRUM: măsuri + ordinea în care se cântă (repetiții, volte, D.C.) ──
function flow(sp){ const b=sp.boxes||[], BW=52, o=[];
  b.forEach((t,k)=>{ const tg=(sp.tags||{})[k]; o.push(`<g class="fb" data-b="${k}"><rect x="${k*BW+3}" y="34" width="${BW-6}" height="42" rx="9" fill="#efe6ff" stroke="#c9b2f5" stroke-width="1.5"/><text x="${k*BW+BW/2}" y="60" text-anchor="middle" font-size="15" font-weight="900" fill="#3a1d6e">${esc(t)}</text>${tg?`<text x="${k*BW+BW/2}" y="24" text-anchor="middle" font-size="11.5" font-weight="900" fill="#d02a2a">${esc(tg)}</text>`:""}</g>`); });
  return `<svg class="flow" data-path="${(sp.path||[]).join(",")}" viewBox="0 0 ${b.length*BW} 96" style="max-height:120px">${o.join("")}<text class="fl-s" x="${b.length*BW/2}" y="94" text-anchor="middle" font-size="11.5" font-weight="700" fill="#6a4fa8">ordinea: ${(sp.path||[]).map(i=>b[i]).join(" → ")}</text></svg>`; }

// ── MÂNA (numerele degetelor) ──
function hand(){ const F=[[38,98,1,-38],[70,48,2,-8],[100,40,3,0],[130,46,4,6],[156,64,5,14]];
  return `<svg viewBox="0 0 200 210" style="max-height:200px"><path d="M50 120 Q40 200 100 205 Q165 205 165 120 Z" fill="#f5c9a5" stroke="#c98b60" stroke-width="2"/>
  ${F.map(([x,y,n,r],k)=>`<g class="ap" style="animation-delay:${.2+k*.25}s"><rect x="${x-12}" y="${y}" width="24" height="${n===1?52:80}" rx="12" fill="#f5c9a5" stroke="#c98b60" stroke-width="2" transform="rotate(${r} ${x} ${y+60})"/><circle cx="${x+(n===1?-14:0)}" cy="${y-4}" r="13" fill="#7b3fe4"/><text x="${x+(n===1?-14:0)}" y="${y+1}" text-anchor="middle" font-size="14" font-weight="900" fill="#fff">${n}</text></g>`).join("")}</svg>`; }
// ── PEDALELE ──
function pedals(sp){ const on=sp.on||"r", P3=[["l","stânga"],["m","mijloc"],["r","dreapta"]];
  return `<svg viewBox="0 0 220 120" style="max-height:140px"><rect x="10" y="10" width="200" height="34" rx="6" fill="#222"/>${P3.map(([k,t],i)=>`<g><rect class="${on===k?"glow":""}" x="${30+i*62}" y="40" width="36" height="${on===k?58:52}" rx="9" fill="${on===k?"#ffc90e":"#c9a227"}" stroke="#7a5c00"/><text x="${48+i*62}" y="114" text-anchor="middle" font-size="11" font-weight="800" fill="#555">${t}</text></g>`).join("")}</svg>`; }
// ── CERCUL CVINTELOR ──
function circle(sp){ const K=[["Do","0"],["Sol","1♯"],["Re","2♯"],["La","3♯"],["Mi","4♯"],["Si","5♯"],["Fa♯","6♯"],["Re♭","5♭"],["La♭","4♭"],["Mi♭","3♭"],["Si♭","2♭"],["Fa","1♭"]];
  return `<svg class="cf" viewBox="-110 -110 220 220" style="max-height:230px"><circle r="86" fill="none" stroke="#c9b2f5" stroke-width="2"/>${K.map(([n,a],i)=>{ const an=(i*30-90)*Math.PI/180, x=Math.cos(an)*86, y=Math.sin(an)*86;
    const on=sp.hl==="sharps"?(i>=1&&i<=6):sp.hl==="flats"?(i>=7||i===0&&false):false; const isC=i===0;
    return `<g class="k ap" style="animation-delay:${.1+i*.12}s"><circle cx="${x}" cy="${y}" r="17" fill="${isC?"#ffc90e":on?"#c58cff":"#efe6ff"}" stroke="#7b3fe4"/><text x="${x}" y="${y+1}" text-anchor="middle" font-size="11" font-weight="900" fill="#3a1d6e">${n}</text><text x="${x}" y="${y+11}" text-anchor="middle" font-size="8.5" font-weight="800" fill="#5a24b8">${a}</text></g>`; }).join("")}
  <text y="-4" text-anchor="middle" font-size="12" font-weight="800" fill="#6a4fa8">${sp.hl==="sharps"?"↻ +1 ♯":sp.hl==="flats"?"↺ +1 ♭":"cercul"}</text><text y="12" text-anchor="middle" font-size="10" fill="#888">${sp.hl==="order"?"♯: Fa Do Sol Re La Mi Si":"cvintelor"}</text></svg>`; }
function sym(sp){ return `<div style="text-align:center;padding:6px 0"><div class="ap" style="font-size:${sp.size||86}px;line-height:1.05;font-family:'Bravura','Noto Music','Segoe UI Symbol','Apple Symbols',Georgia,serif;color:#3a1d6e">${sp.s}</div></div>`; }

function one(sp){ switch(sp.k){ case "staff": return staff(sp); case "kb": return kb(sp); case "fret": return fret(sp); case "tab": return tab(sp);
  case "rhythm": return rhythm(sp); case "metro": return metro(sp); case "dyn": return dyn(sp); case "stairs": return stairs(sp); case "flow": return flow(sp);
  case "hand": return hand(sp); case "pedals": return pedals(sp); case "circle": return circle(sp); case "sym": return sym(sp); default: return ""; } }
function html(sp){ if(!sp) return ""; css();
  if(sp.k==="cmp") return `<div class="vz"><div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">${[["a","la"],["b","lb"]].map(([k,l])=>`<div>${one(sp[k])}<div class="cap">${esc(sp[l]||"")}</div></div>`).join("")}</div>${sp.cap?`<div class="cap">${esc(sp.cap)}</div>`:""}</div>`;
  const dark=sp.k==="fret";
  return `<div class="vz${dark?" dk":""}">${one(sp)}${sp.cap?`<div class="cap">${esc(sp.cap)}</div>`:""}</div>`; }

// claviatura și chitara se pot atinge: cântă nota
function bind(el,play){ el.querySelectorAll('.kbw,.kbb').forEach(k=>k.addEventListener('pointerdown',e=>{ e.preventDefault(); const m=+k.dataset.m; play({m}); flash(el,[m],.35); }));
  el.querySelectorAll('.fr .dot,.fr .hitz').forEach(d=>d.addEventListener('pointerdown',e=>{ e.preventDefault(); const s=+d.dataset.s, f=+d.dataset.f, m=OPEN[s-1]+f; play({m,g:1}); flash(el,[m],.5);
    const st=el.querySelectorAll('.fr .str')[s-1]; if(st){ st.classList.add('hit'); setTimeout(()=>st.classList.remove('hit'),450); } }));
  // drumul (repetiții): o bulină trece prin măsuri, în ordinea în care se cântă
  el.querySelectorAll('svg.flow').forEach(sv=>{ const path=(sv.dataset.path||"").split(",").filter(x=>x!=="").map(Number); if(!path.length) return; let i=0;
    const tick=()=>{ if(!document.body.contains(sv)) return; sv.querySelectorAll('.fb').forEach(b=>b.classList.remove('cur')); const b=sv.querySelector(`.fb[data-b="${path[i%path.length]}"]`); if(b) b.classList.add('cur'); i++; setTimeout(tick,i%path.length===0?1400:650); }; tick(); }); }
function flash(el,ms,dur){ ms.forEach(m=>el.querySelectorAll(`[data-m="${m}"]`).forEach(x=>{ x.classList.add('hit'); setTimeout(()=>x.classList.remove('hit'),dur*1000); })); }
// sincronizare cu sunetul: evs=[{t,d,ms:[midi], v:voce}] (secunde)
let timers=[];
function sync(el,evs,bpm,total){ timers.forEach(clearTimeout); timers=[]; if(!el) return;
  const byI={}; el.querySelectorAll('.seq[data-i]').forEach(s=>{ const i=+s.dataset.i; if(i>=0)(byI[i]=byI[i]||[]).push(s); });
  const seqs=Object.keys(byI).sort((a,b)=>a-b).map(k=>byI[k]); const all=[].concat(...seqs); const v0=evs.filter(e=>e.v===0);
  // grupăm notele simultane din vocea 1 (acorduri)
  const groups=[]; v0.forEach(e=>{ const g=groups.find(g=>Math.abs(g.t-e.t)<.06); if(g) g.ms.push(e.m); else groups.push({t:e.t,d:e.d,ms:[e.m]}); });
  groups.forEach((g,k)=>{ timers.push(setTimeout(()=>{ all.forEach(s=>s.classList.remove('hit')); (seqs[k]||[]).forEach(s=>s.classList.add('hit')); },g.t*1000)); });
  evs.forEach(e=>timers.push(setTimeout(()=>flash(el,[e.m],Math.max(.18,Math.min(e.d,1.2))),e.t*1000)));
  timers.push(setTimeout(()=>all.forEach(s=>s.classList.remove('hit')),(total+.3)*1000));
  el.querySelectorAll('.rh .ph').forEach(ph=>{ ph.classList.remove('run'); void ph.offsetWidth; ph.style.animationDuration=total+"s"; ph.classList.add('run'); });
  const met=el.querySelector('.met'); if(met&&bpm){ met.style.animationDuration=(60/bpm)+"s"; const t=el.querySelector('.bpm'); if(t) t.textContent=bpm+" BPM"; } }
window.PSVZ={html,bind,sync,css};
})();
