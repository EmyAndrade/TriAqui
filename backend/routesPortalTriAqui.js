const express = require('express');
const bcrypt = require('bcrypt');
const { normalizarDocumento } = require('./validacaoCadastro');
const { ensureIASchema,evaluate,saveEvaluation } = require('./triagemIA');
const { db, active, wrap, fail, id, text, staff, clinical, token, auth, transaction, notify, audit, period, lockDoctor, freePatient, eligibleSlot, reallocate, release, appointmentColumns, appointmentJoins, scope, ownAppointment } = require('./operacoesTriAqui');
const router = express.Router();
router.use(require('./routesCadastroTriAqui'));

router.post('/sessao', wrap(async (req, res) => {
  const documento = normalizarDocumento(req.body.documento);
  const senha = typeof req.body.senha === 'string' ? req.body.senha : '';
  if (!documento || !senha) fail(400, 'Informe CPF/CNPJ e senha.');
  const profiles = req.body.perfil === 'staff' ? ['profissional','administrativo'] : ['paciente'];
  const [[user]] = await db.query('SELECT id,nome,documento,email,telefone,perfil,senha_hash FROM usuarios WHERE documento=? AND perfil IN (?) AND ativo=1', [documento,profiles]);
  if (!user || !await bcrypt.compare(senha,user.senha_hash)) fail(401, 'CPF/CNPJ, perfil ou senha inválidos.');
  delete user.senha_hash;
  res.json({ usuario: user, token: token(user) });
}));
router.use(auth);
router.get('/sessao', (req,res) => res.json({ usuario: req.user }));

router.get('/profissionais', wrap(async (_req,res) => {
  const [profissionais] = await db.query(`SELECT p.id,p.usuario_id,u.nome,p.registro_profissional,p.unidade,e.id especialidade_id,e.nome especialidade
    FROM profissionais p JOIN usuarios u ON u.id=p.usuario_id JOIN profissional_especialidades pe ON pe.profissional_id=p.id JOIN especialidades e ON e.id=pe.especialidade_id WHERE u.ativo=1 ORDER BY u.nome,e.nome`);
  res.json({ profissionais });
}));
router.get('/horarios', wrap(async (req,res) => {
  const doctorId = id(req.query.profissionalId);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(req.query.data || '')) fail(422, 'Informe a data.');
  const [horarios] = await db.query(`SELECT d.id,DATE_FORMAT(d.inicio,'%Y-%m-%d') data,DATE_FORMAT(d.inicio,'%H:%i') horario,
    DATE_FORMAT(d.inicio,'%Y-%m-%dT%H:%i:%s') inicio,d.status,
    EXISTS(SELECT 1 FROM consultas c WHERE c.profissional_id=d.profissional_id AND c.status IN (${active}) AND c.inicio<d.fim AND c.fim>d.inicio) ocupado
    FROM disponibilidades d WHERE d.profissional_id=? AND DATE(d.inicio)=? AND d.inicio>NOW() ORDER BY d.inicio`, [doctorId, req.query.data]);
  res.json({ horarios });
}));
router.post('/horarios', wrap(async (req,res) => {
  staff(req.user);
  const doctorId = id(req.body.profissionalId);
  const { inicio,fim } = period(req.body.data,req.body.horario);
  const result = await transaction(async (conn) => {
    await lockDoctor(conn,doctorId,req.user,true);
    const [[overlap]] = await conn.query('SELECT id FROM disponibilidades WHERE profissional_id=? AND inicio<? AND fim>?', [doctorId,fim,inicio]);
    if (overlap) fail(409, 'Já existe um horário nesse intervalo.');
    const [created] = await conn.execute('INSERT INTO disponibilidades(profissional_id,inicio,fim) VALUES (?,?,?)', [doctorId,inicio,fim]);
    await audit(conn,req.user,'publicar_horario','disponibilidades',created.insertId);
    return created.insertId;
  });
  res.status(201).json({ id: result,mensagem: 'Horário publicado.' });
}));
router.patch('/horarios/:id', wrap(async (req,res) => {
  staff(req.user);
  if (!['disponivel','bloqueado'].includes(req.body.status)) fail(422,'Status inválido.');
  await transaction(async (conn) => {
    const [[slot]] = await conn.query('SELECT * FROM disponibilidades WHERE id=?', [id(req.params.id)]);
    if (!slot) fail(404,'Horário não encontrado.');
    await lockDoctor(conn,slot.profissional_id,req.user,true);
    const [[booked]] = await conn.query(`SELECT id FROM consultas WHERE profissional_id=? AND status IN (${active}) AND inicio<? AND fim>?`, [slot.profissional_id,slot.fim,slot.inicio]);
    if (booked) fail(409,'Este horário possui consulta. Cancele ou reagende primeiro.');
    await conn.query('UPDATE disponibilidades SET status=? WHERE id=?',[req.body.status,slot.id]);
  });
  res.json({ mensagem: 'Disponibilidade atualizada.' });
}));

