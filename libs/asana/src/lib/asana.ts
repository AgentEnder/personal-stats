import { Client } from 'asana';
import { subDays } from 'date-fns';

const today = new Date();

let asanaClient: Client;

interface AsanaContext {
  workspaceId: string;
  userId: string;
  period: number;
}

export async function getAsanaUserId() {
  const me = await asanaClient.users.me();
  return me.gid;
}

export async function getAsanaWorkspace(asanaWorkspace: string) {
  const ws = await asanaClient.workspaces.findAll().then((x) => x.data);
  return ws.find(({ name }) => name === asanaWorkspace).gid;
}

export async function getAsanaContext(
  accessToken: string,
  asanaWorkspace: string,
  period: number
): Promise<AsanaContext> {
  asanaClient = Client.create({
    defaultHeaders: {
      'Asana-Disable': 'new_memberships',
    },
  }).useAccessToken(accessToken);
  return Promise.all([getAsanaUserId(), getAsanaWorkspace(asanaWorkspace)] as const).then(
    ([user, workspace]) => ({
      userId: user,
      workspaceId: workspace,
      period,
    })
  );
}

export async function getAsanaTasksCompletedThisWeek({
  workspaceId,
  userId,
  period,
}: AsanaContext) {
  return asanaClient.tasks
    .searchInWorkspace(workspaceId, {
      opt_fields: 'notes,name,permalink_url',
      'assignee.any': userId,
      'completed_on.after': subDays(today, period)
        .toISOString()
        .replace(/T.*Z/, ''),
      completed: true,
    } as unknown)
    .then((v) => v.data);
}

export async function getWeeklyGoalsFromAsana(ctx: AsanaContext) {
  const allTasks = await asanaClient.tasks
    .searchInWorkspace(ctx.workspaceId, {
      opt_fields: 'notes, created_at',
      'created_by.any': ctx.userId,
      'created_on.after': subDays(today, ctx.period + 1)
        .toISOString()
        .replace(/T.*Z/, ''),
      'projects.any': '1204025107844535',
    } as unknown)
    .then((v) => v.data);
  const sorted = allTasks.sort(
    (a, b) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
  return sorted[0];
}
