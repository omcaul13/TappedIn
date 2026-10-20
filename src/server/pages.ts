// Self-contained pages served on localhost: control panel, data tile, picker, halftime, idle.
// No build step: HTML + inline JS polling /api/state and POSTing actions.

const BASE_CSS = `
  :root{--bg:#0b0f14;--panel:#121923;--panel2:#16202d;--line:#223042;--text:#e6edf3;--dim:#8b9bb0;--live:#22c55e;--brk:#f59e0b;--half:#3b82f6;--fin:#9ca3af;--rz:#ef4444;--data:#a78bfa;--err:#dc2626}
  *{box-sizing:border-box}html,body{margin:0;height:100%;background:var(--bg);color:var(--text);font-family:system-ui,-apple-system,"Segoe UI",sans-serif}
  .chip{display:inline-block;padding:2px 7px;border-radius:999px;font-weight:700;font-size:11px;letter-spacing:.04em;color:#000}
  button,select{font:inherit;color:inherit}
`;

// Shared browser-side helpers (string-inlined into each page).
const CLIENT_JS = `
  const esc=(s)=>String(s??'').replace(/[&<>"]/g,(c)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'})[c]);
  const TONE={LIVE:'var(--live)',BREAK:'var(--brk)',HALFTIME:'var(--half)',FINAL:'var(--fin)',PRE:'var(--fin)',UNKNOWN:'var(--fin)'};
  const stateLabel=(s)=>s==='BREAK'?'BREAK?':s;
  async function post(path,body){try{const r=await fetch(path,{method:'POST',headers:{'content-type':'application/json','x-tappedin':'1'},body:JSON.stringify(body)});return await r.json();}catch(e){return{ok:false,message:String(e)}}}
  const mmss=(sec)=>Math.floor(sec/60)+':'+String(sec%60).padStart(2,'0');
  function pickerHTML(p,left){
    const row=(g)=>'<button class="pk" data-pick="'+esc(g.id)+'"><b>'+esc(g.label)+'</b><span>'+esc(g.detail)+'</span></button>';
    return '<div class="pkhead"><b>'+esc(p.title)+'</b><span class="cd">'+(left!=null?'best live game in '+mmss(left):'')+'</span></div>'+
      '<div class="pklist">'+(p.live.length?'<h4>Live now</h4>'+p.live.map(row).join(''):'')+(p.later.length?'<h4>Later today</h4>'+p.later.map(row).join(''):'')+
      (!p.live.length&&!p.later.length?'<h4>No other watchable games today</h4>':'')+'</div>'+
      '<div class="pkfoot"><button class="ghost" data-keep="1">Not now (stay on this channel)</button></div>';
  }
  function wirePicker(el,screen){el.addEventListener('click',async(e)=>{const b=e.target.closest('button');if(!b)return;
    if(b.dataset.pick)await post('/api/action',{type:'setHome',screen,gameId:b.dataset.pick});
    else if(b.dataset.keep)await post('/api/action',{type:'cancelAutoPick',screen});});}
`;

const PICKER_CSS = `
  .pkhead{display:flex;justify-content:space-between;align-items:baseline;gap:10px;padding:10px 14px 6px}.pkhead b{font-size:16px}
  .cd{color:#fbbf24;font-weight:700;white-space:nowrap}.pklist{overflow:auto;padding:0 10px 6px;flex:1}
  .pklist h4{margin:8px 4px 4px;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--dim)}
  .pk{display:flex;justify-content:space-between;gap:10px;width:100%;text-align:left;background:var(--panel);border:1px solid var(--line);border-radius:8px;padding:7px 10px;margin:3px 0;cursor:pointer}
  .pk:hover{border-color:#60a5fa;background:var(--panel2)}.pk span{color:var(--dim);white-space:nowrap}
  .pkfoot{display:flex;justify-content:flex-end;padding:6px 12px 10px}
  .ghost{background:transparent;border:1px solid #475569;color:#cbd5e1;border-radius:8px;padding:6px 12px;cursor:pointer}
`;

