'use strict';
/* BM Sistemas — Controle de Frota — PWA offline. Dados ficam no aparelho (IndexedDB). */
const APP_VERSION = '2.0.0';
const MAX_PX = 1280, JPEG_Q = 0.8;

/* Categorias: definem campos (série x chassi/placa), itens de vencimento e checklist da OS */
const CATS = {
  carregadeira:{nome:'Pá carregadeira', grupo:'maquina'},
  escavadeira:{nome:'Escavadeira', grupo:'maquina'},
  esteira:{nome:'Trator de esteira', grupo:'maquina'},
  empilhadeira:{nome:'Empilhadeira', grupo:'maquina'},
  pickup:{nome:'Picape / utilitário', grupo:'veiculo'},
  caminhao:{nome:'Caminhão / cavalo mecânico', grupo:'veiculo'},
  semireboque:{nome:'Semi-reboque / prancha', grupo:'veiculo'},
  outro:{nome:'Outro equipamento', grupo:'maquina'},
};
const isVeic = (m)=> (CATS[m.categoria]||{}).grupo==='veiculo';

const wm = (autor,licenca,arquivo,obs,aprox)=>({autor, licenca, url:'https://commons.wikimedia.org/wiki/File:'+arquivo, obs, aprox:!!aprox});
const DEFAULT_MACHINES = [
  {id:'volvo-l90', nome:'Volvo L90', tipo:'Pá carregadeira', categoria:'carregadeira', medidor:'h', foto:'img/volvo-l90.jpg',
   descricao:'Pá carregadeira de rodas Volvo L90. Controle por horímetro.',
   credito:{autor:'Alf van Beem', licenca:'CC0 (domínio público)', url:'https://commons.wikimedia.org/wiki/File:Volvo_L90F_p1.JPG', obs:'Foto de uma Volvo L90F.'}},
  {id:'case-w20e', nome:'W20E', tipo:'Pá carregadeira', categoria:'carregadeira', medidor:'h', foto:'img/case-w20e-bm.jpg',
   descricao:'Pá carregadeira articulada Case W20E. Controle por horímetro.', credito:null},
  {id:'saveiro', nome:'Saveiro quadrada', tipo:'Picape • Verde', categoria:'pickup', medidor:'km', foto:'img/saveiro-bm.jpg',
   descricao:'VW Saveiro quadrada (1ª geração), cor verde. Controle por hodômetro.', credito:null},
  {id:'hilux-std', nome:'Hilux STD', tipo:'Picape • Branca • Cabine simples', categoria:'pickup', medidor:'km', foto:'img/hilux-std-bm.jpg',
   descricao:'Toyota Hilux STD, branca, cabine simples. Controle por hodômetro.', credito:null},
  {id:'f250', nome:'F-250 XL 2010', tipo:'Picape • Branca • 4x4', categoria:'pickup', ano:'2010', medidor:'km', foto:'img/f250-bm.jpg',
   descricao:'Ford F-250 XL ano 2010, branca, 4x4. Controle por hodômetro.', credito:null},
  {id:'jcb-426ex', nome:'JCB 426EX', tipo:'Pá carregadeira', categoria:'carregadeira', medidor:'h', foto:'img/jcb-426ex-bm.jpg',
   descricao:'Pá carregadeira JCB 426EX. Controle por horímetro.', credito:null},
  {id:'axor-2644', nome:'Axor 2644', tipo:'Cavalo mecânico', categoria:'caminhao', medidor:'km', foto:'img/axor-2644-bm.jpg',
   descricao:'Caminhão trator (cavalo mecânico) Mercedes-Benz Axor 2644. Controle por hodômetro.', credito:null},
  {id:'prancha-pastri', nome:'Prancha Pastri', tipo:'Semi-reboque prancha • Amarela • 2 eixos', categoria:'semireboque', medidor:'km', foto:'img/semi-reboque-prancha.jpg',
   descricao:'Semi-reboque prancha Pastri para transporte de máquinas, amarela, 2 eixos. Controle por hodômetro (opcional).',
   credito:wm('Overbilt','CC BY-SA 4.0','25_Ton_Lowboy.jpg','Foto aproximada: prancha rebaixada amarela de 2 eixos de outro fabricante (não é Pastri).',true)},
  {id:'empilhadeira-longking', nome:'Empilhadeira Longking', tipo:'Empilhadeira 2,5 t • Laranja', categoria:'empilhadeira', medidor:'h', foto:'img/empilhadeira-longking.jpg',
   descricao:'Empilhadeira Longking (Lonking) de 2,5 toneladas, laranja. Controle por horímetro.',
   credito:wm('PATCHANAT2701','CC BY-SA 4.0','Forklift_1.jpg','Foto aproximada: empilhadeira laranja de 2,5 t de outra marca (não é Longking).',true)},
  {id:'case-w20d', nome:'W20D', tipo:'Pá carregadeira • Amarela', categoria:'carregadeira', medidor:'h', foto:'img/case-w20d.jpg',
   descricao:'Pá carregadeira articulada Case W20D, amarela. Controle por horímetro.',
   credito:wm('BuckSkinRider','CC BY-SA 4.0','2025-03-18_134123_S90_0002_I_w248.jpg','Foto aproximada: Case W20C, da mesma linha W20 (não é a W20D).',true)},
  {id:'cat-320d2', nome:'CAT 320D2', tipo:'Escavadeira hidráulica', categoria:'escavadeira', medidor:'h', foto:'img/cat-320d2.jpg',
   descricao:'Escavadeira hidráulica Caterpillar 320D2. Controle por horímetro.',
   credito:wm('SwarmCheng','CC BY-SA 4.0','Caterpillar_320D2_04.jpg','Foto de uma Caterpillar 320D2.')},
  {id:'komatsu-pc210', nome:'Komatsu PC210', tipo:'Escavadeira hidráulica', categoria:'escavadeira', medidor:'h', foto:'img/komatsu-pc210.jpg',
   descricao:'Escavadeira hidráulica Komatsu PC210. Controle por horímetro.',
   credito:wm('Tiia Monto','CC BY-SA 3.0','Komatsu_PC210.jpg','Foto de uma Komatsu PC210 (a geração pode ser diferente).')},
  {id:'komatsu-d50a', nome:'Komatsu D50A', tipo:'Trator de esteira', categoria:'esteira', medidor:'h', foto:'img/komatsu-d50a.jpg',
   descricao:'Trator de esteira Komatsu D50A. Controle por horímetro.',
   credito:wm('CEphoto, Uwe Aranas','CC BY-SA 3.0','Da-Nang_Vietnam_KOMATSU-D60A-bulldozer-01.jpg','Foto aproximada: Komatsu D60A, da mesma geração e um pouco maior que o D50A.',true)},
  {id:'komatsu-d51ex', nome:'Komatsu D51EX-22', tipo:'Trator de esteira', categoria:'esteira', medidor:'h', foto:'img/komatsu-d51ex.jpg',
   descricao:'Trator de esteira Komatsu D51EX-22. Controle por horímetro.',
   credito:wm('Ermell','CC BY-SA 4.0','Komatsu_D51px-20180420-RM-161126.jpg','Foto aproximada: Komatsu D51PX (mesma série D51, versão de esteira larga).',true)},
];
const IDS_V1 = ['volvo-l90','case-w20e','saveiro','hilux-std','f250','jcb-426ex','axor-2644'];

const PECAS = ['Óleo do motor','Filtro de óleo','Filtro de ar','Filtro de combustível','Filtro separador de água','Filtro hidráulico','Óleo hidráulico','Óleo da transmissão','Óleo do diferencial','Lubrificação / graxa','Pneus','Pastilhas / lonas de freio','Correia','Bateria','Líquido de arrefecimento','Mangueira','Pino / bucha'];

/* Itens de documentos / manutenção com vencimento */
function docsPadrao(cat){
  const veic = (CATS[cat]||{}).grupo==='veiculo';
  let n;
  if(cat==='semireboque') n=['Licenciamento / CRLV','Seguro','IPVA','Revisão preventiva (freios e rolamentos)'];
  else if(cat==='caminhao') n=['Licenciamento / CRLV','Seguro','IPVA','Tacógrafo (aferição)','Troca de óleo','Revisão preventiva'];
  else if(veic) n=['Licenciamento / CRLV','Seguro','IPVA','Troca de óleo','Revisão preventiva'];
  else n=['Revisão preventiva','Troca de óleo','NR-12 / inspeção de segurança'];
  return n.map(nome=>({id:uid(), nome, vence:'', prox:null, override:'', obs:''}));
}

