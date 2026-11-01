import React, { useCallback, useEffect, useState } from 'react';
import { Activity, Bell, CalendarDays, CircleHelp, FileText, HeartPulse, LogOut, Plus, RefreshCw, User, Users } from 'lucide-react';
import { request } from '../services/triAqui';
import { ThemeButton } from '../context/ThemeContext';
import Logo from '../img/logo-triaqui.svg';
import '../css/PortalTriAqui.css';

const labels = { confirmada:'Confirmada',agendada:'Agendada',em_atendimento:'Em atendimento',concluida:'Concluída',cancelada:'Cancelada',falta:'Não compareceu',vaga_liberada:'Vaga liberada',realocada:'Realocada',aberto:'Aberto',liberado:'Liberado',retido:'Pendente de regularização',pendente:'Aguardando avaliação',avaliada:'Avaliada',avaliada_ia:'Avaliada por IA',revisada_medico:'Revisada pelo médico' };
const riskLabels = { baixa:'Baixa',moderada:'Moderada',alta:'Alta',emergencia:'Emergência' };
const active = ['agendada','confirmada','realocada'];
const formatDate = value => value ? new Date(value).toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'}) : '—';
const today = () => new Date().toLocaleDateString('en-CA');
const isoDate = date => date.slice(0,10);
const empty = { consultas:[],profissionais:[],triagens:[],notificacoes:[],fila:[],documentos:[] };
function Status({ value }) { return <span className={`status-chip ${value}`}>{labels[value] || riskLabels[value] || value}</span>; }
function Empty({ children }) { return <p className="empty-state">{children}</p>; }
function Heading({ title, eyebrow }) { return <div className="screen-heading"><div><span>{eyebrow}</span><h1>{title}</h1></div></div>; }
function Field({ label, children }) { return <label className="form-field"><span>{label}</span>{children}</label>; }
function Confirm({ children, action, disabled }) {
  const [confirm,setConfirm]=useState(false);
  return confirm ? <span className="portal-confirm"><button disabled={disabled} className="secondary-action" onClick={async()=>{await action();setConfirm(false);}}>Confirmar</button><button className="text-button" onClick={()=>setConfirm(false)}>Voltar</button></span> : <button disabled={disabled} className="text-button" onClick={()=>setConfirm(true)}>{children}</button>;
}

