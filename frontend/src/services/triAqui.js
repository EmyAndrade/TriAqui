const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001/api/triaqui';

export function authToken() {
  try { return sessionStorage.getItem('triaqui-token') || localStorage.getItem('triaqui-token'); } catch { return null; }
}
export function saveAuthToken(token, remember = false) {
  try {
    sessionStorage.removeItem('triaqui-token'); localStorage.removeItem('triaqui-token');
    if (token) (remember ? localStorage : sessionStorage).setItem('triaqui-token', token);
  } catch { /* O erro de armazenamento será informado ao tentar carregar a sessão. */ }
}

export async function request(path, options = {}) {
  let response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      ...options,
      headers: { 'Content-Type': 'application/json', ...(authToken() ? { Authorization: `Bearer ${authToken()}` } : {}), ...options.headers },
    });
  } catch {
    throw new Error('Não foi possível conectar ao servidor. Tente novamente em instantes.');
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401 && authToken()) { saveAuthToken(null); window.dispatchEvent(new Event('triaqui:logout')); }
    throw new Error(payload.mensagem || 'Não foi possível concluir a operação.');
  }
  return payload;
}
