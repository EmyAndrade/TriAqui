// Este módulo só chama a API Python; não executa classificação em JavaScript.
const fallback = (message) => ({ estado:'falha',modelo:'triaqui-nb-python-sintetico-v2',versao:'indisponivel',prioridade:null,resumo:message,sinais:[],experimental:true,linguagem:'python' });

async function evaluate(input) {
  if (process.env.TRIAQUI_AI_ENABLED==='false') return fallback('IA Python desativada. Aguardando avaliação profissional.');
  const base=(process.env.TRIAQUI_AI_URL||'http://127.0.0.1:8001').replace(/\/$/,'');
  const configured=Number(process.env.TRIAQUI_AI_TIMEOUT_MS||3000);
  const timeout=Number.isFinite(configured)?Math.max(100,Math.min(configured,30000)):3000;
  try {
    const response=await fetch(base+'/predict',{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({sintomas:input.sintomas||[],descricao:input.descricao||''}),
      signal:AbortSignal.timeout(timeout),
    });
    if(!response.ok) throw new Error('Serviço indisponível.');
    const result=await response.json();
    const validStatus=['avaliada_ia','sem_resultado','falha'].includes(result.estado);
    const validPriority=result.estado==='avaliada_ia'?['baixa','moderada','alta','emergencia'].includes(result.prioridade):result.prioridade===null;
    if(!validStatus||!validPriority||result.servico!=='triaqui-python-ia'||result.linguagem!=='python'||result.experimental!==true||typeof result.modelo!=='string'||result.modelo.length>100||!/^[a-f0-9]{64}$/.test(result.versao)||typeof result.resumo!=='string'||result.resumo.length>2000||!Array.isArray(result.sinais)||result.sinais.length>20||result.sinais.some(s=>typeof s!=='string'||s.length>150)) throw new Error('Resposta inválida da IA Python.');
    return result;
  } catch {
    return fallback('Não foi possível concluir a análise pela IA Python. Sua triagem foi salva e aguarda avaliação profissional.');
  }
}
module.exports={evaluate};
