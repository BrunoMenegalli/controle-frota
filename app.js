'use strict';
/* BM Sistemas — Controle de Frota — PWA offline. Dados ficam no aparelho (IndexedDB). */
const APP_VERSION = '1.3.0';
const MAX_PX = 1280, JPEG_Q = 0.8;

const DEFAULT_MACHINES = [
  {id:'volvo-l90', nome:'Volvo L90', tipo:'Pá carregadeira', medidor:'h', foto:'img/volvo-l90.jpg',
   descricao:'Pá carregadeira de rodas Volvo L90. Controle por horímetro.',
   credito:{autor:'Alf van Beem', licenca:'CC0 (domínio público)', url:'https://commons.wikimedia.org/wiki/File:Volvo_L90F_p1.JPG', obs:'Foto de uma Volvo L90F.'}},
  {id:'case-w20e', nome:'W20E', tipo:'Pá carregadeira', medidor:'h', foto:'img/case-w20e-bm.jpg',
   descricao:'Pá carregadeira articulada Case W20E. Controle por horímetro.',
   credito:null},
  {id:'saveiro', nome:'Saveiro quadrada', tipo:'Picape • Verde', medidor:'km', foto:'img/saveiro.jpg',
   descricao:'VW Saveiro quadrada (1ª geração), cor verde. Controle por hodômetro.',
   credito:{autor:'order_242 (Flickr)', licenca:'CC BY-SA 2.0', url:'https://commons.wikimedia.org/wiki/File:Volkswagen_Saveiro_1.6_1987_(16108616693).jpg', obs:'Saveiro 1.6 1987. Cor alterada digitalmente de vermelho para verde.'}},
  {id:'hilux-std', nome:'Hilux STD', tipo:'Picape • Branca • Cabine simples', medidor:'km', foto:'img/hilux-std-bm.jpg',
   descricao:'Toyota Hilux STD, branca, cabine simples. Controle por hodômetro.',
   credito:null},
  {id:'f250', nome:'F-250 XL 2010', tipo:'Picape • Branca • 4x4', medidor:'km', foto:'img/f250-xl.jpg',
   descricao:'Ford F-250 XL ano 2010, branca, 4x4. Controle por hodômetro.',
   credito:{autor:'TuRbO_J (Flickr)', licenca:'CC BY 2.0', url:'https://commons.wikimedia.org/wiki/File:Ford_F250_XLT_(14195500167).jpg', obs:'F-250 fabricada no Brasil (exportada p/ Austrália), versão XLT cabine dupla, ano anterior.'}},
  {id:'jcb-426ex', nome:'JCB 426EX', tipo:'Pá carregadeira', medidor:'h', foto:'img/jcb-426.jpg',
   descricao:'Pá carregadeira JCB 426EX. Controle por horímetro.',
   credito:{autor:'Oto Zapletal', licenca:'CC BY 4.0', url:'https://commons.wikimedia.org/wiki/File:JCB_426_ZX_wheel_loader.jpg', obs:'Foto de uma JCB 426 ZX (mesma família 426).'}},
  {id:'axor-2644', nome:'Axor 2644', tipo:'Cavalo mecânico', medidor:'km', foto:'img/axor-2644.jpg',
   descricao:'Caminhão trator (cavalo mecânico) Mercedes-Benz Axor 2644. Controle por hodômetro.',
   credito:{autor:'Grupo Aço Cearense', licenca:'CC BY-SA 4.0', url:'https://commons.wikimedia.org/wiki/File:Frame_080.jpg', obs:'Frota de Axor no Brasil; o 2º caminhão é um Axor 2644.'}},
];

const PECAS = ['Óleo do motor','Filtro de óleo','Filtro de ar','Filtro de combustível','Filtro separador de água','Filtro hidráulico','Óleo hidráulico','Óleo da transmissão','Óleo do diferencial','Lubrificação / graxa','Pneus','Pastilhas / lonas de freio','Correia','Bateria','Líquido de arrefecimento','Mangueira','Pino / bucha'];

