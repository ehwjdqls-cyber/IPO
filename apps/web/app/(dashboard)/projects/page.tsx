import Link from "next/link";
import { getAuthenticatedUser } from "../../../lib/auth";
import { listMemberships } from "../../../lib/queries/organizations";
import { listProjects } from "../../../lib/queries/projects";
import { Button } from "../../../components/ui/button";
import { Card, CardContent } from "../../../components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../../components/ui/table";

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
        <h1 className="text-lg font-semibold text-foreground">소속된 조직이 없습니다</h1>
        <p className="mt-2 text-sm text-muted-foreground">회원가입을 완료하면 조직이 자동으로 생성됩니다.</p>
      </div>
    );
  }

  const projects = await listProjects(user.id, organization.id);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-foreground">IPO 프로젝트</h1>
        <Button asChild>
          <Link href="/projects/new">새 프로젝트</Link>
        </Button>
      </div>

      {projects.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="p-12 text-center">
            <p className="text-sm text-muted-foreground">
              아직 프로젝트가 없습니다. 데모가 아닌 실제 IPO 프로젝트를 만들어보세요.
            </p>
            <Button asChild className="mt-4">
              <Link href="/projects/new">새 프로젝트 만들기</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>회사명</TableHead>
                <TableHead>시장</TableHead>
                <TableHead>목표일</TableHead>
                <TableHead>상태</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {projects.map((project) => (
                <TableRow key={project.id}>
                  <TableCell>
                    <Link
                      href={`/projects/${project.id}`}
                      className="font-medium text-foreground hover:underline"
                    >
                      {project.companyNameKo}
                    </Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {MARKET_LABEL[project.targetMarket]}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {project.targetFilingDate ?? "-"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{project.status}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
