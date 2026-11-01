const mysql = require('mysql2/promise');
const path = require('path');
const { loadEnv } = require('./envConfig');

const envFile = path.join(__dirname, '.env');
loadEnv(envFile);

// Configuração das credenciais de acesso ao banco de dados
const dbConfig = {
  host: process.env.TRIAQUI_DB_HOST || 'localhost',
  port: Number(process.env.TRIAQUI_DB_PORT || 3306),
  user: process.env.TRIAQUI_DB_USER || 'root',
  password: process.env.TRIAQUI_DB_PASSWORD,
  database: process.env.TRIAQUI_DB_NAME || 'triaqui_db'
};

// Criação do pool de conexões com o banco de dados
const connection = mysql.createPool(dbConfig);

// Exporta o pool de conexões para uso em outras partes da aplicação
module.exports = connection;

