import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import PortalTriAqui from './PortalTriAqui';
import { ThemeProvider } from '../context/ThemeContext';
import { request } from '../services/triAqui';
jest.mock('../services/triAqui',()=>({ request:jest.fn() }));

const patient={id:1,nome:'Paciente teste',perfil:'paciente',documento:'52998224725',email:'teste@example.test',telefone:'11999999999'};
beforeEach(()=>{
  window.scrollTo=jest.fn();
  request.mockReset();
  request.mockImplementation(async path=>{
    if(path==='/profissionais')return {profissionais:[{id:2,usuario_id:4,nome:'Médico teste',especialidade_id:3,especialidade:'Clínica médica',unidade:'Centro'}]};
    if(path.startsWith('/horarios'))return {horarios:[{id:1,horario:'10:00',status:'disponivel',ocupado:0}]};
    return {[path.slice(1)]:[]};
  });
});
const renderPortal=(user=patient)=>render(<ThemeProvider><PortalTriAqui user={user} logout={()=>{}} updateUser={()=>{}}/></ThemeProvider>);

test('abre agendamento, carrega horários da API e envia a reserva escolhida',async()=>{
  renderPortal();
  await screen.findByText('Painel de cuidado');
  fireEvent.click(screen.getAllByRole('button',{name:'Agendar'})[0]);
  fireEvent.change(screen.getByLabelText('Especialidade'),{target:{value:'3'}});
  fireEvent.change(screen.getByLabelText('Profissional'),{target:{value:'2'}});
  fireEvent.change(screen.getByLabelText('Data'),{target:{value:'2027-01-15'}});
  await screen.findByRole('option',{name:'10:00'});
  fireEvent.change(screen.getByLabelText('Horário disponível'),{target:{value:'10:00'}});
  request.mockImplementationOnce(async()=>({mensagem:'Consulta agendada com sucesso.'}));
  fireEvent.click(screen.getByRole('button',{name:'Confirmar agendamento'}));
  await waitFor(()=>expect(request).toHaveBeenCalledWith('/consultas',expect.objectContaining({method:'POST',body:JSON.stringify({profissionalId:2,especialidadeId:3,data:'2027-01-15',horario:'10:00',observacoes:''})})));
  await screen.findByRole('status');
});
test('triagem envia sintomas e descrição, sem aceitar identidade de outro paciente',async()=>{
  renderPortal();await screen.findByText('Painel de cuidado');
  fireEvent.click(screen.getAllByRole('button',{name:'Triagem'})[0]);
  fireEvent.click(screen.getByRole('checkbox',{name:'Febre'}));
  fireEvent.change(screen.getByLabelText('Descreva o que sente e quando começou'),{target:{value:'Sintoma fictício'}});
  fireEvent.click(screen.getByRole('button',{name:'Enviar para avaliação'}));
  await waitFor(()=>expect(request).toHaveBeenCalledWith('/triagem',expect.objectContaining({method:'POST',body:JSON.stringify({sintomas:['Febre'],descricao:'Sintoma fictício'})})));
  await waitFor(()=>expect(screen.getByRole('button',{name:'Enviar para avaliação'})).not.toBeDisabled());
  expect(screen.getByLabelText('Descreva o que sente e quando começou')).toHaveValue('');
});
test('perfil administrativo não exibe triagem nem requerimentos clínicos',async()=>{
  renderPortal({...patient,perfil:'administrativo'});await screen.findByText('Painel de atendimento');
  expect(screen.queryByRole('button',{name:'Triagem'})).not.toBeInTheDocument();
  expect(screen.queryByRole('button',{name:'Documentos'})).not.toBeInTheDocument();
  expect(request).not.toHaveBeenCalledWith('/triagens');
  expect(request).not.toHaveBeenCalledWith('/documentos');
});

