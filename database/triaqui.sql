-- TriAqui: esquema inicial MySQL 8+
SET NAMES utf8mb4;
CREATE DATABASE IF NOT EXISTS triaqui_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE triaqui_db;

CREATE TABLE IF NOT EXISTS usuarios (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  nome VARCHAR(150) NOT NULL,
  documento VARCHAR(18) NOT NULL,
  email VARCHAR(150) NOT NULL,
  telefone VARCHAR(20) NULL,
  data_nascimento DATE NULL,
  senha_hash VARCHAR(255) NOT NULL,
  perfil ENUM('paciente', 'profissional', 'administrativo') NOT NULL,
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_usuarios_documento (documento),
  UNIQUE KEY uq_usuarios_email (email)
) ENGINE=InnoDB;

-- Criado automaticamente também no primeiro cadastro pela API.
CREATE TABLE IF NOT EXISTS usuarios_cadastro (
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
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS especialidades (
  id SMALLINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  nome VARCHAR(100) NOT NULL,
  UNIQUE KEY uq_especialidades_nome (nome)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS profissionais (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  usuario_id BIGINT UNSIGNED NOT NULL,
  registro_profissional VARCHAR(40) NOT NULL,
  unidade VARCHAR(120) NOT NULL DEFAULT 'Unidade Centro',
  CONSTRAINT fk_profissionais_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id),
  UNIQUE KEY uq_profissionais_usuario (usuario_id),
  UNIQUE KEY uq_profissionais_registro (registro_profissional)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS profissional_especialidades (
  profissional_id BIGINT UNSIGNED NOT NULL,
  especialidade_id SMALLINT UNSIGNED NOT NULL,
  PRIMARY KEY (profissional_id, especialidade_id),
  CONSTRAINT fk_pe_profissional FOREIGN KEY (profissional_id) REFERENCES profissionais(id),
  CONSTRAINT fk_pe_especialidade FOREIGN KEY (especialidade_id) REFERENCES especialidades(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS disponibilidades (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  profissional_id BIGINT UNSIGNED NOT NULL,
  inicio DATETIME NOT NULL,
  fim DATETIME NOT NULL,
  status ENUM('disponivel', 'bloqueado') NOT NULL DEFAULT 'disponivel',
  CONSTRAINT fk_disponibilidades_profissional FOREIGN KEY (profissional_id) REFERENCES profissionais(id),
  CONSTRAINT chk_disponibilidade_periodo CHECK (fim > inicio),
  UNIQUE KEY uq_disponibilidade_profissional_inicio (profissional_id, inicio),
  KEY ix_disponibilidades_inicio (inicio, status)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS triagens (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  paciente_id BIGINT UNSIGNED NOT NULL,
  sintomas JSON NOT NULL,
  descricao TEXT NULL,
  prioridade ENUM('baixa', 'moderada', 'alta', 'emergencia') NOT NULL DEFAULT 'baixa',
  status ENUM('pendente', 'avaliada', 'encaminhada') NOT NULL DEFAULT 'pendente',
  avaliador_id BIGINT UNSIGNED NULL,
  criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  avaliado_em TIMESTAMP NULL,
  CONSTRAINT fk_triagens_paciente FOREIGN KEY (paciente_id) REFERENCES usuarios(id),
  CONSTRAINT fk_triagens_avaliador FOREIGN KEY (avaliador_id) REFERENCES usuarios(id),
  KEY ix_triagens_prioridade_status (prioridade, status, criado_em)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS triagens_ia (
  triagem_id BIGINT UNSIGNED PRIMARY KEY,
  estado ENUM('avaliada_ia','sem_resultado','falha') NOT NULL,
  modelo VARCHAR(100) NOT NULL,
  versao VARCHAR(64) NOT NULL,
  prioridade_sugerida ENUM('baixa','moderada','alta','emergencia') NULL,
  resumo TEXT NOT NULL,
  sinais JSON NOT NULL,
  avaliada_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_triagem_ia FOREIGN KEY(triagem_id) REFERENCES triagens(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS triagens_revisoes (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  triagem_id BIGINT UNSIGNED NOT NULL,
  profissional_id BIGINT UNSIGNED NOT NULL,
  prioridade_anterior ENUM('baixa','moderada','alta','emergencia') NOT NULL,
  prioridade_nova ENUM('baixa','moderada','alta','emergencia') NOT NULL,
  justificativa VARCHAR(1000) NOT NULL DEFAULT '',
  criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_revisao_triagem FOREIGN KEY(triagem_id) REFERENCES triagens(id),
  CONSTRAINT fk_revisao_profissional FOREIGN KEY(profissional_id) REFERENCES usuarios(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS consultas (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  paciente_id BIGINT UNSIGNED NULL,
  profissional_id BIGINT UNSIGNED NOT NULL,
  especialidade_id SMALLINT UNSIGNED NOT NULL,
  inicio DATETIME NOT NULL,
  fim DATETIME NOT NULL,
  status ENUM('agendada', 'confirmada', 'em_atendimento', 'concluida', 'cancelada', 'falta', 'vaga_liberada', 'realocada') NOT NULL DEFAULT 'agendada',
  triagem_id BIGINT UNSIGNED NULL,
  observacoes TEXT NULL,
  criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_consultas_paciente FOREIGN KEY (paciente_id) REFERENCES usuarios(id),
  CONSTRAINT fk_consultas_profissional FOREIGN KEY (profissional_id) REFERENCES profissionais(id),
  CONSTRAINT fk_consultas_especialidade FOREIGN KEY (especialidade_id) REFERENCES especialidades(id),
  CONSTRAINT fk_consultas_triagem FOREIGN KEY (triagem_id) REFERENCES triagens(id),
  CONSTRAINT chk_consulta_periodo CHECK (fim > inicio),
  KEY ix_consultas_agenda (inicio, status),
  KEY ix_consultas_paciente (paciente_id, inicio)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS fila_espera (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  paciente_id BIGINT UNSIGNED NOT NULL,
  especialidade_id SMALLINT UNSIGNED NULL,
  triagem_id BIGINT UNSIGNED NULL,
  prioridade ENUM('baixa', 'moderada', 'alta', 'emergencia') NOT NULL DEFAULT 'baixa',
  status ENUM('aguardando', 'notificado', 'realocado', 'cancelado') NOT NULL DEFAULT 'aguardando',
  entrada_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_fila_paciente FOREIGN KEY (paciente_id) REFERENCES usuarios(id),
  CONSTRAINT fk_fila_especialidade FOREIGN KEY (especialidade_id) REFERENCES especialidades(id),
  CONSTRAINT fk_fila_triagem FOREIGN KEY (triagem_id) REFERENCES triagens(id),
  KEY ix_fila_prioridade (status, prioridade, entrada_em)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS notificacoes (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  usuario_id BIGINT UNSIGNED NOT NULL,
  tipo ENUM('consulta', 'triagem', 'realocacao', 'emergencia', 'sistema') NOT NULL,
  titulo VARCHAR(150) NOT NULL,
  mensagem TEXT NOT NULL,
  lida_em TIMESTAMP NULL,
  criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_notificacoes_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id),
  KEY ix_notificacoes_usuario (usuario_id, lida_em, criado_em)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS auditoria_acessos (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  usuario_id BIGINT UNSIGNED NULL,
  acao VARCHAR(100) NOT NULL,
  entidade VARCHAR(100) NOT NULL,
  entidade_id BIGINT UNSIGNED NULL,
  ip VARCHAR(45) NULL,
  criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_auditoria_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id),
  KEY ix_auditoria_entidade (entidade, entidade_id, criado_em)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS requerimentos (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  usuario_id BIGINT UNSIGNED NOT NULL,
  tipo ENUM('atestado','laudo','declaracao') NOT NULL,
  descricao TEXT NOT NULL,
  status ENUM('aberto','liberado','retido') NOT NULL DEFAULT 'aberto',
  resposta TEXT NULL,
  criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_requerimento_usuario FOREIGN KEY(usuario_id) REFERENCES usuarios(id)
) ENGINE=InnoDB;

INSERT INTO especialidades (nome) VALUES ('Clínica médica'), ('Cardiologia'), ('Pediatria')
ON DUPLICATE KEY UPDATE nome = VALUES(nome);

INSERT INTO usuarios (nome, documento, email, telefone, senha_hash, perfil) VALUES
  ('Marina Costa', '00000000001', 'marina.costa@triaqui.local', '11990000001', '$2b$10$nNQ8FazpSiY0xTT8OrEEBe5SYk1f78mjc5McZjytIGp38LbqJr8l.', 'paciente'),
  ('Bianca Martins', '00000000002', 'bianca.martins@triaqui.local', '11990000002', '$2b$10$nNQ8FazpSiY0xTT8OrEEBe5SYk1f78mjc5McZjytIGp38LbqJr8l.', 'paciente'),
  ('Rafael Souza', '00000000003', 'rafael.souza@triaqui.local', '11990000003', '$2b$10$nNQ8FazpSiY0xTT8OrEEBe5SYk1f78mjc5McZjytIGp38LbqJr8l.', 'paciente'),
  ('Carolina Vieira', '00000000004', 'carolina.vieira@triaqui.local', '11990000004', '$2b$10$nNQ8FazpSiY0xTT8OrEEBe5SYk1f78mjc5McZjytIGp38LbqJr8l.', 'paciente'),
  ('Gabriel Oliveira', '00000000005', 'gabriel.oliveira@triaqui.local', '11990000005', '$2b$10$nNQ8FazpSiY0xTT8OrEEBe5SYk1f78mjc5McZjytIGp38LbqJr8l.', 'profissional')
ON DUPLICATE KEY UPDATE nome = VALUES(nome), senha_hash = VALUES(senha_hash);

INSERT INTO profissionais (usuario_id, registro_profissional, unidade)
SELECT id, 'CRM-SP 000001', 'Unidade Centro' FROM usuarios WHERE email = 'gabriel.oliveira@triaqui.local'
ON DUPLICATE KEY UPDATE unidade = VALUES(unidade);

INSERT IGNORE INTO profissional_especialidades (profissional_id, especialidade_id)
SELECT p.id, e.id FROM profissionais p JOIN usuarios u ON u.id = p.usuario_id JOIN especialidades e ON e.nome = 'Clínica médica'
WHERE u.email = 'gabriel.oliveira@triaqui.local';

INSERT INTO consultas (paciente_id, profissional_id, especialidade_id, inicio, fim, status)
SELECT u.id, p.id, e.id, CURDATE() + INTERVAL 8 HOUR + INTERVAL 30 MINUTE, CURDATE() + INTERVAL 9 HOUR, 'em_atendimento'
FROM usuarios u JOIN profissionais p JOIN especialidades e
WHERE u.email = 'marina.costa@triaqui.local' AND e.nome = 'Clínica médica'
  AND NOT EXISTS (SELECT 1 FROM consultas c WHERE c.inicio = CURDATE() + INTERVAL 8 HOUR + INTERVAL 30 MINUTE AND c.profissional_id = p.id);

INSERT INTO consultas (paciente_id, profissional_id, especialidade_id, inicio, fim, status)
SELECT NULL, p.id, e.id, CURDATE() + INTERVAL 9 HOUR + INTERVAL 30 MINUTE, CURDATE() + INTERVAL 10 HOUR, 'vaga_liberada'
FROM profissionais p JOIN especialidades e
WHERE e.nome = 'Clínica médica'
  AND NOT EXISTS (SELECT 1 FROM consultas c WHERE c.inicio = CURDATE() + INTERVAL 9 HOUR + INTERVAL 30 MINUTE AND c.profissional_id = p.id);

INSERT INTO fila_espera (paciente_id, especialidade_id, prioridade)
SELECT u.id, e.id, 'alta' FROM usuarios u JOIN especialidades e
WHERE u.email = 'bianca.martins@triaqui.local' AND e.nome = 'Clínica médica'
  AND NOT EXISTS (SELECT 1 FROM fila_espera f WHERE f.paciente_id = u.id AND f.status = 'aguardando');

DROP PROCEDURE IF EXISTS realocar_proximo_paciente;
DELIMITER //
CREATE PROCEDURE realocar_proximo_paciente(IN p_consulta_id BIGINT UNSIGNED)
BEGIN
  DECLARE v_paciente_id BIGINT UNSIGNED DEFAULT NULL;
  DECLARE v_especialidade_id SMALLINT UNSIGNED DEFAULT NULL;
  START TRANSACTION;
  SELECT especialidade_id INTO v_especialidade_id FROM consultas WHERE id = p_consulta_id AND status = 'vaga_liberada' FOR UPDATE;
  IF v_especialidade_id IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Vaga liberada não encontrada'; END IF;
  SELECT paciente_id INTO v_paciente_id FROM fila_espera
  WHERE status = 'aguardando' AND (especialidade_id = v_especialidade_id OR especialidade_id IS NULL)
  ORDER BY FIELD(prioridade, 'emergencia', 'alta', 'moderada', 'baixa'), entrada_em LIMIT 1 FOR UPDATE;
  IF v_paciente_id IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Não há paciente elegível na fila'; END IF;
  UPDATE consultas SET paciente_id = v_paciente_id, status = 'realocada' WHERE id = p_consulta_id;
  UPDATE fila_espera SET status = 'realocado' WHERE paciente_id = v_paciente_id AND status = 'aguardando';
  INSERT INTO notificacoes (usuario_id, tipo, titulo, mensagem) VALUES (v_paciente_id, 'realocacao', 'Novo horário disponível', 'Sua consulta foi realocada para uma vaga disponível.');
  COMMIT;
END //
DELIMITER ;
