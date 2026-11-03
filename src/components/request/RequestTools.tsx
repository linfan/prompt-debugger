import { Wrench } from "lucide-react";
import type { ChatTool } from "../../lib/openai";
import { JsonTree } from "../JsonTree";

export function RequestTools({ tools }: { tools?: ChatTool[] }) {
  if (!tools?.length) return null;

  return <section className="request-tools" aria-label="Request tools">
    <div className="panel-caption"><span>TOOLS <b>{tools.length}</b></span></div>
    <div className="request-tools-list">
      {tools.map((tool, index) => {
        const name = typeof tool.function?.name === "string" && tool.function.name.trim() ? tool.function.name : "Unnamed tool";
        const description = typeof tool.function?.description === "string" ? tool.function.description : "";
        const parameters = tool.function?.parameters;
        return <article className="request-tool-card" key={index}>
          <div className="request-tool-heading">
            <Wrench size={15} />
            <h3>{name}</h3>
            {typeof tool.type === "string" && <span>{tool.type}</span>}
          </div>
          <p className={`request-tool-description ${description ? "" : "is-empty"}`}>{description || "No description"}</p>
          <div className="request-tool-parameters">
            <div className="argument-label">PARAMETERS</div>
            {parameters === undefined
              ? <p className="request-tool-empty">No parameters schema</p>
              : <JsonTree value={parameters} label="parameters" />}
          </div>
        </article>;
      })}
    </div>
  </section>;
}
