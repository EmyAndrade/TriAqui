const db = require('./db');
const { evaluate } = require('./clienteIAPython');
let ready;

function ensureIASchema() {
  if (!ready) ready = (async()=>{
    await db.query(`CREATE TABLE IF NOT EXISTS triagens_ia (
      triagem_id BIGINT UNSIGNED PRIMARY KEY,
      estado ENUM('avaliada_ia','sem_resultado','falha') NOT NULL,
      modelo VARCHAR(100) NOT NULL,
      versao VARCHAR(64) NOT NULL,
      prioridade_sugerida ENUM('baixa','moderada','alta','emergencia') NULL,
      resumo TEXT NOT NULL,
      sinais JSON NOT NULL,
      avaliada_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_triagem_ia FOREIGN KEY(triagem_id) REFERENCES triagens(id)
    ) ENGINE=InnoDB`);
    await db.query(`CREATE TABLE IF NOT EXISTS triagens_revisoes (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      triagem_id BIGINT UNSIGNED NOT NULL,
      profissional_id BIGINT UNSIGNED NOT NULL,
      prioridade_anterior ENUM('baixa','moderada','alta','emergencia') NOT NULL,
      prioridade_nova ENUM('baixa','moderada','alta','emergencia') NOT NULL,
      justificativa VARCHAR(1000) NOT NULL DEFAULT '',
      criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_revisao_triagem FOREIGN KEY(triagem_id) REFERENCES triagens(id),
      CONSTRAINT fk_revisao_profissional FOREIGN KEY(profissional_id) REFERENCES usuarios(id)
    ) ENGINE=InnoDB`);
  })().catch(error=>{ready=null;throw error;});
  return ready;
}

async function saveEvaluation(conn, triageId, evaluation) {
  await conn.execute('INSERT INTO triagens_ia(triagem_id,estado,modelo,versao,prioridade_sugerida,resumo,sinais) VALUES (?,?,?,?,?,?,?)',
    [triageId,evaluation.estado,evaluation.modelo,evaluation.versao,evaluation.prioridade,evaluation.resumo,JSON.stringify(evaluation.sinais)]);
}
module.exports = { ensureIASchema,evaluate,saveEvaluation };