export function tilePage(screen: number): string {
  return `<!doctype html><html><head><meta charset="utf-8"><title>TappedIn S${screen}</title><style>${BASE_CSS}${PICKER_CSS}
  body{display:flex;flex-direction:column;padding:14px 18px;gap:10px}
  .top{display:flex;justify-content:space-between;align-items:center;font-size:13px;color:var(--dim)}
  .teams{flex:1;display:grid;grid-template-rows:1fr 1fr;gap:6px}
  .team{display:flex;align-items:center;gap:14px;background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:0 18px}
  .abbr{font-weight:800;font-size:clamp(22px,6vh,40px);min-width:3.5em}.name{color:var(--dim);flex:1;font-size:clamp(13px,3vh,18px)}
  .score{font-weight:800;font-size:clamp(34px,11vh,64px);font-variant-numeric:tabular-nums}
  .pos::after{content:"\\25CF";color:var(--brk);font-size:.7em;margin-left:8px}
  .mid{display:flex;justify-content:space-between;align-items:baseline;font-size:clamp(14px,3.6vh,20px);font-weight:600}
  .field{position:relative;height:18px;border-radius:9px;background:linear-gradient(90deg,#14532d,#166534 50%,#14532d);overflow:hidden;border:1px solid var(--line)}
  .rz{position:absolute;top:0;bottom:0;width:20%;background:rgba(239,68,68,.35)}
  .ball{position:absolute;top:2px;width:12px;height:12px;border-radius:50%;background:#fbbf24;transform:translateX(-6px);box-shadow:0 0 6px #fbbf24}
  .last{color:var(--dim);font-size:clamp(12px,2.8vh,15px);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .empty{flex:1;display:grid;place-items:center;color:var(--dim);font-size:20px;text-align:center}
  .redzone{animation:pulse 1.4s infinite}@keyframes pulse{50%{box-shadow:0 0 0 4px rgba(239,68,68,.45)}}
  #pop{position:fixed;inset:30px 16px 12px;background:rgba(11,15,20,.97);border:1px solid #334155;border-radius:12px;display:none;flex-direction:column;box-shadow:0 12px 40px rgba(0,0,0,.7)}
  </style></head><body><div id="root" class="empty">TappedIn screen ${screen}</div><div id="pop"></div><script>${CLIENT_JS}
  const N=${screen};wirePicker(document.getElementById('pop'),N);let popKey='';
  async function tick(){try{const st=await (await fetch('/api/state')).json();const sc=st.screens.find((s)=>s.id===N);
    const pop=document.getElementById('pop');
    if(sc&&sc.picker&&sc.gameOverAutoPickAt){const left=Math.max(0,Math.round((sc.gameOverAutoPickAt-st.now)/1000));const k=JSON.stringify(sc.picker)+left;if(k!==popKey){popKey=k;pop.innerHTML=pickerHTML(sc.picker,left);}pop.style.display='flex';}
    else{pop.style.display='none';popKey='';}
    const g=sc&&st.games.find((x)=>x.id===sc.showingGameId);const root=document.getElementById('root');
    if(!g){root.className='empty';root.style.display='';root.innerHTML='Screen '+N+'<br><small>'+esc(sc?sc.mode:'')+'</small>';return;}
    const a=g.assessment||{state:'UNKNOWN',score:0};const s=g.situation;const homeG=st.games.find((x)=>x.id===sc.homeGameId);
    const why=sc.render==='data'?(sc.dataReason||'live data'):'';
    const fill=sc.mode==='GAME_OVER'?'game over':sc.mode==='LOCKED'?'locked':sc.showingGameId!==sc.homeGameId&&homeG?'filling in for '+homeG.shortName:'';
    let ball='';if(s&&s.yardsToEndzone!=null&&s.possessionTeamId){const homeAttacksRight=s.possessionTeamId===g.home.id;const x=homeAttacksRight?100-s.yardsToEndzone:s.yardsToEndzone;ball='<div class="ball" style="left:'+x+'%"></div>';}
    const rzSide=s&&s.possessionTeamId===g.home.id?'right:0':'left:0';
    const fb=g.family==='football';const L=g.live;let sit='';
    if(!fb){const parts=[];if(g.hot)parts.push(g.hot.toUpperCase());if(L&&L.family==='baseball'&&(L.half==='top'||L.half==='bottom')){const b=[L.onFirst?'1st':'',L.onSecond?'2nd':'',L.onThird?'3rd':''].filter(Boolean);parts.push((b.length?'on '+b.join(', '):'bases empty')+(L.outs!=null?' \\u00b7 '+L.outs+' out':'')+(L.balls!=null&&L.strikes!=null?' \\u00b7 '+L.balls+'-'+L.strikes:''));}sit=parts.join(' \\u00b7 ');}
    root.className='';root.style.display='contents';
    root.innerHTML='<div class="top"><span><span class="chip" style="background:'+(TONE[a.state]||'var(--fin)')+'">'+stateLabel(a.state)+'</span> &nbsp;'+esc(g.channel?g.channel.name+' '+g.channel.number:g.networks.join('/'))+(sc.audio?' &#128266;':'')+'</span><span>'+esc([fill,why,st.mode!=='live'?st.mode.toUpperCase():''].filter(Boolean).join(' \\u00b7 '))+'</span></div>'+
      '<div class="teams'+((s&&s.isRedZone)||(!fb&&g.hot)?' redzone':'')+'">'+[g.away,g.home].map((t)=>'<div class="team"><span class="abbr'+(s&&s.possessionTeamId===t.id?' pos':'')+'">'+esc(t.abbr)+'</span><span class="name">'+esc(t.name)+'</span><span class="score">'+t.score+'</span></div>').join('')+'</div>'+
      '<div class="mid"><span>'+esc((fb?'':g.sportShort+' \\u00b7 ')+g.detail)+'</span><span style="color:'+((s&&s.isRedZone)||(!fb&&g.hot)?'var(--rz)':'inherit')+'">'+esc(fb?(s&&s.downDistanceText?s.downDistanceText+(s.isRedZone?' \\u00b7 RED ZONE':''):''):sit)+'</span></div>'+
      (fb?'<div class="field">'+(s?'<div class="rz" style="'+rzSide+'"></div>':'')+ball+'</div>':'')+
      '<div class="last">'+esc(s&&s.lastPlay?s.lastPlay:'')+'</div>';
  }catch(e){}}
  tick();setInterval(tick,1000);
  </script></body></html>`;
}

