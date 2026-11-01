import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import CriarContaTriAqui from './CriarContaTriAqui';
import { ThemeProvider, ThemeButton } from '../context/ThemeContext';
import { TextEncoder } from 'util';

beforeEach(() => { localStorage.clear(); global.fetch = jest.fn(); global.TextEncoder = TextEncoder; });
afterEach(() => { jest.useRealTimers(); });

test('modo noturno alterna o tema e persiste a preferência', () => {
  render(<ThemeProvider><ThemeButton /></ThemeProvider>);
  fireEvent.click(screen.getByRole('button', { name: 'Ativar modo noturno' }));
  expect(document.body).toHaveAttribute('data-theme', 'dark');
  expect(localStorage.getItem('dark-mode')).toBe('true');
  fireEvent.click(screen.getByRole('button', { name: 'Ativar modo claro' }));
  expect(document.body).toHaveAttribute('data-theme', 'light');
});

test('cadastro valida o documento por perfil e consulta/preenche o CEP', async () => {
  global.fetch.mockResolvedValue({ ok: true, json: async () => ({ uf: 'SP', localidade: 'São Paulo', bairro: 'Sé', logradouro: 'Praça da Sé' }) });
  render(<ThemeProvider><CriarContaTriAqui onBack={() => {}} /></ThemeProvider>);
  const cpf = screen.getByLabelText('CPF');
  fireEvent.change(cpf, { target: { value: '11111111111' } });
  fireEvent.blur(cpf);
  expect(cpf).toHaveAttribute('aria-invalid', 'true');
  fireEvent.change(cpf, { target: { value: '52998224725' } });
  expect(cpf).toHaveValue('529.982.247-25');
  expect(cpf).toHaveAttribute('aria-invalid', 'false');
  fireEvent.click(screen.getByRole('button', { name: /Instituição/ }));
  const cnpj = screen.getByLabelText('CNPJ');
  fireEvent.change(cnpj, { target: { value: '12ABC34501DE35' } });
  expect(cnpj).toHaveValue('12.ABC.345/01DE-35');
  fireEvent.change(screen.getByLabelText('CEP'), { target: { value: '01001000' } });
  await waitFor(() => expect(screen.getByLabelText('Cidade')).toHaveValue('São Paulo'));
  expect(screen.getByLabelText('Rua / logradouro')).toHaveValue('Praça da Sé');
  expect(screen.getByLabelText('Bairro')).toHaveValue('Sé');
  expect(screen.getByLabelText('Estado (UF)')).toHaveValue('SP');
});

test('cadastro envia os campos à API e só mostra sucesso depois da confirmação', async () => {
  global.fetch.mockImplementation(async (url) => url.includes('viacep')
    ? { ok: true, json: async () => ({ uf: 'SP', localidade: 'São Paulo', bairro: 'Sé', logradouro: 'Praça da Sé' }) }
    : { ok: true, json: async () => ({ mensagem: 'Cadastro concluído.' }) });
  const onBack = jest.fn();
  render(<ThemeProvider><CriarContaTriAqui onBack={onBack} /></ThemeProvider>);
  for (const [label, value] of [['Nome completo', 'Paciente de teste'], ['CPF', '52998224725'], ['E-mail', 'teste@example.test'], ['Telefone com DDD', '11999999999'], ['Senha', 'TesteSeguro2026'], ['Confirmar senha', 'TesteSeguro2026'], ['CEP', '01001000']]) {
    fireEvent.change(screen.getByLabelText(label), { target: { value } });
  }
  await waitFor(() => expect(screen.getByLabelText('Cidade')).toHaveValue('São Paulo'));
  fireEvent.change(screen.getByLabelText('Número'), { target: { value: '1' } });
  fireEvent.click(screen.getByRole('button', { name: 'Criar cadastro' }));
  await screen.findByText('Conta criada com sucesso');
  const [url, options] = global.fetch.mock.calls.find(([, config]) => config.method === 'POST');
  expect(url).toMatch(/\/api\/triaqui\/cadastro$/);
  expect(JSON.parse(options.body)).toMatchObject({ documento: '529.982.247-25', uf: 'SP', cidade: 'São Paulo', rua: 'Praça da Sé', numero: '1' });
  fireEvent.click(screen.getByRole('button', { name: 'Ir para o login' }));
  expect(onBack).toHaveBeenCalledTimes(1);
});
