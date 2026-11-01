const { test } = require('node:test');
const assert = require('node:assert/strict');
const { cpfValido, cnpjValido, erroCadastro, normalizarDocumento } = require('../validacaoCadastro');

test('CPF: verifica os dois dígitos e rejeita sequências ou letras', () => {
  assert.equal(cpfValido('529.982.247-25'), true);
  for (const value of ['52998224724', '11111111111', '00000000000', '5299822472', 'A52998224725']) assert.equal(cpfValido(value), false);
});
test('CNPJ: valida formato numérico e alfanumérico sem perder letras', () => {
  assert.equal(cnpjValido('11.222.333/0001-81'), true);
  assert.equal(cnpjValido('12.ABC.345/01DE-35'), true);
  assert.equal(normalizarDocumento('12.abc.345/01de-35'), '12ABC34501DE35');
  for (const value of ['11222333000180', '00000000000000', '12ABC34501DE34', 'ABC']) assert.equal(cnpjValido(value), false);
});
const valid = { tipo: 'paciente', nome: 'Paciente de teste', documento: '529.982.247-25', email: 'teste@example.test', telefone: '11999999999', senha: 'TesteSeguro2026', confirmarSenha: 'TesteSeguro2026', cep: '01001000', uf: 'SP', cidade: 'São Paulo', rua: 'Praça da Sé', numero: '1' };
test('cadastro exige endereço, confirmação de senha e dados profissionais', () => {
  assert.equal(erroCadastro(valid), '');
  assert.match(erroCadastro({ ...valid, confirmarSenha: 'OutraSenha' }), /senhas/);
  assert.match(erroCadastro({ ...valid, uf: '' }), /estado/);
  assert.match(erroCadastro({ ...valid, tipo: 'profissional' }), /CRM/);
  assert.equal(erroCadastro({ ...valid, tipo: 'profissional', crm: 'CRM-SP 123456', especialidade: 'Clínica médica' }), '');
  assert.equal(erroCadastro({ ...valid, tipo: 'instituicao', documento: '12ABC34501DE35' }), '');
  assert.match(erroCadastro({ ...valid, tipo: 'administrativo' }), /tipo/);
});
