export async function request(path, { method = 'GET', body, signal } = {}) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener('abort', abort, { once: true });
  if (signal?.aborted) controller.abort();
  const timeout = setTimeout(abort, 15000);
  try {
    const response = await fetch(`/api${path}`, {
      method, signal: controller.signal, cache: 'no-store',
      headers: body === undefined ? { Accept: 'application/json' } : { Accept: 'application/json', 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      if (payload?.code === 'AUTH_REQUIRED') window.dispatchEvent(new Event('treehole-session-expired'));
      throw Object.assign(new Error(payload?.error || '服务器暂时无法处理，请稍后重试。'), { code: payload?.code, status: response.status });
    }
    if (!payload || typeof payload !== 'object') throw new Error('服务器响应异常，请稍后重新读取。');
    return payload;
  } catch (error) {
    if (signal?.aborted) throw error;
    if (error instanceof TypeError || error.name === 'AbortError') {
      throw new Error(method === 'GET' ? '暂时连接不上日记本，请检查网络后重试。' : '尚未确认服务器是否保存成功。文字仍保留在这里，请恢复连接后先查看日记本，再决定是否重试。');
    }
    throw error;
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', abort);
  }
}

export const listDiaries = (signal) => request('/diaries', { signal });
export const saveRemoteDiary = (draft, updatedAt) => {
  const { id, ...body } = draft;
  return request(id ? `/diaries/${encodeURIComponent(id)}` : '/diaries', {
    method: id ? 'PUT' : 'POST', body: id ? { ...body, updatedAt } : body,
  });
};
export const deleteRemoteDiary = (id, updatedAt) => request(`/diaries/${encodeURIComponent(id)}`, { method: 'DELETE', body: { updatedAt } });
export const importDiaries = (entries) => request('/diaries/import', { method: 'POST', body: { entries } });
