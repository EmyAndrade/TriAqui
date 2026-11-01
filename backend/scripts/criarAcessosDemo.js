// Gera contas locais de demonstração; as senhas são exibidas apenas ao criar.
const crypto = require('crypto');
const { cpfValido, cnpjValido } = require('../validacaoCadastro');
const base = 'http://localhost:3001/api/triaqui';

function cpf() {
  let value = Array.from({ length: 9 }, () => crypto.randomInt(0, 10)).join('');
  for (const size of [9,10]) {
    const sum = [...value].reduce((total,n,i) => total + Number(n) * (size + 1 - i),0);
    value += sum % 11 < 2 ? 0 : 11 - sum % 11;
  }
  return cpfValido(value) ? value : cpf();
}
function cnpj() {
  let value = Array.from({ length: 8 }, () => crypto.randomInt(0,10)).join('') + '0001';
  for (const weights of [[5,4,3,2,9,8,7,6,5,4,3,2],[6,5,4,3,2,9,8,7,6,5,4,3,2]]) {
    const sum = weights.reduce((total,weight,i) => total + Number(value[i]) * weight,0);
    value += sum % 11 < 2 ? 0 : 11 - sum % 11;
  }
  return cnpjValido(value) ? value : cnpj();
}
async function post(path, body) {
  const response = await fetch(base + path, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.mensagem || 'Falha ao criar acesso.');
  return result;
}
async function main() {
  const suffix = crypto.randomBytes(4).toString('hex');
  const common = { telefone:'11999990000', cep:'01001000', uf:'SP', cidade:'São Paulo', bairro:'Centro', rua:'Rua de demonstração', numero:'0', complemento:'Conta fictícia para testes locais' };
  const accounts = [
    { ...common, tipo:'profissional', nome:'Médico Teste TriAqui', documento:cpf(), email:'medico.demo.'+suffix+'@example.test', senha:'Medico@'+crypto.randomBytes(6).toString('hex'), crm:'DEMO-'+suffix, especialidade:'Clínica médica', unidade:'Unidade de Demonstração', sala:'Sala teste' },
    { ...common, tipo:'instituicao', nome:'Instituição Teste TriAqui', documento:cnpj(), email:'instituicao.demo.'+suffix+'@example.test', senha:'Clinica@'+crypto.randomBytes(6).toString('hex'), responsavel:'Responsável de demonstração' },
  ];
  for (const account of accounts) {
    const created = await post('/cadastro',{...account,confirmarSenha:account.senha});
    // Exibir o acesso criado mesmo se a verificação posterior do login falhar.
    console.log(JSON.stringify({ tipo:account.tipo,id:created.usuario.id,nome:account.nome,documento:account.documento,senha:account.senha }));
    const session = await post('/sessao',{documento:account.documento,senha:account.senha,perfil:'staff'});
    if (!session.token || session.usuario.id !== created.usuario.id) throw new Error('Login de demonstração não confirmado.');
    console.log('Login confirmado: '+account.tipo);
  }
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