/* ---------- IndexedDB ---------- */
let dbp;
function db(){
  if(!dbp) dbp = new Promise((res,rej)=>{
    const r = indexedDB.open('controle-frota',1);
    r.onupgradeneeded = ()=>{
      const d = r.result;
      if(!d.objectStoreNames.contains('maquinas')) d.createObjectStore('maquinas',{keyPath:'id'});
      if(!d.objectStoreNames.contains('revisoes')){ const s=d.createObjectStore('revisoes',{keyPath:'id'}); s.createIndex('maquina','maquinaId'); }
      if(!d.objectStoreNames.contains('meta')) d.createObjectStore('meta',{keyPath:'k'});
    };
    r.onsuccess = ()=>res(r.result); r.onerror = ()=>rej(r.error);
  });
  return dbp;
}
async function tx(store, mode, fn){
  const d = await db();
  return new Promise((res,rej)=>{
    const t = d.transaction(store, mode); const s = t.objectStore(store);
    let out; const r = fn(s); if(r && 'onsuccess' in r) r.onsuccess = ()=>{ out = r.result; };
    t.oncomplete = ()=>res(out); t.onerror = ()=>rej(t.error); t.onabort = ()=>rej(t.error);
  });
}
const getAll = (st)=>tx(st,'readonly',s=>s.getAll());
const getOne = (st,id)=>tx(st,'readonly',s=>s.get(id));
const put = (st,obj)=>tx(st,'readwrite',s=>s.put(obj));
const del = (st,id)=>tx(st,'readwrite',s=>s.delete(id));
const revsOf = (mid)=>tx('revisoes','readonly',s=>s.index('maquina').getAll(mid));

