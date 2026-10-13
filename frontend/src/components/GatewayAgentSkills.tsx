import { ArrowUpRight, Bot, Copy, PackageOpen, Plug, Terminal } from "lucide-react";

const repository = "https://github.com/RainyHorizon/voice-hub";
const installCommand = "npx skills add RainyHorizon/voice-hub --skill voice-hub-tts";
const cliCommands = '.\\voicehub.cmd doctor\n.\\voicehub.cmd models\n.\\voicehub.cmd voices --model tts-default --language zh-CN';

export function GatewayAgentSkills({ base, copy }: {
  base: string;
  copy: (label: string, value: string) => Promise<void>;
}) {
  const serviceUrl = base.replace(/\/v1\/?$/, "").replace(/\/$/, "");
  const mcpUrl = `${serviceUrl}/mcp`;
  const localCliCommands = `$env:VOICE_HUB_BASE_URL = "${serviceUrl}"\n${cliCommands}`;

  return (
    <div className="gateway-agent-skills">
      <div className="gateway-skill-grid">
        <article className="gateway-skill-card gateway-skill-feature">
          <PackageOpen size={28} />
          <span className="gateway-skill-label">AGENT SKILL</span>
          <h3>Voice Hub TTS</h3>
          <p>让 Agent 查询模型与音色、生成语音并下载音频。一个技能，沿用你已经配置好的 Voice Hub。</p>
          <a className="secondary-button" href={`${repository}/tree/main/skills/voice-hub-tts`} target="_blank" rel="noreferrer"><ArrowUpRight size={16} />查看技能文件</a>
          <span className="gateway-skill-footnote">voice-hub-tts · 优先 MCP，也支持 CLI</span>
        </article>
        <article className="gateway-skill-card gateway-skill-install">
          <Terminal size={25} />
          <h3>GitHub + npx</h3>
          <p>用 skills CLI 安装到支持 Agent Skills 的客户端，或打开仓库手动复制技能目录。</p>
          <div className="gateway-agent-code">
            <div><span>安装命令</span><button onClick={() => copy("技能安装命令", installCommand)} aria-label="复制技能安装命令"><Copy size={15} />复制</button></div>
            <pre>{installCommand}</pre>
          </div>
          <a className="gateway-repository-link" href={repository} target="_blank" rel="noreferrer"><ArrowUpRight size={16} />打开仓库</a>
          <details className="gateway-local-skill">
            <summary>已有本机项目？从本地安装</summary>
            <p>在 Voice Hub 目录执行，或将 skills/voice-hub-tts 复制到客户端的 skills 目录。</p>
            <div className="gateway-agent-code">
              <div><span>本地安装</span><button onClick={() => copy("本地技能安装命令", "npx skills add . --skill voice-hub-tts")} aria-label="复制本地技能安装命令"><Copy size={15} />复制</button></div>
              <pre>npx skills add . --skill voice-hub-tts</pre>
            </div>
          </details>
        </article>
      </div>

      <section className="gateway-agent-steps" aria-label="Agent 接入步骤">
        <h3>四步完成接入</h3>
        <ol>
          <li><span>1</span><strong>启动 Voice Hub</strong><p>在设置中配置厂商账号与默认模型。</p></li>
          <li><span>2</span><strong>连接 MCP 或 CLI</strong><p>使用下方 MCP 地址，或在本机运行 CLI。</p></li>
          <li><span>3</span><strong>安装语音技能</strong><p>安装 voice-hub-tts，然后重新载入 Agent。</p></li>
          <li><span>4</span><strong>描述你的需求</strong><p>让 Agent 先查询音色，再生成并保存语音。</p></li>
        </ol>
        <div className="gateway-agent-code">
          <div><span>PowerShell · 检查本机连接</span><button onClick={() => copy("本机连接检查", `$env:VOICE_HUB_BASE_URL = "${serviceUrl}"\n.\\voicehub.cmd doctor`)} aria-label="复制本机连接检查"><Copy size={15} />复制</button></div>
          <pre>{`$env:VOICE_HUB_BASE_URL = "${serviceUrl}"\n.\\voicehub.cmd doctor`}</pre>
        </div>
      </section>

      <div className="gateway-agent-tools">
        <article className="gateway-skill-card">
          <div className="gateway-access-title"><Plug size={21} /><h3>MCP 接入</h3></div>
          <p>在客户端添加 Streamable HTTP 服务，填写下方地址。与 Voice Hub 共用端口，无需额外启动服务。</p>
          <div className="gateway-agent-code">
            <div><span>Streamable HTTP</span><button onClick={() => copy("MCP 地址", mcpUrl)} aria-label="复制 MCP 地址"><Copy size={15} />复制</button></div>
            <pre>{mcpUrl}</pre>
          </div>
          <p className="gateway-agent-note">已提供 7 个工具。支持 Skills 扩展的客户端也可直接扫描导入技能；更新后需重新扫描。远程使用受控私有通道，当前没有公网 OAuth。</p>
        </article>
        <article className="gateway-skill-card">
          <div className="gateway-access-title"><Terminal size={21} /><h3>CLI 接入</h3></div>
          <p>在 Voice Hub 目录打开 PowerShell，先检查连接、模型和音色。本机 CLI 会自动读取网关 Key。</p>
          <div className="gateway-agent-code">
            <div><span>PowerShell · 本机</span><button onClick={() => copy("CLI 检查命令", localCliCommands)} aria-label="复制 CLI 检查命令"><Copy size={15} />复制</button></div>
            <pre>{localCliCommands}</pre>
          </div>
          <p className="gateway-agent-note">便携版也支持 VoiceHub.exe cli。远程 CLI 使用 HTTPS，并配置 VOICE_HUB_API_KEY（网关 Key）。</p>
        </article>
      </div>
      <div className="gateway-agent-tools gateway-agent-client-grid">
        <article className="gateway-skill-card">
          <div className="gateway-access-title"><Bot size={21} /><h3>兼容 Agent Skills 客户端</h3></div>
          <div className="gateway-client-badges"><span>Codex</span><span>Claude Code</span><span>Cursor</span></div>
          <p>客户端需要支持 SKILL.md 文件，并能执行命令或调用 MCP 工具。连接 MCP 后，也可在其他支持 Streamable HTTP 的客户端中使用语音工具。</p>
          <p className="gateway-agent-note">本机凭据由 Voice Hub 管理，安装技能时无需填写厂商 API Key。</p>
        </article>
        <article className="gateway-skill-card">
          <h3>手动安装目录</h3>
          <p>将完整的 voice-hub-tts 文件夹放入以下目录，保留其中的 references 文件夹。</p>
          <div className="gateway-skill-paths">
            <div><span>Codex / Cursor · 项目级</span><code>.agents/skills/</code><small>Cursor 也支持 .cursor/skills/</small></div>
            <div><span>Codex / Cursor · 用户级</span><code>~/.agents/skills/</code><small>Cursor 也支持 ~/.cursor/skills/</small></div>
            <div><span>Claude Code · 项目级 / 用户级</span><code>.claude/skills/ · ~/.claude/skills/</code></div>
          </div>
        </article>
      </div>
      <section className="gateway-agent-prompt">
        <div className="gateway-access-title"><Bot size={22} /><h3>一个语音技能，七个 MCP 工具</h3></div>
        <div className="gateway-tool-badges">{["get_voice_hub_status", "list_tts_models", "list_voices", "create_speech", "list_recent_speech_jobs", "get_speech_job", "get_speech_audio"].map((tool) => <code key={tool}>{tool}</code>)}</div>
        <strong>试着这样说</strong><p>“先列出可用的中文音色，等我选定后，把这段文字生成 MP3 并保存下来。”</p>
      </section>
    </div>
  );
}
