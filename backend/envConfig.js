const fs = require('fs');

function parseEnv(source) {
  const values = {};
  for (const line of source.replace(/^\uFEFF/, '').split(/\r?\n/)) {
    const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) continue;
    let value = match[2].trim();
    if (value.startsWith('"') || value.startsWith("'")) {
      const quote = value[0];
      const end = value.lastIndexOf(quote);
      if (end < 1 || !/^\s*(?:#.*)?$/.test(value.slice(end + 1))) {
        throw new Error(`Aspas inválidas na variável ${match[1]} do .env.`);
      }
      value = value.slice(1, end);
      if (quote === '"') value = value.replace(/\\n/g, '\n').replace(/\\r/g, '\r');
    } else {
      value = value.replace(/\s+#.*$/, '').trim();
    }
    values[match[1]] = value;
  }
  return values;
}

function loadEnv(filename) {
  if (!fs.existsSync(filename)) return;
  const values = parseEnv(fs.readFileSync(filename, 'utf8'));
  for (const [key, value] of Object.entries(values)) {
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

module.exports = { parseEnv, loadEnv };
