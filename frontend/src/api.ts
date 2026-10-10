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
  const requestHeaders: Record<string, string> = { Accept: "application/json" };
  if (typeof options?.body === "string") requestHeaders["Content-Type"] = "application/json";
  Object.assign(requestHeaders, options?.headers || {});
  const response = await fetch(url, {
    credentials: "same-origin",
    ...options,
    headers: requestHeaders,
  });
  if ((response.status === 401 || response.status === 428) && !url.startsWith("/api/auth/")) {
    let code = "";
    try {
      const body = await response.clone().json();
      code = String(body?.error?.code || "");
    } catch {
      // Keep the original response error below.
    }
    if (code === "auth_required" || code === "auth_setup_required") {
      window.dispatchEvent(new CustomEvent("voice-hub-auth-expired"));
    }
  }
  if (!response.ok) throw new Error(await responseError(response));
  return response.json();
}
