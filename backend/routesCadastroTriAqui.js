const express = require('express');
const bcrypt = require('bcrypt');
const db = require('./db');
const { normalizarDocumento, digitos, erroCadastro } = require('./validacaoCadastro');
const router = express.Router();
let schemaReady;

// Complemento separado para preservar os usuários já cadastrados.
function prepararCadastro() {
  if (!schemaReady) schemaReady = db.query(`CREATE TABLE IF NOT EXISTS usuarios_cadastro (
    usuario_id BIGINT UNSIGNED PRIMARY KEY,
    tipo ENUM('paciente','profissional','instituicao') NOT NULL,
    cep CHAR(8) NOT NULL,
    uf CHAR(2) NOT NULL,
    cidade VARCHAR(150) NOT NULL,
    bairro VARCHAR(150) NOT NULL DEFAULT '',
    rua VARCHAR(150) NOT NULL,
    numero VARCHAR(150) NOT NULL,
    complemento VARCHAR(150) NOT NULL DEFAULT '',
    responsavel VARCHAR(150) NOT NULL DEFAULT '',
    sala VARCHAR(150) NOT NULL DEFAULT '',
    CONSTRAINT fk_cadastro_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
  ) ENGINE=InnoDB`).catch((error) => { schemaReady = null; throw error; });
  return schemaReady;
}

router.post('/cadastro', async (req, res, next) => {
  const data = req.body;
  const erro = erroCadastro(data);
  if (erro) return res.status(422).json({ mensagem: erro });
  let conn;
  try {
    await prepararCadastro();
    const hash = await bcrypt.hash(data.senha, 12);
    conn = await db.getConnection();
    await conn.beginTransaction();
    const perfil = data.tipo === 'instituicao' ? 'administrativo' : data.tipo;
    const [created] = await conn.execute(
      'INSERT INTO usuarios (nome,documento,email,telefone,data_nascimento,senha_hash,perfil) VALUES (?,?,?,?,?,?,?)',
      [data.nome.trim(), normalizarDocumento(data.documento), data.email.trim().toLowerCase(), digitos(data.telefone), data.tipo === 'instituicao' ? null : data.nascimento || null, hash, perfil],
    );
    await conn.execute(`INSERT INTO usuarios_cadastro (usuario_id,tipo,cep,uf,cidade,bairro,rua,numero,complemento,responsavel,sala)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    [created.insertId, data.tipo, digitos(data.cep), data.uf, data.cidade.trim(), data.bairro || '', data.rua.trim(), data.numero.trim(), data.complemento || '', data.responsavel || '', data.sala || '']);
    if (data.tipo === 'profissional') {
      const [professional] = await conn.execute('INSERT INTO profissionais (usuario_id,registro_profissional,unidade) VALUES (?,?,?)', [created.insertId, data.crm.trim(), data.unidade || 'Unidade Centro']);
      await conn.execute('INSERT INTO especialidades (nome) VALUES (?) ON DUPLICATE KEY UPDATE nome=VALUES(nome)', [data.especialidade.trim()]);
      await conn.execute('INSERT INTO profissional_especialidades (profissional_id,especialidade_id) SELECT ?,id FROM especialidades WHERE nome=?', [professional.insertId, data.especialidade.trim()]);
    }
    await conn.commit();
    res.status(201).json({ mensagem: 'Cadastro concluído. Entre com seu documento e senha.', usuario: { id: created.insertId, nome: data.nome.trim(), perfil } });
  } catch (error) {
    if (conn) await conn.rollback();
    if (error.code === 'ER_DUP_ENTRY') return res.status(409).json({ mensagem: 'Documento, e-mail ou CRM já cadastrado. Utilize outra conta ou entre no portal.' });
    next(error);
  } finally { if (conn) conn.release(); }
});
module.exports = router;
