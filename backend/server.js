const express = require('express');
const cors = require('cors');

// Importa as rotas
const rotaTriAqui = require('./routesPortalTriAqui');

// Cria uma instância do Express
const app = express();
const port = 3001; // Define a porta que deseja utilizar

// Configura o corpo das requisições e o CORS.
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));


// Usa as rotas do backend
app.use('/api/triaqui', rotaTriAqui);

app.use((error, _req, res, _next) => {
  console.error('Erro do backend:', error.code || error.message);
  res.status(500).json({ mensagem: 'Não foi possível acessar o banco de dados. Verifique a configuração do backend.' });
});

// Responde às rotas não definidas.
app.use('/', (req, res) => {
  res.status(404).send('Rota não encontrada');
});

// Inicia o servidor
async function start() {
  let python;
  try {
    python=await require('./servicoPython').startPythonService();
    console.log(python.disabled?'IA Python desativada.':'IA Python disponível em '+python.url);
  } catch(error) {
    console.warn('IA Python indisponível: '+error.message);
  }
  const server=app.listen(port,()=>console.log(`Servidor está rodando na porta ${port}`));
  for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>{
    if(python?.child)python.child.kill();
    server.close(()=>process.exit(0));
  });
}
if(require.main===module)start();


module.exports = app;
