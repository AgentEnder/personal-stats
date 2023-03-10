import { memoize } from '@personal-stats/utils';
import { subDays, isAfter } from 'date-fns';
import { Octokit } from 'octokit';
import parseGitDiff = require('parse-diff');

type EventTimelineEntry = Awaited<
  ReturnType<Octokit['rest']['activity']['listEventsForAuthenticatedUser']>
>['data'][0];

type EventTimeline = Array<EventTimelineEntry>;

let client: Octokit;

export function initializeGithubClient(accessToken?: string) {
  client = new Octokit({
    auth: accessToken,
  });
}

export type Issue = EventTimelineEntry['payload']['issue'];

export async function getGithubIssuesClosedForPeriod(
  user: string,
  repo: string,
  period: number
): Promise<Issue[]> {
  const events = await getUserGithubEventsFromPeriod(user, period);
  return events
    .filter(
      (evt) =>
        evt.type === 'IssuesEvent' &&
        evt.payload?.action === 'closed' &&
        evt.repo.name === repo
    )
    .map(({ payload }) => payload.issue);
}

function getChangedLinesFromPR(pr: PR): Promise<Changes> {
  return client.request(pr.diff_url).then(({ data }) => {
    const diff = parseGitDiff(data);
    let prAdditions = 0;
    let prDeletions = 0;
    const files = new Map<string, Omit<Changes, 'files'>>();
    for (const file of diff) {
      prAdditions += file.additions;
      prDeletions += file.deletions;
      const filePath = file.to.replace(/^b/, '');
      const fileChanges = files.get(filePath) ?? { additions: 0, deletions: 0 };
      fileChanges.additions += file.additions;
      fileChanges.deletions += file.deletions;
      files.set(filePath, fileChanges);
    }
    return {
      additions: prAdditions,
      deletions: prDeletions,
      files,
    };
  });
}

export type Changes = {
  additions: number;
  deletions: number;
  files: Map<string, Omit<Changes, 'files'>>;
};

export type PR = Awaited<
  ReturnType<Octokit['rest']['pulls']['list']>
>['data'][0];

export function getTotalLinesChanged(changes: Changes[]): Changes {
  const lines = changes.reduce(
    (acc, { additions, deletions }) => ({
      additions: acc.additions + additions,
      deletions: acc.deletions + deletions,
    }),
    { additions: 0, deletions: 0 }
  );
  const files = new Map<string, Omit<Changes, 'files'>>();
  for (const change of changes) {
    for (const [file, diffFileChanges] of change.files) {
      const fileChanges = files.get(file) ?? { additions: 0, deletions: 0 };
      fileChanges.additions += diffFileChanges.additions;
      fileChanges.deletions += diffFileChanges.deletions;
      files.set(file, fileChanges);
    }
  }
  return {
    ...lines,
    files,
  };
}

export const getMergedPrsForPeriod = memoize<
  Array<PR & Changes>,
  (
    user: string,
    repo: `${string}/${string}`,
    period: number,
    base?: string
  ) => Promise<Array<PR & Changes>>
>(async function (user: string, repo: string, period: number, base = 'master') {
  const it = client.paginate.iterator(client.rest.pulls.list, {
    repo: repo.split('/')[1],
    owner: repo.split('/')[0],
    base,
    state: 'closed',
    per_page: 100,
    sort: 'updated',
    direction: 'desc',
  });
  const collected: (PR & Changes)[] = [];
  for await (const slice of it) {
    let end = false;
    for (const pr of slice.data) {
      if (isAfter(new Date(pr.updated_at), subDays(new Date(), period))) {
        if (
          pr.user.login === user &&
          isAfter(new Date(pr.merged_at), subDays(new Date(), period))
        ) {
          const changes = await getChangedLinesFromPR(pr);
          collected.push({
            ...pr,
            ...changes,
          });
        }
      } else if (pr.merge_commit_sha) {
        end = true;
      }
    }
    if (end) {
      break;
    }
  }
  return collected;
});

export const getUserGithubEventsFromPeriod = memoize<
  EventTimeline,
  (user: string, period: number) => Promise<EventTimeline>
>(async function (user: string, period: number) {
  const events: EventTimeline = [];

  const iterator = client.paginate.iterator(
    client.rest.activity.listEventsForAuthenticatedUser,
    {
      username: user,
    }
  );
  for await (const pg of iterator) {
    events.push(...pg.data);
  }
  return events.filter((x) =>
    isAfter(new Date(x.created_at), subDays(new Date(), period))
  );
});

export function isGithubRepo(str: string): str is `${string}/${string}` {
  return /\S+\/\S+/.test(str);
}