/* Checklists de OS (estilo concessionária) */
const CK_LINHA_AMARELA = ['Motor: nível de óleo e vazamentos','Filtros (ar, óleo, combustível, hidráulico)','Arrefecimento / radiador','Sistema hidráulico: nível e vazamentos','Mangueiras e conexões','Correias'];
const CK_SEG_MAQ = ['Sistema elétrico e bateria','Painel e instrumentos','Ar-condicionado','Freios / freio de estacionamento','Luzes e faróis','Alarme de ré','Buzina','Extintor de incêndio','Cinto de segurança','Cabine, vidros e retrovisores','Estrutura / soldas (trincas)'];
const CK_VEIC = ['Óleo do motor','Filtros (óleo, ar, combustível, cabine)','Líquido de arrefecimento','Fluido de freio','Freios (pastilhas, discos, lonas)','Suspensão e amortecedores','Direção','Pneus e estepe','Luzes, setas e lanternas','Bateria e sistema elétrico','Correias','Embreagem / câmbio','Limpador e para-brisa','Ar-condicionado','Cintos de segurança','Extintor, triângulo e macaco','Documentos (CRLV)'];
const CHECKLISTS = {
  carregadeira:[...CK_LINHA_AMARELA,'Pneus (pressão e desgaste)','Caçamba, dentes e lâmina de corte','Pinos e buchas / lubrificação','Articulação central','Transmissão e diferenciais',...CK_SEG_MAQ],
  escavadeira:[...CK_LINHA_AMARELA,'Esteiras e material rodante','Roletes, rodas-guia e roda motriz','Caçamba e dentes','Lança, braço e cilindros','Pinos e buchas / lubrificação','Giro (rolamento e redutor)',...CK_SEG_MAQ],
  esteira:[...CK_LINHA_AMARELA,'Esteiras e material rodante','Roletes, rodas-guia e roda motriz','Lâmina e cantos','Ripper / escarificador','Pinos e buchas / lubrificação','Comando final / transmissão',...CK_SEG_MAQ],
  empilhadeira:['Garfos (trincas, desgaste e travas)','Corrente de elevação','Mastro e roletes','Cilindros de elevação e inclinação','GLP (cilindro, mangueira, válvula) / bateria','Motor: nível de óleo e vazamentos','Óleo hidráulico','Freio de serviço e de estacionamento','Direção','Pneus / rodas','Buzina','Luzes / giroflex','Alarme de ré','Cinto de segurança','Extintor de incêndio','Protetor de teto','Placa de capacidade'],
  pickup:CK_VEIC,
  caminhao:[...CK_VEIC,'Tacógrafo','Quinta roda','Sistema de ar (compressor, drenos)','Engates de ar e elétrica do reboque','Faixas refletivas'],
  semireboque:['Pneus (pressão, desgaste) e estepe','Freios (lonas, tambores, cuícas)','Sistema de ar (mangueiras e válvulas)','Suspensão (molas e balancins)','Rolamentos / cubos de roda','Rampas','Pino rei / quinta roda','Luzes, lanternas e chicote','Faixas refletivas e para-choque','Pontos de amarração, correntes e catracas','Assoalho / madeiramento','Pé de apoio (patola)','Documentos (CRLV)'],
};
CHECKLISTS.outro = [...CK_LINHA_AMARELA,...CK_SEG_MAQ];

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
function agoraLocal(){ const d=new Date(); d.setMinutes(d.getMinutes()-d.getTimezoneOffset()); return d.toISOString().slice(0,16); }
function dtBR(s){ if(!s) return '—'; const [d,t]=s.split('T'); return dataBR(d)+(t?' '+t.slice(0,5):''); }
const pad4 = (n)=> String(n||0).padStart(4,'0');
const fmtNum = (v)=> v==null||v==='' ? '' : String(v).replace('.',',');

/* ---------- estado ---------- */
let maquinas = [], atual = null;
let alertas = [], alertMap = {}, semData = 0;

async function seed(){
  const m = await getOne('meta','seeded');
  if(m) return;
  let i=0; for(const x of DEFAULT_MACHINES){ await put('maquinas',{...x, padrao:true, ordem:i++, docs:docsPadrao(x.categoria)}); }
  await put('meta',{k:'seeded',v:true});
  await put('meta',{k:'seededIds',v:DEFAULT_MACHINES.map(x=>x.id)});
}
// Atualiza fotos/créditos das máquinas padrão (sem mexer em fotos trocadas pelo usuário),
// adiciona equipamentos novos da versão e completa campos novos (categoria, documentos).
async function migrar(){
  for(const d of DEFAULT_MACHINES){
    const m=await getOne('maquinas',d.id);
    if(m && m.padrao && typeof m.foto==='string' && m.foto.startsWith('img/') && (m.foto!==d.foto || JSON.stringify(m.credito)!==JSON.stringify(d.credito))){
      const desc = (d.id==='case-w20e' && m.descricao==='Pá carregadeira Case W20E. Controle por horímetro.') ? d.descricao : m.descricao;
      await put('maquinas',{...m, foto:d.foto, credito:d.credito, descricao:desc});
    }
  }
  const known = (await getOne('meta','seededIds'))?.v || IDS_V1;
  const todas = await getAll('maquinas');
  let ordem = Math.max(-1,...todas.map(x=>x.ordem??0))+1;
  for(const d of DEFAULT_MACHINES){
    if(known.includes(d.id) || todas.some(x=>x.id===d.id)) continue;
    await put('maquinas',{...d, padrao:true, ordem:ordem++, docs:docsPadrao(d.categoria)});
  }
  await put('meta',{k:'seededIds',v:[...new Set([...known,...DEFAULT_MACHINES.map(x=>x.id)])]});
  for(const m of await getAll('maquinas')){
    if(m.categoria && Array.isArray(m.docs)) continue;
    const d = DEFAULT_MACHINES.find(x=>x.id===m.id);
    const categoria = m.categoria || d?.categoria || (m.medidor==='km'?'pickup':'carregadeira');
    await put('maquinas',{...m, categoria, ano: m.ano ?? d?.ano ?? '', docs: Array.isArray(m.docs)?m.docs:docsPadrao(categoria)});
  }
}
async function loadMaquinas(){ maquinas = (await getAll('maquinas')).sort((a,b)=>(a.ordem??0)-(b.ordem??0)); }

/* ---------- vencimentos / alertas ---------- */
const RANK={sem:0,ok:1,prox:2,venc:3};
const pior=(a,b)=> !a?b : (RANK[b]>RANK[a]?b:a);
function leituraAtual(m, regs){
  let v = (m.leituraAtual!=null && m.leituraAtual!=='') ? Number(m.leituraAtual) : null;
  for(const r of regs||[]) if(r.leitura!=null && (v==null || r.leitura>v)) v=r.leitura;
  return v;
}
function statusDoc(d, m, leit){
  if(d.override==='ok') return {st:'ok', txt:'Em dia', det:'definido manualmente'};
  if(d.override==='vencido') return {st:'venc', txt:'Vencido', det:'definido manualmente'};
  let st=null; const det=[];
  if(d.vence){
    const dias=Math.round((new Date(d.vence+'T00:00')-new Date(hoje()+'T00:00'))/864e5);
    st=pior(st, dias<0?'venc':dias<=15?'prox':'ok');
    det.push(dias<0?`venceu em ${dataBR(d.vence)} (há ${-dias} dia${-dias>1?'s':''})` : dias===0?'vence hoje' : `vence em ${dataBR(d.vence)} (${dias} dia${dias>1?'s':''})`);
  }
  if(d.prox!=null && d.prox!==''){
    const u=unidade(m);
    if(leit==null){ st=pior(st,'ok'); det.push(`próx. com ${num(d.prox)} ${u} (sem leitura atual)`); }
    else{ const rest=d.prox-leit, lim=u==='h'?50:1000;
      st=pior(st, rest<=0?'venc':rest<=lim?'prox':'ok');
      det.push(rest<=0?`passou ${num(-rest)} ${u} (era com ${num(d.prox)} ${u})`:`faltam ${num(rest)} ${u} (com ${num(d.prox)} ${u})`); }
  }
  if(!st) return {st:'sem', txt:'Sem data', det:'preencha o vencimento em ✎'};
  return {st, txt: st==='venc'?'Vencido':st==='prox'?'Vence em breve':'Em dia', det:det.join(' · ')};
}
async function calcAlertas(){
  const regs = await getAll('revisoes');
  alertas=[]; alertMap={}; semData=0;
  for(const m of maquinas){
    const leit = leituraAtual(m, regs.filter(r=>r.maquinaId===m.id));
    const a = alertMap[m.id] = {venc:0, prox:0, ok:0, leit};
    for(const d of m.docs||[]){
      const s=statusDoc(d,m,leit);
      if(s.st==='venc'||s.st==='prox'){ a[s.st]++; alertas.push({m,d,s}); }
      else if(s.st==='ok') a.ok++; else semData++;
    }
  }
  alertas.sort((x,y)=>RANK[y.s.st]-RANK[x.s.st]);
}
const pill = (s)=> `<span class="pill ${s.st}">${esc(s.txt)}</span>`;
function badgeHTML(id, big){
  const a=alertMap[id]; if(!a) return '';
  if(a.venc) return `<span class="bdg venc">${big?`${a.venc} vencido${a.venc>1?'s':''}`:a.venc}</span>`;
  if(a.prox) return `<span class="bdg prox">${big?`${a.prox} vence${a.prox>1?'m':''} em breve`:a.prox}</span>`;
  if(big && a.ok) return `<span class="bdg ok">✔ em dia</span>`;
  return '';
}
function mostrarBanner(){
  const b=$('#banner'); const nv=alertas.filter(x=>x.s.st==='venc').length, np=alertas.length-nv;
  if(!alertas.length || sessionStorage.getItem('frota.bannerOff')){ b.hidden=true; return; }
  b.innerHTML=`<span>⚠️ <b>${nv} vencido${nv!==1?'s':''}</b> · ${np} vence${np!==1?'m':''} em breve</span><button class="bn-ver" id="bnVer">Ver alertas</button><button class="bn-x" id="bnX" aria-label="Fechar">✕</button>`;
  b.hidden=false;
  $('#bnVer').onclick=()=>selecionar('__alertas');
  $('#bnX').onclick=()=>{ sessionStorage.setItem('frota.bannerOff','1'); b.hidden=true; };
}
async function notificar(){
  if(!alertas.length || !('Notification' in window) || Notification.permission!=='granted') return;
  const key='frota.notif.'+hoje(); if(localStorage.getItem(key)) return; localStorage.setItem(key,'1');
  const nv=alertas.filter(x=>x.s.st==='venc').length;
  const body=alertas.slice(0,4).map(x=>`${x.m.nome}: ${x.d.nome} — ${x.s.txt}`).join('\n')+(alertas.length>4?`\n+${alertas.length-4} itens`:'');
  const title=`BM Sistemas — ${nv} vencido${nv!==1?'s':''}, ${alertas.length-nv} em breve`;
  try{ const reg=navigator.serviceWorker && await navigator.serviceWorker.getRegistration();
    if(reg && reg.showNotification) await reg.showNotification(title,{body, icon:'icons/icon-192.png', badge:'icons/favicon-32.png', tag:'frota-alertas'});
    else new Notification(title,{body, icon:'icons/icon-192.png'});
  }catch(e){}
}
async function refresh(){ await loadMaquinas(); await calcAlertas(); renderTabs(); await renderMain(); }

