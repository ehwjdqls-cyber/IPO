import Link from "next/link";
import { getAuthenticatedUser } from "../../../lib/auth";
import { listMemberships } from "../../../lib/queries/organizations";
import { listProjects } from "../../../lib/queries/projects";

const MARKET_LABEL: Record<string, string> = {
  KOSPI: "KOSPI",
  KOSDAQ: "KOSDAQ",
  KONEX: "KONEX",
  UNDECIDED: "미정",
};

export default async function ProjectsPage() {
  const user = await getAuthenticatedUser();
  if (!user) {
    return null;
  }

  const memberships = await listMemberships(user.id);
  const organization = memberships[0];

  if (!organization) {
    return (
      <div className="mx-auto max-w-2xl text-center">
        <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">소속된 조직이 없습니다</h1>
        <p className="mt-2 text-sm text-zinc-500">회원가입을 완료하면 조직이 자동으로 생성됩니다.</p>
      </div>
    );
  }

  const projects = await listProjects(user.id, organization.id);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">IPO 프로젝트</h1>
        <Link
          href="/projects/new"
          className="rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white dark:bg-zinc-50 dark:text-zinc-900"
        >
          새 프로젝트
        </Link>
      </div>

      {projects.length === 0 ? (
        <div className="rounded-lg border border-dashed border-zinc-300 bg-white p-12 text-center dark:border-zinc-700 dark:bg-zinc-900">
          <p className="text-sm text-zinc-500">
            아직 프로젝트가 없습니다. 데모가 아닌 실제 IPO 프로젝트를 만들어보세요.
          </p>
          <Link
            href="/projects/new"
            className="mt-4 inline-block rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white dark:bg-zinc-50 dark:text-zinc-900"
          >
            새 프로젝트 만들기
          </Link>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
          <table className="min-w-full divide-y divide-zinc-200 text-sm dark:divide-zinc-800">
            <thead className="bg-zinc-50 text-left text-xs font-medium uppercase text-zinc-500 dark:bg-zinc-950">
              <tr>
                <th className="px-4 py-3">회사명</th>
                <th className="px-4 py-3">시장</th>
                <th className="px-4 py-3">목표일</th>
                <th className="px-4 py-3">상태</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {projects.map((project) => (
                <tr key={project.id}>
                  <td className="px-4 py-3">
                    <Link
                      href={`/projects/${project.id}`}
                      className="font-medium text-zinc-900 hover:underline dark:text-zinc-50"
                    >
                      {project.companyNameKo}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-zinc-500">{MARKET_LABEL[project.targetMarket]}</td>
                  <td className="px-4 py-3 text-zinc-500">{project.targetFilingDate ?? "-"}</td>
                  <td className="px-4 py-3 text-zinc-500">{project.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
