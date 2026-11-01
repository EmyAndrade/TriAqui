const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const db = require('./db');

const secret = process.env.TRIAQUI_JWT_SECRET || crypto.randomBytes(48).toString('hex');
const active = "'agendada','confirmada','em_atendimento','realocada'";
const priorityOrder = "FIELD(f.prioridade,'emergencia','alta','moderada','baixa'),f.entrada_em,f.id";
const wrap = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
function fail(status, message) { const error = new Error(message); error.status = status; throw error; }
function id(value) { const number = Number(value); if (!Number.isSafeInteger(number) || number < 1) fail(422, 'Identificador inválido.'); return number; }
function text(value, max = 2000) { if (typeof value !== 'string' || value.trim().length > max) fail(422, 'Texto inválido ou muito longo.'); return value.trim(); }
function isStaff(user) { return ['profissional', 'administrativo'].includes(user.perfil); }
function staff(user) { if (!isStaff(user)) fail(403, 'Operação exclusiva da equipe.'); }
function clinical(user) { if (user.perfil !== 'profissional') fail(403, 'Os dados clínicos são exclusivos dos profissionais de saúde.'); }
function token(user) { return jwt.sign({ sub: String(user.id) }, secret, { expiresIn: '8h', algorithm: 'HS256' }); }
const auth = wrap(async (req, _res, next) => {
  try {
    const raw = req.headers.authorization || '';
    if (!raw.startsWith('Bearer ')) fail(401, 'Entre na sua conta para continuar.');
    let payload;
    try { payload = jwt.verify(raw.slice(7), secret, { algorithms: ['HS256'] }); } catch { fail(401, 'Sua sessão expirou. Entre novamente.'); }
    const [[user]] = await db.query('SELECT id,nome,documento,email,telefone,perfil FROM usuarios WHERE id=? AND ativo=1', [payload.sub]);
    if (!user) fail(401, 'Sessão inválida. Entre novamente.');
    req.user = user;
    next();
  } catch (error) { next(error); }
});