router.get('/consultas', wrap(async (req,res) => {
  const filter=scope(req.user);
  const [consultas] = await db.query(`SELECT ${appointmentColumns} ${appointmentJoins} WHERE ${filter.sql} ORDER BY c.inicio DESC,c.id DESC`,filter.values);
  res.json({ consultas });
}));
router.post('/consultas', wrap(async (req,res) => {
  if (req.user.perfil !== 'paciente') fail(403,'O agendamento deve ser realizado pelo paciente.');
  const doctorId=id(req.body.profissionalId), specialtyId=id(req.body.especialidadeId);
  const { inicio,fim }=period(req.body.data,req.body.horario);
  const observations=text(req.body.observacoes || '');
  const created=await transaction(async (conn) => {
    await lockDoctor(conn,doctorId,req.user);
    if (!await freePatient(conn,req.user.id,inicio,fim)) fail(409,'Você já possui consulta nesse intervalo.');
    await eligibleSlot(conn,doctorId,specialtyId,inicio,fim);
    const [[vacancy]]=await conn.query("SELECT id FROM consultas WHERE profissional_id=? AND inicio=? AND status='vaga_liberada' LIMIT 1 FOR UPDATE",[doctorId,inicio]);
    let appointmentId;
    if (vacancy) {
      appointmentId=vacancy.id;
      await conn.query("UPDATE consultas SET paciente_id=?,especialidade_id=?,observacoes=?,status='confirmada' WHERE id=?",[req.user.id,specialtyId,observations,appointmentId]);
    } else {
      const [result]=await conn.execute("INSERT INTO consultas(paciente_id,profissional_id,especialidade_id,inicio,fim,status,observacoes) VALUES (?,?,?,?,?,'confirmada',?)",[req.user.id,doctorId,specialtyId,inicio,fim,observations]);
      appointmentId=result.insertId;
    }
    await notify(conn,req.user.id,'Consulta confirmada',`Sua consulta está agendada para ${req.body.data} às ${req.body.horario}.`);
    await audit(conn,req.user,'agendar','consultas',appointmentId);
    return appointmentId;
  });
  res.status(201).json({ id: created,mensagem:'Consulta agendada com sucesso.' });
}));
router.patch('/consultas/:id/reagendar', wrap(async (req,res) => {
  const appointmentId=id(req.params.id);
  const {inicio,fim}=period(req.body.data,req.body.horario);
  await transaction(async (conn) => {
    const old=await ownAppointment(conn,appointmentId,req.user);
    await lockDoctor(conn,old.profissional_id,req.user,true);
    const [[current]]=await conn.query('SELECT * FROM consultas WHERE id=? FOR UPDATE',[appointmentId]);
    if (!['agendada','confirmada','realocada'].includes(current.status)) fail(409,'Esta consulta não pode ser reagendada.');
    if (!await freePatient(conn,current.paciente_id,inicio,fim,appointmentId)) fail(409,'O paciente já possui consulta nesse intervalo.');
    await eligibleSlot(conn,current.profissional_id,current.especialidade_id,inicio,fim,appointmentId);
    await conn.query("UPDATE consultas SET inicio=?,fim=?,status='confirmada' WHERE id=?",[inicio,fim,appointmentId]);
    await conn.query("UPDATE consultas SET status='cancelada' WHERE profissional_id=? AND inicio=? AND status='vaga_liberada' AND id<>?",[current.profissional_id,inicio,appointmentId]);
    await notify(conn,current.paciente_id,'Consulta reagendada',`Novo atendimento: ${req.body.data} às ${req.body.horario}.`);
    await release(conn,current);
    await audit(conn,req.user,'reagendar','consultas',appointmentId);
  });
  res.json({ mensagem:'Consulta reagendada.' });
}));
router.patch('/consultas/:id/status', wrap(async (req,res) => {
  const target=req.body.status;
  const allowed={ agendada:['confirmada','cancelada','falta'], confirmada:['em_atendimento','cancelada','falta'], realocada:['em_atendimento','cancelada','falta'], em_atendimento:['concluida'] };
  if (req.user.perfil==='paciente' && target!=='cancelada') fail(403,'Você pode apenas cancelar sua consulta.');
  await transaction(async (conn) => {
    const old=await ownAppointment(conn,id(req.params.id),req.user);
    await lockDoctor(conn,old.profissional_id,req.user,true);
    const [[current]]=await conn.query('SELECT * FROM consultas WHERE id=? FOR UPDATE',[old.id]);
    if (!allowed[current.status]?.includes(target)) fail(409,'Alteração de status não permitida para esta consulta.');
    if (target==='falta' && new Date(current.inicio)>new Date()) fail(409,'Não é possível registrar falta antes do horário da consulta.');
    if (req.user.perfil==='paciente' && new Date(current.inicio)<=new Date()) fail(409,'Contate a unidade para alterar um atendimento já iniciado.');
    await conn.query('UPDATE consultas SET status=? WHERE id=?',[target,old.id]);
    if (current.paciente_id) await notify(conn,current.paciente_id,'Atendimento atualizado',`O status da consulta foi alterado para ${target.replaceAll('_',' ')}.`);
    if (['cancelada','falta'].includes(target)) await release(conn,current);
    await audit(conn,req.user,target,'consultas',old.id);
  });
  res.json({ mensagem:'Consulta atualizada.' });
}));

