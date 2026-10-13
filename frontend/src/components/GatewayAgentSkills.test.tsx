import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { GatewayAgentSkills } from "./GatewayAgentSkills";

describe("GatewayAgentSkills", () => {
  it.each(["http://127.0.0.1:8766/v1", "http://127.0.0.1:8766/v1/"])("uses the configured service address for MCP and CLI: %s", (base) => {
    const html = renderToStaticMarkup(<GatewayAgentSkills base={base} copy={async () => undefined} />);
    expect(html).toContain("http://127.0.0.1:8766/mcp");
    expect(html).toContain('$env:VOICE_HUB_BASE_URL = &quot;http://127.0.0.1:8766&quot;');
    expect(html).not.toContain("8765");
    expect(html).not.toContain("/v1/mcp");
    expect(html).not.toContain("Bearer ");
  });
});
