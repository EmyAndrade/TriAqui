const fs=require('fs');
const os=require('os');
const path=require('path');
const {spawn,spawnSync}=require('child_process');

function findPython() {
  const home=os.homedir();
  const candidates=[];
  if(process.env.TRIAQUI_PYTHON)candidates.push({file:process.env.TRIAQUI_PYTHON,args:[]});
  if(process.platform==='win32') {
    const installations=path.join(home,'AppData','Local','Programs','Python');
    if(fs.existsSync(installations)) for(const entry of fs.readdirSync(installations,{withFileTypes:true})) {
      if(entry.isDirectory()&&/^Python3\d+$/.test(entry.name)) candidates.push({file:path.join(installations,entry.name,'python.exe'),args:[]});
    }
    candidates.push({file:path.join(home,'.cache','codex-runtimes','codex-primary-runtime','dependencies','python','python.exe'),args:[]},{file:'py',args:['-3']});
  } else candidates.push({file:'python3',args:[]},{file:'python',args:[]});
  for(const candidate of candidates) {
    if(candidate.file.toLowerCase().includes('windowsapps'))continue;
    const result=spawnSync(candidate.file,[...candidate.args,'-c','import sys; print(int(sys.version_info >= (3,10)))'],{encoding:'utf8',windowsHide:true,timeout:5000});
    if(result.status===0&&result.stdout.trim()==='1')return candidate;
  }
  throw new Error('Python 3.10+ não encontrado. Configure TRIAQUI_PYTHON com o caminho do python.exe.');
}

async function health(base) {
  let reply;
  try { reply=await fetch(base+'/health',{signal:AbortSignal.timeout(800)}); }
  catch { return null; }
  let result;
  try { result=await reply.json(); } catch { throw new Error('A porta da IA está ocupada por outro serviço. Configure TRIAQUI_AI_URL.'); }
  if(!reply.ok||result.servico!=='triaqui-python-ia'||result.linguagem!=='python'||result.status!=='online') throw new Error('O serviço da porta configurada não é a IA Python do TriAqui. Configure TRIAQUI_AI_URL.');
  return result;
}

async function startPythonService() {
  if(process.env.TRIAQUI_AI_ENABLED==='false')return {started:false,disabled:true};
  const base=(process.env.TRIAQUI_AI_URL||'http://127.0.0.1:8001').replace(/\/$/,'');
  const info=await health(base);
  if(info)return {started:false,url:base};
  const url=new URL(base);
  if(!['127.0.0.1','localhost'].includes(url.hostname)||!['','/'].includes(url.pathname)||url.protocol!=='http:') throw new Error('A IA configurada não respondeu. Inicie o serviço indicado por TRIAQUI_AI_URL.');
  const python=findPython();
  const aiDirectory=path.join(__dirname,'..','ai');
  const child=spawn(python.file,[...python.args,path.join(aiDirectory,'service.py'),'--port',url.port||'80'],{cwd:aiDirectory,windowsHide:true,stdio:['ignore','pipe','pipe'],env:{...process.env,PYTHONDONTWRITEBYTECODE:'1'}});
  await new Promise((resolve,reject)=>{
    let settled=false,output='';
    const finish=(error)=>{if(settled)return;settled=true;clearTimeout(timer);if(error){child.kill();reject(error);}else resolve();};
    const timer=setTimeout(()=>finish(new Error('A IA Python não iniciou no tempo esperado.')),12000);
    child.once('error',()=>finish(new Error('Não foi possível iniciar o executável Python.')));
    child.once('exit',code=>{if(!settled)finish(new Error('A IA Python encerrou durante a inicialização (código '+code+').'));});
    child.stderr.on('data',()=>{});
    child.stdout.on('data',chunk=>{
      output=(output+chunk.toString()).slice(-2048);
      if(output.includes('IA Python pronta')) health(base).then(result=>{if(result)finish();else finish(new Error('A IA Python não respondeu à verificação de saúde.'));}).catch(finish);
    });
  });
  process.once('exit',()=>child.kill());
  return {started:true,url:base,child};
}
module.exports={findPython,startPythonService,health};