export default function PortalTriAqui({ user, logout, updateUser }) {
  const [tab,setTab]=useState('inicio');
  const [data,setData]=useState(empty);
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [message,setMessage]=useState('');
  const [editing,setEditing]=useState(null);
  const staff=user.perfil!=='paciente';
  const clinician=user.perfil==='profissional';
  useEffect(()=>{ window.scrollTo(0,0); },[tab]);
  const refresh=useCallback(async()=>{
    const resources=['consultas','profissionais','notificacoes','fila',...(user.perfil==='administrativo'?[]:['triagens','documentos'])];
    const results=await Promise.all(resources.map(key=>request('/'+key)));
    setData(Object.assign({},empty,...results));
  },[user.perfil]);
  useEffect(()=>{
    let alive=true;
    const load=()=>refresh().catch(e=>{if(alive)setError(e.message);}).finally(()=>{if(alive)setLoading(false);});
    load(); const timer=setInterval(load,20000);
    return ()=>{alive=false;clearInterval(timer);};
  },[refresh]);
  const mutate=async(path,method='POST',body)=>{
    if(busy)return false;
    setBusy(true);setError('');setMessage('');
    try { const result=await request(path,{method,...(body?{body:JSON.stringify(body)}:{})});setMessage(result.mensagem||'Alteração salva.');await refresh();return result; }
    catch(e){setError(e.message);return false;}
    finally{setBusy(false);}
  };
  const navigate=key=>{setTab(key);setError('');setMessage('');};
  const schedule=appointment=>{setEditing(appointment||null);navigate('agendar');};
  const unread=data.notificacoes.filter(n=>!n.lida_em).length;
  const nav=[['inicio','Início',Activity],['agenda',staff?'Agenda':'Minhas consultas',CalendarDays],...(staff?[['horarios','Disponibilidade',Plus]]:[['agendar','Agendar',Plus]]),...(user.perfil==='administrativo'?[]:[['triagem','Triagem',HeartPulse]]),['fila','Fila',Users],['notificacoes','Avisos',Bell],...(user.perfil==='administrativo'?[]:[['documentos','Documentos',FileText]]),['perfil','Meus dados',User],['ajuda','Ajuda',CircleHelp]];
  return <div className="portal-shell">
    <header className="portal-navbar app-navbar"><div className="brand-link"><img src={Logo} alt="TriAqui" /></div><nav aria-label="Navegação principal">{nav.map(([key,title,Icon])=><button key={key} className={tab===key?'active':''} aria-current={tab===key?'page':undefined} onClick={()=>{if(key==='agendar')setEditing(null);navigate(key);}}><Icon size={16}/>{title}{key==='notificacoes'&&unread>0&&<span className="portal-badge">{unread}</span>}</button>)}</nav><div className="portal-user-actions"><ThemeButton/><button className="logout-button" onClick={logout}><LogOut size={17}/>Sair</button></div></header>
    <main className="layout-app portal-main"><div className="portal-container">
      <div className="portal-toolbar"><span>{user.nome} · {staff?'Equipe':'Paciente'}</span><button className="text-button" disabled={busy} onClick={()=>{setError('');refresh().catch(e=>setError(e.message));}}><RefreshCw size={16}/>Atualizar</button></div>
      {error&&<div className="form-error" role="alert">{error}</div>}{message&&<div className="portal-success" role="status">{message}</div>}
      {loading?<p className="page-loading">Carregando seus dados...</p>:<>
        {tab==='inicio'&&<Overview data={data} user={user} navigate={navigate} schedule={schedule}/>}
        {tab==='agendar'&&<Booking key={editing?.id||'new'} editing={editing} doctors={data.profissionais} mutate={mutate} busy={busy} onSaved={()=>{setEditing(null);setTab('agenda');}}/>}
        {tab==='agenda'&&<Agenda data={data.consultas} staff={staff} mutate={mutate} busy={busy} schedule={schedule}/>}
        {tab==='horarios'&&<Availability doctors={data.profissionais} user={user} mutate={mutate} busy={busy}/>}
        {tab==='triagem'&&<Triage data={data.triagens} clinician={clinician} mutate={mutate} busy={busy}/>}
        {tab==='fila'&&<Queue data={data} staff={staff} mutate={mutate} busy={busy}/>}
        {tab==='notificacoes'&&<Notifications rows={data.notificacoes} mutate={mutate} busy={busy}/>}
        {tab==='documentos'&&<Documents rows={data.documentos} clinician={clinician} mutate={mutate} busy={busy}/>}
        {tab==='perfil'&&<Profile user={user} mutate={mutate} updateUser={updateUser} busy={busy}/>}
        {tab==='ajuda'&&<Help/>}
      </>}
    </div></main>
  </div>;
}

