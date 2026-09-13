"use client";

import { Button } from "../../components/ui/button";
import { Card, CardContent } from "../../components/ui/card";

export default function Error({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <div className="mx-auto max-w-md">
      <Card>
        <CardContent className="space-y-3 text-center">
          <h2 className="text-lg font-semibold text-foreground">문제가 발생했습니다</h2>
          <p className="text-sm text-muted-foreground">
            잠시 후 다시 시도해주세요. 문제가 계속되면 관리자에게 문의해주세요.
          </p>
          {error.digest && <p className="text-xs text-muted-foreground">오류 코드: {error.digest}</p>}
          <Button onClick={() => retry()}>다시 시도</Button>
        </CardContent>
      </Card>
    </div>
  );
}