router.get('/triagens', wrap(async (req,res) => {
  if (req.user.perfil==='administrativo') fail(403,'Acesso clínico restrito aos profissionais de saúde.');
  await ensureIASchema();
  const [triagens]=await db.query(`SELECT t.*,u.nome paciente,DATE_FORMAT(t.criado_em,'%Y-%m-%dT%H:%i:%s') criadaEm,
    ia.estado ia_estado,ia.modelo ia_modelo,ia.versao ia_versao,ia.prioridade_sugerida prioridade_ia,
    ia.resumo ia_resumo,ia.sinais ia_sinais,DATE_FORMAT(ia.avaliada_em,'%Y-%m-%dT%H:%i:%s') ia_avaliada_em,
    CASE WHEN t.status='avaliada' THEN 'revisada_medico' WHEN ia.estado='avaliada_ia' THEN 'avaliada_ia' ELSE 'pendente' END situacao_avaliacao
    FROM triagens t JOIN usuarios u ON u.id=t.paciente_id LEFT JOIN triagens_ia ia ON ia.triagem_id=t.id
    ${req.user.perfil==='paciente'?'WHERE t.paciente_id=?':''} ORDER BY t.criado_em DESC,t.id DESC`,req.user.perfil==='paciente'?[req.user.id]:[]);
  const [reviews]=triagens.length ? await db.query(`SELECT r.id,r.triagem_id,r.prioridade_anterior,r.prioridade_nova,r.justificativa,u.nome profissional,
    DATE_FORMAT(r.criado_em,'%Y-%m-%dT%H:%i:%s') criadoEm FROM triagens_revisoes r JOIN usuarios u ON u.id=r.profissional_id WHERE r.triagem_id IN (?) ORDER BY r.criado_em,r.id`,[triagens.map(t=>t.id)]) : [[]];
  for(const triage of triagens) triage.revisoes=reviews.filter(r=>r.triagem_id===triage.id);
  res.json({ triagens });
}));
router.post('/triagem', wrap(async (req,res) => {
  if (req.user.perfil!=='paciente') fail(403,'Use a área do paciente para enviar uma triagem.');
  const {sintomas=[]}=req.body;
  if (!Array.isArray(sintomas) || sintomas.length>20 || sintomas.some(s=>typeof s!=='string'||s.length>150)) fail(422,'Informe sintomas válidos.');
  const descricao=text(req.body.descricao || '');
  if (!sintomas.length && descricao.length<3) fail(422,'Selecione um sintoma ou descreva o que sente.');
  await ensureIASchema();
  const evaluation=await evaluate({sintomas,descricao});
  const result=await transaction(async conn=>{
    await conn.query('SELECT id FROM usuarios WHERE id=? FOR UPDATE',[req.user.id]);
    const aiPriority=evaluation.estado==='avaliada_ia'?evaluation.prioridade:null;
    const [created]=await conn.execute("INSERT INTO triagens(paciente_id,sintomas,descricao,prioridade,status) VALUES (?,?,?,?,'pendente')",[req.user.id,JSON.stringify(sintomas),descricao,aiPriority||'baixa']);
    await saveEvaluation(conn,created.insertId,evaluation);
    if(aiPriority) await conn.query("UPDATE fila_espera SET triagem_id=?,prioridade=? WHERE paciente_id=? AND status='aguardando'",[created.insertId,aiPriority,req.user.id]);
    else await conn.query("UPDATE fila_espera SET triagem_id=? WHERE paciente_id=? AND status='aguardando'",[created.insertId,req.user.id]);
    await notify(conn,req.user.id,evaluation.estado==='avaliada_ia'?'Triagem avaliada por IA':'Triagem recebida',evaluation.estado==='avaliada_ia'?'A IA definiu uma prioridade provisória para a fila. A revisão médica permanece pendente.':'Sua triagem foi registrada e aguarda avaliação profissional.','triagem');
    await audit(conn,req.user,'analise_ia_'+evaluation.estado,'triagens',created.insertId);
    return created.insertId;
  });
  res.status(201).json({id:result,avaliacaoIA:evaluation,mensagem:evaluation.estado==='avaliada_ia'?'Avaliada por IA. Prioridade provisória aplicada à fila; revisão médica pendente.':'Triagem salva. '+evaluation.resumo});
}));
router.patch('/triagens/:id', wrap(async (req,res)=>{
  clinical(req.user);
  if (!['baixa','moderada','alta','emergencia'].includes(req.body.prioridade)) fail(422,'Prioridade inválida.');
  const justification=text(req.body.justificativa || '',1000);
  await ensureIASchema();
  await transaction(async conn=>{
    const [[triage]]=await conn.query('SELECT * FROM triagens WHERE id=? FOR UPDATE',[id(req.params.id)]);
    if (!triage) fail(404,'Triagem não encontrada.');
    const [[ia]]=await conn.query('SELECT prioridade_sugerida FROM triagens_ia WHERE triagem_id=?',[triage.id]);
    const previous=triage.status==='avaliada'?triage.prioridade:ia?.prioridade_sugerida||triage.prioridade;
    if((ia?.prioridade_sugerida||triage.status==='avaliada')&&previous!==req.body.prioridade&&justification.length<3) fail(422,'Informe a justificativa para alterar a prioridade sugerida ou já revisada.');
    await conn.execute('INSERT INTO triagens_revisoes(triagem_id,profissional_id,prioridade_anterior,prioridade_nova,justificativa) VALUES (?,?,?,?,?)',[triage.id,req.user.id,previous,req.body.prioridade,justification]);
    await conn.query("UPDATE triagens SET prioridade=?,status='avaliada',avaliador_id=?,avaliado_em=NOW() WHERE id=?",[req.body.prioridade,req.user.id,triage.id]);
    await conn.query("UPDATE fila_espera SET prioridade=? WHERE triagem_id=? AND status='aguardando'",[req.body.prioridade,triage.id]);
    await notify(conn,triage.paciente_id,'Triagem avaliada',`Sua triagem foi avaliada. Prioridade: ${req.body.prioridade}.`,'triagem');
    await audit(conn,req.user,'avaliar_triagem','triagens',triage.id);
  });
  res.json({mensagem:'Avaliação registrada e prioridade da fila atualizada.'});
}));

