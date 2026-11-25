'use strict';
/* Configuração da nuvem (Supabase).
 * A anon/publishable key é pública por desenho (já protegida por login + RLS).
 * Nunca coloque a service_role key neste arquivo. */
window.CLOUD_CONFIG = {
  enabled: true,
  url: 'https://qpusgufqswkdlscmwsyl.supabase.co',
  anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFwdXNndWZxc3drZGxzY213c3lsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTU1NzYyNjcsImV4cCI6MjExMTE1MjI2N30.1bSBCj6m7w98FHXWfc9MOnJQDKe_hqI3xdue8hoyAXc',
  bucket: 'frota-media',
};
