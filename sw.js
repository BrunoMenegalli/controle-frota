const CACHE='bm-sistemas-v7';
const ASSETS=['./','index.html','app.css','app.js','manifest.webmanifest','icons/icon-192.png','icons/icon-512.png','icons/icon-maskable-192.png','icons/icon-maskable-512.png','icons/apple-touch-icon.png','icons/favicon-32.png','icons/favicon-16.png','icons/src/bm-icon.svg',
 'img/volvo-l90.jpg','img/case-w20e-bm.jpg','img/saveiro-bm.jpg','img/hilux-std-bm.jpg','img/f250-bm.jpg','img/jcb-426.jpg','img/axor-2644-bm.jpg'];
self.addEventListener('install',e=>{ e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting())); });
self.addEventListener('activate',e=>{ e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())); });
self.addEventListener('fetch',e=>{
  const req=e.request; if(req.method!=='GET' || new URL(req.url).origin!==location.origin) return;
  // rede primeiro para HTML/JS/CSS (pega atualizações), cache como reserva offline; imagens: cache primeiro
  const isImg=/\.(png|jpe?g|webp)$/i.test(new URL(req.url).pathname);
  if(isImg){ e.respondWith(caches.match(req).then(r=>r||fetch(req).then(res=>{ const cp=res.clone(); caches.open(CACHE).then(c=>c.put(req,cp)); return res; }))); return; }
  e.respondWith(fetch(req).then(res=>{ const cp=res.clone(); caches.open(CACHE).then(c=>c.put(req,cp)); return res; })
    .catch(()=>caches.match(req,{ignoreSearch:true}).then(r=>r||caches.match('index.html'))));
});