async function transaction(work) {
  const conn = await db.getConnection();
  try { await conn.beginTransaction(); const result = await work(conn); await conn.commit(); return result; }
  catch (error) { await conn.rollback(); throw error; }
  finally { conn.release(); }
}
async function notify(conn, userId, title, message, type = 'consulta') {
  await conn.execute('INSERT INTO notificacoes(usuario_id,tipo,titulo,mensagem) VALUES (?,?,?,?)', [userId, type, title, message]);
}
async function audit(conn, user, action, entity, entityId) {
  await conn.execute('INSERT INTO auditoria_acessos(usuario_id,acao,entidade,entidade_id) VALUES (?,?,?,?)', [user.id, action, entity, entityId]);
}
function period(date, time) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '') || !/^\d{2}:\d{2}$/.test(time || '')) fail(422, 'Informe data e horário válidos.');
  const start = new Date(`${date}T${time}:00`);
  if (Number.isNaN(start.getTime()) || start.getFullYear() !== +date.slice(0,4) || start.getMonth()+1 !== +date.slice(5,7) || start.getDate() !== +date.slice(8,10) || start.getHours() !== +time.slice(0,2) || start.getMinutes() !== +time.slice(3)) fail(422, 'Data ou horário inválido.');
  if (start <= new Date()) fail(422, 'Escolha um horário futuro.');
  const end = new Date(start.getTime() + 30 * 60000);
  const format = (d) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}:00`;
  return { inicio: format(start), fim: format(end) };
}
async function lockDoctor(conn, professionalId, user, restrict = false) {
  const [[doctor]] = await conn.query('SELECT * FROM profissionais WHERE id=? FOR UPDATE', [professionalId]);
  if (!doctor) fail(404, 'Profissional não encontrado.');
  if (restrict && user.perfil === 'profissional' && doctor.usuario_id !== user.id) fail(403, 'Você só pode alterar a própria agenda.');
  return doctor;
}
async function freePatient(conn, patientId, inicio, fim, except = 0) {
  await conn.query('SELECT id FROM usuarios WHERE id=? FOR UPDATE', [patientId]);
  const [[conflict]] = await conn.query(`SELECT id FROM consultas WHERE paciente_id=? AND status IN (${active}) AND inicio<? AND fim>? AND id<>? LIMIT 1`, [patientId, fim, inicio, except]);
  return !conflict;
}
async function eligibleSlot(conn, professionalId, specialtyId, inicio, fim, except = 0) {
  const [[specialty]] = await conn.query('SELECT 1 FROM profissional_especialidades WHERE profissional_id=? AND especialidade_id=?', [professionalId, specialtyId]);
  if (!specialty) fail(422, 'Especialidade não atendida por esse profissional.');
  const [[slot]] = await conn.query("SELECT id FROM disponibilidades WHERE profissional_id=? AND inicio=? AND fim=? AND status='disponivel' FOR UPDATE", [professionalId, inicio, fim]);
  if (!slot) fail(409, 'Este horário não está mais disponível. Escolha outro.');
  const [[conflict]] = await conn.query(`SELECT id FROM consultas WHERE profissional_id=? AND status IN (${active}) AND inicio<? AND fim>? AND id<>? LIMIT 1`, [professionalId, fim, inicio, except]);
  if (conflict) fail(409, 'Horário já reservado. Escolha outro.');
}
async function reallocate(conn, vacancyId) {
  const [[slot]] = await conn.query("SELECT * FROM consultas WHERE id=? AND status='vaga_liberada' AND inicio>NOW() FOR UPDATE", [vacancyId]);
  if (!slot) return null;
  const [[availability]] = await conn.query("SELECT id FROM disponibilidades WHERE profissional_id=? AND inicio=? AND fim=? AND status='disponivel'", [slot.profissional_id,slot.inicio,slot.fim]);
  if (!availability) return null;
  const [[occupied]] = await conn.query(`SELECT id FROM consultas WHERE profissional_id=? AND status IN (${active}) AND inicio<? AND fim>? LIMIT 1`,[slot.profissional_id,slot.fim,slot.inicio]);
  if (occupied) return null;
  const [waiting] = await conn.query(`SELECT f.* FROM fila_espera f JOIN usuarios u ON u.id=f.paciente_id WHERE f.status='aguardando' AND u.ativo=1 AND (f.especialidade_id=? OR f.especialidade_id IS NULL) ORDER BY ${priorityOrder} FOR UPDATE`, [slot.especialidade_id]);
  for (const entry of waiting) {
    if (!await freePatient(conn, entry.paciente_id, slot.inicio, slot.fim)) continue;
    await conn.query("UPDATE consultas SET paciente_id=?,triagem_id=?,status='realocada' WHERE id=?", [entry.paciente_id, entry.triagem_id, slot.id]);
    await conn.query("UPDATE fila_espera SET status='realocado' WHERE id=?", [entry.id]);
    await notify(conn, entry.paciente_id, 'Consulta realocada', `Um horário foi reservado para você em ${String(slot.inicio).slice(0,24)}. Confira a agenda.`, 'realocacao');
    return { consultaId: slot.id, pacienteId: entry.paciente_id };
  }
  return null;
}
async function release(conn, old) {
  if (new Date(old.inicio) <= new Date()) return null;
  const [result] = await conn.query("INSERT INTO consultas(profissional_id,especialidade_id,inicio,fim,status) VALUES (?,?,?,?,'vaga_liberada')", [old.profissional_id,old.especialidade_id,old.inicio,old.fim]);
  return reallocate(conn, result.insertId);
}
const appointmentColumns = `c.id,c.paciente_id,c.profissional_id,c.especialidade_id,
  DATE_FORMAT(c.inicio,'%Y-%m-%dT%H:%i:%s') inicio,DATE_FORMAT(c.fim,'%Y-%m-%dT%H:%i:%s') fim,
  c.status,c.observacoes,e.nome especialidade,COALESCE(u.nome,'Vaga liberada') paciente,d.nome profissional,p.unidade,p.usuario_id profissional_usuario_id`;
const appointmentJoins = 'FROM consultas c JOIN profissionais p ON p.id=c.profissional_id JOIN usuarios d ON d.id=p.usuario_id JOIN especialidades e ON e.id=c.especialidade_id LEFT JOIN usuarios u ON u.id=c.paciente_id';
function scope(user) { return user.perfil === 'paciente' ? { sql: 'c.paciente_id=?', values: [user.id] } : user.perfil === 'profissional' ? { sql: 'p.usuario_id=?', values: [user.id] } : { sql: '1=1', values: [] }; }
async function ownAppointment(conn, appointmentId, user) {
  const [[row]] = await conn.query('SELECT c.*,p.usuario_id profissional_usuario_id FROM consultas c JOIN profissionais p ON p.id=c.profissional_id WHERE c.id=?', [appointmentId]);
  if (!row) fail(404, 'Consulta não encontrada.');
  if (user.perfil === 'paciente' && row.paciente_id !== user.id || user.perfil === 'profissional' && row.profissional_usuario_id !== user.id) fail(403, 'Você não tem acesso a esta consulta.');
  return row;
}

module.exports = { db, active, wrap, fail, id, text, staff, clinical, isStaff, token, auth, transaction, notify, audit, period, lockDoctor, freePatient, eligibleSlot, reallocate, release, appointmentColumns, appointmentJoins, scope, ownAppointment };