/* ---------- utils ---------- */
const $ = (s,el=document)=>el.querySelector(s);
const esc = (s)=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const uid = ()=> Date.now().toString(36)+Math.random().toString(36).slice(2,8);
const brl = (n)=> (Number(n)||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const num = (n)=> (Number(n)||0).toLocaleString('pt-BR',{maximumFractionDigits:1});
function hoje(){ const d=new Date(); d.setMinutes(d.getMinutes()-d.getTimezoneOffset()); return d.toISOString().slice(0,10); }
function dataBR(iso){ if(!iso) return '—'; const [y,m,d]=iso.split('-'); return `${d}/${m}/${y}`; }
function parseBR(v){ v=String(v||'').trim().replace(/[R$\s]/g,''); if(!v) return null;
  if(v.includes(',')) v=v.replace(/\./g,'').replace(',','.');
  else if(/^\d{1,3}(\.\d{3})+$/.test(v)) v=v.replace(/\./g,'');
  const n=parseFloat(v); return isNaN(n)?null:n; }
const parseValor = (v)=> parseBR(v)||0;
const parseLeitura = (v)=> parseBR(v);
const unidade = (m)=> m.medidor==='km' ? 'km' : 'h';
const medidorNome = (m)=> m.medidor==='km' ? 'Hodômetro' : 'Horímetro';
const urls = new Map();
function blobUrl(b){ if(!b) return ''; if(typeof b==='string') return b; if(!urls.has(b)) urls.set(b, URL.createObjectURL(b)); return urls.get(b); }
function toast(msg,ms=2500){ const t=$('#toast'); t.textContent=msg; t.hidden=false; clearTimeout(toast._t); toast._t=setTimeout(()=>t.hidden=true,ms); }

async function compress(file){
  const url = URL.createObjectURL(file);
  try{
    const img = await new Promise((res,rej)=>{ const i=new Image(); i.onload=()=>res(i); i.onerror=rej; i.src=url; });
    let w=img.naturalWidth, h=img.naturalHeight; const k=Math.min(1, MAX_PX/Math.max(w,h));
    w=Math.round(w*k); h=Math.round(h*k);
    const c=document.createElement('canvas'); c.width=w; c.height=h; c.getContext('2d').drawImage(img,0,0,w,h);
    return await new Promise(res=>c.toBlob(b=>res(b||file),'image/jpeg',JPEG_Q));
  }catch(e){ return file; } finally{ URL.revokeObjectURL(url); }
}
function blobToDataURL(b){ return new Promise((res,rej)=>{ const r=new FileReader(); r.onload=()=>res(r.result); r.onerror=rej; r.readAsDataURL(b); }); }
async function dataURLToBlob(d){ return (await fetch(d)).blob(); }

/* ---------- estado ---------- */
let maquinas = [], atual = null;

async function seed(){
  const m = await getOne('meta','seeded');
  if(m) return;
  let i=0; for(const x of DEFAULT_MACHINES){ await put('maquinas',{...x, padrao:true, ordem:i++}); }
  await put('meta',{k:'seeded',v:true});
}
// Atualiza foto/créditos das máquinas padrão (sem mexer em fotos trocadas pelo usuário)
async function migrar(){
  for(const d of DEFAULT_MACHINES){
    const m=await getOne('maquinas',d.id);
    if(m && m.padrao && typeof m.foto==='string' && m.foto.startsWith('img/') && (m.foto!==d.foto || JSON.stringify(m.credito)!==JSON.stringify(d.credito))){
      const desc = (d.id==='case-w20e' && m.descricao==='Pá carregadeira Case W20E. Controle por horímetro.') ? d.descricao : m.descricao;
      await put('maquinas',{...m, foto:d.foto, credito:d.credito, descricao:desc});
    }
  }
}
async function loadMaquinas(){ maquinas = (await getAll('maquinas')).sort((a,b)=>(a.ordem??0)-(b.ordem??0)); }

function renderTabs(){
  const el=$('#tabs');
  el.innerHTML = maquinas.map(m=>`<button class="tab" role="tab" data-id="${esc(m.id)}" aria-selected="${m.id===atual}"><img src="${esc(blobUrl(m.foto))}" alt="">${esc(m.nome)}</button>`).join('')
    + `<button class="tab add" id="tabAdd">＋ Nova máquina</button>`;
  el.querySelectorAll('.tab[data-id]').forEach(b=>b.onclick=()=>selecionar(b.dataset.id));
  $('#tabAdd').onclick=()=>formMaquina();
  const sel=el.querySelector('[aria-selected=true]'); if(sel) sel.scrollIntoView({inline:'center',block:'nearest'});
}

async function selecionar(id){
  atual=id; localStorage.setItem('frota.atual',id);
  renderTabs(); await renderMain(); window.scrollTo({top:0});
}

async function renderMain(){
  const m = maquinas.find(x=>x.id===atual);
  const main=$('#main');
  if(!m){ main.innerHTML=`<div class="wrap"><div class="empty">Nenhuma máquina cadastrada.<br><br><button class="btn pri" id="bAdd">＋ Adicionar máquina</button></div></div>`; $('#bAdd').onclick=()=>formMaquina(); return; }
  const revs = (await revsOf(m.id)).sort((a,b)=> (b.data||'').localeCompare(a.data||'') || (b.criadoEm||0)-(a.criadoEm||0));
  const total = revs.reduce((s,r)=>s+(Number(r.custo)||0),0);
  const ultima = revs.find(r=>r.leitura!=null);
  main.innerHTML = `
    <section class="hero">${m.foto?`<img src="${esc(blobUrl(m.foto))}" alt="${esc(m.nome)}">`:''}
      <button class="icon-btn edit" id="bEditM" aria-label="Editar máquina">✎</button>
      <div class="ov"><span class="badge">${esc(m.tipo||'Máquina')}</span><h1>${esc(m.nome)}</h1></div></section>
    <div class="wrap">
      <p class="desc">${esc(m.descricao||'')}</p>
      <div class="stats">
        <div class="stat"><small>Total gasto</small><b>${brl(total)}</b></div>
        <div class="stat"><small>Revisões</small><b>${revs.length}</b></div>
        <div class="stat"><small>Último ${medidorNome(m).toLowerCase()}</small><b>${ultima?num(ultima.leitura)+' '+unidade(m):'—'}</b></div>
      </div>
      <button class="btn pri" id="bNova">＋ Nova revisão</button>
      <h3 class="sec">Histórico</h3>
      <div class="list" id="hist">${revs.length?revs.map(r=>itemRev(m,r)).join(''):`<div class="empty">Nenhuma revisão ainda.<br>Toque em <b>Nova revisão</b> para começar.</div>`}</div>
      ${m.credito?`<p class="credit-line">Foto: ${esc(m.credito.autor)} — ${esc(m.credito.licenca)}${m.credito.obs?' · '+esc(m.credito.obs):''}</p>`:''}
    </div>`;
  $('#bNova').onclick=()=>formRevisao(m);
  $('#bEditM').onclick=()=>formMaquina(m);
  main.querySelectorAll('.item').forEach(b=>b.onclick=async()=>detalhe(m, await getOne('revisoes',b.dataset.id)));
}
function itemRev(m,r){
  const th = (r.fotosMaquina&&r.fotosMaquina[0]) || r.fotoMedidor;
  return `<button class="item" data-id="${esc(r.id)}">${th?`<img class="th" src="${esc(blobUrl(th))}" alt="">`:`<div class="th"></div>`}
    <div class="meta"><b>${dataBR(r.data)} · ${r.leitura!=null?num(r.leitura)+' '+unidade(m):'—'}</b>
    <span>${esc(r.mecanico||'Sem mecânico')}</span><span>${esc((r.trocado||'').split('\n').filter(Boolean).join(', ')||'—')}</span></div>
    <div class="cost">${brl(r.custo)}</div></button>`;
}

/* ---------- modal ---------- */
function abrir(titulo, html){
  $('#modalTitle').textContent=titulo; $('#modalBody').innerHTML=html; $('#modal').hidden=false;
  $('#modalBody').scrollTop=0; document.body.style.overflow='hidden';
  return $('#modalBody');
}
function fechar(){ $('#modal').hidden=true; document.body.style.overflow=''; $('#modalBody').innerHTML=''; }
$('#modal').addEventListener('click',e=>{ if(e.target.id==='modal'||e.target.closest('[data-close]')) fechar(); });
function verFoto(src){ $('#viewerImg').src=src; $('#viewer').hidden=false; }
$('#viewer').addEventListener('click',()=>{ $('#viewer').hidden=true; $('#viewerImg').src=''; });

/* ---------- photo picker ---------- */
function photoPicker(container, {multi, initial=[], label}){
  let fotos=[...initial];
  const render=()=>{
    container.innerHTML = fotos.map((b,i)=>`<div class="ph"><img src="${esc(blobUrl(b))}" alt=""><button type="button" data-rm="${i}" aria-label="Remover">✕</button></div>`).join('')
      + ((multi||!fotos.length)?`<label class="pick-btn"><b>📷</b>${esc(label)}<input type="file" accept="image/*" capture="environment" ${multi?'multiple':''}></label>`
        + `<label class="pick-btn"><b>🖼️</b>Galeria<input type="file" accept="image/*" ${multi?'multiple':''}></label>`:'');
    container.querySelectorAll('[data-rm]').forEach(b=>b.onclick=()=>{ fotos.splice(+b.dataset.rm,1); render(); });
    container.querySelectorAll('input[type=file]').forEach(inp=>inp.onchange=async()=>{
      const files=[...inp.files]; if(!files.length) return;
      toast('Processando foto…',1500);
      for(const f of files){ const b=await compress(f); if(multi) fotos.push(b); else fotos=[b]; }
      render();
    });
  };
  render();
  return { get:()=>fotos };
}

/* ---------- formulário revisão ---------- */
function formRevisao(m, r){
  const ed = !!r; r = r || {};
  const body = abrir(ed?'Editar revisão':'Nova revisão — '+m.nome, `
    <form id="fRev" autocomplete="off">
      <label class="f"><span>Data</span><input class="in" type="date" name="data" required value="${esc(r.data||hoje())}"></label>
      <label class="f"><span>${medidorNome(m)} <em>(${unidade(m)==='h'?'horas':'km'})</em></span><input class="in" name="leitura" inputmode="decimal" placeholder="Ex.: ${unidade(m)==='h'?'12.540':'185.300'}" value="${r.leitura!=null?esc(String(r.leitura).replace('.',',')):''}"></label>
      <div class="f"><label class="f" style="margin-bottom:6px"><span>Foto do ${medidorNome(m).toLowerCase()}</span></label><div class="photo-pick" id="pMed"></div></div><br>
      <div class="f"><label class="f" style="margin-bottom:6px"><span>Fotos da máquina</span></label><div class="photo-pick" id="pMaq"></div></div><br>
      <label class="f"><span>Mecânico</span><input class="in" name="mecanico" list="dlMec" placeholder="Nome do mecânico" value="${esc(r.mecanico||'')}"><datalist id="dlMec"></datalist></label>
      <label class="f"><span>Custo total (R$)</span><input class="in" name="custo" inputmode="decimal" placeholder="0,00" value="${r.custo?esc(Number(r.custo).toFixed(2).replace('.',',')):''}"></label>
      <label class="f"><span>O que foi trocado / serviços <em>(um por linha)</em></span><textarea class="in" name="trocado" rows="4" placeholder="Ex.: Óleo do motor&#10;Filtro de óleo">${esc(r.trocado||'')}</textarea>
        <div class="chips">${PECAS.map(p=>`<button type="button" class="chip" data-p="${esc(p)}">＋ ${esc(p)}</button>`).join('')}</div></label>
      <label class="f"><span>Observações</span><textarea class="in" name="obs" rows="3" placeholder="Algo a mais? Próxima revisão, defeitos…">${esc(r.observacoes||'')}</textarea></label>
      <button class="btn pri" type="submit">💾 Salvar revisão</button>
    </form>`);
  const pMed = photoPicker($('#pMed',body),{multi:false, initial:r.fotoMedidor?[r.fotoMedidor]:[], label:'Câmera'});
  const pMaq = photoPicker($('#pMaq',body),{multi:true, initial:r.fotosMaquina||[], label:'Câmera'});
  getAll('revisoes').then(all=>{ const s=[...new Set(all.map(x=>x.mecanico).filter(Boolean))]; $('#dlMec',body).innerHTML=s.map(x=>`<option value="${esc(x)}">`).join(''); });
  const ta=body.querySelector('[name=trocado]');
  body.querySelectorAll('.chip').forEach(c=>c.onclick=()=>{ const v=ta.value.replace(/\s+$/,''); ta.value=(v?v+'\n':'')+c.dataset.p; });
  $('#fRev',body).onsubmit=async(e)=>{
    e.preventDefault(); const f=e.target;
    const obj = { ...r, id:r.id||uid(), maquinaId:m.id, data:f.data.value||hoje(), leitura:parseLeitura(f.leitura.value),
      fotoMedidor:pMed.get()[0]||null, fotosMaquina:pMaq.get(), mecanico:f.mecanico.value.trim(), custo:parseValor(f.custo.value),
      trocado:f.trocado.value.trim(), observacoes:f.obs.value.trim(), criadoEm:r.criadoEm||Date.now(), atualizadoEm:Date.now() };
    try{ await put('revisoes',obj); }catch(err){ alert('Erro ao salvar: '+err); return; }
    fechar(); toast(ed?'Revisão atualizada ✔':'Revisão salva ✔'); await renderMain();
  };
}

/* ---------- detalhe ---------- */
function resumoTexto(m,r){
  const l=[`🔧 *Revisão — ${m.nome}*`, m.tipo?`${m.tipo}`:'', `📅 Data: ${dataBR(r.data)}`,
    `⏱️ ${medidorNome(m)}: ${r.leitura!=null?num(r.leitura)+' '+unidade(m):'—'}`,
    `👨‍🔧 Mecânico: ${r.mecanico||'—'}`, `💰 Custo: ${brl(r.custo)}`];
  if(r.trocado) l.push('', '*Trocado / serviços:*', ...r.trocado.split('\n').filter(Boolean).map(x=>'• '+x));
  if(r.observacoes) l.push('', '*Obs.:* '+r.observacoes);
  return l.filter(x=>x!=='' || true).join('\n').replace(/\n{3,}/g,'\n\n');
}
function detalhe(m,r){
  if(!r) return;
  const fotos=[...(r.fotoMedidor?[{b:r.fotoMedidor,c:medidorNome(m)}]:[]), ...(r.fotosMaquina||[]).map((b,i)=>({b,c:'Máquina '+(i+1)}))];
  const body=abrir(`${m.nome} — ${dataBR(r.data)}`, `
    ${fotos.length?`<div class="gallery">${fotos.map(f=>`<figure><img src="${esc(blobUrl(f.b))}" alt="${esc(f.c)}"><figcaption>${esc(f.c)}</figcaption></figure>`).join('')}</div>`:''}
    <dl class="kv">
      <div><dt>Data</dt><dd>${dataBR(r.data)}</dd></div>
      <div><dt>${medidorNome(m)}</dt><dd>${r.leitura!=null?num(r.leitura)+' '+unidade(m):'—'}</dd></div>
      <div><dt>Mecânico</dt><dd>${esc(r.mecanico||'—')}</dd></div>
      <div><dt>Custo</dt><dd>${brl(r.custo)}</dd></div>
    </dl>
    <div class="block"><small>O que foi trocado / serviços</small>${esc(r.trocado||'—')}</div>
    ${r.observacoes?`<div class="block"><small>Observações</small>${esc(r.observacoes)}</div>`:''}
    <div class="stack">
      <button class="btn pri" id="bShare">📤 Compartilhar</button>
      <div class="btn-row"><button class="btn ghost" id="bEdit">✎ Editar</button><button class="btn danger" id="bDel">🗑️ Excluir</button></div>
    </div>`);
  body.querySelectorAll('.gallery img').forEach(i=>i.onclick=()=>verFoto(i.src));
  $('#bEdit',body).onclick=()=>formRevisao(m,r);
  $('#bDel',body).onclick=async()=>{ if(!confirm('Excluir esta revisão? Isso não pode ser desfeito.')) return; await del('revisoes',r.id); fechar(); toast('Revisão excluída'); renderMain(); };
  $('#bShare',body).onclick=()=>compartilhar(m,r);
}
async function compartilhar(m,r){
  const text=resumoTexto(m,r);
  const blobs=[r.fotoMedidor,...(r.fotosMaquina||[])].filter(Boolean);
  const files=blobs.map((b,i)=>new File([b],`${m.id}-${r.data}-${i+1}.jpg`,{type:'image/jpeg'}));
  try{
    if(files.length && navigator.canShare && navigator.canShare({files})){ await navigator.share({files, text, title:'Revisão '+m.nome}); return; }
    if(navigator.share){ await navigator.share({text, title:'Revisão '+m.nome}); return; }
  }catch(e){ if(e && e.name==='AbortError') return; }
  const body=abrir('Compartilhar', `
    <div class="block" id="txt">${esc(text)}</div>
    <div class="stack">
      <a class="btn pri" href="https://wa.me/?text=${encodeURIComponent(text)}" target="_blank" rel="noopener">💬 Enviar no WhatsApp</a>
      <button class="btn ghost" id="bCopy">📋 Copiar texto</button>
      <p class="note">Neste navegador as fotos não podem ser anexadas automaticamente. Envie o texto e anexe as fotos pela galeria, se precisar.</p>
    </div>`);
  $('#bCopy',body).onclick=async()=>{ try{ await navigator.clipboard.writeText(text); toast('Texto copiado ✔'); }catch(e){ const t=document.createElement('textarea'); t.value=text; document.body.appendChild(t); t.select(); document.execCommand('copy'); t.remove(); toast('Texto copiado ✔'); } };
}

/* ---------- máquinas ---------- */
function formMaquina(m){
  const ed=!!m; m=m||{medidor:'h'};
  const body=abrir(ed?'Editar máquina':'Nova máquina', `
    <form id="fMaq" autocomplete="off">
      <label class="f"><span>Nome (aparece na aba)</span><input class="in" name="nome" required placeholder="Ex.: Caterpillar 924" value="${esc(m.nome||'')}"></label>
      <label class="f"><span>Modelo / tipo</span><input class="in" name="tipo" placeholder="Ex.: Pá carregadeira, Caminhão, Picape" value="${esc(m.tipo||'')}"></label>
      <label class="f"><span>Descrição</span><textarea class="in" name="descricao" rows="3" placeholder="Placa, ano, cor, nº de série…">${esc(m.descricao||'')}</textarea></label>
      <label class="f"><span>Controle por</span><select class="in" name="medidor"><option value="h" ${m.medidor!=='km'?'selected':''}>Horímetro (horas)</option><option value="km" ${m.medidor==='km'?'selected':''}>Hodômetro (km)</option></select></label>
      <div class="f"><label class="f" style="margin-bottom:6px"><span>Foto da máquina</span></label><div class="photo-pick" id="pFoto"></div></div><br>
      <button class="btn pri" type="submit">💾 Salvar máquina</button>
      ${ed?`<br><button type="button" class="btn danger" id="bDelM">🗑️ Remover máquina</button>`:''}
    </form>`);
  const pf=photoPicker($('#pFoto',body),{multi:false, initial:m.foto?[m.foto]:[], label:'Câmera'});
  $('#fMaq',body).onsubmit=async e=>{
    e.preventDefault(); const f=e.target; const foto=pf.get()[0]||null;
    const obj={...m, id:m.id||('m-'+uid()), nome:f.nome.value.trim(), tipo:f.tipo.value.trim(), descricao:f.descricao.value.trim(), medidor:f.medidor.value, foto,
      ordem: m.ordem ?? (Math.max(-1,...maquinas.map(x=>x.ordem??0))+1)};
    if(foto!==m.foto) obj.credito=null;
    await put('maquinas',obj); fechar(); await loadMaquinas(); toast('Máquina salva ✔'); selecionar(obj.id);
  };
  if(ed) $('#bDelM',body).onclick=async()=>{
    const n=(await revsOf(m.id)).length;
    if(!confirm(`Remover "${m.nome}"${n?` e suas ${n} revisões`:''}? Isso não pode ser desfeito.`)) return;
    for(const r of await revsOf(m.id)) await del('revisoes',r.id);
    await del('maquinas',m.id); fechar(); await loadMaquinas(); toast('Máquina removida');
    selecionar(maquinas[0]?.id||null);
  };
}

/* ---------- menu / backup ---------- */
function menu(){
  const body=abrir('Menu', `<div class="stack menu-list">
    <button class="btn ghost" id="mAdd">＋ Adicionar máquina</button>
    <button class="btn ghost" id="mExp">⬇️ Exportar backup (arquivo)</button>
    <button class="btn ghost" id="mImp">⬆️ Importar backup</button>
    <button class="btn ghost" id="mInst">📱 Instalar na tela inicial</button>
    <button class="btn ghost" id="mCred">ℹ️ Sobre e créditos das fotos</button>
    <input type="file" id="impFile" accept="application/json,.json" hidden>
    <p class="note">⚠️ Os dados ficam salvos <b>somente neste aparelho/navegador</b>. Use <b>Exportar backup</b> com frequência para guardar uma cópia ou passar para outro celular.</p>
  </div>`);
  $('#mAdd',body).onclick=()=>formMaquina();
  $('#mExp',body).onclick=()=>{ fechar(); exportar(); };
  $('#mImp',body).onclick=()=>$('#impFile',body).click();
  $('#impFile',body).onchange=e=>{ const f=e.target.files[0]; if(f) importar(f); };
  $('#mInst',body).onclick=instalar;
  $('#mCred',body).onclick=creditos;
}
async function exportar(){
  toast('Gerando backup…');
  const maqs=await getAll('maquinas'), revs=await getAll('revisoes');
  const enc=async b=> (b && typeof b!=='string') ? await blobToDataURL(b) : b;
  const data={app:'controle-frota', versao:1, exportadoEm:new Date().toISOString(),
    maquinas: await Promise.all(maqs.map(async m=>({...m, foto:await enc(m.foto)}))),
    revisoes: await Promise.all(revs.map(async r=>({...r, fotoMedidor:await enc(r.fotoMedidor), fotosMaquina:await Promise.all((r.fotosMaquina||[]).map(enc))})))};
  const name=`bm-sistemas-frota-${hoje()}.json`;
  const blob=new Blob([JSON.stringify(data)],{type:'application/json'});
  const file=new File([blob],name,{type:'application/json'});
  try{ if(navigator.canShare && navigator.canShare({files:[file]}) && confirm('Compartilhar o backup (WhatsApp, Drive, e-mail…)?\n\nCancelar = apenas baixar o arquivo.')){ await navigator.share({files:[file], title:'Backup BM Sistemas'}); return; } }catch(e){ if(e.name==='AbortError') return; }
  const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(()=>URL.revokeObjectURL(a.href),10000); toast('Backup baixado: '+name,4000);
}
async function importar(file){
  let data; try{ data=JSON.parse(await file.text()); }catch(e){ alert('Arquivo inválido.'); return; }
  if(data.app!=='controle-frota'){ alert('Este arquivo não é um backup do Controle de Frota.'); return; }
  if(!confirm(`Importar ${data.maquinas?.length||0} máquinas e ${data.revisoes?.length||0} revisões?\nRegistros com o mesmo ID serão substituídos; os demais são mantidos.`)) return;
  const dec=async v=> (typeof v==='string' && v.startsWith('data:')) ? await dataURLToBlob(v) : v;
  for(const m of data.maquinas||[]) await put('maquinas',{...m, foto:await dec(m.foto)});
  for(const r of data.revisoes||[]) await put('revisoes',{...r, fotoMedidor:await dec(r.fotoMedidor), fotosMaquina:await Promise.all((r.fotosMaquina||[]).map(dec))});
  await put('meta',{k:'seeded',v:true});
  fechar(); await loadMaquinas(); toast('Backup importado ✔'); selecionar(atual && maquinas.some(x=>x.id===atual)?atual:maquinas[0]?.id);
}
let deferredPrompt=null;
window.addEventListener('beforeinstallprompt',e=>{ e.preventDefault(); deferredPrompt=e; });
async function instalar(){
  if(deferredPrompt){ deferredPrompt.prompt(); await deferredPrompt.userChoice; deferredPrompt=null; return; }
  abrir('Instalar na tela inicial', `<div class="block"><b>iPhone (Safari):</b> toque em <b>Compartilhar</b> (quadrado com seta) → <b>Adicionar à Tela de Início</b>.</div>
    <div class="block"><b>Android (Chrome):</b> toque no menu <b>⋮</b> → <b>Adicionar à tela inicial</b> / <b>Instalar app</b>.</div>
    <p class="note">Depois de instalado, o app abre como um aplicativo e funciona mesmo sem internet.</p>`);
}
function creditos(){
  abrir('Sobre', `<div class="block"><b>BM Sistemas — Controle de Frota</b> v${APP_VERSION}<br>Registro de revisões com fotos, horímetro/hodômetro, mecânico, custo e peças trocadas. Funciona offline.</div>
    <div class="block"><small>Onde ficam os dados</small>Tudo é salvo no próprio aparelho (no navegador). Se limpar os dados do navegador ou trocar de celular, os registros não vão junto — faça <b>Exportar backup</b> e depois <b>Importar backup</b> no outro aparelho.</div>
    <h3 class="sec">Créditos das fotos (Wikimedia Commons)</h3>
    <ul class="credits">${DEFAULT_MACHINES.filter(m=>m.credito).map(m=>`<li><b>${esc(m.nome)}</b>: ${esc(m.credito.autor)} — ${esc(m.credito.licenca)}. ${esc(m.credito.obs)} <a href="${esc(m.credito.url)}" target="_blank" rel="noopener">Ver original</a></li>`).join('')}<li><b>W20E</b> e <b>Hilux STD</b>: foto própria (BM Sistemas).</li></ul>
    <p class="note">Fotos redimensionadas. Licenças CC BY / CC BY-SA exigem atribuição; a foto da Saveiro teve a cor alterada.</p>`);
}

/* ---------- init ---------- */
$('#btnMenu').onclick=menu;
(async()=>{
  try{ await seed(); await migrar(); await loadMaquinas(); }catch(e){ $('#main').innerHTML=`<div class="wrap"><div class="empty">Não foi possível abrir o banco de dados do navegador.<br>${esc(e)}</div></div>`; return; }
  const saved=localStorage.getItem('frota.atual');
  atual = maquinas.some(m=>m.id===saved) ? saved : maquinas[0]?.id;
  renderTabs(); renderMain();
  if(navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(()=>{});
  if('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(()=>{});
})();
