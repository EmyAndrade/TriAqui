const normalizarDocumento = (value = '') => String(value).replace(/[.\-/\s]/g, '').toUpperCase();
const digitos = (value = '') => String(value).replace(/\D/g, '');

function cpfValido(value) {
  const cpf = normalizarDocumento(value);
  if (!/^\d{11}$/.test(cpf) || /^(\d)\1+$/.test(cpf)) return false;
  const calcular = (size) => {
    const soma = [...cpf.slice(0, size)].reduce((total, n, i) => total + Number(n) * (size + 1 - i), 0);
    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
  };
  return calcular(9) === Number(cpf[9]) && calcular(10) === Number(cpf[10]);
}

function cnpjValido(value) {
  const cnpj = normalizarDocumento(value);
  if (!/^[A-Z0-9]{12}\d{2}$/.test(cnpj) || /^(.)\1+$/.test(cnpj)) return false;
  const calcular = (size) => {
    const pesos = size === 12 ? [5,4,3,2,9,8,7,6,5,4,3,2] : [6,5,4,3,2,9,8,7,6,5,4,3,2];
    const soma = pesos.reduce((total, peso, i) => total + (cnpj.charCodeAt(i) - 48) * peso, 0);
    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
  };
  return calcular(12) === Number(cnpj[12]) && calcular(13) === Number(cnpj[13]);
}

function erroCadastro(data = {}) {
  if (!['paciente', 'profissional', 'instituicao'].includes(data.tipo)) return 'Selecione o tipo de cadastro.';
  if (typeof data.nome !== 'string' || data.nome.trim().length < 3 || data.nome.length > 150) return 'Informe um nome entre 3 e 150 caracteres.';
  if (!(data.tipo === 'instituicao' ? cnpjValido(data.documento) : cpfValido(data.documento))) return `Informe um ${data.tipo === 'instituicao' ? 'CNPJ' : 'CPF'} válido.`;
  if (typeof data.email !== 'string' || data.email.length > 150 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) return 'Informe um e-mail válido.';
  if (!/^[1-9]{2}\d{8,9}$/.test(digitos(data.telefone))) return 'Informe um telefone válido com DDD.';
  if (typeof data.senha !== 'string' || data.senha.length < 8 || Buffer.byteLength(data.senha) > 72 || !/[a-z]/.test(data.senha) || !/[A-Z]/.test(data.senha) || !/\d/.test(data.senha)) return 'Use uma senha com 8 a 72 bytes, maiúsculas, minúsculas e números.';
  if (data.senha !== data.confirmarSenha) return 'As senhas não conferem.';
  if (data.tipo === 'profissional' && (!String(data.crm || '').trim() || !String(data.especialidade || '').trim())) return 'Informe CRM e especialidade.';
  if (data.nascimento && (!/^\d{4}-\d{2}-\d{2}$/.test(data.nascimento) || Number.isNaN(Date.parse(data.nascimento)) || new Date(data.nascimento) > new Date())) return 'Informe uma data de nascimento válida.';
  if (!/^\d{8}$/.test(digitos(data.cep))) return 'Informe um CEP com 8 dígitos.';
  if (!/^[A-Z]{2}$/.test(data.uf || '') || !String(data.cidade || '').trim() || !String(data.rua || '').trim() || !String(data.numero || '').trim()) return 'Preencha estado, cidade, rua e número do endereço.';
  if (['crm','especialidade','unidade','sala','responsavel','cidade','bairro','rua','numero','complemento'].some((key) => data[key] != null && (typeof data[key] !== 'string' || data[key].length > (key === 'crm' ? 40 : key === 'especialidade' ? 100 : key === 'unidade' ? 120 : 150)))) return 'Um dos campos excede o tamanho permitido.';
  return '';
}

module.exports = { normalizarDocumento, digitos, cpfValido, cnpjValido, erroCadastro };
