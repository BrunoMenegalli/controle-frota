# BM Sistemas — Controle de Frota

App web (PWA) para registrar revisões e manutenção da frota pelo celular: foto do horímetro/hodômetro, fotos da máquina, data, leitura, mecânico, custo, peças trocadas e observações. Uma aba por máquina, histórico com total gasto, compartilhamento (WhatsApp / menu do celular) e backup em arquivo.

- **Ordem de Serviço (OS)** estilo concessionária: numeração sequencial (OS 0001), entrada/saída, solicitante, mecânico (obrigatório), checklist por tipo de equipamento (OK / Não OK / N/A + observação), peças e serviços com valores, mão de obra, total, fotos e assinatura na tela (mecânico e responsável). Botão **Gerar PDF** (A4) para compartilhar ou imprimir.
- **Dados do equipamento**: ano, nº de série (máquinas), placa e chassi (veículos).
- **Documentos e vencimentos** (CRLV, seguro, IPVA, tacógrafo, revisão, troca de óleo, NR-12, itens livres) por data e/ou horímetro/km, com status automático ou manual e **alertas** (abas, tela Alertas, aviso ao abrir o app).
- Tela inicial com todos os equipamentos e selos de alerta.
- Funciona offline e pode ser instalado na tela inicial.
- **Os dados ficam salvos no próprio aparelho** (IndexedDB do navegador). Use *Menu → Exportar backup* para guardar uma cópia ou passar para outro celular (*Importar backup*).

Fotos das máquinas: Wikimedia Commons — créditos e licenças em *Menu → Sobre e créditos das fotos* e em `CREDITOS.md`.

Ícone: monograma BM (fonte Outfit, SIL OFL, convertida em curvas) — fonte em `icons/src/`.


## Sincronização na nuvem (v2.2)

Com login (e-mail e senha), o celular e o computador passam a mostrar os mesmos equipamentos, OS, fotos, assinaturas e vencimentos. Os dados continuam em cache no aparelho (IndexedDB) e funcionam offline; ao reconectar, a fila é enviada.

Backend: projeto gratuito **Supabase** (`bm-sistemas`, região São Paulo). O script `supabase-setup.sql` documenta tabelas, RLS e o bucket privado `frota-media`. Um workflow (`supabase-keepalive.yml`) pinga a API toda segunda-feira para o projeto gratuito não pausar após 7 dias parado.

Acesso: só quem está em `frota_membros` com status ativo entra nos dados. O administrador (Bruno) libera ou bloqueia pessoas em **Gerenciar acessos**. Quem é bloqueado deixa de ver a frota na hora.

Valores (custos, mão de obra, peças, totais e notas fiscais) vêm mascarados como **R$ ****** para todo mundo, inclusive o administrador, até ele tocar em **Mostrar valores** e informar o PIN. A liberação vale só na sessão, cerca de 10 minutos, ou até fechar o app. Os valores reais não ficam no aparelho enquanto estão ocultos (só chegam depois do PIN, pela API). Membros nunca desbloqueiam. O PIN pode ser trocado em **Alterar PIN**. Documentos de nota fiscal continuam só para o administrador (placeholder com cadeado para os demais).

Menu **Aparelhos conectados** lista os dispositivos que já entraram, com horário de Belém, e permite apelido ou remoção.

Se esquecer a senha, use **Esqueci a senha**: chega um e-mail com link para **Criar nova senha** neste mesmo app.
