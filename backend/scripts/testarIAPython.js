const {spawnSync}=require('child_process');
const path=require('path');
require('../envConfig').loadEnv(path.join(__dirname,'../.env'));
const python=require('../servicoPython').findPython();
const result=spawnSync(python.file,[...python.args,'-m','unittest','discover','-s','ai','-p','test_*.py','-v'],{cwd:path.join(__dirname,'../..'),windowsHide:true,stdio:'inherit',env:{...process.env,PYTHONDONTWRITEBYTECODE:'1'}});
if(result.error)console.error(result.error.message);
process.exitCode=result.status===0?0:1;
