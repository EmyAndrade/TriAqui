import React, { useEffect, useId, useState } from 'react';
import { Building2, CheckCircle, LoaderCircle, Lock, Mail, MapPin, Phone, Stethoscope, User } from 'lucide-react';
import Logo from '../img/logo-triaqui.svg';
import { ThemeButton } from '../context/ThemeContext';
import { request } from '../services/triAqui';
import { cpfValido, cnpjValido, digitos, erroCadastro, mascararDocumento as maskDocument } from '../utils/cadastro';

const blank = { tipo: 'paciente', nome: '', documento: '', email: '', telefone: '', nascimento: '', senha: '', confirmarSenha: '', crm: '', especialidade: '', unidade: '', sala: '', responsavel: '', cep: '', uf: '', cidade: '', bairro: '', rua: '', numero: '', complemento: '' };
const roles = [
  { value: 'paciente', title: 'Paciente', description: 'Agendar e acompanhar consultas.', icon: User },
  { value: 'profissional', title: 'Médico', description: 'Acesso com CRM e especialidade.', icon: Stethoscope },
  { value: 'instituicao', title: 'Instituição', description: 'Cadastro por CNPJ.', icon: Building2 },
];

function Field({ label, icon: Icon, children, wide }) {
  const id = useId();
  const fields = React.Children.map(children, (child) => React.isValidElement(child) && ['input', 'select', 'textarea'].includes(child.type) ? React.cloneElement(child, { id, 'aria-labelledby': `${id}-label` }) : child);
  return <label htmlFor={id} className={`form-field${wide ? ' wide' : ''}`}><span id={`${id}-label`}>{Icon && <Icon size={16} />}{label}</span>{fields}</label>;
}