router.get('/fila', wrap(async(req,res)=>{
  await ensureIASchema();
  const [fila]=await db.query(`SELECT f.id,f.paciente_id,u.nome paciente,e.nome especialidade,f.prioridade,f.status,
    (t.status='pendente') revisao_pendente,
    (t.status='pendente' AND ia.estado='avaliada_ia') revisao_pendente_ia,
    TIMESTAMPDIFF(MINUTE,f.entrada_em,NOW()) esperaMinutos FROM fila_espera f JOIN usuarios u ON u.id=f.paciente_id LEFT JOIN especialidades e ON e.id=f.especialidade_id
    LEFT JOIN triagens t ON t.id=f.triagem_id LEFT JOIN triagens_ia ia ON ia.triagem_id=t.id
    WHERE f.status='aguardando' ${req.user.perfil==='paciente'?'AND f.paciente_id=?':''} ORDER BY FIELD(f.prioridade,'emergencia','alta','moderada','baixa'),f.entrada_em,f.id`,req.user.perfil==='paciente'?[req.user.id]:[]);
  res.json({fila});
}));
router.post('/fila', wrap(async(req,res)=>{
  if(req.user.perfil!=='paciente') fail(403,'A entrada na fila é feita pelo paciente.');
  const specialtyId=id(req.body.especialidadeId);
  await ensureIASchema();
  await transaction(async conn=>{
    await conn.query('SELECT id FROM usuarios WHERE id=? FOR UPDATE',[req.user.id]);
    const [[specialty]]=await conn.query('SELECT id FROM especialidades WHERE id=?',[specialtyId]);
    if(!specialty) fail(422,'Especialidade inválida.');
    const [[exists]]=await conn.query("SELECT id FROM fila_espera WHERE paciente_id=? AND especialidade_id=? AND status='aguardando'",[req.user.id,specialtyId]);
    if(exists) fail(409,'Você já está na fila dessa especialidade.');
    const [[triage]]=await conn.query('SELECT id,prioridade,status FROM triagens WHERE paciente_id=? ORDER BY criado_em DESC,id DESC LIMIT 1',[req.user.id]);
    const [[effective]]=await conn.query(`SELECT t.prioridade,t.status,ia.prioridade_sugerida FROM triagens t LEFT JOIN triagens_ia ia ON ia.triagem_id=t.id
      WHERE t.paciente_id=? AND (t.status='avaliada' OR ia.estado='avaliada_ia') ORDER BY t.criado_em DESC,t.id DESC LIMIT 1`,[req.user.id]);
    const priority=effective?.status==='avaliada'?effective.prioridade:effective?.prioridade_sugerida||'baixa';
    await conn.execute('INSERT INTO fila_espera(paciente_id,especialidade_id,triagem_id,prioridade) VALUES (?,?,?,?)',[req.user.id,specialtyId,triage?.id||null,priority]);
    await notify(conn,req.user.id,'Entrada na fila','Você será avisado aqui quando uma vaga compatível for realocada.','sistema');
  });
  res.status(201).json({mensagem:'Você entrou na fila de espera.'});
}));
router.patch('/fila/:id/sair', wrap(async(req,res)=>{
  const [result]=await db.query("UPDATE fila_espera SET status='cancelado' WHERE id=? AND paciente_id=? AND status='aguardando'",[id(req.params.id),req.user.id]);
  if(!result.affectedRows) fail(404,'Entrada não encontrada.');
  res.json({mensagem:'Você saiu da fila.'});
}));
router.post('/realocacoes/:id',wrap(async(req,res)=>{
  staff(req.user);
  const result=await transaction(async conn=>{
    const vacancy=await ownAppointment(conn,id(req.params.id),req.user);
    await lockDoctor(conn,vacancy.profissional_id,req.user,true);
    const allocated=await reallocate(conn,vacancy.id);
    if(!allocated) fail(409,'Não há paciente elegível ou a vaga já não está disponível.');
    await audit(conn,req.user,'realocar','consultas',vacancy.id);
    return allocated;
  });
  res.json({mensagem:'Paciente realocado e notificado.',...result});
}));
router.get('/notificacoes',wrap(async(req,res)=>{
  const [notificacoes]=await db.query("SELECT id,tipo,titulo,mensagem,lida_em,DATE_FORMAT(criado_em,'%Y-%m-%dT%H:%i:%s') criadoEm FROM notificacoes WHERE usuario_id=? ORDER BY criado_em DESC,id DESC LIMIT 100",[req.user.id]);
  res.json({notificacoes});
}));
router.patch('/notificacoes/:id/ler',wrap(async(req,res)=>{
  const [result]=await db.query('UPDATE notificacoes SET lida_em=COALESCE(lida_em,NOW()) WHERE id=? AND usuario_id=?',[id(req.params.id),req.user.id]);
  if(!result.affectedRows) fail(404,'Notificação não encontrada.');
  res.json({mensagem:'Notificação marcada como lida.'});
}));

