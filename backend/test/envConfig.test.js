const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parseEnv } = require('../envConfig');

test('carrega senha com aspas sem enviar as aspas ao banco', () => {
  assert.equal(parseEnv('PASSWORD="senha@#=teste"').PASSWORD, 'senha@#=teste');
  assert.equal(parseEnv("PASSWORD='senha@#=teste'").PASSWORD, 'senha@#=teste');
  assert.equal(parseEnv('PASSWORD=senha@#=teste').PASSWORD, 'senha@#=teste');
});

test('aceita BOM, espaços, comentários e export sem perder espaços entre aspas', () => {
  assert.deepEqual(parseEnv('\uFEFF# comentário\r\n export HOST = localhost # local\r\nPASSWORD=" senha # " # comentário\r\n'), { HOST: 'localhost', PASSWORD: ' senha # ' });
});

test('rejeita aspas incompletas sem revelar o valor da senha', () => {
  assert.throws(() => parseEnv('PASSWORD="segredo'), { message: 'Aspas inválidas na variável PASSWORD do .env.' });
});
