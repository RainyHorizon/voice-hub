import { AudioLines, Eye, EyeOff } from "lucide-react";
import { useState, type FormEvent } from "react";
import { api } from "../api";
import type { AuthStatus } from "../types";

type AuthScreenProps = {
  mode: "setup" | "login";
  status: AuthStatus;
  onAuthenticated: () => void;
};

export function AuthScreen({ mode, status, onAuthenticated }: AuthScreenProps) {
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const isSetup = mode === "setup";

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    setWorking(true);
    try {
      await api(`/api/auth/${isSetup ? "setup" : "login"}`, {
        method: "POST",
        body: JSON.stringify({ password, confirmation: isSetup ? confirmation : "" }),
      });
      onAuthenticated();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "请求失败，请稍后重试");
    } finally {
      setWorking(false);
    }
  };

  return (
    <main className="auth-screen">
      <section className="auth-panel" aria-labelledby="auth-title">
        <div className="auth-brand">
          <AudioLines size={28} aria-hidden="true" />
          <strong>Voice Hub</strong>
        </div>
        <h1 id="auth-title">{isSetup ? "设置管理密码" : "登录工作台"}</h1>
        <form className="auth-form" onSubmit={(event) => void submit(event)}>
          <label>
            <span>管理密码</span>
            <div className="auth-input-wrap">
              <input
                required
                minLength={status.password_min_length}
                maxLength={256}
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete={isSetup ? "new-password" : "current-password"}
                placeholder={isSetup ? `至少 ${status.password_min_length} 个字符` : "请输入密码"}
                autoFocus
              />
              <button type="button" className="auth-visibility" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? "隐藏密码" : "显示密码"} aria-pressed={showPassword}>
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </label>
          {isSetup && (
            <label>
              <span>确认密码</span>
              <input
                required
                minLength={status.password_min_length}
                maxLength={256}
                type={showPassword ? "text" : "password"}
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
                autoComplete="new-password"
                placeholder="再次输入管理密码"
              />
            </label>
          )}
          {error && <div className="auth-error" role="alert">{error}</div>}
          <button className="primary-button auth-submit" type="submit" disabled={working}>
            {working ? "处理中…" : isSetup ? "设置密码并进入" : "登录"}
          </button>
        </form>
        {!isSetup && <details className="auth-help">
          <summary>忘记密码？</summary>
          <p>在运行 Voice Hub 的设备上，进入项目的 backend 目录，执行 <code>python -m app.auth_admin reset</code>，按终端提示重置密码。</p>
        </details>}
      </section>
    </main>
  );
}