let documentSchema;
function ensureDocuments(){
  if(!documentSchema) documentSchema=db.query(`CREATE TABLE IF NOT EXISTS requerimentos (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,usuario_id BIGINT UNSIGNED NOT NULL,
    tipo ENUM('atestado','laudo','declaracao') NOT NULL,descricao TEXT NOT NULL,
    status ENUM('aberto','liberado','retido') NOT NULL DEFAULT 'aberto',resposta TEXT NULL,
    criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_requerimento_usuario FOREIGN KEY(usuario_id) REFERENCES usuarios(id)
  ) ENGINE=InnoDB`).catch(e=>{documentSchema=null;throw e;});
  return documentSchema;
}
router.get('/documentos',wrap(async(req,res)=>{
  if(req.user.perfil==='administrativo') fail(403,'Os requerimentos médicos são restritos ao profissional de saúde.');
  await ensureDocuments();
  const [documentos]=await db.query(`SELECT r.*,u.nome paciente,DATE_FORMAT(r.criado_em,'%Y-%m-%dT%H:%i:%s') criadoEm FROM requerimentos r JOIN usuarios u ON u.id=r.usuario_id ${req.user.perfil==='paciente'?'WHERE r.usuario_id=?':''} ORDER BY r.id DESC`,req.user.perfil==='paciente'?[req.user.id]:[]);
  res.json({documentos});
}));
router.post('/documentos',wrap(async(req,res)=>{
  if(req.user.perfil!=='paciente') fail(403,'Requerimento exclusivo do paciente.');
  if(!['atestado','laudo','declaracao'].includes(req.body.tipo)) fail(422,'Tipo inválido.');
  const description=text(req.body.descricao);
  if(description.length<3) fail(422,'Descreva sua solicitação.');
  await ensureDocuments();
  const [created]=await db.execute('INSERT INTO requerimentos(usuario_id,tipo,descricao) VALUES (?,?,?)',[req.user.id,req.body.tipo,description]);
  res.status(201).json({id:created.insertId,mensagem:`Solicitação #${created.insertId} registrada.`});
}));
router.patch('/documentos/:id',wrap(async(req,res)=>{
  clinical(req.user);
  if(!['liberado','retido'].includes(req.body.status)) fail(422,'Status inválido.');
  const reply=text(req.body.resposta);
  if(reply.length<3) fail(422,'Informe a orientação ao paciente.');
  await ensureDocuments();
  await transaction(async conn=>{
    const [[doc]]=await conn.query('SELECT * FROM requerimentos WHERE id=? FOR UPDATE',[id(req.params.id)]);
    if(!doc) fail(404,'Requerimento não encontrado.');
    await conn.query('UPDATE requerimentos SET status=?,resposta=? WHERE id=?',[req.body.status,reply,doc.id]);
    await notify(conn,doc.usuario_id,'Solicitação atualizada',`Seu requerimento #${doc.id} foi atualizado. Confira em Documentos.`,'sistema');
    await audit(conn,req.user,'responder_requerimento','requerimentos',doc.id);
  });
  res.json({mensagem:'Resposta enviada ao paciente.'});
}));
router.get('/perfil',wrap(async(req,res)=>{
  const [[cadastro]]=await db.query('SELECT * FROM usuarios_cadastro WHERE usuario_id=?',[req.user.id]).catch(error=>{if(error.code==='ER_NO_SUCH_TABLE')return [[]];throw error;});
  res.json({usuario:req.user,endereco:cadastro||null});
}));
router.patch('/perfil',wrap(async(req,res)=>{
  const name=text(req.body.nome,150), email=text(req.body.email,150).toLowerCase(), phone=String(req.body.telefone||'').replace(/\D/g,'');
  if(name.length<3||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||!/^\d{10,11}$/.test(phone)) fail(422,'Confira nome, e-mail e telefone.');
  try {await db.query('UPDATE usuarios SET nome=?,email=?,telefone=? WHERE id=?',[name,email,phone,req.user.id]);}
  catch(error){if(error.code==='ER_DUP_ENTRY') fail(409,'Este e-mail já está em uso.');throw error;}
  res.json({mensagem:'Perfil atualizado.'});
}));

router.use((error,_req,res,_next)=>{
  if(error.status) return res.status(error.status).json({mensagem:error.message});
  console.error('Erro do portal:',error.code||error.message);
  res.status(500).json({mensagem:'Não foi possível concluir a operação. Tente novamente.'});
});
module.exports=router;
