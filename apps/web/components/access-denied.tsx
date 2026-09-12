import { Card, CardContent } from "./ui/card";

export function AccessDenied({ message }: { message: string }) {
  return (
    <div className="mx-auto max-w-2xl">
      <Card>
        <CardContent className="text-center">
          <h1 className="text-lg font-semibold text-foreground">권한이 없습니다</h1>
          <p className="mt-2 text-sm text-muted-foreground">{message}</p>
        </CardContent>
      </Card>
    </div>
  );
}
