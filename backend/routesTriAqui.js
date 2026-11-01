const express = require('express');

const router = express.Router();

let waitingQueue = [
  { id: 1, paciente: 'Bianca M.', motivo: 'Dor abdominal intensa', prioridade: 'alta', esperaMinutos: 18 },
  { id: 2, paciente: 'Rafael S.', motivo: 'Febre e mal-estar', prioridade: 'moderada', esperaMinutos: 32 },
  { id: 3, paciente: 'Carolina V.', motivo: 'Retorno clínico', prioridade: 'baixa', esperaMinutos: 48 },
];

const appointments = [
  { id: 1, horario: '08:30', paciente: 'Marina Costa', especialidade: 'Clínica médica', status: 'em_atendimento' },
  { id: 2, horario: '09:00', paciente: 'João Pedro Alves', especialidade: 'Cardiologia', status: 'confirmado' },
  { id: 3, horario: '09:30', paciente: null, especialidade: 'Clínica médica', status: 'vaga_liberada' },
  { id: 4, horario: '10:00', paciente: 'Ana Beatriz Lima', especialidade: 'Pediatria', status: 'confirmado' },
];

router.get('/dashboard', (_req, res) => {
  res.json({
    atendimentosHoje: 24,
    tempoMedioEspera: 18,
    agenda: appointments,
    fila: waitingQueue,
  });
});

router.post('/triagem', (req, res) => {
  const { paciente = 'Paciente', sintomas = [], descricao = '' } = req.body;
  const critical = sintomas.some((item) => /respirar|intensa/i.test(item));
  const prioridade = critical ? 'alta' : sintomas.length >= 2 ? 'moderada' : 'baixa';
  const triagem = { id: Date.now(), paciente, sintomas, descricao, prioridade, criadaEm: new Date().toISOString() };
  res.status(201).json({ triagem, mensagem: 'Triagem recebida e enviada para avaliação da equipe.' });
});

router.post('/realocacoes/:vagaId', (req, res) => {
  const slot = appointments.find((item) => item.id === Number(req.params.vagaId));
  if (!slot || slot.status !== 'vaga_liberada') return res.status(404).json({ mensagem: 'Vaga disponível não encontrada.' });
  const next = waitingQueue.shift();
  if (!next) return res.status(409).json({ mensagem: 'Não há pacientes elegíveis na fila.' });
  slot.paciente = next.paciente;
  slot.status = 'realocado';
  res.json({ vaga: slot, pacienteRealocado: next, fila: waitingQueue });
});

module.exports = router;