function Overview({data,user,navigate,schedule}) {
  const staff=user.perfil!=='paciente';
  const upcoming=data.consultas.filter(c=>active.includes(c.status)&&new Date(c.inicio)>new Date()).sort((a,b)=>a.inicio.localeCompare(b.inicio));
  const day=data.consultas.filter(c=>isoDate(c.inicio)===today()&&c.paciente_id&&!['cancelada','falta'].includes(c.status));
  return <section className="dashboard-grid portal-home"><div className="welcome-panel"><img src={Logo} alt="TriAqui"/><span className="eyebrow">Olá, {user.nome.split(' ')[0]}</span><h1>{staff?'Painel de atendimento':'Painel de cuidado'}</h1><p>{staff?'Acompanhe a agenda e a fila, publique horários e mantenha os atendimentos atualizados.':'Agende consultas, acompanhe sua triagem e receba atualizações do seu atendimento.'}</p></div><div className="metric-card"><CalendarDays/><span>{staff?'Atendimentos hoje':'Próximas consultas'}</span><strong>{staff?day.length:upcoming.length}</strong></div><div className="metric-card"><Users/><span>Na fila de espera</span><strong>{data.fila.length}</strong></div><div className="quick-actions"><button className="primary-action" onClick={()=>staff?navigate('horarios'):schedule()}>{staff?'Publicar horários':'Agendar'}</button><button className="secondary-action" onClick={()=>navigate('agenda')}>Ver agenda</button><button className="dark-action" onClick={()=>navigate(user.perfil==='administrativo'?'fila':'triagem')}>{user.perfil==='administrativo'?'Ver fila':'Triagem'}</button></div><article className="appointments-card wide-home"><div className="section-title"><span>{staff?'Agenda de hoje':'Próximas consultas'}</span><button onClick={()=>navigate('agenda')}>Ver todas</button></div>{(staff?day:upcoming).slice(0,5).map(c=><div className="upcoming-row" key={c.id}><div><strong>{c.especialidade}</strong><span>{formatDate(c.inicio)} · {staff?c.paciente:c.profissional}</span></div><Status value={c.status}/></div>)}{!(staff?day:upcoming).length&&<Empty>Nenhuma consulta neste período.</Empty>}</article></section>;
}

function Booking({ doctors, editing, mutate, busy, onSaved }) {
  const specialties=[...new Map(doctors.map(d=>[d.especialidade_id,d.especialidade])).entries()];
  const [specialty,setSpecialty]=useState(String(editing?.especialidade_id||''));
  const [doctor,setDoctor]=useState(String(editing?.profissional_id||''));
  const [date,setDate]=useState('');
  const [time,setTime]=useState('');
  const [notes,setNotes]=useState('');
  const [slots,setSlots]=useState([]);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState('');
  useEffect(()=>{
    let alive=true;setSlots([]);setTime('');setError('');
    if(!date||!doctor)return;
    setLoading(true);
    request(`/horarios?profissionalId=${doctor}&data=${date}`).then(r=>{if(alive)setSlots(r.horarios.filter(s=>!s.ocupado&&s.status==='disponivel'));}).catch(e=>{if(alive)setError(e.message);}).finally(()=>{if(alive)setLoading(false);});
    return()=>{alive=false;};
  },[date,doctor]);
  return <section className="screen-card"><Heading eyebrow="Agendamento" title={editing?'Reagendar consulta':'Agendar consulta'}/>{editing&&<p>Atual: {formatDate(editing.inicio)} · {editing.profissional}</p>}<form className="form-grid" onSubmit={async e=>{e.preventDefault();if(await mutate(editing?`/consultas/${editing.id}/reagendar`:'/consultas',editing?'PATCH':'POST',{profissionalId:Number(doctor),especialidadeId:Number(specialty),data:date,horario:time,observacoes:notes}))onSaved();}}>
    <Field label="Especialidade"><select required value={specialty} disabled={!!editing} onChange={e=>{setSpecialty(e.target.value);setDoctor('');}}><option value="">Selecione</option>{specialties.map(([id,name])=><option key={id} value={id}>{name}</option>)}</select></Field>
    <Field label="Profissional"><select required value={doctor} disabled={!!editing} onChange={e=>setDoctor(e.target.value)}><option value="">Selecione</option>{doctors.filter(d=>String(d.especialidade_id)===specialty).map(d=><option key={d.id} value={d.id}>{d.nome} · {d.unidade}</option>)}</select></Field>
    <Field label="Data"><input type="date" required value={date} min={today()} onChange={e=>setDate(e.target.value)}/></Field>
    <Field label="Horário disponível"><select required value={time} disabled={loading||!slots.length} onChange={e=>setTime(e.target.value)}><option value="">{loading?'Carregando...':'Selecione'}</option>{slots.map(s=><option key={s.id} value={s.horario}>{s.horario}</option>)}</select></Field>
    {date&&doctor&&!loading&&!slots.length&&<p className="empty-state wide">Sem horários disponíveis nessa data. Tente outra data ou entre na fila de espera.</p>}{error&&<p className="form-error wide">{error}</p>}
    {!editing&&<label className="form-field wide"><span>Observações para o agendamento (opcional)</span><textarea maxLength={2000} value={notes} onChange={e=>setNotes(e.target.value)}/></label>}
    <button className="primary-action" disabled={busy||!time}>{busy?'Salvando...':editing?'Confirmar novo horário':'Confirmar agendamento'}</button>
  </form>{!doctors.length&&<Empty>A equipe ainda não publicou profissionais e especialidades.</Empty>}</section>;
}