export default function CriarContaTriAqui({ onBack }) {
  const [form, setForm] = useState(blank);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState(false);
  const [cepState, setCepState] = useState({ loading: false, message: '', error: false });
  const [documentTouched, setDocumentTouched] = useState(false);
  const institution = form.tipo === 'instituicao';
  const documentValid = institution ? cnpjValido(form.documento) : cpfValido(form.documento);
  const change = (key, value) => setForm((current) => ({ ...current, [key]: value }));

  useEffect(() => {
    const cep = digitos(form.cep);
    if (cep.length !== 8) { setCepState({ loading: false, message: '', error: false }); return; }
    const controller = new AbortController();
    setCepState({ loading: true, message: 'Buscando endereço...', error: false });
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`, { signal: controller.signal });
        if (!response.ok) throw new Error('Não foi possível consultar o CEP. Preencha o endereço manualmente.');
        const address = await response.json();
        if (address.erro) throw new Error('CEP não encontrado. Confira os 8 dígitos.');
        if (controller.signal.aborted) return;
        setForm((current) => digitos(current.cep) === cep ? { ...current, uf: address.uf || '', cidade: address.localidade || '', bairro: address.bairro || '', rua: address.logradouro || '' } : current);
        setCepState({ loading: false, message: 'Endereço encontrado. Informe o número e confira os dados.', error: false });
      } catch (fetchError) {
        if (!controller.signal.aborted) setCepState({ loading: false, message: fetchError.message || 'Não foi possível consultar o CEP. Preencha o endereço manualmente.', error: true });
      }
    }, 350);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [form.cep]);

  const submit = async (event) => {
    event.preventDefault();
    const validationError = erroCadastro(form);
    if (validationError) { setError(validationError); setDocumentTouched(true); return; }
    setBusy(true); setError('');
    try { await request('/cadastro', { method: 'POST', body: JSON.stringify(form) }); setCreated(true); }
    catch (submitError) { setError(submitError.message); }
    finally { setBusy(false); }
  };
  const strong = form.senha.length >= 8 && /[A-Z]/.test(form.senha) && /[a-z]/.test(form.senha) && /\d/.test(form.senha);
  const input = (key, props = {}) => <input value={form[key]} onChange={(event) => change(key, event.target.value)} maxLength={150} {...props} />;

  return <div className="register-page">
    <header className="app-navbar public-navbar"><div className="brand-link"><img src={Logo} alt="TriAqui" /></div><ThemeButton /></header>
    <main className="layout-app">
      <section className="auth-card register-card">
        <img src={Logo} alt="TriAqui" />
        <h1>Criar cadastro</h1>
        {created ? <div className="registration-success" role="status"><CheckCircle size={36} /><h2>Conta criada com sucesso</h2><p>Entre com seu {institution ? 'CNPJ' : 'CPF'} e a senha cadastrada. Selecione {form.tipo === 'paciente' ? 'Paciente' : 'Equipe'} na tela de acesso.</p><button className="primary-action" onClick={onBack}>Ir para o login</button></div> : <>
          <form className="form-grid register-form" onSubmit={submit}>
            <div className="role-options wide"><span>Tipo de cadastro</span><div>{roles.map(({ value, title, description, icon: Icon }) => <button type="button" key={value} className={form.tipo === value ? 'selected' : ''} aria-pressed={form.tipo === value} onClick={() => { setForm((current) => ({ ...current, tipo: value, documento: '' })); setDocumentTouched(false); setError(''); }}><Icon size={18} /><strong>{title}</strong><small>{description}</small></button>)}</div></div>
            <Field label={institution ? 'Nome da instituição' : 'Nome completo'} icon={institution ? Building2 : User}>{input('nome', { required: true, autoComplete: 'name' })}</Field>
            <Field label={institution ? 'CNPJ' : 'CPF'}><input value={form.documento} required inputMode={institution ? 'text' : 'numeric'} maxLength={institution ? 18 : 14} onChange={(event) => change('documento', maskDocument(event.target.value, institution))} onBlur={() => setDocumentTouched(true)} aria-invalid={documentTouched && !documentValid} aria-describedby="document-feedback" autoComplete="off" /><small id="document-feedback" className={documentTouched && !documentValid ? 'field-error' : 'field-hint'}>{documentTouched && !documentValid ? `Informe um ${institution ? 'CNPJ' : 'CPF'} válido.` : documentValid ? 'Dígitos verificadores válidos.' : institution ? 'Informe o CNPJ da instituição.' : 'Informe seu CPF.'}</small></Field>
            <Field label="E-mail" icon={Mail}>{input('email', { type: 'email', required: true, autoComplete: 'email' })}</Field>
            <Field label="Telefone com DDD" icon={Phone}>{input('telefone', { required: true, type: 'tel', autoComplete: 'tel', maxLength: 15 })}</Field>
            {institution ? <Field label="Responsável administrativo">{input('responsavel')}</Field> : <Field label="Data de nascimento">{input('nascimento', { type: 'date', max: new Date().toLocaleDateString('en-CA'), autoComplete: 'bday' })}</Field>}
            {form.tipo === 'profissional' && <>
              <Field label="CRM">{input('crm', { required: true, maxLength: 40 })}</Field><Field label="Especialidade">{input('especialidade', { required: true, maxLength: 100 })}</Field>
              <Field label="Unidade de atendimento">{input('unidade', { maxLength: 120 })}</Field><Field label="Sala">{input('sala')}</Field>
            </>}
            <Field label="Senha" icon={Lock}>{input('senha', { required: true, type: 'password', minLength: 8, maxLength: 72, autoComplete: 'new-password' })}</Field>
            <Field label="Confirmar senha" icon={Lock}>{input('confirmarSenha', { required: true, type: 'password', minLength: 8, maxLength: 72, autoComplete: 'new-password' })}</Field>
            <div className={`password-panel password-${strong ? 'strong' : form.senha.length >= 8 ? 'medium' : 'weak'} wide`}><div><span>{strong ? 'Senha forte' : 'Crie uma senha segura'}</span><b /></div><p>Use pelo menos 8 caracteres, com letras maiúsculas, minúsculas e números.</p></div>
            <div className="register-section wide"><MapPin size={18} /><strong>Endereço</strong></div>
            <Field label={cepState.loading ? 'CEP — buscando endereço...' : 'CEP'} icon={MapPin}><input value={form.cep} required maxLength={9} inputMode="numeric" autoComplete="postal-code" onChange={(event) => { const cep = digitos(event.target.value).slice(0,8).replace(/(\d{5})(\d)/, '$1-$2'); setForm((current) => ({ ...current, cep, uf: '', cidade: '', bairro: '', rua: '' })); }} /></Field>
            <Field label="Estado (UF)">{input('uf', { required: true, maxLength: 2, autoComplete: 'address-level1', onChange: (event) => change('uf', event.target.value.replace(/[^a-z]/gi, '').toUpperCase()) })}</Field>
            {cepState.message && <p className={`cep-message wide ${cepState.error ? 'field-error' : ''}`} role="status">{cepState.loading && <LoaderCircle size={16} className="spin" />}{cepState.message}</p>}
            <Field label="Cidade">{input('cidade', { required: true, autoComplete: 'address-level2' })}</Field><Field label="Bairro">{input('bairro', { autoComplete: 'address-level3' })}</Field>
            <Field label="Rua / logradouro" wide>{input('rua', { required: true, autoComplete: 'address-line1' })}</Field>
            <Field label="Número">{input('numero', { required: true })}</Field><Field label="Complemento">{input('complemento', { autoComplete: 'address-line2' })}</Field>
            {error && <p className="form-error wide register-error" role="alert">{error}</p>}
            <button type="submit" className="primary-action" disabled={busy || cepState.loading}>{busy ? <><LoaderCircle className="spin" size={18} />Criando conta...</> : <><User size={18} />Criar cadastro</>}</button>
          </form>
          <button type="button" className="text-button register-back" onClick={onBack}>Já tenho uma conta</button>
        </>}
      </section>
    </main>
  </div>;
}
