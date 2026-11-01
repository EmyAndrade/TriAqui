require('../envConfig').loadEnv(require('path').join(__dirname,'../.env'));
require('../servicoPython').startPythonService().then(service=>{
  console.log(service.disabled?'IA Python desativada.':'IA Python disponível em '+service.url);
  if(service.child)for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>{service.child.kill();process.exit(0);});
}).catch(error=>{console.error(error.message);process.exitCode=1;});
