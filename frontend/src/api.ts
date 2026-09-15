export async function responseError(response: Response) {
  const text = await response.text();
  try {
    const body = JSON.parse(text);
    return body.error?.message || body.detail?.message || body.detail || text;
  } catch {
    return text || "请求失败 " + response.status;
  }
}

export async function api<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, options);
  if (!response.ok) throw new Error(await responseError(response));
  return response.json();
}