function Agenda({data,staff,mutate,busy,schedule}) {
  const [date,setDate]=useState(''),[search,setSearch]=useState('');
  const rows=data.filter(c=>(!date||isoDate(c.inicio)===date)&&`${c.especialidade} ${c.profissional} ${c.paciente}`.toLowerCase().includes(search.toLowerCase()));
  return <section className="screen-card"><Heading eyebrow="Agenda" title={staff?'Grade de atendimento':'Minhas consultas'}/><div className="portal-filters"><Field label="Filtrar por data"><input type="date" value={date} onChange={e=>setDate(e.target.value)}/></Field><Field label="Buscar"><input type="search" placeholder="Nome ou especialidade" value={search} onChange={e=>setSearch(e.target.value)}/></Field><button className="text-button" onClick={()=>{setDate('');setSearch('');}}>Limpar filtros</button></div><div className="portal-list">{rows.map(c=><article className="portal-record" key={c.id}><div className="portal-record-heading"><div><strong>{c.especialidade}</strong><p>{formatDate(c.inicio)} · {c.profissional} · {c.unidade}</p>{staff&&<p>Paciente: {c.paciente}</p>}</div><Status value={c.status}/></div><div className="portal-row-actions">
      {active.includes(c.status)&&new Date(c.inicio)>new Date()&&<><button disabled={busy} className="secondary-action" onClick={()=>schedule(c)}>Reagendar</button><Confirm disabled={busy} action={()=>mutate(`/consultas/${c.id}/status`,'PATCH',{status:'cancelada'})}>Cancelar consulta</Confirm></>}
      {staff&&active.includes(c.status)&&<><button className="primary-action" disabled={busy} onClick={()=>mutate(`/consultas/${c.id}/status`,'PATCH',{status:'em_atendimento'})}>Iniciar atendimento</button><Confirm disabled={busy} action={()=>mutate(`/consultas/${c.id}/status`,'PATCH',{status:'falta'})}>Registrar falta</Confirm></>}
      {staff&&c.status==='em_atendimento'&&<button className="primary-action" disabled={busy} onClick={()=>mutate(`/consultas/${c.id}/status`,'PATCH',{status:'concluida'})}>Concluir atendimento</button>}
      {staff&&c.status==='vaga_liberada'&&new Date(c.inicio)>new Date()&&<button className="primary-action" disabled={busy} onClick={()=>mutate(`/realocacoes/${c.id}`)}>Realocar próximo da fila</button>}
    </div></article>)}</div>{!rows.length&&<Empty>Nenhuma consulta encontrada.</Empty>}</section>;
}

