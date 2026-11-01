# IA migrada para Python

O classificador JavaScript anterior foi removido. O treinamento e a inferência agora estão em `ai/triage_model.py`, com API em `ai/service.py`.

O backend consulta essa API por `backend/clienteIAPython.js`. O armazenamento da avaliação e das revisões permanece em `backend/triagemIA.js`.

Consulte [a documentação da IA Python](../../ai/README.md) para inicialização, configuração, limites e testes.