/* ---------- abas / telas ---------- */
function renderTabs(){
  const el=$('#tabs');
  el.innerHTML = `<button class="tab nav" data-id="__home" aria-selected="${atual==='__home'}">🏠 Início</button>`
    + `<button class="tab nav" data-id="__alertas" aria-selected="${atual==='__alertas'}">⚠️ Alertas${alertas.length?`<span class="bdg ${alertas.some(x=>x.s.st==='venc')?'venc':'prox'}">${alertas.length}</span>`:''}</button>`
    + maquinas.map(m=>`<button class="tab" role="tab" data-id="${esc(m.id)}" aria-selected="${m.id===atual}"><img src="${esc(blobUrl(m.foto))}" alt="">${esc(m.nome)}${badgeHTML(m.id)}</button>`).join('')
    + `<button class="tab add" id="tabAdd">＋ Novo</button>`;
  el.querySelectorAll('.tab[data-id]').forEach(b=>b.onclick=()=>selecionar(b.dataset.id));
  $('#tabAdd').onclick=()=>formMaquina();
  const sel=el.querySelector('[aria-selected=true]'); if(sel) sel.scrollIntoView({inline:'center',block:'nearest'});
}
async function selecionar(id){
  atual=id||'__home'; localStorage.setItem('frota.atual',atual);
  renderTabs(); await renderMain(); window.scrollTo({top:0});
  if(atual==='__alertas') $('#banner').hidden=true; else mostrarBanner();
}
async function renderMain(){
  if(atual==='__home') return renderHome();
  if(atual==='__alertas') return renderAlertas();
  const m = maquinas.find(x=>x.id===atual);
  if(!m) return renderHome();
  return renderMaquina(m);
}
function renderHome(){
  const main=$('#main');
  const nv=alertas.filter(x=>x.s.st==='venc').length, np=alertas.length-nv;
  main.innerHTML=`<div class="wrap">
    <div class="home-head"><div><h2>Equipamentos</h2><small>${maquinas.length} cadastrados</small></div>
      <button class="sum ${nv?'venc':np?'prox':'ok'}" id="hAl">${alertas.length?`⚠️ ${nv} vencido${nv!==1?'s':''} · ${np} em breve`:'✔ Tudo em dia'}</button></div>
    <div class="grid">${maquinas.map(m=>`<button class="card" data-id="${esc(m.id)}"><div class="cimg">${m.foto?`<img src="${esc(blobUrl(m.foto))}" alt="" loading="lazy">`:''}${badgeHTML(m.id,true)}</div>
      <div class="cb"><b>${esc(m.nome)}</b><small>${esc(m.tipo||CATS[m.categoria]?.nome||'')}</small></div></button>`).join('')}
      <button class="card add" id="hAdd"><b>＋</b><span>Novo equipamento</span></button></div>
  </div>`;
  main.querySelectorAll('.card[data-id]').forEach(b=>b.onclick=()=>selecionar(b.dataset.id));
  $('#hAdd').onclick=()=>formMaquina();
  $('#hAl').onclick=()=>selecionar('__alertas');
}
function renderAlertas(){
  const main=$('#main');
  const venc=alertas.filter(x=>x.s.st==='venc'), prox=alertas.filter(x=>x.s.st==='prox');
  const row=(x)=>`<button class="item al" data-id="${esc(x.m.id)}"><img class="th" src="${esc(blobUrl(x.m.foto))}" alt="">
    <div class="meta"><b>${esc(x.d.nome)}</b><span>${esc(x.m.nome)}</span><span>${esc(x.s.det)}</span></div>${pill(x.s)}</button>`;
  const podeNotif = ('Notification' in window) && Notification.permission==='default';
  main.innerHTML=`<div class="wrap">
    <h2 class="ttl">⚠️ Alertas de vencimento</h2>
    <p class="note">Avisa o que está vencido e o que vence em até <b>15 dias</b>, <b>50 h</b> ou <b>1.000 km</b>. Os prazos de cada equipamento são preenchidos no <b>✎</b> dele.</p>
    ${podeNotif?`<button class="btn ghost" id="bNotif">🔔 Ativar notificação ao abrir o app</button>`:''}
    ${('Notification' in window) && Notification.permission==='denied'?`<p class="note">Notificações bloqueadas neste navegador — os alertas aparecem numa faixa ao abrir o app.</p>`:''}
    <h3 class="sec">Vencidos (${venc.length})</h3>
    <div class="list">${venc.length?venc.map(row).join(''):`<div class="empty">Nada vencido ✔</div>`}</div>
    <h3 class="sec">Vencem em breve (${prox.length})</h3>
    <div class="list">${prox.length?prox.map(row).join(''):`<div class="empty">Nada para os próximos dias ✔</div>`}</div>
    ${semData?`<p class="note">${semData} ite${semData>1?'ns':'m'} ainda sem data/leitura preenchida.</p>`:''}
  </div>`;
  main.querySelectorAll('.item.al').forEach(b=>b.onclick=()=>selecionar(b.dataset.id));
  const bn=$('#bNotif'); if(bn) bn.onclick=async()=>{ try{ const p=await Notification.requestPermission(); if(p==='granted'){ toast('Notificações ativadas ✔'); localStorage.removeItem('frota.notif.'+hoje()); notificar(); } }catch(e){} renderAlertas(); };
}

