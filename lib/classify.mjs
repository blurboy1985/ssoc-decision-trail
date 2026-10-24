// SSOC 2024 classification as a beam search over Jev Choice questions.
// Follows TypeSafe's hierarchical-classification cookbook: every tree node is one Choice over
// its direct children; the K best paths (by geometric-mean edge probability) survive each
// level; a final head-to-head Choice with full definitions picks among the best leaves.

import { choice, noul } from "@typesafe-ai/sdk";

export const BEAM_WIDTH = 3;
export const FINALISTS = 5;
const MAX_JOB_CHARS = 9000;
const LEVEL_NAMES = ["", "Major group", "Sub-major group", "Minor group", "Unit group", "Occupation"];

const trim = (text, max) => (text.length <= max ? text : text.slice(0, max - 1).trimEnd() + "…");

function leafTitles(nodes, node) {
  if (!node.children.length) return [node.title];
  return node.children.flatMap((code) => leafTitles(nodes, nodes[code]));
}

/** Option description shown to Jev for one child node during the beam search. */
function describe(nodes, node) {
  const option = { title: node.title };
  if (node.def) option.definition = trim(node.def, 360);
  if (node.children.length) {
    option.includes = node.children.map((code) => nodes[code].title).join("; ");
    // Group names hide their members ("Chef" lives under "Artistic and Cultural Associate
    // Professionals"), so upper levels also list every occupation inside the group.
    if (node.level < 4) option.occupations = leafTitles(nodes, node).join("; ");
  } else {
    if (node.examples.length) option.example_job_titles = node.examples.slice(0, 8).join("; ");
    if (node.elsewhere.length) option.not_this_code_for = node.elsewhere.slice(0, 5).join("; ");
  }
  return option;
}

/** Richer description for the finals, where only a handful of occupations compete. */
function describeFinalist(nodes, node) {
  const unit = nodes[node.parent];
  const option = { title: node.title, unit_group: unit ? unit.title : undefined };
  if (node.def) option.definition = trim(node.def, 900);
  if (node.examples.length) option.example_job_titles = node.examples.slice(0, 12).join("; ");
  if (node.elsewhere.length) option.not_this_code_for = node.elsewhere.slice(0, 6).join("; ");
  if (!node.def && unit && unit.tasks.length) option.typical_tasks = unit.tasks.slice(0, 6).join("; ");
  return option;
}

function childQuestion(nodes, parent) {
  const criteria = {};
  for (const code of parent.children) criteria[code] = describe(nodes, nodes[code]);
  const instructions = parent.code === "ROOT"
    ? "Which SSOC 2024 major group fits the occupation in `job`? Judge by the main duties and " +
      "the skill level the work requires, not by the employer's industry."
    : `Assume the occupation in \`job\` belongs to SSOC 2024 group ${parent.code} ` +
      `"${parent.title}". Which of its direct sub-groups best fits the job's main duties?`;
  return choice(instructions, criteria);
}

const brief = (node) => ({ code: node.code, title: node.title, level: node.level });

function extend(path, code, p, isDecision) {
  const logSum = path.logSum + (isDecision ? Math.log(Math.max(p, 1e-9)) : 0);
  const decisions = path.decisions + (isDecision ? 1 : 0);
  return {
    codes: [...path.codes, code],
    edges: [...path.edges, p],
    logSum,
    decisions,
    pathP: Math.exp(logSum),
    score: decisions ? Math.exp(logSum / decisions) : 1,
  };
}

/**
 * Classify a job. Yields events the UI animates: asking → round (×5) → finals-asking → final.
 * @param {{title: string, description: string}} job
 */