/** Fallback when the game-over pop-up can't be drawn over the Xfinity player. */
export function pickerPage(screen: number): string {
  return `<!doctype html><html><head><meta charset="utf-8"><title>TappedIn S${screen}: pick a game</title><style>${BASE_CSS}${PICKER_CSS}
  body{display:flex;flex-direction:column}#p{flex:1;display:flex;flex-direction:column}</style></head><body><div id="p"></div><script>${CLIENT_JS}
  const N=${screen};const el=document.getElementById('p');wirePicker(el,N);let key='';
  async function tick(){try{const st=await (await fetch('/api/state')).json();const sc=st.screens.find((s)=>s.id===N);if(!sc||!sc.picker)return;
    const left=sc.gameOverAutoPickAt?Math.max(0,Math.round((sc.gameOverAutoPickAt-st.now)/1000)):null;const k=JSON.stringify(sc.picker)+left;if(k!==key){key=k;el.innerHTML=pickerHTML(sc.picker,left);}}catch(e){}}
  tick();setInterval(tick,1000);</script></body></html>`;
}

/**
 * Halftime highlights reel: ESPN MP4 clips and official YouTube packages back to back, a scores board
 * every few clips (or on its own when there's nothing to play). Sound follows the screen's audio focus.
 */
export function halftimePage(screen: number, cardSeconds = 8): string {
  return `<!doctype html><html><head><meta charset="utf-8"><title>TappedIn halftime S${screen}</title><style>${BASE_CSS}
  body{position:relative;overflow:hidden;background:#000}
  #v,#yt,#card{position:absolute;inset:0;width:100%;height:100%;display:none}#v{object-fit:contain;background:#000}
  #card{background:var(--bg);padding:42px 16px 12px;overflow:hidden}
  .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:7px}
  .g{background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:7px 10px;font-size:13px}
  .g b{font-variant-numeric:tabular-nums}.g small{color:var(--dim);display:block;margin-top:2px}.g.live{border-color:#166534}
  .top{position:absolute;top:0;left:0;right:0;display:flex;justify-content:space-between;gap:10px;padding:8px 12px;font:700 13px system-ui;
    background:linear-gradient(#000c,#0000);z-index:5;pointer-events:none}.top .tag{background:var(--half);color:#fff;border-radius:6px;padding:3px 8px}
  .cap{position:absolute;left:0;right:0;bottom:0;padding:22px 14px 10px;background:linear-gradient(#0000,#000d);z-index:5;pointer-events:none}
  .cap small{display:block;color:#fbbf24;font-weight:700;font-size:12px;letter-spacing:.03em}.cap b{font-size:15px}
  </style></head><body>
  <div class="top"><span><span class="tag" id="ht">HALFTIME</span> <span id="home"></span></span><span id="pos" class="dim"></span></div>
  <video id="v" playsinline preload="auto"></video><div id="yt"></div><div id="card"><div class="grid" id="grid"></div></div>
  <div class="cap"><small id="cg"></small><b id="ct"></b></div>
  <script>${CLIENT_JS}
  const N=${screen},CARD_MS=${Math.round(cardSeconds * 1000)};
  const $=(id)=>document.getElementById(id);const v=$('v');
  let items=[],idx=-1,audio=false,st=null,yt=null,ytReady=false,ytQueue=null,timer=null,lastT=0,lastMove=Date.now();
  const played=new Set(JSON.parse(sessionStorage.getItem('rz-played-'+N)||'[]'));
  const remember=(id)=>{played.add(id);sessionStorage.setItem('rz-played-'+N,JSON.stringify([...played].slice(-300)));};
  async function loadReel(){try{const r=await (await fetch('/api/reel/'+N)).json();const fresh=r.items.filter((i)=>i.kind==='card'||!played.has(i.id));
    items=fresh.some((i)=>i.kind!=='card')?fresh:r.items;}catch(e){items=[{kind:'card',id:'card-x',title:'Scores'}];}}
  function hideAll(){clearTimeout(timer);v.pause();v.removeAttribute('src');v.load();v.style.display='none';$('yt').style.display='none';$('card').style.display='none';if(yt&&ytReady)try{yt.stopVideo();}catch(e){}}
  async function next(){idx++;if(idx>=items.length){await loadReel();idx=0;}play(items[idx]);}
  function caption(game,title){$('cg').textContent=game||'';$('ct').textContent=title||'';const n=items.filter((i)=>i.kind!=='card').length;
    const k=items.slice(0,idx+1).filter((i)=>i.kind!=='card').length;$('pos').textContent=n?'highlight '+Math.max(1,k)+' of '+n:'';}
  function play(it){hideAll();if(!it){return showCard();}
    if(it.kind==='card'){caption('',it.title);return showCard();}
    remember(it.id);caption(it.game,it.title);lastMove=Date.now();lastT=0;
    if(it.kind==='espn'){v.style.display='block';v.poster=it.poster||'';v.src=it.src;v.muted=!audio;v.play().catch(()=>{v.muted=true;v.play().catch(next);});return;}
    if(it.kind==='youtube'){$('yt').style.display='block';if(ytReady){yt.loadVideoById(it.videoId);applySound();}else{ytQueue=it.videoId;loadYT();}}}
  function showCard(){$('card').style.display='block';paintScores();timer=setTimeout(next,CARD_MS);}
  function paintScores(){if(!st)return;const order={LIVE:0,HALFTIME:1,FINAL:2};const gs=st.games.filter((g)=>g.phase in order).sort((a,b)=>order[a.phase]-order[b.phase]||Math.abs(a.home.score-a.away.score)-Math.abs(b.home.score-b.away.score));
    $('grid').innerHTML=gs.map((g)=>'<div class="g'+(g.phase==='LIVE'?' live':'')+'"><b>'+esc(g.away.abbr)+' '+g.away.score+' - '+g.home.score+' '+esc(g.home.abbr)+'</b><small>'+esc(g.detail)+' \\u00b7 '+esc(g.channel?g.channel.name:g.networks.join('/'))+'</small></div>').join('');}
  function applySound(){v.muted=!audio;if(yt&&ytReady)try{audio?yt.unMute():yt.mute();}catch(e){}}
  function loadYT(){if(window.YT||document.getElementById('ytapi'))return;const s=document.createElement('script');s.id='ytapi';s.src='https://www.youtube.com/iframe_api';document.head.appendChild(s);}
  window.onYouTubeIframeAPIReady=()=>{yt=new YT.Player('yt',{width:'100%',height:'100%',videoId:ytQueue||'',playerVars:{autoplay:1,controls:0,rel:0,playsinline:1,origin:location.origin},
    events:{onReady:()=>{ytReady=true;applySound();if(ytQueue)yt.playVideo();},onStateChange:(e)=>{if(e.data===1)lastMove=Date.now();if(e.data===0)next();},onError:()=>next()}});};
  v.addEventListener('ended',next);v.addEventListener('error',()=>next());
  v.addEventListener('timeupdate',()=>{if(v.currentTime!==lastT){lastT=v.currentTime;lastMove=Date.now();}});
  // A clip that stops making progress for 15 s is skipped.
  setInterval(()=>{const it=items[idx];if(it&&it.kind==='youtube'&&ytReady)try{if(yt.getPlayerState()===1)lastMove=Date.now();}catch(e){}
    if(it&&it.kind!=='card'&&Date.now()-lastMove>15000)next();},3000);
  async function poll(){try{st=await (await fetch('/api/state')).json();const sc=st.screens.find((s)=>s.id===N);const home=st.games.find((g)=>g.id===sc?.homeGameId);
    $('ht').textContent=home&&home.family==='hockey'?'INTERMISSION':'HALFTIME';
    $('home').textContent=home?home.away.abbr+' '+home.away.score+' - '+home.home.score+' '+home.home.abbr:'';if(sc&&sc.audio!==audio){audio=sc.audio;applySound();}}catch(e){}}
  poll().then(async()=>{await loadReel();next();});setInterval(poll,3000);
  </script></body></html>`;
}

