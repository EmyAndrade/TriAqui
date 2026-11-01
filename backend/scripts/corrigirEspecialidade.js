const db=require('../db');
const canonical='Cl\u00ednica m\u00e9dica';
const brokenHex='436CE2949CC2A16E696361206DE2949CC2AE64696361';

async function main(){
  const conn=await db.getConnection();
  try{
    await conn.beginTransaction();
    const [[broken]]=await conn.query('SELECT id,nome FROM especialidades WHERE HEX(nome)=? FOR UPDATE',[brokenHex]);
    if(!broken){await conn.commit();console.log('Nenhum registro com a codificação incorreta encontrada.');return;}
    const [[correct]]=await conn.query('SELECT id FROM especialidades WHERE nome=? FOR UPDATE',[canonical]);
    if(!correct){
      await conn.query('UPDATE especialidades SET nome=? WHERE id=?',[canonical,broken.id]);
      await conn.commit();
      console.log('Nome da especialidade corrigido, mantendo o identificador original.');
      return;
    }
    // Unificar apenas o registro duplicado identificado acima.
    await conn.query('INSERT IGNORE INTO profissional_especialidades(profissional_id,especialidade_id) SELECT profissional_id,? FROM profissional_especialidades WHERE especialidade_id=?',[correct.id,broken.id]);
    const [appointments]=await conn.query('UPDATE consultas SET especialidade_id=? WHERE especialidade_id=?',[correct.id,broken.id]);
    const [queue]=await conn.query('UPDATE fila_espera SET especialidade_id=? WHERE especialidade_id=?',[correct.id,broken.id]);
    await conn.query('DELETE FROM profissional_especialidades WHERE especialidade_id=?',[broken.id]);
    await conn.query('DELETE FROM especialidades WHERE id=? AND HEX(nome)=?',[broken.id,brokenHex]);
    const [[remaining]]=await conn.query('SELECT COUNT(*) total FROM especialidades WHERE HEX(nome)=?',[brokenHex]);
    if(remaining.total!==0)throw new Error('A correção não foi concluída.');
    await conn.commit();
    console.log(JSON.stringify({especialidade:canonical,idMantido:correct.id,consultasPreservadas:appointments.affectedRows,entradasFilaPreservadas:queue.affectedRows,duplicataUnificada:true}));
  }catch(error){await conn.rollback();throw error;}
  finally{conn.release();}
}
main().catch(error=>{console.error(error.code||error.message);process.exitCode=1;}).finally(()=>db.end());
