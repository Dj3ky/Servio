import { kimaiSafeName } from '@servio/shared';
import type { KimaiProject } from './kimai';

export type LinkMatch = 'exact' | 'same_name' | 'similar';

export interface LinkCandidate {
  projectNumber: string;
  name: string;
  customerName: string | null;
}

const RANK: Record<LinkMatch, number> = { exact: 0, same_name: 1, similar: 2 };
const MIN_PARTIAL_LENGTH = 4;

function normalize(value: string | null | undefined) {
  return kimaiSafeName(value ?? '').toLocaleLowerCase('sl');
}

function classify(project: LinkCandidate, kimai: KimaiProject): LinkMatch | null {
  const name = normalize(project.name);
  const kimaiName = normalize(kimai.name);
  const sameNumber = !!kimai.number && normalize(project.projectNumber) === normalize(kimai.number);
  const sameCustomer = !!project.customerName && normalize(project.customerName) === normalize(kimai.parentTitle);

  if (name === kimaiName) return sameNumber || sameCustomer ? 'exact' : 'same_name';
  // Numbers can repeat, so a matching number alone is never more than a hint
  if (sameNumber) return 'similar';
  const [shorter, longer] = name.length < kimaiName.length ? [name, kimaiName] : [kimaiName, name];
  return shorter.length >= MIN_PARTIAL_LENGTH && longer.includes(shorter) ? 'similar' : null;
}

// Only a suggestion for the user to confirm. On a tie the same customer wins, then the first in Kimai's order.
export function suggestKimaiProject(project: LinkCandidate, kimaiProjects: KimaiProject[]) {
  let best: { kimaiProjectId: number; match: LinkMatch; sameCustomer: boolean } | null = null;
  for (const kimai of kimaiProjects) {
    const match = classify(project, kimai);
    if (!match) continue;
    const sameCustomer = !!project.customerName && normalize(project.customerName) === normalize(kimai.parentTitle);
    const better = !best
      || RANK[match] < RANK[best.match]
      || (RANK[match] === RANK[best.match] && sameCustomer && !best.sameCustomer);
    if (better) best = { kimaiProjectId: kimai.id, match, sameCustomer };
  }
  return best && { kimaiProjectId: best.kimaiProjectId, match: best.match };
}