export function idlePage(screen: number, note: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><title>TappedIn S${screen}</title><style>${BASE_CSS}
  body{display:grid;place-items:center;text-align:center}div{color:var(--dim)}b{display:block;font-size:28px;color:var(--text);margin-bottom:6px}
  </style></head><body><div><b>Screen ${screen}</b>${note.replace(/[<>&]/g, '')}</div></body></html>`;
}

export function panelPage(): string {
  return `<!doctype html><html><head><meta charset="utf-8"><title>TappedIn control panel</title><style>${BASE_CSS}
  body{display:flex;flex-direction:column;font-size:13px;overflow:hidden}
  header{display:flex;align-items:center;gap:14px;padding:8px 12px;border-bottom:1px solid var(--line);background:var(--panel)}
  header h1{font-size:15px;margin:0}header .sp{flex:1}.dim{color:var(--dim)}
  .seg{display:inline-flex;border:1px solid var(--line);border-radius:8px;overflow:hidden}.seg button{background:transparent;border:0;padding:4px 10px;cursor:pointer;color:var(--dim)}
  .seg button.on{background:#1e3a5f;color:#fff}
  main{flex:1;display:grid;grid-template-columns:minmax(0,1.3fr) minmax(0,1fr);gap:10px;padding:10px;min-height:0}
  .left{display:flex;flex-direction:column;gap:10px;min-height:0;min-width:0}
  .cards{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:8px}
  .card{background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:8px 10px;display:flex;flex-direction:column;gap:4px;min-width:0}
  .card.err{border-color:var(--err)}.card.rz{box-shadow:inset 0 0 0 1px var(--rz)}
  .ch{display:flex;align-items:center;gap:6px}.ch b{font-size:14px}.ch .sp{flex:1}
  .score{font-weight:800;font-size:16px;font-variant-numeric:tabular-nums;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .small{font-size:12px;color:var(--dim);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .why{font-size:11.5px;color:#cbd5e1;max-height:2.7em;overflow:hidden}
  .errbox{font-size:12px;color:#fecaca}
  .btns{display:flex;flex-wrap:wrap;gap:4px;margin-top:2px}
  .btns button,.btns select{background:var(--panel2);border:1px solid var(--line);border-radius:6px;padding:3px 7px;cursor:pointer;font-size:12px}
  .btns button:hover{border-color:#60a5fa}.btns .on{background:#1e3a5f;border-color:#3b82f6}
  .btns select{max-width:120px}
  .feed{flex:1;min-height:90px;overflow:auto;background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:6px 8px;font:12px/1.35 ui-monospace,Consolas,monospace}
  .feed div{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.feed .switch{color:#e6edf3}.feed .note,.feed .game{color:var(--dim)}.feed .info{color:#93c5fd}.feed .audio{color:#c4b5fd}.feed .label{color:#fde68a}
  .slate{display:flex;flex-direction:column;min-height:0;background:var(--panel);border:1px solid var(--line);border-radius:10px}
  .slate .tabs{display:flex;gap:6px;padding:8px;border-bottom:1px solid var(--line)}
  .rows{overflow:auto;padding:4px 8px}
  .row{display:grid;grid-template-columns:62px 1fr auto;gap:6px;align-items:center;padding:5px 2px;border-bottom:1px solid #172231}
  .row.na{opacity:.45}.row .t b{font-variant-numeric:tabular-nums}.row .t small{display:block;color:var(--dim)}
  .set button{background:var(--panel2);border:1px solid var(--line);border-radius:5px;width:22px;height:22px;padding:0;cursor:pointer;font-size:11px;margin-left:2px}
  .set button.home{background:#14532d;border-color:var(--live)}
  .keys{font-size:11px}
  </style></head><body>
  <header><h1>TappedIn</h1><span id="mode" class="dim"></span><span class="sp"></span>
    <span class="dim">Sound</span><span class="seg" id="audio"><button data-am="manual">Manual</button><button data-am="auto">Auto</button></span>
    <span id="meta" class="dim"></span></header>
  <main><div class="left"><div class="cards" id="cards"></div><div class="feed" id="feed"></div>
    <div class="dim keys">Alt+P hide/show panel &middot; Alt+1-4 sound &middot; Alt+A audio mode &middot; in a tile: Alt+L lock, Alt+H home, Alt+N skip, Alt+B "break", Alt+V "live"</div></div>
    <div class="slate"><div class="tabs seg" id="tabs"><button data-tab="now" class="on">Live &amp; upcoming</button><button data-tab="final">Final</button><button data-tab="all">All</button></div><div class="rows" id="rows"></div></div></main>
  <script>${CLIENT_JS}
  let st=null;let tab='now';
  const homeOf=(g)=>st.screens.filter((s)=>s.homeGameId===g.id).map((s)=>s.id);
  function gameLine(g){return g?esc(g.away.abbr)+' '+g.away.score+' - '+g.home.score+' '+esc(g.home.abbr):'-';}
  function card(sc){
    const G=(id)=>st.games.find((g)=>g.id===id);const home=G(sc.homeGameId);const on=G(sc.showingGameId);
    const a=home&&home.assessment;const live=st.games.filter((g)=>g.channel&&g.phase==='LIVE'&&g.id!==sc.showingGameId);
    const shown=sc.showingKind==='halftime'?'highlights':on&&on.id!==sc.homeGameId?'showing '+on.shortName+(on.situation&&on.situation.isRedZone?' (red zone)':''):'';
    const health=sc.render==='video'?(sc.health?sc.health.state:'tuning'):sc.render==='data'?'data tile: '+(sc.dataReason||''):sc.render;
    return '<div class="card'+(sc.error?' err':'')+(on&&on.situation&&on.situation.isRedZone?' rz':'')+'" data-s="'+sc.id+'">'+
      '<div class="ch"><b>S'+sc.id+'</b><span class="chip" style="background:'+(a?TONE[a.state]:'var(--fin)')+'">'+esc(sc.mode)+'</span>'+(sc.audio?'&#128266;':'')+'<span class="sp"></span><span class="small">'+esc(health)+'</span></div>'+
      '<div class="score">'+(home?gameLine(home):'No home game: use the slate &rarr;')+'</div>'+
      (home?'<div class="small">'+esc(home.detail)+' &middot; '+esc(home.channel?home.channel.name+' '+home.channel.number:home.networks.join('/'))+(a?' &middot; '+stateLabel(a.state)+' '+a.score.toFixed(2):'')+'</div>':'')+
      (a&&a.reasons.length?'<div class="why">'+esc(a.reasons.slice(0,2).join(' | '))+'</div>':'')+
      (shown?'<div class="small" style="color:#fbbf24">'+esc(shown)+'</div>':'')+
      (sc.error?'<div class="errbox"><b>'+esc(sc.error.title)+'</b> '+esc(sc.error.hint)+'</div>':'')+
      (sc.mode==='GAME_OVER'&&sc.gameOverAutoPickAt?'<div class="small" style="color:#fbbf24">game over &middot; next game in '+mmss(Math.max(0,Math.round((sc.gameOverAutoPickAt-st.now)/1000)))+'</div>':'')+
      '<div class="btns">'+
        (sc.mode==='LOCKED'?'<button data-a="unlock" class="on">Unlock</button>':'<button data-a="lock">Lock</button>')+
        '<button data-a="goHome">Home</button><button data-a="skip" title="Best other game now">Skip</button>'+
        '<button data-a="sound" class="'+(sc.audio?'on':'')+'">Sound</button>'+
        '<select data-a="force"><option value="">Force game&hellip;</option>'+live.map((g)=>'<option value="'+esc(g.id)+'">'+esc(g.shortName)+' ('+esc(g.detail)+')</option>').join('')+'</select>'+
        '<button data-l="break" title="What this screen shows is a commercial (Alt+B)">Break!</button><button data-l="live" title="What this screen shows is live action (Alt+V)">Live!</button>'+
      '</div></div>';
  }
  function slate(){
    const order={LIVE:0,HALFTIME:0,DELAYED:0,PRE:1,FINAL:2,POSTPONED:3,CANCELED:3,UNKNOWN:3};
    let gs=st.games.slice();
    if(tab==='now')gs=gs.filter((g)=>order[g.phase]<2);else if(tab==='final')gs=gs.filter((g)=>order[g.phase]>=2);
    gs.sort((a,b)=>(order[a.phase]-order[b.phase])||(!!b.channel-!!a.channel)||(order[a.phase]===0?Math.abs(a.home.score-a.away.score)-Math.abs(b.home.score-b.away.score):String(a.startTime).localeCompare(String(b.startTime))));
    return gs.map((g)=>{const homes=homeOf(g);const s=g.situation;const a=g.assessment;
      const when=g.phase==='PRE'&&g.startTime?new Date(g.startTime).toLocaleTimeString([], {hour:'numeric',minute:'2-digit'}):g.detail;
      return '<div class="row'+(g.channel?'':' na')+'"><span><span class="chip" style="background:'+(a?TONE[a.state]:'var(--fin)')+'">'+(g.phase==='PRE'?'LATER':a?stateLabel(a.state):g.phase)+'</span></span>'+
        '<span class="t"><b>'+(g.phase==='PRE'?esc(g.shortName):gameLine(g))+'</b>'+(s&&s.isRedZone?' <span style="color:var(--rz);font-weight:700">RZ</span>':'')+
        '<small>'+esc(when)+' &middot; '+esc(g.channel?g.channel.name+' '+g.channel.number:(g.unavailable||g.networks.join('/')))+'</small></span>'+
        '<span class="set">'+(g.channel&&g.phase!=='FINAL'?[1,2,3,4].map((n)=>'<button data-home="'+n+'" data-g="'+esc(g.id)+'" class="'+(homes.includes(n)?'home':'')+'" title="Make this screen '+n+'\\'s home game">'+n+'</button>').join(''):'')+'</span></div>';}).join('');
  }
  function render(){
    if(document.activeElement&&document.activeElement.tagName==='SELECT')return;
    document.getElementById('mode').textContent=st.mode.toUpperCase()+' \\u00b7 '+new Date(st.now).toLocaleTimeString();
    document.getElementById('meta').textContent='streams '+st.streamLimit+' \\u00b7 labels '+st.labels+' \\u00b7 dwell '+st.settings.dwellSeconds+'s';
    document.querySelectorAll('#audio button').forEach((b)=>b.classList.toggle('on',b.dataset.am===st.audio.mode));
    document.getElementById('cards').innerHTML=st.screens.map(card).join('');
    document.getElementById('rows').innerHTML=slate();
    document.getElementById('feed').innerHTML=st.feed.slice().reverse().map((f)=>'<div class="'+f.kind+'">'+new Date(f.at).toLocaleTimeString([], {hour12:false})+' '+(f.screen?'[S'+f.screen+'] ':'')+esc(f.text)+'</div>').join('');
  }
  async function refresh(){try{st=await (await fetch('/api/state')).json();render();}catch(e){}}
  document.body.addEventListener('click',async(e)=>{const b=e.target.closest('button');if(!b)return;const c=b.closest('.card');const screen=c?Number(c.dataset.s):null;
    if(b.dataset.am)await post('/api/audio',{mode:b.dataset.am});
    else if(b.dataset.tab){tab=b.dataset.tab;document.querySelectorAll('#tabs button').forEach((x)=>x.classList.toggle('on',x===b));}
    else if(b.dataset.home)await post('/api/action',{type:'setHome',screen:Number(b.dataset.home),gameId:b.dataset.g});
    else if(b.dataset.l)await post('/api/label',{screen,label:b.dataset.l});
    else if(b.dataset.a==='sound')await post('/api/audio',{focus:screen});
    else if(b.dataset.a)await post('/api/action',{type:b.dataset.a,screen});
    refresh();});
  document.body.addEventListener('change',async(e)=>{const s=e.target;if(s.dataset.a!=='force'||!s.value)return;const c=s.closest('.card');
    await post('/api/action',{type:'force',screen:Number(c.dataset.s),gameId:s.value});s.blur();refresh();});
  window.addEventListener('keydown',(e)=>{if(!e.altKey||e.ctrlKey)return;const k=(e.code||'').replace(/^(Key|Digit|Numpad)/,'').toLowerCase();
    const map={p:'panel',a:'audioMode','1':'audio1','2':'audio2','3':'audio3','4':'audio4'};if(!map[k])return;e.preventDefault();
    if(typeof window.rzCall==='function')window.rzCall({type:'hotkey',key:map[k]});else post('/api/hotkey',{key:map[k]});setTimeout(refresh,200);},true);
  refresh();setInterval(refresh,1000);
  </script></body></html>`;
}