test('médico vê a sugestão de IA e altera com justificativa preservando a origem',async()=>{
  const fallback=request.getMockImplementation();
  let triage={id:8,paciente:'Paciente fictício',paciente_id:1,sintomas:['Exemplo'],descricao:'Dados fictícios',criadaEm:'2026-11-01T10:00:00',status:'pendente',prioridade:'baixa',situacao_avaliacao:'avaliada_ia',ia_estado:'avaliada_ia',prioridade_ia:'moderada',ia_avaliada_em:'2026-11-01T10:00:00',revisoes:[]};
  request.mockImplementation(async(path,options)=>{
    if(path==='/triagens')return {triagens:[triage]};
    if(path==='/triagens/8'){
      const body=JSON.parse(options.body);
      triage={...triage,status:'avaliada',prioridade:body.prioridade,situacao_avaliacao:'revisada_medico',revisoes:[{id:1,profissional:'Médico teste',criadoEm:'2026-11-01T10:05:00',prioridade_anterior:'moderada',prioridade_nova:body.prioridade,justificativa:body.justificativa}]};
      return {mensagem:'Revisão salva.'};
    }
    return fallback(path,options);
  });
  renderPortal({...patient,id:4,perfil:'profissional'});
  await screen.findByText('Painel de atendimento');
  fireEvent.click(screen.getAllByRole('button',{name:'Triagem'})[0]);
  expect(screen.getByText('Avaliada por IA',{exact:true})).toBeInTheDocument();
  expect(screen.getByLabelText('Prioridade clínica')).toHaveValue('moderada');
  fireEvent.change(screen.getByLabelText('Prioridade clínica'),{target:{value:'alta'}});
  const reason=screen.getByLabelText('Justificativa da alteração (obrigatória)');
  expect(reason).toBeRequired();
  fireEvent.change(reason,{target:{value:'Avaliação fictícia do profissional'}});
  fireEvent.click(screen.getByRole('button',{name:'Alterar prioridade e concluir revisão'}));
  await screen.findByText('Revisada pelo médico',{exact:true});
  expect(request).toHaveBeenCalledWith('/triagens/8',expect.objectContaining({method:'PATCH',body:JSON.stringify({prioridade:'alta',justificativa:'Avaliação fictícia do profissional'})}));
  expect(screen.getByText('Moderada',{selector:'strong'})).toBeInTheDocument();
  expect(screen.getByText('Alta',{selector:'strong'})).toBeInTheDocument();
  expect(screen.getByText('Histórico de revisões médicas (1)')).toBeInTheDocument();
});

test('indisponibilidade não aparece como avaliada por IA',async()=>{
  const fallback=request.getMockImplementation();
  request.mockImplementation(async(path,options)=>path==='/triagens'?{triagens:[{id:9,sintomas:[],descricao:'Exemplo fictício',status:'pendente',prioridade:'baixa',situacao_avaliacao:'pendente',ia_estado:'falha',ia_resumo:'A IA não concluiu a análise.',revisoes:[]}]}:fallback(path,options));
  renderPortal();await screen.findByText('Painel de cuidado');
  fireEvent.click(screen.getAllByRole('button',{name:'Triagem'})[0]);
  expect(screen.queryByText('Avaliada por IA',{exact:true})).not.toBeInTheDocument();
  expect(screen.getByText('Aguardando avaliação',{exact:true})).toBeInTheDocument();
});

test('paciente complementa uma triagem ambígua e mantém os campos se a IA não concluir',async()=>{
  const fallback=request.getMockImplementation();
  request.mockImplementation(async(path,options)=>{
    if(path==='/triagens')return {triagens:[{id:9,sintomas:['Dor','Febre','Tontura'],descricao:'',status:'pendente',prioridade:'baixa',situacao_avaliacao:'pendente',ia_estado:'sem_resultado',ia_resumo:'O modelo não diferenciou as prioridades.',revisoes:[]}]};
    if(path==='/triagem')return {mensagem:'Triagem salva. Resultado ambíguo.',avaliacaoIA:{estado:'sem_resultado',resumo:'O modelo não diferenciou as prioridades.'}};
    return fallback(path,options);
  });
  renderPortal();await screen.findByText('Painel de cuidado');
  fireEvent.click(screen.getAllByRole('button',{name:'Triagem'})[0]);
  fireEvent.click(screen.getByRole('button',{name:'Complementar sintomas'}));
  expect(screen.getByRole('checkbox',{name:'Febre'})).toBeChecked();
  const description=screen.getByLabelText('Descreva o que sente e quando começou');
  expect(description).toBeRequired();
  fireEvent.change(description,{target:{value:'Descrição fictícia para teste do formulário'}});
  fireEvent.click(screen.getByRole('button',{name:'Enviar nova avaliação'}));
  await screen.findByText(/Os campos foram mantidos/);
  expect(description).toHaveValue('Descrição fictícia para teste do formulário');
  expect(screen.getByRole('checkbox',{name:'Dor'})).toBeChecked();
  expect(screen.getByText(/Complementando as informações da triagem #9/)).toBeInTheDocument();
});
