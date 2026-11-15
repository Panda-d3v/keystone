import Link from "next/link";
import Image from "next/image";
import { Layers } from "lucide-react";
import { versions } from "@/lib/routes";
export default function Home() {
  return <main className="picker"><div className="brand"><Layers aria-hidden="true"/>Keystone</div>
    <h1>When the reason changes,<br/>revisit the decision.</h1>
    <p className="picker-intro">One MeridianFlow scenario. Five ways to work through the impact, the evidence, and the next decision.</p>
    <div className="variant-list">{versions.map(v => <article className="variant-row" key={v.id}>
      <Image className="variant-preview" src={`/variants/${v.id}.jpg`} alt={`${v.name} workspace preview`} width={1440} height={1000} sizes="192px" />
      <div><h2>{v.id}. {v.name}</h2><p>{v.description}</p><p className="muted small">For the {v.audience.toLowerCase()}.</p></div>
      <Link className="button" href={`/${v.id}`}>Open {v.name}</Link>
    </article>)}</div><p className="muted small" style={{marginTop: "var(--space-5)"}}>Illustrative scenario. Section 232 layer only; not a duty determination.</p>
  </main>;
}
