const {test}=require('node:test');
const assert=require('node:assert/strict');
const {evaluate}=require('../clienteIAPython');

const valid={servico:'triaqui-python-ia',linguagem:'python',modelo:'triaqui-nb-python-sintetico-v2',versao:'a'.repeat(64),experimental:true,estado:'avaliada_ia',prioridade:'baixa',resumo:'Exemplo fictício de resposta Python.',sinais:['rotina']};
async function withFetch(implementation,run) {
  const original=global.fetch;
  global.fetch=implementation;
  try {await run();} finally {global.fetch=original;}
}
test('cliente Node envia somente os sintomas à API Python',async()=>{
  await withFetch(async(url,options)=>{
    assert.match(url,/\/predict$/);
    assert.deepEqual(JSON.parse(options.body),{sintomas:['Exemplo'],descricao:'Texto fictício'});
    return new Response(JSON.stringify(valid),{status:200});
  },async()=>{
    const result=await evaluate({sintomas:['Exemplo'],descricao:'Texto fictício',cpf:'não enviar'});
    assert.equal(result.linguagem,'python');
    assert.equal(result.estado,'avaliada_ia');
    assert.equal(result.prioridade,'baixa');
  });
});
test('falha da API Python não aciona nenhum classificador JavaScript',async()=>{
  await withFetch(async()=>{throw new Error('Serviço offline');},async()=>{
    const result=await evaluate({descricao:'Texto fictício'});
    assert.equal(result.estado,'falha');
    assert.equal(result.prioridade,null);
  });
});
test('resposta incompatível da API é tratada como pendência',async()=>{
  for(const body of [{...valid,linguagem:'javascript'},{...valid,prioridade:'inventada'},{...valid,versao:'inválida'}]){
    await withFetch(async()=>new Response(JSON.stringify(body)),async()=>assert.equal((await evaluate({descricao:'Exemplo'})).estado,'falha'));
  }
});
test('desativação mantém triagem pendente e não chama o serviço',async()=>{
  const previous=process.env.TRIAQUI_AI_ENABLED;
  try {
    process.env.TRIAQUI_AI_ENABLED='false';
    await withFetch(async()=>{assert.fail('A IA desativada não pode ser chamada');},async()=>{
      assert.equal((await evaluate({descricao:'Exemplo'})).estado,'falha');
    });
  } finally {if(previous===undefined)delete process.env.TRIAQUI_AI_ENABLED;else process.env.TRIAQUI_AI_ENABLED=previous;}
});