function Availability({doctors,user,mutate,busy}) {
  const options=[...new Map(doctors.filter(d=>user.perfil==='administrativo'||d.usuario_id===user.id).map(d=>[d.id,d])).values()];
  const [doctor,setDoctor]=useState(String(options[0]?.id||'')),[date,setDate]=useState(today()),[time,setTime]=useState(''),[slots,setSlots]=useState([]),[error,setError]=useState('');
  const load=useCallback(()=>{if(!doctor||!date)return;return request(`/horarios?profissionalId=${doctor}&data=${date}`).then(r=>setSlots(r.horarios)).catch(e=>setError(e.message));},[doctor,date]);
  useEffect(()=>{setSlots([]);load();},[load]);
  return <section className="screen-card"><Heading eyebrow="Escala médica" title="Disponibilidade"/><p>Publique horários de 30 minutos para permitir que os pacientes agendem.</p><form className="form-grid" onSubmit={async e=>{e.preventDefault();if(await mutate('/horarios','POST',{profissionalId:Number(doctor),data:date,horario:time})){setTime('');load();}}}><Field label="Profissional"><select required value={doctor} onChange={e=>setDoctor(e.target.value)}><option value="">Selecione</option>{options.map(d=><option key={d.id} value={d.id}>{d.nome}</option>)}</select></Field><Field label="Data"><input required type="date" min={today()} value={date} onChange={e=>setDate(e.target.value)}/></Field><Field label="Início do horário"><input required type="time" value={time} onChange={e=>setTime(e.target.value)}/></Field><button className="primary-action" disabled={busy||!options.length}>Publicar horário</button></form>{error&&<p className="form-error">{error}</p>}{!options.length&&<Empty>Nenhum profissional disponível para sua conta.</Empty>}<div className="portal-list">{slots.map(s=><div className="portal-record portal-record-heading" key={s.id}><strong>{s.horario}</strong><span>{s.ocupado?'Reservado':s.status==='bloqueado'?'Bloqueado':'Disponível'}</span>{!s.ocupado&&<button className="text-button" disabled={busy} onClick={async()=>{if(await mutate(`/horarios/${s.id}`,'PATCH',{status:s.status==='bloqueado'?'disponivel':'bloqueado'}))load();}}>{s.status==='bloqueado'?'Liberar':'Bloquear'}</button>}</div>)}</div></section>;
}

