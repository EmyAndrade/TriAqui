const express = require('express');
const bcrypt = require('bcrypt');
const db = require('./db');
const { normalizarDocumento } = require('./validacaoCadastro');

const router = express.Router();

function prioridade(sintomas) {
  if (sintomas.some((item) => /respirar|dor intensa|desmaio/i.test(item))) return 'alta';
  if (sintomas.length >= 2) return 'moderada';
  return 'baixa';
}

router.post('/sessao', async (req, res, next) => {
  try {
    const documento = normalizarDocumento(req.body.documento);
    const senha = String(req.body.senha || '');
    const perfil = req.body.perfil === 'staff' ? ['profissional', 'administrativo'] : ['paciente'];
    if (!documento || !senha) return res.status(400).json({ mensagem: 'Informe CPF/CNPJ e senha.' });

    const [[usuario]] = await db.query(
      'SELECT id, nome, documento, email, perfil, senha_hash FROM usuarios WHERE documento = ? AND perfil IN (?) AND ativo = TRUE',
      [documento, perfil],
    );
    if (!usuario || !(await bcrypt.compare(senha, usuario.senha_hash))) {
      return res.status(401).json({ mensagem: 'CPF/CNPJ, perfil ou senha inválidos.' });
    }
    delete usuario.senha_hash;
    res.json({ usuario });
  } catch (error) { next(error); }
});

router.get('/dashboard', async (_req, res, next) => {
  try {
    const [[atendimentos], [tempo], [agenda], [fila]] = await Promise.all([
      db.query("SELECT COUNT(*) AS total FROM consultas WHERE DATE(inicio) = CURDATE() AND status NOT IN ('cancelada', 'vaga_liberada')"),
      db.query("SELECT COALESCE(ROUND(AVG(TIMESTAMPDIFF(MINUTE, entrada_em, NOW()))), 0) AS minutos FROM fila_espera WHERE status = 'aguardando'"),
      db.query(`SELECT c.id, DATE_FORMAT(c.inicio, '%H:%i') AS horario, COALESCE(u.nome, 'Vaga liberada') AS paciente,
                       e.nome AS especialidade, c.status
                  FROM consultas c
                  JOIN especialidades e ON e.id = c.especialidade_id
                  LEFT JOIN usuarios u ON u.id = c.paciente_id
                 WHERE DATE(c.inicio) = CURDATE()
                 ORDER BY c.inicio`),
      db.query(`SELECT f.id, u.nome AS paciente, COALESCE(t.descricao, 'Aguardando atendimento') AS motivo,
                       f.prioridade, TIMESTAMPDIFF(MINUTE, f.entrada_em, NOW()) AS esperaMinutos
                  FROM fila_espera f
                  JOIN usuarios u ON u.id = f.paciente_id
                  LEFT JOIN triagens t ON t.id = f.triagem_id
                 WHERE f.status = 'aguardando'
                 ORDER BY FIELD(f.prioridade, 'emergencia', 'alta', 'moderada', 'baixa'), f.entrada_em`),
    ]);

    res.json({ atendimentosHoje: atendimentos[0].total, tempoMedioEspera: tempo[0].minutos, agenda, fila });
  } catch (error) { next(error); }
});

router.post('/triagem', async (req, res, next) => {
  try {
    const { pacienteId, sintomas = [], descricao = '' } = req.body;
    if (!Number.isInteger(pacienteId) || !Array.isArray(sintomas)) {
      return res.status(400).json({ mensagem: 'pacienteId e sintomas são obrigatórios.' });
    }
    const classificacao = prioridade(sintomas);
    const [result] = await db.query(
      'INSERT INTO triagens (paciente_id, sintomas, descricao, prioridade) VALUES (?, ?, ?, ?)',
      [pacienteId, JSON.stringify(sintomas), descricao, classificacao],
    );
    const [[triagem]] = await db.query('SELECT * FROM triagens WHERE id = ?', [result.insertId]);
    res.status(201).json({ triagem, mensagem: 'Triagem recebida e enviada para avaliação da equipe.' });
  } catch (error) { next(error); }
});

router.post('/realocacoes/:vagaId', async (req, res, next) => {
  try {
    const vagaId = Number(req.params.vagaId);
    if (!Number.isInteger(vagaId)) return res.status(400).json({ mensagem: 'Identificador de vaga inválido.' });
    await db.query('CALL realocar_proximo_paciente(?)', [vagaId]);
    const [[vaga]] = await db.query(`SELECT c.id, DATE_FORMAT(c.inicio, '%H:%i') AS horario, u.nome AS paciente,
      c.status FROM consultas c JOIN usuarios u ON u.id = c.paciente_id WHERE c.id = ?`, [vagaId]);
    res.json({ vaga, mensagem: 'Paciente realocado e notificado com sucesso.' });
  } catch (error) {
    if (error.sqlState === '45000') return res.status(409).json({ mensagem: error.sqlMessage });
    next(error);
  }
});

module.exports = router;
