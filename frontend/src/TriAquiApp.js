import React, { useEffect, useState } from "react";
import { Activity, ArrowRight, Check, ShieldCheck, Stethoscope, Users } from "lucide-react";
import "bootstrap/dist/css/bootstrap.min.css";
import "./css/HealthOpsACEX.css";
import "./css/NavbarACEX.css";
import "./css/ACEXVisual.css";
import "./css/CadastroTema.css";
import Logo from "./img/logo-triaqui.svg";
import CriarContaTriAqui from "./Pages/CriarContaTriAqui";
import PortalTriAqui from "./Pages/PortalTriAqui";
import { ThemeProvider, ThemeButton } from "./context/ThemeContext";
import { request as api, authToken, saveAuthToken } from "./services/triAqui";
import { mascararDocumento } from "./utils/cadastro";

function Brand() { return <div className="brand brand-link"><img src={Logo} alt="TriAqui — Consultas e triagem médica" /></div>; }

function Login({ enter, onCreate }) {
  const [remember, setRemember] = useState(false);
  const [role, setRole] = useState("patient"); const [visible, setVisible] = useState(false);
  const [documento, setDocumento] = useState(""); const [senha, setSenha] = useState("");
  const [error, setError] = useState(""); const [loading, setLoading] = useState(false);
  const login = async (event) => {
    event.preventDefault(); setError(""); setLoading(true);
    try {
      const { usuario, token } = await api("/sessao", { method: "POST", body: JSON.stringify({ documento, senha, perfil: role }) });
      saveAuthToken(token, remember);
      enter(usuario);
    } catch (requestError) { setError(requestError.message || "Não foi possível conectar ao servidor."); }
    finally { setLoading(false); }
  };
  return <main className="login"><section className="login-art"><Brand /><ThemeButton /><div className="intro"><p>Saúde no tempo certo</p><h1>Saúde organizada.<br />Você em primeiro lugar.</h1><span>Agende, acompanhe e receba orientações para o seu atendimento com mais clareza e menos espera.</span></div><div className="art-card"><i><Activity size={21} /></i><div><strong>Triagem inteligente</strong><small>Prioridades mais claras para a equipe.</small></div><Check size={19} /></div><div className="ring" /></section>
    <section className="login-form layout-app"><div className="form-card auth-card"><header><p>Portal de saúde</p><h2>Olá, que bom ter você aqui.</h2><span>Entre para acessar seu atendimento.</span></header><div className="roles"><button className={role === "patient" ? "active" : ""} onClick={() => setRole("patient")}><Users size={16} />Paciente</button><button className={role === "staff" ? "active" : ""} onClick={() => setRole("staff")}><Stethoscope size={16} />Equipe</button></div><form onSubmit={login}><label>CPF ou CNPJ<input required value={documento} onChange={(e) => setDocumento(mascararDocumento(e.target.value))} maxLength={18} autoComplete="username" placeholder="CPF ou CNPJ" /></label><label>Senha<div className="password"><input required value={senha} onChange={(e) => setSenha(e.target.value)} type={visible ? "text" : "password"} placeholder="Sua senha" /><button type="button" onClick={() => setVisible(!visible)}>{visible ? "Ocultar" : "Mostrar"}</button></div></label><div className="form-line"><label className="remember"><input type="checkbox" checked={remember} onChange={e => setRemember(e.target.checked)} /> Lembrar de mim</label><button type="button" className="link text-button" onClick={() => setError("Para recuperar seu acesso, procure a secretaria da sua unidade.")}>Esqueci minha senha</button></div>{error && <p className="form-error">{error}</p>}<button className="primary full primary-action" disabled={loading}>{loading ? "Entrando..." : <>Entrar no portal <ArrowRight size={18} /></>}</button></form><div className="new">Ainda não possui acesso? <button type="button" className="link text-button" onClick={onCreate}>Crie sua conta</button></div><footer><ShieldCheck size={15} /> Seus dados são protegidos e confidenciais.</footer></div></section></main>;
}

function TriAquiContent() {
  const [registerOpen, setRegisterOpen] = useState(false);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(!!authToken());
  const [sessionError, setSessionError] = useState("");
  useEffect(() => {
    let alive = true;
    const expired = () => { saveAuthToken(null); setUser(null); setRegisterOpen(false); };
    window.addEventListener("triaqui:logout", expired);
    if (authToken()) api("/sessao").then(result => { if (alive) setUser(result.usuario); })
      .catch(error => { if (alive) { saveAuthToken(null); setSessionError(error.message); } })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; window.removeEventListener("triaqui:logout", expired); };
  }, []);
  if (loading) return <main className="layout-app"><p className="page-loading">Carregando sua conta...</p></main>;
  if (user) return <PortalTriAqui user={user} updateUser={setUser} logout={() => { saveAuthToken(null); setUser(null); setRegisterOpen(false); }} />;
  if (registerOpen) return <CriarContaTriAqui onBack={() => setRegisterOpen(false)} />;
  return <>{sessionError && <p className="form-error" role="alert">{sessionError}</p>}<Login enter={account => { setSessionError(""); setUser(account); }} onCreate={() => setRegisterOpen(true)} /></>;
}
export default function TriAquiApp() { return <ThemeProvider><TriAquiContent /></ThemeProvider>; }