function Triage({data,clinician,mutate,busy}) {
  const [selected,setSelected]=useState([]),[description,setDescription]=useState('');
  const [complementing,setComplementing]=useState(null);
  const [analysisNotice,setAnalysisNotice]=useState('');
  const formRef=React.useRef(null);
  const symptoms=['Dor','Febre','Dificuldade para respirar','Tontura','Mal-estar','Outro'];
  const complement=t=>{
    let original=t.sintomas;
    if(typeof original==='string'){try{original=JSON.parse(original);}catch{original=[];}}
    setSelected(Array.isArray(original)?original:[]);
    setDescription(t.descricao||'');
    setComplementing(t.id);
    setAnalysisNotice('');
    formRef.current?.scrollIntoView?.({behavior:'smooth',block:'start'});
  };
  const submit=async e=>{
    e.preventDefault();
    setAnalysisNotice('');
    const result=await mutate('/triagem','POST',{sintomas:selected,descricao:description});
    if(!result)return;
    if(result.avaliacaoIA&&result.avaliacaoIA.estado!=='avaliada_ia'){
      setAnalysisNotice(result.avaliacaoIA.resumo+' Os campos foram mantidos para você complementar as informações. A avaliação profissional continua disponível.');
      return;
    }
    setSelected([]);setDescription('');setComplementing(null);
  };
  return <section className="screen-card"><Heading eyebrow="Triagem" title={clinician?'Avaliar triagens':'Como você está se sentindo?'}/>{!clinician&&<>
    <p>A IA gera uma sugestão inicial a partir dos sintomas; o médico pode confirmar ou alterar a prioridade. Em caso de emergência, procure atendimento imediato.</p>
    {complementing&&<p className="triage-ai-notice" role="status">Complementando as informações da triagem #{complementing}. O envio criará uma nova avaliação e preservará o registro anterior.</p>}
    <form ref={formRef} className="form-grid triage-patient-form" onSubmit={submit}>
      <div className="risk-options wide"><span>Sintomas</span><div>{symptoms.map(s=><label key={s}><input type="checkbox" checked={selected.includes(s)} onChange={()=>setSelected(old=>old.includes(s)?old.filter(x=>x!==s):[...old,s])}/>{s}</label>)}</div></div>
      <label className="form-field wide"><span>Descreva o que sente e quando começou</span><textarea required minLength={10} value={description} maxLength={2000} aria-describedby="triage-description-help" placeholder="Conte o que sente, onde, há quanto tempo e a intensidade." onChange={e=>setDescription(e.target.value)}/></label>
      <p id="triage-description-help" className="triage-ai-notice wide">Descreva os sintomas com suas palavras, incluindo local, intensidade e quando começaram. Apenas marcar sintomas genéricos pode não ser suficiente para a IA.</p>
      {analysisNotice&&<p className="triage-ai-notice wide" role="status">{analysisNotice}</p>}
      <button className="primary-action" disabled={busy}>{busy?'Analisando...':complementing?'Enviar nova avaliação':'Enviar para avaliação'}</button>
    </form>
  </>}
    <p className="triage-ai-notice">IA local experimental, treinada com exemplos fictícios. A sugestão não é uma classificação clínica validada e aguarda revisão médica.</p>
    <div className="section-title portal-section-title"><span>{clinician?'Registros para avaliação':'Minhas triagens'}</span></div>
    {data.map(t=><TriageRecord key={t.id} record={t} clinician={clinician} mutate={mutate} busy={busy} onComplement={complement}/>)}
    {!data.length&&<Empty>Nenhuma triagem registrada.</Empty>}
  </section>;
}

function TriageRecord({record:t,clinician,mutate,busy,onComplement}) {
  const suggested=t.prioridade_ia;
  const initial=t.status==='avaliada'?t.prioridade:suggested||t.prioridade;
  const [priority,setPriority]=useState(initial);
  const [reason,setReason]=useState('');
  useEffect(()=>{setPriority(initial);},[initial]);
  const changed=(suggested||t.status==='avaliada')&&priority!==initial;
  let symptoms=t.sintomas;
  if(typeof symptoms==='string'){try{symptoms=JSON.parse(symptoms);}catch{symptoms=[];}}
  const state=t.situacao_avaliacao||(t.status==='avaliada'?'revisada_medico':'pendente');
  return <article className="portal-record">
    <div className="portal-record-heading"><strong>{clinician?t.paciente:`Triagem #${t.id}`}</strong><Status value={state}/></div>
    <p>{formatDate(t.criadaEm)}</p><p>{(symptoms||[]).join(', ')}</p><p className="portal-prewrap">{t.descricao}</p>
    {t.ia_estado==='avaliada_ia'&&suggested?<div className="triage-ai-result"><strong>Avaliação inicial por IA</strong><p>Prioridade sugerida: <strong>{riskLabels[suggested]}</strong></p><p>Gerada em {formatDate(t.ia_avaliada_em)} · Modelo local experimental.</p>{t.status!=='avaliada'&&<span>Prioridade provisória aplicada à fila pela IA. A revisão médica continua pendente.</span>}</div>:t.ia_estado&&<p className="triage-ai-notice">{t.ia_resumo||'A IA não concluiu a avaliação. Aguarde a equipe médica.'}</p>}
    {t.status==='avaliada'?<p>Prioridade confirmada pelo médico: <strong>{riskLabels[t.prioridade]}</strong></p>:!suggested&&<p>A prioridade será definida após avaliação profissional.</p>}
    {!clinician&&t.status!=='avaliada'&&['sem_resultado','falha'].includes(t.ia_estado)&&<button className="secondary-action" disabled={busy} onClick={()=>onComplement(t)}>Complementar sintomas</button>}
    {clinician&&<form className="form-grid triage-medical-review" onSubmit={async e=>{e.preventDefault();if(await mutate(`/triagens/${t.id}`,'PATCH',{prioridade:priority,justificativa:reason}))setReason('');}}>
      <Field label="Prioridade clínica"><select value={priority} onChange={e=>setPriority(e.target.value)}>{Object.entries(riskLabels).map(([key,title])=><option key={key} value={key}>{title}</option>)}</select></Field>
      <label className="form-field wide"><span>{changed?'Justificativa da alteração (obrigatória)':'Observação da revisão (opcional)'}</span><textarea required={!!changed} minLength={changed?3:undefined} maxLength={1000} value={reason} onChange={e=>setReason(e.target.value)}/></label>
      <button className="primary-action" disabled={busy}>{t.status==='avaliada'?'Salvar nova revisão':changed?'Alterar prioridade e concluir revisão':'Confirmar prioridade e concluir revisão'}</button>
    </form>}
    {!!t.revisoes?.length&&<details className="triage-revision-history"><summary>Histórico de revisões médicas ({t.revisoes.length})</summary>{t.revisoes.map(r=><div key={r.id}><p><strong>{r.profissional}</strong> · {formatDate(r.criadoEm)}</p><p>{riskLabels[r.prioridade_anterior]} → {riskLabels[r.prioridade_nova]}</p>{r.justificativa&&<p className="portal-prewrap">{r.justificativa}</p>}</div>)}</details>}
  </article>;
}

function Queue({data,staff,mutate,busy}) {
  const [specialty,setSpecialty]=useState('');
  const specialties=[...new Map(data.profissionais.map(d=>[d.especialidade_id,d.especialidade])).entries()];
  return <section className="screen-card"><Heading eyebrow="Fila dinâmica" title={staff?'Fila de espera':'Minha fila de espera'}/><p>Vagas liberadas seguem a prioridade atual da fila, definida provisoriamente pela IA ou revisada pelo médico. Dentro de cada prioridade, vale a ordem de entrada.</p>{!staff&&<form className="portal-review" onSubmit={e=>{e.preventDefault();mutate('/fila','POST',{especialidadeId:Number(specialty)});}}><Field label="Especialidade"><select required value={specialty} onChange={e=>setSpecialty(e.target.value)}><option value="">Selecione</option>{specialties.map(([id,title])=><option key={id} value={id}>{title}</option>)}</select></Field><button className="primary-action" disabled={busy}>Entrar na fila</button></form>}{data.fila.map((f,index)=><article className="portal-record" key={f.id}><div className="portal-record-heading"><strong>{staff?`${index+1}. ${f.paciente}`:f.especialidade||'Qualquer especialidade'}</strong><Status value={f.prioridade}/></div><p>{f.especialidade||'Qualquer especialidade'} · Aguardando {f.esperaMinutos} min</p>{!!f.revisao_pendente&&<p>{f.revisao_pendente_ia?'Prioridade provisória por IA · revisão médica pendente.':'Revisão médica pendente.'}</p>}{!staff&&<Confirm disabled={busy} action={()=>mutate(`/fila/${f.id}/sair`,'PATCH')}>Sair da fila</Confirm>}</article>)}{!data.fila.length&&<Empty>Nenhum paciente aguardando.</Empty>}{staff&&<><div className="section-title portal-section-title"><span>Vagas para realocação</span></div>{data.consultas.filter(c=>c.status==='vaga_liberada'&&new Date(c.inicio)>new Date()).map(c=><article className="portal-record" key={c.id}><p>{formatDate(c.inicio)} · {c.especialidade} · {c.profissional}</p><button className="primary-action" disabled={busy} onClick={()=>mutate(`/realocacoes/${c.id}`)}>Realocar próximo paciente elegível</button></article>)}</>}</section>;
}

function Notifications({rows,mutate,busy}) {return <section className="screen-card"><Heading eyebrow="Atualizações" title="Notificações"/>{rows.map(n=><article className={`portal-record ${!n.lida_em?'unread':''}`} key={n.id}><div className="portal-record-heading"><strong>{n.titulo}</strong><small>{formatDate(n.criadoEm)}</small></div><p>{n.mensagem}</p>{!n.lida_em&&<button className="text-button" disabled={busy} onClick={()=>mutate(`/notificacoes/${n.id}/ler`,'PATCH')}>Marcar como lida</button>}</article>)}{!rows.length&&<Empty>Você não tem notificações.</Empty>}</section>;}

function Documents({rows,clinician,mutate,busy}) {
  const [type,setType]=useState('declaracao'),[description,setDescription]=useState('');
  return <section className="screen-card"><Heading eyebrow="Requerimentos" title="Documentos"/>{!clinician&&<form className="form-grid" onSubmit={async e=>{e.preventDefault();if(await mutate('/documentos','POST',{tipo:type,descricao:description}))setDescription('');}}><Field label="Tipo de documento"><select value={type} onChange={e=>setType(e.target.value)}><option value="declaracao">Declaração</option><option value="atestado">Atestado</option><option value="laudo">Laudo</option></select></Field><label className="form-field wide"><span>Descreva sua solicitação</span><textarea required minLength={3} maxLength={2000} value={description} onChange={e=>setDescription(e.target.value)}/></label><button className="primary-action" disabled={busy}>Solicitar documento</button></form>}<p>As solicitações são analisadas pela equipe. A emissão e assinatura de documentos médicos são feitas pela unidade.</p>{rows.map(doc=><DocumentRecord key={doc.id} doc={doc} clinician={clinician} mutate={mutate} busy={busy}/>)}{!rows.length&&<Empty>Nenhuma solicitação registrada.</Empty>}</section>;
}
function DocumentRecord({doc,clinician,mutate,busy}) {
  const [reply,setReply]=useState(doc.resposta||''),[status,setStatus]=useState(doc.status==='aberto'?'liberado':doc.status);
  return <article className="portal-record"><div className="portal-record-heading"><strong>Protocolo #{doc.id} · {doc.tipo}{clinician?` · ${doc.paciente}`:''}</strong><Status value={doc.status}/></div><p>{formatDate(doc.criadoEm)}</p><p className="portal-prewrap">{doc.descricao}</p>{doc.resposta&&<p className="portal-prewrap"><strong>Orientação da equipe: </strong>{doc.resposta}</p>}{clinician&&<form className="form-grid" onSubmit={e=>{e.preventDefault();mutate(`/documentos/${doc.id}`,'PATCH',{status,resposta:reply});}}><Field label="Status"><select value={status} onChange={e=>setStatus(e.target.value)}><option value="liberado">Liberado para retirada</option><option value="retido">Pendente de regularização</option></select></Field><label className="form-field wide"><span>Orientação ao paciente</span><textarea required minLength={3} maxLength={2000} value={reply} onChange={e=>setReply(e.target.value)}/></label><button className="primary-action" disabled={busy}>Responder solicitação</button></form>}</article>;
}

function Profile({user,mutate,updateUser,busy}) {
  const [form,setForm]=useState({nome:user.nome,email:user.email,telefone:user.telefone||''});
  return <section className="screen-card"><Heading eyebrow="Minha conta" title="Meus dados"/><p>CPF/CNPJ: {user.documento.length===11?`${user.documento.slice(0,3)}.***.***-${user.documento.slice(-2)}`:`${user.documento.slice(0,2)}.***.***/****-${user.documento.slice(-2)}`}</p><form className="form-grid" onSubmit={async e=>{e.preventDefault();if(await mutate('/perfil','PATCH',form))updateUser({...user,...form});}}>{[['nome','Nome','text'],['email','E-mail','email'],['telefone','Telefone com DDD','tel']].map(([key,label,type])=><Field key={key} label={label}><input type={type} required value={form[key]} maxLength={key==='telefone'?20:150} onChange={e=>setForm({...form,[key]:e.target.value})}/></Field>)}<button className="primary-action" disabled={busy}>Salvar alterações</button></form></section>;
}
function Help(){return <section className="screen-card"><Heading eyebrow="Dúvidas frequentes" title="Como usar o TriAqui"/>{[['Como agendar?','Acesse Agendar, escolha a especialidade, o profissional, a data e um horário publicado pela equipe.'],['Não há horário disponível. O que fazer?','Tente outra data ou entre na fila de espera da especialidade. Uma realocação será informada em Avisos.'],['Como cancelar ou reagendar?','Abra Minhas consultas e escolha a ação na consulta futura. Vagas liberadas podem ser realocadas para pacientes da fila.'],['Como funciona a triagem?','Descreva os sintomas. A IA local sugere uma prioridade inicial, identificada como Avaliada por IA. O médico pode confirmar ou alterar a sugestão, com registro do histórico. Este modelo experimental não substitui avaliação clínica.'],['Como recuperar minha senha?','Procure a secretaria da unidade para solicitar recuperação de acesso.'],['Onde recebo avisos?','As alterações da consulta, da fila e dos requerimentos aparecem em Avisos.']].map(([q,a])=><details className="portal-faq" key={q}><summary>{q}</summary><p>{a}</p></details>)}</section>;}
