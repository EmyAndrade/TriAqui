# IA de triagem em Python

O treinamento, a preparação de texto e a inferência do classificador multinomial Naive Bayes são executados em Python, em `triage_model.py`. A API HTTP está em `service.py`; o backend Node apenas envia sintomas/descrição e armazena o resultado no MySQL.

## Iniciar

Inicie o backend normalmente com `npm start`, no diretório `backend`. Ele inicia automaticamente o serviço Python em `http://127.0.0.1:8001` ou reutiliza uma instância deste mesmo serviço já em execução.

Para iniciar apenas a IA:

```powershell
cd backend
npm run ia
```

Também é possível abrir `ai/start.bat` ou executar, com Python 3.10 ou superior:

```powershell
python ai/service.py --port 8001
```

O serviço usa somente a biblioteca padrão do Python; não depende de instalação de pacotes com pip. O iniciador procura uma instalação Python local e, neste computador, também encontra o Python disponibilizado pelo ambiente de desenvolvimento.

## Configuração opcional em backend/.env

```env
TRIAQUI_PYTHON=C:/caminho/para/python.exe
TRIAQUI_AI_URL=http://127.0.0.1:8001
TRIAQUI_AI_TIMEOUT_MS=3000
TRIAQUI_AI_ENABLED=true
```

Não configure `TRIAQUI_PYTHON` se o iniciador já encontrar o interpretador. Uma porta ocupada por outro serviço, incluindo o serviço antigo de regras do ACEX, não é encerrada pelo TriAqui. Nesse caso, use uma porta livre em `TRIAQUI_AI_URL` ou inicie explicitamente a nova API Python na porta escolhida.

## API

- `GET /health`: identifica o serviço, a linguagem Python, a versão do modelo e o uso experimental.
- `POST /predict`: recebe `sintomas` (lista de textos) e `descricao` (texto). Retorna estado, prioridade sugerida, identificação do modelo, hash da versão, resumo e termos reconhecidos.

A API escuta somente em `127.0.0.1`. Ela não acessa o MySQL e não recebe nome, CPF, senha ou endereço. Não há envio para serviços de IA externos.

O front continua acessando apenas o Node na porta 3001. O Node chama o Python pela API. Se o Python não responder, a triagem é salva como pendente e não é marcada como “Avaliada por IA”. Não existe fallback para classificador JavaScript.

## Limites e revisão médica

O corpus contém 32 exemplos inteiramente fictícios. Este é um modelo educacional sem validação clínica, não um protocolo de triagem nem um modelo pronto para atendimento real. O modelo se abstém quando há pouca informação, ambiguidade ou negações não suportadas; isso não elimina todos os riscos de classificação.

A sugestão aparece como “Avaliada por IA” e aguarda revisão médica. O médico confirma ou altera a prioridade, com justificativa para mudanças. A sugestão original e as revisões são preservadas. A sugestão da IA altera imediatamente a prioridade provisória da fila, mantendo a revisão médica pendente. O médico pode confirmar ou substituir essa prioridade posteriormente.

As versões anteriores de avaliações permanecem no banco com seu identificador original. Novas avaliações são identificadas por `triaqui-nb-python-sintetico-v2`.

## Testes

No diretório `backend`:

```powershell
npm run test:python
npm test
npm run test:integration
```

Os testes Python cobrem treinamento, inferência, validação e endpoints HTTP. Os testes Node verificam o cliente HTTP e a indisponibilidade do serviço. A integração usa a API Python real e um banco MySQL temporário, removido ao final sem alterar os registros do usuário.
