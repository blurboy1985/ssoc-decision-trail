// Fetch a MyCareersFuture posting through its public API and turn its HTML into plain text.

const API = "https://api.mycareersfuture.gov.sg/v2/jobs/";

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

export function htmlToText(html) {
  return String(html || "")
    .replace(/<\s*(br|\/p|\/div|\/h\d|\/ul|\/ol)\s*\/?>/gi, "\n")
    .replace(/<\s*li[^>]*>/gi, "\n- ")
    .replace(/<[^>]+>/g, "")
    .replace(/&(#x?[0-9a-f]+|\w+);/gi, (m, e) => {
      if (e[0] === "#") return String.fromCodePoint(parseInt(e.slice(e[1] === "x" ? 2 : 1), e[1] === "x" ? 16 : 10));
      return ENTITIES[e.toLowerCase()] ?? m;
    })
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n\s*\n+/g, "\n\n")
    .trim();
}

export function jobIdFrom(input) {
  const match = String(input || "").match(/[0-9a-f]{32}/i);
  return match ? match[0].toLowerCase() : null;
}

export async function fetchMcfJob(input, tree) {
  const id = jobIdFrom(input);
  if (!id) throw new Error("That doesn't look like a MyCareersFuture job link (no job id found).");
  const res = await fetch(API + id, { headers: { "User-Agent": "Mozilla/5.0 ssoc-decision-visualiser" } });
  if (!res.ok) throw new Error(`MyCareersFuture returned ${res.status} for job ${id}.`);
  const job = await res.json();
  const skills = (job.skills || []).map((s) => s.skill).filter(Boolean);
  const ssoc2020 = job.ssocCode ? String(job.ssocCode) : null;
  return {
    id,
    title: job.title,
    company: job.postedCompany?.name || "",
    url: job.metadata?.jobDetailsUrl || `https://www.mycareersfuture.gov.sg/job/${id}`,
    description: htmlToText(job.description) + (skills.length ? `\n\nSkills: ${skills.slice(0, 20).join(", ")}` : ""),
    reference: ssoc2020
      ? {
          ssoc2020,
          version: job.ssocVersion,
          ssoc2024: (tree.ssoc2020to2024[ssoc2020] || []).map((code) => ({ code, title: tree.nodes[code]?.title || "" })),
        }
      : null,
  };
}
