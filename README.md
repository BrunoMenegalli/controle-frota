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
