# TriAqui

O TriAqui é uma plataforma de gestão de consultas e triagem clínica. Foi construída sobre a estrutura React + Node.js + Express + MySQL do MindU, adaptando-a para três fluxos principais: agendamento do paciente, triagem indicativa e gestão operacional da fila.

## Funcionalidades

- Login com senha criptografada, token de sessão e permissões por perfil.
- Publicação e bloqueio de horários pela equipe, com atendimentos de 30 minutos.
- Agendamento, histórico, cancelamento e reagendamento persistentes no MySQL.
- Proteção contra reservas simultâneas da mesma vaga e conflitos de agenda do paciente.
- Triagem com sugestão de IA local experimental, confirmação ou alteração pelo médico e histórico das revisões.
- Fila por prioridade e ordem de entrada; realocação automática ao liberar uma consulta futura.
- Notificações internas, requerimentos médicos, atualização de perfil e dúvidas frequentes.
- Painel atualizado automaticamente a cada 20 segundos, preservando o layout ACEX e o modo noturno.

O paciente preenche os sintomas; um classificador de IA local em Python sugere a prioridade e o médico pode confirmar ou alterar essa sugestão. O Node consulta a API Python local na porta 8001. A classificação original e as revisões ficam preservadas. O modelo é demonstrativo, treinado com exemplos fictícios e sem validação clínica; detalhes em `ai/README.md`. A IA atualiza a prioridade provisória da fila imediatamente; a revisão médica permanece obrigatória e pode modificar a prioridade. Documentos médicos são solicitados e acompanhados no portal; emissão e assinatura são feitas pela unidade.

## Executar

Clone o projeto:

```bash
git clone https://github.com/EmyAndrade/TriAqui.git
cd TriAqui
```

Copie `backend/.env.example` para `backend/.env`, preencha as credenciais locais e importe `database/triaqui.sql` no MySQL antes de iniciar. O arquivo `.env` não é enviado ao GitHub.

```bash
cd frontend
npm install
npm start
```

Em outra janela:

```bash
cd backend
npm install
node server.js
```

O backend inicia a API de IA em Python automaticamente. É necessário Python 3.10 ou superior; se necessário, configure o caminho do interpretador em `TRIAQUI_PYTHON`, no `backend/.env`. O serviço usa somente a biblioteca padrão, sem instalação de pacotes adicionais.

O portal exige conexão com o MySQL. Primeiro, entre como Equipe e publique horários em **Disponibilidade**. Depois, entre como Paciente e selecione esses horários em **Agendar**. Os registros não desaparecem ao reiniciar o servidor. A fila e as notificações podem ser acompanhadas em suas respectivas telas.

As rotas do portal estão em `backend/routesPortalTriAqui.js`, sob `/api/triaqui`. As operações protegidas exigem o token retornado por `POST /sessao`, no cabeçalho `Authorization: Bearer TOKEN`. O cadastro é público; o paciente acessa os próprios dados; profissionais alteram a própria agenda; a administração não acessa sintomas nem requerimentos clínicos.

Para manter as sessões válidas após reiniciar o backend, configure `TRIAQUI_JWT_SECRET` no ambiente com um segredo aleatório privado. Sem essa variável, um segredo é gerado a cada inicialização e será necessário entrar novamente após o reinício.

### Verificação

No diretório `backend`, execute `npm test`. O comando `npm run test:integration` cria um banco temporário `triaqui_test_*`, testa os fluxos com dados fictícios e remove somente esse banco ao finalizar. O usuário MySQL de teste precisa ter permissão de criação e remoção de bancos. O banco `triaqui_db` não é usado pelos testes de integração.

## Banco de dados TriAqui

O esquema MySQL está em `database/triaqui.sql`. Ele cria o banco `triaqui_db`, dados de demonstração e as tabelas de usuários, profissionais, especialidades, disponibilidades, consultas, triagens, fila de espera, notificações e auditoria.

Defina as credenciais locais a partir de `backend/.env.example` e execute:

```bash
"C:\\Program Files\\MySQL\\MySQL Server 8.0\\bin\\mysql.exe" -u root -p < database/triaqui.sql
```

Após a importação, os endpoints do TriAqui passam a consultar o MySQL em vez dos dados em memória.