async function renderMaquina(m){
  const main=$('#main');
  const regs = (await revsOf(m.id)).sort((a,b)=> (b.data||'').localeCompare(a.data||'') || (b.criadoEm||0)-(a.criadoEm||0));
  const total = regs.reduce((s,r)=>s+(Number(r.custo)||0),0);
  const leit = leituraAtual(m, regs);
  const veic = isVeic(m);
  const docs = (m.docs||[]).map(d=>({d, s:statusDoc(d,m,leit)}));
  const nOS = regs.filter(r=>r.tipo==='os').length;
  main.innerHTML = `
    <section class="hero">${m.foto?`<img src="${esc(blobUrl(m.foto))}" alt="${esc(m.nome)}">`:''}
      <button class="icon-btn edit" id="bEditM" aria-label="Editar equipamento">✎</button>
      ${m.credito&&m.credito.aprox?`<span class="aprox">📷 foto aproximada</span>`:''}
      <div class="ov"><span class="badge">${esc(m.tipo||CATS[m.categoria]?.nome||'Máquina')}</span><h1>${esc(m.nome)}</h1></div></section>
    <div class="wrap">
      <p class="desc">${esc(m.descricao||'')}</p>
      <div class="stats">
        <div class="stat"><small>Total gasto</small><b>${brl(total)}</b></div>
        <div class="stat"><small>OS / revisões</small><b>${regs.length}</b></div>
        <div class="stat"><small>${medidorNome(m)} atual</small><b>${leit!=null?num(leit)+' '+unidade(m):'—'}</b></div>
      </div>
      <button class="btn pri" id="bOS">📋 Nova Ordem de Serviço</button>
      <button class="btn ghost mt8" id="bNova">＋ Registro rápido de revisão</button>
      <h3 class="sec">Dados do equipamento <button class="lnk" id="bEdD">✎ editar</button></h3>
      <dl class="kv">
        <div><dt>Categoria</dt><dd>${esc(CATS[m.categoria]?.nome||'—')}</dd></div>
        <div><dt>Ano</dt><dd>${esc(m.ano||'—')}</dd></div>
        ${veic?`<div><dt>Placa</dt><dd>${esc(m.placa||'—')}</dd></div><div><dt>Chassi</dt><dd>${esc(m.chassi||'—')}</dd></div>`
              :`<div><dt>Nº de série</dt><dd>${esc(m.serie||'—')}</dd></div>`}
      </dl>
      <h3 class="sec">Documentos e vencimentos</h3>
      <div class="docs">${docs.length?docs.map(({d,s})=>`<div class="doc ${s.st}"><div><b>${esc(d.nome)}</b><small>${esc(s.det)}</small></div>${pill(s)}</div>`).join(''):`<div class="empty">Nenhum item. Toque em ✎ para adicionar.</div>`}</div>
      <h3 class="sec">Histórico ${nOS?`· ${nOS} OS`:''}</h3>
      <div class="list" id="hist">${regs.length?regs.map(r=>itemRev(m,r)).join(''):`<div class="empty">Nenhum registro ainda.<br>Toque em <b>Nova Ordem de Serviço</b> para começar.</div>`}</div>
      ${m.credito?`<p class="credit-line">Foto: ${esc(m.credito.autor)} — ${esc(m.credito.licenca)}${m.credito.obs?' · '+esc(m.credito.obs):''}</p>`:''}
    </div>`;
  $('#bOS').onclick=()=>formOS(m);
  $('#bNova').onclick=()=>formRevisao(m);
  $('#bEditM').onclick=()=>formMaquina(m);
  $('#bEdD').onclick=()=>formMaquina(m);
  main.querySelectorAll('.item').forEach(b=>b.onclick=async()=>{ const r=await getOne('revisoes',b.dataset.id); if(r && r.tipo==='os') detalheOS(m,r); else detalhe(m,r); });
}
function itemRev(m,r){
  const th = (r.fotosMaquina&&r.fotosMaquina[0]) || r.fotoMedidor;
  const os = r.tipo==='os';
  const nok = os ? (r.checklist||[]).filter(c=>c.st==='nok').length : 0;
  const linha2 = os ? `${esc(r.mecanico||'—')} · ${r.saida?'Concluída':'Em aberto'}${nok?` · ${nok} não OK`:''}` : esc(r.mecanico||'Sem mecânico');
  const linha3 = os ? esc(r.servicoSolicitado||(r.pecas||[]).map(p=>p.desc).filter(Boolean).join(', ')||'—') : esc((r.trocado||'').split('\n').filter(Boolean).join(', ')||'—');
  return `<button class="item" data-id="${esc(r.id)}">${th?`<img class="th" src="${esc(blobUrl(th))}" alt="">`:`<div class="th ${os?'th-os':''}">${os?'OS':''}</div>`}
    <div class="meta"><b>${os?`<span class="tag-os">OS ${pad4(r.numero)}</span> `:''}${dataBR(r.data)} · ${r.leitura!=null?num(r.leitura)+' '+unidade(m):'—'}</b>
    <span>${linha2}</span><span>${linha3}</span></div>
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
  fillMecanicos($('#dlMec',body));
  const ta=body.querySelector('[name=trocado]');
  body.querySelectorAll('.chip').forEach(c=>c.onclick=()=>{ const v=ta.value.replace(/\s+$/,''); ta.value=(v?v+'\n':'')+c.dataset.p; });
  $('#fRev',body).onsubmit=async(e)=>{
    e.preventDefault(); const f=e.target;
    const obj = { ...r, id:r.id||uid(), maquinaId:m.id, data:f.data.value||hoje(), leitura:parseLeitura(f.leitura.value),
      fotoMedidor:pMed.get()[0]||null, fotosMaquina:pMaq.get(), mecanico:f.mecanico.value.trim(), custo:parseValor(f.custo.value),
      trocado:f.trocado.value.trim(), observacoes:f.obs.value.trim(), criadoEm:r.criadoEm||Date.now(), atualizadoEm:Date.now() };
    try{ await put('revisoes',obj); }catch(err){ alert('Erro ao salvar: '+err); return; }
    fechar(); toast(ed?'Revisão atualizada ✔':'Revisão salva ✔'); await refresh();
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
  $('#bDel',body).onclick=async()=>{ if(!confirm('Excluir esta revisão? Isso não pode ser desfeito.')) return; await del('revisoes',r.id); fechar(); toast('Revisão excluída'); refresh(); };
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

/* ---------- Ordem de Serviço ---------- */
function fillMecanicos(dl){
  getAll('revisoes').then(all=>{ const s=[...new Set(all.map(x=>x.mecanico).filter(Boolean))]; dl.innerHTML=s.map(x=>`<option value="${esc(x)}">`).join(''); });
}
function sigPad(wrap, initial){
  wrap.innerHTML=`<canvas class="sig"></canvas><div class="sig-bar"><span>✍️ Assine com o dedo</span><button type="button" class="lnk">Limpar</button></div>`;
  const cv=wrap.querySelector('canvas'), ctx=cv.getContext('2d');
  let dirty=false, cur=initial||null, drawing=false, last=null, W=0, H=0;
  function base(){ ctx.setTransform(1,0,0,1,0,0); ctx.fillStyle='#fff'; ctx.fillRect(0,0,cv.width,cv.height);
    const dpr=W?cv.width/W:1; ctx.setTransform(dpr,0,0,dpr,0,0);
    ctx.lineWidth=2.6; ctx.lineCap='round'; ctx.lineJoin='round'; ctx.strokeStyle='#0b1f4d'; }
  function size(){ const r=cv.getBoundingClientRect(); if(!r.width) return; W=r.width; H=r.height; const dpr=Math.min(3,window.devicePixelRatio||1);
    cv.width=Math.round(W*dpr); cv.height=Math.round(H*dpr); base();
    if(cur){ const im=new Image(); im.onload=()=>{ ctx.drawImage(im,0,0,W,H); }; im.src=blobUrl(cur); } }
  requestAnimationFrame(size);
  const pt=(e)=>{ const r=cv.getBoundingClientRect(); return {x:e.clientX-r.left, y:e.clientY-r.top}; };
  cv.addEventListener('pointerdown',e=>{ e.preventDefault(); if(!W) size(); drawing=true; last=pt(e); try{cv.setPointerCapture(e.pointerId);}catch(_){}
    ctx.beginPath(); ctx.arc(last.x,last.y,1.2,0,Math.PI*2); ctx.fillStyle='#0b1f4d'; ctx.fill(); dirty=true; });
  cv.addEventListener('pointermove',e=>{ if(!drawing) return; e.preventDefault(); const p=pt(e);
    ctx.beginPath(); ctx.moveTo(last.x,last.y); ctx.lineTo(p.x,p.y); ctx.stroke(); last=p; dirty=true; });
  const up=()=>{ drawing=false; };
  cv.addEventListener('pointerup',up); cv.addEventListener('pointercancel',up); cv.addEventListener('pointerleave',up);
  wrap.querySelector('.lnk').onclick=()=>{ cur=null; dirty=false; base(); };
  return {
    vazio:()=>!dirty && !cur,
    get:()=> new Promise(res=>{ if(!dirty) return res(cur); cv.toBlob(b=>res(b),'image/png'); }),
  };
}
async function proximoNumeroOS(){ return ((await getOne('meta','osSeq'))?.v||0)+1; }

async function formOS(m, r){
  const ed=!!r; r=r||{};
  const tpl = CHECKLISTS[m.categoria] || CHECKLISTS.outro;
  let check = r.checklist ? r.checklist.map(c=>({...c})) : tpl.map(item=>({item, st:'', obs:''}));
  let pecas = r.pecas ? r.pecas.map(p=>({...p})) : [];
  const numPrev = ed ? r.numero : await proximoNumeroOS();
  const regs = await revsOf(m.id); const leitAtual = leituraAtual(m, regs);
  const veic = isVeic(m);
  const body = abrir(ed?`Editar OS ${pad4(r.numero)}`:`Nova OS — ${m.nome}`, `
    <form id="fOS" autocomplete="off" novalidate>
      <div class="os-head"><img src="${esc(blobUrl(m.foto))}" alt=""><div><small>Ordem de Serviço</small><b>Nº ${pad4(numPrev)}</b><span>${esc(m.nome)} · ${esc(m.tipo||'')}</span>
        <span>${m.ano?'Ano '+esc(m.ano)+' · ':''}${veic?(m.placa?'Placa '+esc(m.placa)+' · ':'')+(m.chassi?'Chassi '+esc(m.chassi):''):(m.serie?'Série '+esc(m.serie):'')}</span></div></div>
      <div class="grid2">
        <label class="f"><span>Entrada</span><input class="in" type="datetime-local" name="entrada" value="${esc(r.entrada||agoraLocal())}" required></label>
        <label class="f"><span>Saída <em>(ao concluir)</em></span><input class="in" type="datetime-local" name="saida" value="${esc(r.saida||'')}"></label>
      </div>
      <label class="f"><span>${medidorNome(m)} na entrada <em>(${unidade(m)==='h'?'horas':'km'})</em></span><input class="in" name="leitura" inputmode="decimal" placeholder="${leitAtual!=null?'Último: '+num(leitAtual):'Ex.: '+(unidade(m)==='h'?'12.540':'185.300')}" value="${r.leitura!=null?esc(fmtNum(r.leitura)):''}"></label>
      <label class="f"><span>Solicitante</span><input class="in" name="solicitante" placeholder="Quem pediu o serviço" value="${esc(r.solicitante||'')}"></label>
      <label class="f"><span>Mecânico responsável <em class="req">* obrigatório</em></span><input class="in" name="mecanico" list="dlMec2" required placeholder="Nome do mecânico" value="${esc(r.mecanico||'')}"><datalist id="dlMec2"></datalist></label>
      <label class="f"><span>Serviço solicitado / defeito relatado</span><textarea class="in" name="servicoSolicitado" rows="2" placeholder="Ex.: revisão das 500 h, vazamento no cilindro…">${esc(r.servicoSolicitado||'')}</textarea></label>

      <h3 class="sec">Checklist de inspeção</h3>
      <div class="ck-tools"><button type="button" class="chip" id="ckAllOk">✔ Marcar restantes como OK</button><span id="ckCount"></span></div>
      <div id="ckList"></div>
      <div class="ck-add"><input class="in" id="ckNovo" placeholder="Adicionar item ao checklist"><button type="button" class="btn ghost" id="ckAddBtn">＋</button></div>

      <h3 class="sec">Peças e serviços</h3>
      <div id="pcList"></div>
      <button type="button" class="btn ghost mt8" id="pcAdd">＋ Adicionar peça / serviço</button>
      <div class="chips">${PECAS.map(p=>`<button type="button" class="chip" data-p="${esc(p)}">＋ ${esc(p)}</button>`).join('')}</div>
      <datalist id="dlPecas">${PECAS.map(p=>`<option value="${esc(p)}">`).join('')}</datalist>
      <div class="grid2 mt8">
        <label class="f"><span>Mão de obra (R$)</span><input class="in" name="maoObra" inputmode="decimal" placeholder="0,00" value="${r.maoObra?esc(Number(r.maoObra).toFixed(2).replace('.',',')):''}"></label>
        <div class="totbox"><small>Peças: <b id="tPec">R$ 0,00</b></small><small>Total geral</small><b id="tGeral">R$ 0,00</b></div>
      </div>
      <label class="f"><span>Serviço executado</span><textarea class="in" name="servicoExecutado" rows="3" placeholder="O que foi feito">${esc(r.servicoExecutado||'')}</textarea></label>
      <label class="f"><span>Observações</span><textarea class="in" name="obs" rows="2" placeholder="Próxima revisão, pendências…">${esc(r.observacoes||'')}</textarea></label>

      <h3 class="sec">Fotos</h3>
      <div class="f"><label class="f" style="margin-bottom:6px"><span>Foto do ${medidorNome(m).toLowerCase()}</span></label><div class="photo-pick" id="pMed"></div></div><br>
      <div class="f"><label class="f" style="margin-bottom:6px"><span>Fotos do equipamento / serviço</span></label><div class="photo-pick" id="pMaq"></div></div>

      <h3 class="sec">Assinaturas</h3>
      <label class="f" style="margin-bottom:6px"><span>Assinatura do mecânico</span></label>
      <div class="sigwrap" id="sigMec"></div>
      <label class="f mt8"><span>Responsável / cliente</span><input class="in" name="responsavel" placeholder="Nome de quem recebe o equipamento" value="${esc(r.responsavel||'')}"></label>
      <div class="sigwrap" id="sigResp"></div>
      <br><button class="btn pri" type="submit">💾 Salvar OS</button>
    </form>`);
  fillMecanicos($('#dlMec2',body));
  const pMed = photoPicker($('#pMed',body),{multi:false, initial:r.fotoMedidor?[r.fotoMedidor]:[], label:'Câmera'});
  const pMaq = photoPicker($('#pMaq',body),{multi:true, initial:r.fotosMaquina||[], label:'Câmera'});
  const sMec = sigPad($('#sigMec',body), r.assinaturaMec);
  const sResp = sigPad($('#sigResp',body), r.assinaturaResp);
  const f=$('#fOS',body);

  function renderCk(){
    $('#ckList',body).innerHTML = check.map((c,i)=>`<div class="ck ${c.st}" data-i="${i}"><div class="ck-top"><span>${esc(c.item)}</span>
      <div class="seg">${[['ok','OK'],['nok','Não OK'],['na','N/A']].map(([v,t])=>`<button type="button" data-v="${v}" aria-pressed="${c.st===v}">${t}</button>`).join('')}</div></div>
      <input class="in sm" data-obs placeholder="Observação" value="${esc(c.obs||'')}"></div>`).join('');
    $('#ckList',body).querySelectorAll('.ck').forEach(el=>{ const i=+el.dataset.i;
      el.querySelectorAll('.seg button').forEach(b=>b.onclick=()=>{ check[i].st = check[i].st===b.dataset.v?'':b.dataset.v; el.className='ck '+check[i].st; el.querySelectorAll('.seg button').forEach(x=>x.setAttribute('aria-pressed', x.dataset.v===check[i].st)); contarCk(); });
      el.querySelector('[data-obs]').oninput=e=>{ check[i].obs=e.target.value; };
    });
    contarCk();
  }
  function contarCk(){ const c={ok:0,nok:0,na:0,'':0}; check.forEach(x=>c[x.st||'']++);
    $('#ckCount',body).innerHTML=`<b class="g">${c.ok} OK</b> · <b class="r">${c.nok} não OK</b> · ${c.na} N/A · ${c['']} pendentes`; }
  $('#ckAllOk',body).onclick=()=>{ check.forEach(c=>{ if(!c.st) c.st='ok'; }); renderCk(); };
  $('#ckAddBtn',body).onclick=()=>{ const v=$('#ckNovo',body).value.trim(); if(!v) return; check.push({item:v,st:'',obs:''}); $('#ckNovo',body).value=''; renderCk(); };
  renderCk();

  function renderPc(){
    $('#pcList',body).innerHTML = pecas.map((p,i)=>`<div class="pc" data-i="${i}">
      <input class="in" data-k="desc" list="dlPecas" placeholder="Peça ou serviço" value="${esc(p.desc||'')}">
      <div class="pc-row"><label><small>Qtd</small><input class="in" data-k="qtd" inputmode="decimal" value="${esc(fmtNum(p.qtd??1))}"></label>
      <label><small>Valor unit. (R$)</small><input class="in" data-k="unit" inputmode="decimal" placeholder="0,00" value="${p.unit?esc(Number(p.unit).toFixed(2).replace('.',',')):''}"></label>
      <div class="pc-tot"><small>Total</small><b data-tot>${brl((Number(p.qtd)||0)*(Number(p.unit)||0))}</b></div>
      <button type="button" class="pc-rm" aria-label="Remover">✕</button></div></div>`).join('') || `<p class="note">Nenhuma peça lançada.</p>`;
    $('#pcList',body).querySelectorAll('.pc').forEach(el=>{ const i=+el.dataset.i;
      el.querySelectorAll('[data-k]').forEach(inp=>inp.oninput=()=>{ const k=inp.dataset.k; pecas[i][k]= k==='desc'?inp.value : parseBR(inp.value);
        el.querySelector('[data-tot]').textContent=brl((Number(pecas[i].qtd)||0)*(Number(pecas[i].unit)||0)); totais(); });
      el.querySelector('.pc-rm').onclick=()=>{ pecas.splice(i,1); renderPc(); };
    });
    totais();
  }
  function totais(){ const tp=pecas.reduce((s,p)=>s+(Number(p.qtd)||0)*(Number(p.unit)||0),0);
    $('#tPec',body).textContent=brl(tp); $('#tGeral',body).textContent=brl(tp+parseValor(f.maoObra.value)); return tp; }
  f.maoObra.oninput=totais;
  $('#pcAdd',body).onclick=()=>{ pecas.push({desc:'',qtd:1,unit:null}); renderPc(); const l=$('#pcList',body).querySelectorAll('.pc'); l[l.length-1]?.querySelector('input')?.focus(); };
  body.querySelectorAll('.chips .chip[data-p]').forEach(c=>c.onclick=()=>{ pecas.push({desc:c.dataset.p,qtd:1,unit:null}); renderPc(); });
  renderPc();

  f.onsubmit=async(e)=>{
    e.preventDefault();
    if(!f.mecanico.value.trim()){ toast('Preencha o nome do mecânico'); f.mecanico.focus(); f.mecanico.scrollIntoView({block:'center'}); return; }
    if(sMec.vazio() && !confirm('A OS está sem a assinatura do mecânico. Salvar mesmo assim?')) return;
    const pend=check.filter(c=>!c.st).length;
    if(pend && !confirm(`${pend} itens do checklist estão sem marcação. Salvar mesmo assim?`)) return;
    const tp=totais(), mo=parseValor(f.maoObra.value);
    const numero = ed ? r.numero : await proximoNumeroOS();
    const obj={...r, id:r.id||uid(), tipo:'os', numero, maquinaId:m.id,
      entrada:f.entrada.value||agoraLocal(), saida:f.saida.value||'', data:(f.entrada.value||agoraLocal()).slice(0,10),
      leitura:parseLeitura(f.leitura.value), solicitante:f.solicitante.value.trim(), mecanico:f.mecanico.value.trim(), responsavel:f.responsavel.value.trim(),
      servicoSolicitado:f.servicoSolicitado.value.trim(), servicoExecutado:f.servicoExecutado.value.trim(), observacoes:f.obs.value.trim(),
      checklist:check, pecas:pecas.filter(p=>p.desc||p.unit), maoObra:mo, totalPecas:tp, custo:tp+mo,
      trocado:pecas.map(p=>p.desc).filter(Boolean).join('\n'),
      fotoMedidor:pMed.get()[0]||null, fotosMaquina:pMaq.get(),
      assinaturaMec:await sMec.get(), assinaturaResp:await sResp.get(),
      criadoEm:r.criadoEm||Date.now(), atualizadoEm:Date.now()};
    try{ await put('revisoes',obj); if(!ed) await put('meta',{k:'osSeq',v:numero}); }catch(err){ alert('Erro ao salvar: '+err); return; }
    toast(ed?`OS ${pad4(numero)} atualizada ✔`:`OS ${pad4(numero)} salva ✔`);
    await refresh(); detalheOS(m,obj);
  };
}

function detalheOS(m,r){
  const fotos=[...(r.fotoMedidor?[{b:r.fotoMedidor,c:medidorNome(m)}]:[]), ...(r.fotosMaquina||[]).map((b,i)=>({b,c:'Foto '+(i+1)}))];
  const c={ok:0,nok:0,na:0}; (r.checklist||[]).forEach(x=>{ if(c[x.st]!=null) c[x.st]++; });
  const noks=(r.checklist||[]).filter(x=>x.st==='nok');
  const body=abrir(`OS ${pad4(r.numero)} — ${m.nome}`, `
    <div class="os-status ${r.saida?'ok':'prox'}">${r.saida?'✔ Concluída':'⏳ Em aberto'}</div>
    <dl class="kv">
      <div><dt>Entrada</dt><dd>${dtBR(r.entrada)}</dd></div>
      <div><dt>Saída</dt><dd>${dtBR(r.saida)}</dd></div>
      <div><dt>${medidorNome(m)}</dt><dd>${r.leitura!=null?num(r.leitura)+' '+unidade(m):'—'}</dd></div>
      <div><dt>Solicitante</dt><dd>${esc(r.solicitante||'—')}</dd></div>
      <div><dt>Mecânico</dt><dd>${esc(r.mecanico||'—')}</dd></div>
      <div><dt>Responsável</dt><dd>${esc(r.responsavel||'—')}</dd></div>
    </dl>
    ${r.servicoSolicitado?`<div class="block"><small>Serviço solicitado</small>${esc(r.servicoSolicitado)}</div>`:''}
    <div class="block"><small>Checklist</small><b class="g">${c.ok} OK</b> · <b class="r">${c.nok} não OK</b> · ${c.na} N/A${noks.length?'\n'+noks.map(x=>'✖ '+x.item+(x.obs?' — '+x.obs:'')).join('\n'):''}</div>
    ${(r.pecas||[]).length?`<div class="block"><small>Peças e serviços</small><table class="tb">${r.pecas.map(p=>`<tr><td>${esc(p.desc)}</td><td>${num(p.qtd)}×</td><td>${brl((Number(p.qtd)||0)*(Number(p.unit)||0))}</td></tr>`).join('')}</table></div>`:''}
    <dl class="kv"><div><dt>Peças</dt><dd>${brl(r.totalPecas)}</dd></div><div><dt>Mão de obra</dt><dd>${brl(r.maoObra)}</dd></div><div><dt><b>Total geral</b></dt><dd>${brl(r.custo)}</dd></div></dl>
    ${r.servicoExecutado?`<div class="block"><small>Serviço executado</small>${esc(r.servicoExecutado)}</div>`:''}
    ${r.observacoes?`<div class="block"><small>Observações</small>${esc(r.observacoes)}</div>`:''}
    ${fotos.length?`<div class="gallery">${fotos.map(f=>`<figure><img src="${esc(blobUrl(f.b))}" alt="${esc(f.c)}"><figcaption>${esc(f.c)}</figcaption></figure>`).join('')}</div>`:''}
    <div class="sigs">${[[r.assinaturaMec,'Mecânico',r.mecanico],[r.assinaturaResp,'Responsável / cliente',r.responsavel]].map(([b,t,n])=>`<div>${b?`<img src="${esc(blobUrl(b))}" alt="">`:'<div class="nosig">sem assinatura</div>'}<span>${esc(n||'—')}</span><small>${t}</small></div>`).join('')}</div>
    <div class="stack">
      <button class="btn pri" id="bPDF">📄 Gerar PDF</button>
      <button class="btn dark" id="bShare">📤 Compartilhar resumo</button>
      <div class="btn-row"><button class="btn ghost" id="bEdit">✎ Editar</button><button class="btn danger" id="bDel">🗑️ Excluir</button></div>
    </div>`);
  body.querySelectorAll('.gallery img').forEach(i=>i.onclick=()=>verFoto(i.src));
  $('#bPDF',body).onclick=()=>pdfOS(m,r);
  $('#bShare',body).onclick=()=>compartilharTexto(resumoOS(m,r), 'OS '+pad4(r.numero), [r.fotoMedidor,...(r.fotosMaquina||[])].filter(Boolean).map((b,i)=>new File([b],`OS-${pad4(r.numero)}-${i+1}.jpg`,{type:'image/jpeg'})));
  $('#bEdit',body).onclick=()=>formOS(m,r);
  $('#bDel',body).onclick=async()=>{ if(!confirm(`Excluir a OS ${pad4(r.numero)}? Isso não pode ser desfeito.`)) return; await del('revisoes',r.id); fechar(); toast('OS excluída'); refresh(); };
}
function resumoOS(m,r){
  const l=[`📋 *OS ${pad4(r.numero)} — ${m.nome}*`, m.tipo||'', `📥 Entrada: ${dtBR(r.entrada)}`, `📤 Saída: ${dtBR(r.saida)}`,
    `⏱️ ${medidorNome(m)}: ${r.leitura!=null?num(r.leitura)+' '+unidade(m):'—'}`, `👨‍🔧 Mecânico: ${r.mecanico||'—'}`, `💰 Total: ${brl(r.custo)}`];
  if(r.servicoSolicitado) l.push('', '*Solicitado:* '+r.servicoSolicitado);
  const noks=(r.checklist||[]).filter(x=>x.st==='nok'); if(noks.length) l.push('', '*Itens não OK:*', ...noks.map(x=>'• '+x.item+(x.obs?' — '+x.obs:'')));
  if((r.pecas||[]).length) l.push('', '*Peças/serviços:*', ...r.pecas.map(p=>`• ${p.desc} (${num(p.qtd)}×) ${brl((Number(p.qtd)||0)*(Number(p.unit)||0))}`));
  if(r.servicoExecutado) l.push('', '*Executado:* '+r.servicoExecutado);
  return l.join('\n');
}
async function compartilharTexto(text, title, files=[]){
  try{
    if(files.length && navigator.canShare && navigator.canShare({files})){ await navigator.share({files, text, title}); return; }
    if(navigator.share){ await navigator.share({text, title}); return; }
  }catch(e){ if(e && e.name==='AbortError') return; }
  const body=abrir('Compartilhar', `<div class="block">${esc(text)}</div><div class="stack">
      <a class="btn pri" href="https://wa.me/?text=${encodeURIComponent(text)}" target="_blank" rel="noopener">💬 Enviar no WhatsApp</a>
      <button class="btn ghost" id="bCopy">📋 Copiar texto</button></div>`);
  $('#bCopy',body).onclick=async()=>{ try{ await navigator.clipboard.writeText(text); toast('Texto copiado ✔'); }catch(e){ toast('Não foi possível copiar'); } };
}

/* ---------- PDF da OS (jsPDF local, funciona offline) ---------- */
function loadScript(src){ return new Promise((res,rej)=>{ const s=document.createElement('script'); s.src=src; s.onload=res; s.onerror=()=>rej(new Error('Falha ao carregar '+src)); document.head.appendChild(s); }); }
async function ensurePDF(){
  if(!window.jspdf) await loadScript('lib/jspdf.umd.min.js');
  if(!window.jspdf.jsPDF.API.autoTable) await loadScript('lib/jspdf.plugin.autotable.min.js');
  return window.jspdf.jsPDF;
}
async function imgData(src, maxPx=1100, fmt='image/jpeg'){
  if(!src) return null;
  try{
    const url = typeof src==='string' ? src : blobUrl(src);
    const img = await new Promise((res,rej)=>{ const i=new Image(); i.onload=()=>res(i); i.onerror=rej; i.src=url; });
    let w=img.naturalWidth, h=img.naturalHeight; const k=Math.min(1,maxPx/Math.max(w,h)); w=Math.round(w*k); h=Math.round(h*k);
    const c=document.createElement('canvas'); c.width=w; c.height=h; const x=c.getContext('2d');
    x.fillStyle='#fff'; x.fillRect(0,0,w,h); x.drawImage(img,0,0,w,h);
    return {data:c.toDataURL(fmt,0.85), w, h, fmt: fmt==='image/png'?'PNG':'JPEG'};
  }catch(e){ return null; }
}
const pdfTxt = (s)=> String(s??'').replace(/[—–]/g,'-').replace(/[•·]/g,'-').replace(/[“”]/g,'"').replace(/[‘’]/g,"'").replace(/[^\x00-\xFF\n]/g,'');
function brlPDF(n){ return pdfTxt(brl(n)).replace(/\u00a0/g,' '); }

async function montarPDF(m, r){
  const jsPDF = await ensurePDF();
  const doc = new jsPDF({unit:'mm', format:'a4', compress:true});
  const W=210, H=297, M=12, CW=W-2*M;
  const NAVY=[15,27,45], AMB=[245,179,1], GR=[107,114,128];
  const veic=isVeic(m), u=unidade(m);
  const [logo, foto, fMed, sMec, sResp] = await Promise.all([
    imgData('icons/icon-192.png',192,'image/png'), imgData(m.foto,900), imgData(r.fotoMedidor,900),
    imgData(r.assinaturaMec,700), imgData(r.assinaturaResp,700)]);
  const fotosMaq = await Promise.all((r.fotosMaquina||[]).slice(0,6).map(b=>imgData(b,900)));

  // Cabeçalho
  doc.setFillColor(...NAVY); doc.rect(0,0,W,27,'F'); doc.setFillColor(...AMB); doc.rect(0,27,W,1.6,'F');
  if(logo) doc.addImage(logo.data,'PNG',M,4.5,18,18,undefined,'FAST');
  doc.setTextColor(255,255,255); doc.setFont('helvetica','bold'); doc.setFontSize(17); doc.text('BM Sistemas',M+22,13);
  doc.setFont('helvetica','normal'); doc.setFontSize(9); doc.setTextColor(203,213,225); doc.text('Controle de Frota - Oficina e Manutenção',M+22,19);
  doc.setTextColor(255,255,255); doc.setFont('helvetica','bold'); doc.setFontSize(12); doc.text('ORDEM DE SERVIÇO',W-M,11,{align:'right'});
  doc.setTextColor(...AMB); doc.setFontSize(20); doc.text('Nº '+pad4(r.numero),W-M,20.5,{align:'right'});
  let y=34;

  // Equipamento: foto + dados
  const bw=64, bh=48;
  doc.setDrawColor(209,213,219); doc.setFillColor(243,244,246); doc.roundedRect(M,y,bw,bh,2,2,'FD');
  if(foto){ const k=Math.min(bw/foto.w, bh/foto.h); const w=foto.w*k, h=foto.h*k; doc.addImage(foto.data,'JPEG',M+(bw-w)/2,y+(bh-h)/2,w,h); }
  const eq=[['Equipamento',m.nome],['Modelo / tipo',m.tipo||CATS[m.categoria]?.nome||'-'],['Ano',m.ano||'-']];
  if(veic){ eq.push(['Placa',m.placa||'-'],['Chassi',m.chassi||'-']); } else eq.push(['Nº de série',m.serie||'-']);
  eq.push([medidorNome(m),r.leitura!=null?num(r.leitura)+' '+u:'-']);
  doc.autoTable({startY:y, margin:{left:M+bw+4,right:M}, theme:'grid', body:eq.map(([a,b])=>[pdfTxt(a),pdfTxt(b)]),
    styles:{fontSize:9, cellPadding:1.6, lineColor:[209,213,219], lineWidth:0.2, textColor:[17,24,39]},
    columnStyles:{0:{fontStyle:'bold', fillColor:[243,244,246], cellWidth:30}}});
  y=Math.max(y+bh, doc.lastAutoTable.finalY)+4;

  // Dados da OS
  doc.autoTable({startY:y, margin:{left:M,right:M}, theme:'grid',
    head:[[{content:'DADOS DA ORDEM DE SERVIÇO', colSpan:4}]],
    body:[['Entrada',dtBR(r.entrada),'Saída',dtBR(r.saida)],['Solicitante',pdfTxt(r.solicitante||'-'),'Mecânico',pdfTxt(r.mecanico||'-')],
          ['Responsável',pdfTxt(r.responsavel||'-'),'Situação',r.saida?'Concluída':'Em aberto']],
    styles:{fontSize:9, cellPadding:1.6, lineColor:[209,213,219], lineWidth:0.2, textColor:[17,24,39]},
    headStyles:{fillColor:NAVY, textColor:255, fontStyle:'bold', fontSize:9},
    columnStyles:{0:{fontStyle:'bold',fillColor:[243,244,246],cellWidth:28},2:{fontStyle:'bold',fillColor:[243,244,246],cellWidth:24}}});
  y=doc.lastAutoTable.finalY+4;

  const bloco=(titulo,txt)=>{ if(!txt) return; doc.autoTable({startY:y, margin:{left:M,right:M}, theme:'grid', head:[[titulo]], body:[[pdfTxt(txt)]],
    styles:{fontSize:9, cellPadding:2, lineColor:[209,213,219], lineWidth:0.2, textColor:[17,24,39]}, headStyles:{fillColor:NAVY,textColor:255,fontSize:9}}); y=doc.lastAutoTable.finalY+4; };
  bloco('SERVIÇO SOLICITADO / DEFEITO RELATADO', r.servicoSolicitado);

  // Checklist
  const ck=r.checklist||[];
  if(ck.length){
    const cnt={ok:0,nok:0,na:0}; ck.forEach(c=>{ if(cnt[c.st]!=null) cnt[c.st]++; });
    doc.autoTable({startY:y, margin:{left:M,right:M}, theme:'grid',
      head:[[{content:`CHECKLIST DE INSPEÇÃO  (${cnt.ok} OK - ${cnt.nok} não OK - ${cnt.na} N/A)`, colSpan:6}],['#','Item','OK','Não OK','N/A','Observação']],
      body:ck.map((c,i)=>[i+1, pdfTxt(c.item), c.st==='ok'?'X':'', c.st==='nok'?'X':'', c.st==='na'?'X':'', pdfTxt(c.obs||'')]),
      styles:{fontSize:8, cellPadding:1.3, lineColor:[209,213,219], lineWidth:0.2, textColor:[17,24,39], valign:'middle'},
      headStyles:{fillColor:NAVY, textColor:255, fontSize:8, halign:'center'},
      columnStyles:{0:{cellWidth:7,halign:'center'},1:{cellWidth:68},2:{cellWidth:11,halign:'center',fontStyle:'bold'},3:{cellWidth:13,halign:'center',fontStyle:'bold'},4:{cellWidth:10,halign:'center',fontStyle:'bold'}},
      didParseCell:(d)=>{ if(d.section!=='body') return; const st=ck[d.row.index]?.st;
        if(d.column.index===2 && st==='ok') d.cell.styles.textColor=[22,163,74];
        if(d.column.index===3 && st==='nok'){ d.cell.styles.textColor=[220,38,38]; }
        if(st==='nok') d.cell.styles.fillColor=[254,242,242]; }});
    y=doc.lastAutoTable.finalY+4;
  }

  // Peças e serviços
  const pc=(r.pecas||[]);
  doc.autoTable({startY:y, margin:{left:M,right:M}, theme:'grid',
    head:[[{content:'PEÇAS E SERVIÇOS',colSpan:4}],['Item / serviço','Qtd','Valor unit.','Total']],
    body: pc.length ? pc.map(p=>[pdfTxt(p.desc), num(p.qtd), brlPDF(p.unit), brlPDF((Number(p.qtd)||0)*(Number(p.unit)||0))]) : [[{content:'Nenhuma peça lançada',colSpan:4,styles:{textColor:GR}}]],
    foot:[[{content:'Subtotal peças',colSpan:3,styles:{halign:'right'}},brlPDF(r.totalPecas)],[{content:'Mão de obra',colSpan:3,styles:{halign:'right'}},brlPDF(r.maoObra)],
          [{content:'TOTAL GERAL',colSpan:3,styles:{halign:'right',fontSize:10}},{content:brlPDF(r.custo),styles:{fontSize:10}}]],
    styles:{fontSize:9, cellPadding:1.6, lineColor:[209,213,219], lineWidth:0.2, textColor:[17,24,39]},
    headStyles:{fillColor:NAVY,textColor:255,fontSize:9}, footStyles:{fillColor:[254,243,199],textColor:[17,24,39],fontStyle:'bold'},
    columnStyles:{1:{cellWidth:16,halign:'center'},2:{cellWidth:30,halign:'right'},3:{cellWidth:32,halign:'right'}}, showFoot:'lastPage',
    didParseCell:(d)=>{ if(d.section==='head' && d.row.index===1 && d.column.index>0) d.cell.styles.halign = d.column.index===1?'center':'right'; }});
  y=doc.lastAutoTable.finalY+4;
  bloco('SERVIÇO EXECUTADO', r.servicoExecutado);
  bloco('OBSERVAÇÕES', r.observacoes);

  // Fotos
  const fts=[...(fMed?[{i:fMed,c:'Foto do '+medidorNome(m).toLowerCase()}]:[]), ...fotosMaq.filter(Boolean).map((i,k)=>({i,c:'Foto '+(k+1)}))];
  if(fts.length){
    const cw=(CW-8)/3, ch=44;
    if(y+12+ch>H-60){ doc.addPage(); y=16; }
    doc.setFont('helvetica','bold'); doc.setFontSize(9); doc.setTextColor(...NAVY); doc.text('FOTOS',M,y+3); y+=6;
    fts.forEach((f,k)=>{ const col=k%3; if(col===0 && k>0){ y+=ch+8; if(y+ch>H-20){ doc.addPage(); y=16; } }
      const x=M+col*(cw+4); doc.setFillColor(243,244,246); doc.rect(x,y,cw,ch,'F');
      const s=Math.min(cw/f.i.w, ch/f.i.h), w=f.i.w*s, h=f.i.h*s; doc.addImage(f.i.data,'JPEG',x+(cw-w)/2,y+(ch-h)/2,w,h);
      doc.setFont('helvetica','normal'); doc.setFontSize(7.5); doc.setTextColor(...GR); doc.text(pdfTxt(f.c),x+cw/2,y+ch+3.5,{align:'center'}); });
    y+=ch+9;
  }

  // Assinaturas
  if(y+46>H-14){ doc.addPage(); y=20; }
  doc.setFont('helvetica','bold'); doc.setFontSize(9); doc.setTextColor(...NAVY); doc.text('ASSINATURAS',M,y+3); y+=6;
  const sw=(CW-12)/2;
  [[sMec,r.mecanico,'Mecânico responsável'],[sResp,r.responsavel,'Responsável / cliente']].forEach(([s,nome,papel],k)=>{
    const x=M+k*(sw+12);
    if(s){ const bh2=24, k2=Math.min(sw/s.w, bh2/s.h), w=s.w*k2, h=s.h*k2; doc.addImage(s.data,'JPEG',x+(sw-w)/2,y+(bh2-h),w,h); }
    doc.setDrawColor(17,24,39); doc.setLineWidth(0.3); doc.line(x,y+26,x+sw,y+26);
    doc.setFont('helvetica','bold'); doc.setFontSize(9); doc.setTextColor(17,24,39); doc.text(pdfTxt(nome||'________________________'),x+sw/2,y+31,{align:'center'});
    doc.setFont('helvetica','normal'); doc.setFontSize(8); doc.setTextColor(...GR); doc.text(papel,x+sw/2,y+35,{align:'center'});
  });

  // Rodapé
  const n=doc.getNumberOfPages(), ger=new Date().toLocaleString('pt-BR');
  for(let i=1;i<=n;i++){ doc.setPage(i); doc.setDrawColor(229,231,235); doc.setLineWidth(0.3); doc.line(M,H-10,W-M,H-10);
    doc.setFont('helvetica','normal'); doc.setFontSize(7.5); doc.setTextColor(...GR);
    doc.text(pdfTxt(`BM Sistemas - Controle de Frota - OS ${pad4(r.numero)} - ${m.nome}`),M,H-6);
    doc.text(`Gerado em ${pdfTxt(ger)} - Página ${i}/${n}`,W-M,H-6,{align:'right'}); }
  return doc.output('blob');
}

async function pdfOS(m,r){
  toast('Gerando PDF…',4000);
  let blob; try{ blob=await montarPDF(m,r); }catch(e){ alert('Não foi possível gerar o PDF: '+(e.message||e)); return; }
  const nome=`OS-${pad4(r.numero)}-${m.nome.replace(/[^\w-]+/g,'-')}.pdf`;
  const file=new File([blob],nome,{type:'application/pdf'});
  const url=URL.createObjectURL(blob);
  const body=abrir(`PDF da OS ${pad4(r.numero)}`, `
    <div class="block pdf-ok"><b>📄 ${esc(nome)}</b><br><small>${(blob.size/1024).toFixed(0)} KB · A4 · pronto para imprimir ou enviar</small></div>
    <div class="stack">
      <button class="btn pri" id="pShare">📤 Compartilhar PDF (WhatsApp, e-mail…)</button>
      <a class="btn dark" id="pDown" href="${url}" download="${esc(nome)}">⬇️ Baixar PDF</a>
      <a class="btn ghost" id="pOpen" href="${url}" target="_blank" rel="noopener">🖨️ Abrir para imprimir</a>
    </div>`);
  const podeShare = navigator.canShare && navigator.canShare({files:[file]});
  if(!podeShare) $('#pShare',body).hidden=true;
  $('#pShare',body).onclick=async()=>{ try{ await navigator.share({files:[file], title:`OS ${pad4(r.numero)} — ${m.nome}`}); }catch(e){ if(e.name!=='AbortError') toast('Não foi possível compartilhar'); } };
}

/* ---------- equipamentos ---------- */
function formMaquina(m){
  const ed=!!m; m=m||{medidor:'h', categoria:'carregadeira'};
  let docs = (m.docs ? m.docs.map(d=>({...d})) : docsPadrao(m.categoria));
  const body=abrir(ed?'Editar equipamento':'Novo equipamento', `
    <form id="fMaq" autocomplete="off">
      <label class="f"><span>Nome (aparece na aba)</span><input class="in" name="nome" required placeholder="Ex.: Caterpillar 924" value="${esc(m.nome||'')}"></label>
      <label class="f"><span>Categoria <em>(define o checklist da OS)</em></span><select class="in" name="categoria">${Object.entries(CATS).map(([k,v])=>`<option value="${k}" ${m.categoria===k?'selected':''}>${esc(v.nome)}</option>`).join('')}</select></label>
      <label class="f"><span>Modelo / descrição curta</span><input class="in" name="tipo" placeholder="Ex.: Pá carregadeira • Amarela" value="${esc(m.tipo||'')}"></label>
      <div class="grid2">
        <label class="f"><span>Ano</span><input class="in" name="ano" inputmode="numeric" placeholder="Ex.: 2012" value="${esc(m.ano||'')}"></label>
        <label class="f only-maq"><span>Nº de série</span><input class="in" name="serie" placeholder="Nº de série / PIN" value="${esc(m.serie||'')}"></label>
        <label class="f only-veic"><span>Placa</span><input class="in" name="placa" placeholder="ABC1D23" value="${esc(m.placa||'')}" style="text-transform:uppercase"></label>
      </div>
      <label class="f only-veic"><span>Chassi</span><input class="in" name="chassi" placeholder="Nº do chassi" value="${esc(m.chassi||'')}" style="text-transform:uppercase"></label>
      <label class="f"><span>Descrição</span><textarea class="in" name="descricao" rows="2" placeholder="Cor, observações…">${esc(m.descricao||'')}</textarea></label>
      <div class="grid2">
        <label class="f"><span>Controle por</span><select class="in" name="medidor"><option value="h" ${m.medidor!=='km'?'selected':''}>Horímetro (h)</option><option value="km" ${m.medidor==='km'?'selected':''}>Hodômetro (km)</option></select></label>
        <label class="f"><span>Leitura atual</span><input class="in" name="leituraAtual" inputmode="decimal" placeholder="opcional" value="${esc(fmtNum(m.leituraAtual))}"></label>
      </div>
      <h3 class="sec">Documentos e vencimentos</h3>
      <p class="note">Preencha a <b>data de vencimento</b> e/ou a <b>próxima leitura</b> (horas ou km). O status é automático; se precisar, force <b>Em dia</b> ou <b>Vencido</b>.</p>
      <div id="docEd"></div>
      <button type="button" class="btn ghost" id="docAdd">＋ Adicionar item</button>
      <h3 class="sec">Foto</h3>
      <div class="photo-pick" id="pFoto"></div><br>
      <button class="btn pri" type="submit">💾 Salvar equipamento</button>
      ${ed?`<br><button type="button" class="btn danger" id="bDelM">🗑️ Remover equipamento</button>`:''}
    </form>`);
  const f=$('#fMaq',body);
  const tog=()=>{ const v=isVeic({categoria:f.categoria.value}); body.querySelectorAll('.only-veic').forEach(e=>e.hidden=!v); body.querySelectorAll('.only-maq').forEach(e=>e.hidden=v); };
  f.categoria.onchange=()=>{ tog(); if(!ed && !docs.some(d=>d.vence||d.prox)){ docs=docsPadrao(f.categoria.value); renderDocs(); } };
  tog();
  function renderDocs(){
    $('#docEd',body).innerHTML = docs.map((d,i)=>`<div class="doc-ed" data-i="${i}">
      <div class="de-top"><input class="in" data-k="nome" value="${esc(d.nome)}" placeholder="Item (ex.: Seguro)"><button type="button" class="pc-rm" aria-label="Remover">✕</button></div>
      <div class="de-row"><label><small>Vence em</small><input class="in" type="date" data-k="vence" value="${esc(d.vence||'')}"></label>
      <label><small>Próx. leitura</small><input class="in" data-k="prox" inputmode="decimal" placeholder="h / km" value="${esc(fmtNum(d.prox))}"></label>
      <label><small>Status</small><select class="in" data-k="override"><option value="">Automático</option><option value="ok" ${d.override==='ok'?'selected':''}>Em dia</option><option value="vencido" ${d.override==='vencido'?'selected':''}>Vencido</option></select></label></div></div>`).join('') || `<p class="note">Nenhum item.</p>`;
    $('#docEd',body).querySelectorAll('.doc-ed').forEach(el=>{ const i=+el.dataset.i;
      el.querySelectorAll('[data-k]').forEach(inp=>inp.oninput=inp.onchange=()=>{ const k=inp.dataset.k; docs[i][k]= k==='prox'?parseBR(inp.value):inp.value; });
      el.querySelector('.pc-rm').onclick=()=>{ docs.splice(i,1); renderDocs(); }; });
  }
  renderDocs();
  $('#docAdd',body).onclick=()=>{ docs.push({id:uid(),nome:'',vence:'',prox:null,override:'',obs:''}); renderDocs(); const l=$('#docEd',body).querySelectorAll('.doc-ed'); l[l.length-1]?.querySelector('input')?.focus(); };
  const pf=photoPicker($('#pFoto',body),{multi:false, initial:m.foto?[m.foto]:[], label:'Câmera'});
  f.onsubmit=async e=>{
    e.preventDefault(); const foto=pf.get()[0]||null; const veic=isVeic({categoria:f.categoria.value});
    const obj={...m, id:m.id||('m-'+uid()), nome:f.nome.value.trim(), categoria:f.categoria.value, tipo:f.tipo.value.trim(), descricao:f.descricao.value.trim(),
      ano:f.ano.value.trim(), serie:veic?(m.serie||''):f.serie.value.trim(), placa:veic?f.placa.value.trim().toUpperCase():(m.placa||''), chassi:veic?f.chassi.value.trim().toUpperCase():(m.chassi||''),
      medidor:f.medidor.value, leituraAtual:parseLeitura(f.leituraAtual.value), foto,
      docs:docs.filter(d=>d.nome.trim()).map(d=>({...d, nome:d.nome.trim()})),
      ordem: m.ordem ?? (Math.max(-1,...maquinas.map(x=>x.ordem??0))+1)};
    if(foto!==m.foto) obj.credito=null;
    await put('maquinas',obj); fechar(); toast('Equipamento salvo ✔'); await loadMaquinas(); await calcAlertas(); selecionar(obj.id);
  };
  if(ed) $('#bDelM',body).onclick=async()=>{
    const n=(await revsOf(m.id)).length;
    if(!confirm(`Remover "${m.nome}"${n?` e seus ${n} registros (OS/revisões)`:''}? Isso não pode ser desfeito.`)) return;
    for(const r of await revsOf(m.id)) await del('revisoes',r.id);
    await del('maquinas',m.id); fechar(); await loadMaquinas(); await calcAlertas(); toast('Equipamento removido');
    selecionar('__home');
  };
}

/* ---------- menu / backup ---------- */
function menu(){
  const body=abrir('Menu', `<div class="stack menu-list">
    <button class="btn ghost" id="mHome">🏠 Todos os equipamentos</button>
    <button class="btn ghost" id="mAl">⚠️ Alertas de vencimento</button>
    <button class="btn ghost" id="mAdd">＋ Adicionar equipamento</button>
    <button class="btn ghost" id="mExp">⬇️ Exportar backup (arquivo)</button>
    <button class="btn ghost" id="mImp">⬆️ Importar backup</button>
    <button class="btn ghost" id="mInst">📱 Instalar na tela inicial</button>
    <button class="btn ghost" id="mCred">ℹ️ Sobre e créditos das fotos</button>
    <input type="file" id="impFile" accept="application/json,.json" hidden>
    <p class="note">⚠️ Os dados ficam salvos <b>somente neste aparelho/navegador</b>. Use <b>Exportar backup</b> com frequência para guardar uma cópia ou passar para outro celular.</p>
  </div>`);
  $('#mHome',body).onclick=()=>{ fechar(); selecionar('__home'); };
  $('#mAl',body).onclick=()=>{ fechar(); selecionar('__alertas'); };
  $('#mAdd',body).onclick=()=>formMaquina();
  $('#mExp',body).onclick=()=>{ fechar(); exportar(); };
  $('#mImp',body).onclick=()=>$('#impFile',body).click();
  $('#impFile',body).onchange=e=>{ const f=e.target.files[0]; if(f) importar(f); };
  $('#mInst',body).onclick=instalar;
  $('#mCred',body).onclick=creditos;
}
const BLOB_FIELDS=['fotoMedidor','assinaturaMec','assinaturaResp'];
async function exportar(){
  toast('Gerando backup…');
  const maqs=await getAll('maquinas'), revs=await getAll('revisoes');
  const enc=async b=> (b && typeof b!=='string') ? await blobToDataURL(b) : b;
  const encR=async r=>{ const o={...r, fotosMaquina:await Promise.all((r.fotosMaquina||[]).map(enc))}; for(const k of BLOB_FIELDS) o[k]=await enc(r[k]); return o; };
  const data={app:'controle-frota', versao:2, exportadoEm:new Date().toISOString(), osSeq:(await getOne('meta','osSeq'))?.v||0,
    maquinas: await Promise.all(maqs.map(async m=>({...m, foto:await enc(m.foto)}))),
    revisoes: await Promise.all(revs.map(encR))};
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
  if(!confirm(`Importar ${data.maquinas?.length||0} equipamentos e ${data.revisoes?.length||0} registros (OS/revisões)?\nRegistros com o mesmo ID serão substituídos; os demais são mantidos.`)) return;
  const dec=async v=> (typeof v==='string' && v.startsWith('data:')) ? await dataURLToBlob(v) : v;
  for(const m of data.maquinas||[]) await put('maquinas',{...m, foto:await dec(m.foto)});
  let maxOS=(await getOne('meta','osSeq'))?.v||0;
  for(const r of data.revisoes||[]){ const o={...r, fotosMaquina:await Promise.all((r.fotosMaquina||[]).map(dec))}; for(const k of BLOB_FIELDS) o[k]=await dec(r[k]); await put('revisoes',o); if(o.tipo==='os') maxOS=Math.max(maxOS,o.numero||0); }
  await put('meta',{k:'osSeq',v:Math.max(maxOS,data.osSeq||0)});
  await put('meta',{k:'seeded',v:true});
  await migrar();
  fechar(); toast('Backup importado ✔'); await loadMaquinas(); await calcAlertas(); selecionar(atual && (atual.startsWith('__')||maquinas.some(x=>x.id===atual))?atual:'__home');
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
  abrir('Sobre', `<div class="block"><b>BM Sistemas — Controle de Frota</b> v${APP_VERSION}<br>Ordens de serviço com checklist, assinatura e PDF; revisões com fotos, horímetro/hodômetro, mecânico e custos; documentos e alertas de vencimento. Funciona offline.</div>
    <div class="block"><small>Onde ficam os dados</small>Tudo é salvo no próprio aparelho (no navegador). Se limpar os dados do navegador ou trocar de celular, os registros não vão junto — faça <b>Exportar backup</b> e depois <b>Importar backup</b> no outro aparelho.</div>
    <h3 class="sec">Créditos das fotos (Wikimedia Commons)</h3>
    <ul class="credits">${DEFAULT_MACHINES.filter(m=>m.credito).map(m=>`<li><b>${esc(m.nome)}</b>${m.credito.aprox?' <span class="pill prox">aproximada</span>':''}: ${esc(m.credito.autor)} — ${esc(m.credito.licenca)}. ${esc(m.credito.obs)} <a href="${esc(m.credito.url)}" target="_blank" rel="noopener">Ver original</a></li>`).join('')}<li><b>W20E</b>, <b>Saveiro quadrada</b>, <b>Hilux STD</b>, <b>F-250 XL 2010</b>, <b>JCB 426EX</b> e <b>Axor 2644</b>: foto própria (BM Sistemas).</li></ul>
    <p class="note">Fotos marcadas como <b>aproximada</b> são ilustrativas — troque pela foto real no ✎ de cada equipamento. Licenças CC BY / CC BY-SA exigem atribuição.</p>
    <p class="note">PDF gerado com jsPDF (licença MIT), incluído no app para funcionar offline.</p>`);
}

/* ---------- init ---------- */
$('#btnMenu').onclick=menu;
(async()=>{
  try{ await seed(); await migrar(); await loadMaquinas(); await calcAlertas(); }catch(e){ $('#main').innerHTML=`<div class="wrap"><div class="empty">Não foi possível abrir o banco de dados do navegador.<br>${esc(e)}</div></div>`; return; }
  const saved=localStorage.getItem('frota.atual');
  atual = (saved==='__home'||saved==='__alertas'||maquinas.some(m=>m.id===saved)) ? saved : '__home';
  renderTabs(); renderMain(); mostrarBanner();
  if(navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(()=>{});
  if('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(()=>{});
  notificar();
})();