export async function* classify(client, tree, job, model = "jev-latest") {
  const { nodes, roots } = tree;
  const root = { code: "ROOT", title: "SSOC 2024", level: 0, children: roots };
  const lookup = (code) => (code === "ROOT" ? root : nodes[code]);
  const state = { job: { title: job.title || "(untitled)", description: trim(job.description, MAX_JOB_CHARS) } };
  const usage = { input_tokens: 0, output_tokens: 0, requests: 0 };
  const started = Date.now();

  let beam = [{ codes: ["ROOT"], edges: [], logSum: 0, decisions: 0, pathP: 1, score: 1 }];
  let leafPool = [];

  for (let round = 1; ; round++) {
    const frontier = beam.filter((path) => lookup(path.codes.at(-1)).children.length);
    const finished = beam.filter((path) => !lookup(path.codes.at(-1)).children.length);
    if (!frontier.length) break;

    const questions = {};
    const asked = [];
    frontier.forEach((path, i) => {
      const parent = lookup(path.codes.at(-1));
      if (parent.children.length > 1) questions[`node${i}`] = childQuestion(nodes, parent);
      asked.push({
        id: `node${i}`,
        parent: brief(parent),
        path: path.codes.filter((c) => c !== "ROOT"),
        auto: parent.children.length === 1,
        options: parent.children.map((code) => brief(nodes[code])),
      });
    });
    // Speculative companion question, asked once alongside the first level for free latency.
    if (round === 1) {
      questions.isJob = noul(
        "Is `job` a genuine job posting that describes the work clearly enough to identify an occupation?",
      );
    }
    const level = Math.min(...frontier.map((p) => lookup(p.codes.at(-1)).level)) + 1;
    yield { type: "asking", round, level, levelName: LEVEL_NAMES[level] || "Occupation", asked };

    const t0 = Date.now();
    let answers = {};
    if (Object.keys(questions).length) {
      const response = await client.systemOne({ model, state, questions });
      answers = response.answers;
      usage.input_tokens += response.usage.input_tokens;
      usage.output_tokens += response.usage.output_tokens;
      usage.requests += 1;
    }

    const decisions = [];
    const expanded = [];
    frontier.forEach((path, i) => {
      const parent = lookup(path.codes.at(-1));
      const answer = answers[`node${i}`];
      const probs = answer ? answer.probabilities : { [parent.children[0]]: 1 };
      decisions.push({
        id: `node${i}`,
        parent: brief(parent),
        path: path.codes.filter((c) => c !== "ROOT"),
        confidence: answer ? answer.confidence : 1,
        choice: answer ? answer.choice : parent.children[0],
        probs: parent.children
          .map((code) => ({ ...brief(nodes[code]), p: probs[code] ?? 0 }))
          .sort((a, b) => b.p - a.p),
      });
      for (const code of parent.children) {
        expanded.push(extend(path, code, probs[code] ?? 0, Boolean(answer)));
      }
    });

    const pool = [...finished, ...expanded].sort((a, b) => b.score - a.score);
    beam = pool.slice(0, BEAM_WIDTH);
    const kept = new Set(beam.map((p) => p.codes.at(-1)));
    for (const path of expanded) if (!lookup(path.codes.at(-1)).children.length) leafPool.push(path);

    yield {
      type: "round",
      round,
      level,
      levelName: LEVEL_NAMES[level] || "Occupation",
      ms: Date.now() - t0,
      isJob: answers.isJob ? answers.isJob.noul : undefined,
      decisions,
      candidates: pool.map((path) => ({
        ...brief(lookup(path.codes.at(-1))),
        path: path.codes.filter((c) => c !== "ROOT"),
        edgeP: path.edges.at(-1) ?? 1,
        pathP: path.pathP,
        score: path.score,
        kept: kept.has(path.codes.at(-1)),
      })),
    };
  }

  // Finals: the best leaves seen anywhere in the search compete head-to-head.
  const finalists = [...new Map(leafPool.sort((a, b) => b.score - a.score).map((p) => [p.codes.at(-1), p])).values()]
    .slice(0, FINALISTS);
  const finalNodes = finalists.map((path) => nodes[path.codes.at(-1)]);
  yield { type: "finals-asking", finalists: finalNodes.map(brief) };

  const t0 = Date.now();
  let probs = { [finalNodes[0].code]: 1 };
  let confidence = 1;
  if (finalNodes.length > 1) {
    const criteria = {};
    for (const node of finalNodes) criteria[node.code] = describeFinalist(nodes, node);
    const response = await client.systemOne({
      model,
      state,
      questions: {
        finals: choice(
          "Which SSOC 2024 occupation best describes the job in `job`? Compare the job's main duties " +
            "with each occupation's definition, example job titles and exclusions.",
          criteria,
        ),
      },
    });
    probs = response.answers.finals.probabilities;
    confidence = response.answers.finals.confidence;
    usage.input_tokens += response.usage.input_tokens;
    usage.output_tokens += response.usage.output_tokens;
    usage.requests += 1;
  }

  const ranked = finalists
    .map((path) => {
      const node = nodes[path.codes.at(-1)];
      return {
        ...brief(node),
        path: path.codes.filter((c) => c !== "ROOT"),
        p: probs[node.code] ?? 0,
        pathP: path.pathP,
        score: path.score,
        def: node.def,
        examples: node.examples.slice(0, 8),
      };
    })
    .sort((a, b) => b.p - a.p);

  yield {
    type: "final",
    ms: Date.now() - t0,
    totalMs: Date.now() - started,
    winner: ranked[0],
    confidence,
    finalists: ranked,
    usage,
    model,
  };
}
