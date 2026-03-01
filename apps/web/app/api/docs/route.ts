import { NextResponse } from "next/server";

import { getAuthContext } from "@/lib/access";

export const dynamic = "force-dynamic";

function buildHtml(specUrl: string) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Aarshjul API Docs</title>
    <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css" />
    <style>
      html, body { margin: 0; padding: 0; background: #f1f4f8; }
      #swagger-ui { max-width: 1200px; margin: 0 auto; }
      .swagger-ui .topbar { background: #243447; }
      .swagger-ui .topbar-wrapper::after {
        content: "Aarshjul API";
        color: #fff;
        font-size: 14px;
        font-weight: 600;
        margin-left: 12px;
      }
    </style>
  </head>
  <body>
    <div id="swagger-ui"></div>
    <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
    <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-standalone-preset.js"></script>
    <script>
      window.onload = function () {
        window.ui = SwaggerUIBundle({
          url: ${JSON.stringify(specUrl)},
          dom_id: '#swagger-ui',
          deepLinking: true,
          presets: [SwaggerUIBundle.presets.apis, SwaggerUIStandalonePreset],
          layout: 'BaseLayout',
          displayRequestDuration: true
        });
      };
    </script>
  </body>
</html>`;
}

export async function GET(request: Request) {
  const authContext = await getAuthContext(request);
  if (authContext instanceof NextResponse) {
    return authContext;
  }
  if (!authContext.isAdmin && !authContext.isSystemAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const origin = new URL(request.url).origin;
  const html = buildHtml(`${origin}/api/openapi`);
  return new NextResponse(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}
