import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { AuthStatus } from "../types";
import { AuthScreen } from "./AuthScreen";

const status: AuthStatus = {
  auth_enabled: true,
  configured: true,
  authenticated: false,
  session_ttl_seconds: 604800,
  password_min_length: 8,
};

describe("AuthScreen", () => {
  it("keeps login minimal while retaining password controls and collapsed reset help", () => {
    const html = renderToStaticMarkup(<AuthScreen mode="login" status={status} onAuthenticated={() => undefined} />);
    expect(html).toContain("登录工作台");
    expect(html.match(/<input /g)).toHaveLength(1);
    expect(html).toContain('autoComplete="current-password"');
    expect(html).toContain('aria-label="显示密码"');
    expect(html).toContain('<details class="auth-help">');
    expect(html).toContain("python -m app.auth_admin reset");
    expect(html).not.toContain("SECURE WORKSPACE");
    expect(html).not.toContain("Gateway Key");
  });

  it("keeps confirmation and minimum password length in the setup form", () => {
    const html = renderToStaticMarkup(<AuthScreen mode="setup" status={status} onAuthenticated={() => undefined} />);
    expect(html).toContain("设置管理密码");
    expect(html).toContain("确认密码");
    expect(html.match(/<input /g)).toHaveLength(2);
    expect(html.match(/minLength="8"/g)).toHaveLength(2);
    expect(html.match(/autoComplete="new-password"/g)).toHaveLength(2);
    expect(html).not.toContain("忘记密码？");
  });
});
