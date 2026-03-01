import { NextResponse } from "next/server";

import { getAuthContext } from "@/lib/access";

export const dynamic = "force-dynamic";

function buildOpenApi(origin: string) {
  return {
    openapi: "3.0.3",
    info: {
      title: "Aarshjul API",
      version: "1.0.0",
      description:
        "Built-in API documentation for Aarshjul. Most endpoints use NextAuth session auth; selected endpoints also support API keys."
    },
    servers: [
      {
        url: origin
      }
    ],
    tags: [
      { name: "Wheels" },
      { name: "Activities" },
      { name: "Sharing" },
      { name: "Tenant API keys" },
      { name: "System API keys" },
      { name: "Jobs" }
    ],
    components: {
      securitySchemes: {
        sessionCookie: {
          type: "apiKey",
          in: "cookie",
          name: "next-auth.session-token",
          description:
            "NextAuth session cookie (in production this may be __Secure-next-auth.session-token depending on deployment)."
        },
        xApiKey: {
          type: "apiKey",
          in: "header",
          name: "x-api-key",
          description: "Tenant/system API key header."
        },
        bearerApiKey: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "API key",
          description: "API key provided as Authorization: Bearer <key>."
        },
        xJobSecret: {
          type: "apiKey",
          in: "header",
          name: "x-job-secret",
          description: "Legacy reminder job secret."
        }
      },
      schemas: {
        ErrorResponse: {
          type: "object",
          properties: {
            error: { type: "string" }
          }
        },
        Wheel: {
          type: "object",
          properties: {
            id: { type: "string" },
            title: { type: "string" },
            timezone: { type: "string" },
            startDate: { type: "string", format: "date-time" },
            durationMonths: { type: "integer", enum: [3, 6, 12] },
            config: {},
            ownerId: { type: "string" },
            updatedAt: { type: "string", format: "date-time" }
          }
        },
        Activity: {
          type: "object",
          properties: {
            id: { type: "string" },
            wheelId: { type: "string" },
            ringId: { type: "string" },
            title: { type: "string" },
            description: { type: "string", nullable: true },
            color: { type: "string" },
            startAt: { type: "string", format: "date-time" },
            endAt: { type: "string", format: "date-time" },
            tags: {
              type: "array",
              items: { type: "string" }
            }
          }
        },
        ActivitySchedule: {
          type: "object",
          properties: {
            cadence: {
              type: "string",
              enum: ["NONE", "ONCE", "DAILY", "WEEKLY", "MONTHLY", "CUSTOM_RRULE"]
            },
            timezone: { type: "string" },
            deadlineAt: { type: "string", format: "date-time", nullable: true },
            rrule: { type: "string", nullable: true },
            reminderOffsetsMinutes: {
              type: "array",
              items: { type: "integer" }
            },
            reminderEmails: {
              type: "array",
              items: { type: "string" }
            },
            isEnabled: { type: "boolean" }
          }
        },
        ManagedApiKey: {
          type: "object",
          properties: {
            id: { type: "string" },
            name: { type: "string" },
            prefix: { type: "string" },
            createdAt: { type: "string", format: "date-time" },
            updatedAt: { type: "string", format: "date-time" },
            lastUsedAt: { type: "string", format: "date-time", nullable: true },
            expiresAt: { type: "string", format: "date-time", nullable: true },
            revokedAt: { type: "string", format: "date-time", nullable: true }
          }
        },
        ShareEntry: {
          type: "object",
          properties: {
            id: { type: "string" },
            targetType: { type: "string", enum: ["USER", "AAD_GROUP"] },
            role: { type: "string", enum: ["VIEWER", "EDITOR", "OWNER"] },
            createdAt: { type: "string", format: "date-time" }
          }
        }
      }
    },
    paths: {
      "/api/wheels": {
        get: {
          tags: ["Wheels"],
          summary: "List wheels for active tenant / API-key tenant",
          security: [{ sessionCookie: [] }, { xApiKey: [] }, { bearerApiKey: [] }],
          responses: {
            "200": {
              description: "Wheel list",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      wheels: {
                        type: "array",
                        items: { $ref: "#/components/schemas/Wheel" }
                      }
                    }
                  }
                }
              }
            },
            "401": { description: "Unauthorized", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } }
          }
        },
        post: {
          tags: ["Wheels"],
          summary: "Create wheel",
          security: [{ sessionCookie: [] }, { xApiKey: [] }, { bearerApiKey: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["title"],
                  properties: {
                    title: { type: "string" },
                    timezone: { type: "string" },
                    startDate: { type: "string", format: "date-time" },
                    durationMonths: { type: "integer", enum: [3, 6, 12] },
                    config: {}
                  }
                }
              }
            }
          },
          responses: {
            "201": {
              description: "Created",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      wheel: { $ref: "#/components/schemas/Wheel" }
                    }
                  }
                }
              }
            }
          }
        }
      },
      "/api/wheels/{wheelId}": {
        get: {
          tags: ["Wheels"],
          summary: "Get wheel",
          security: [{ sessionCookie: [] }, { xApiKey: [] }, { bearerApiKey: [] }],
          parameters: [{ name: "wheelId", in: "path", required: true, schema: { type: "string" } }],
          responses: {
            "200": {
              description: "Wheel",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: { wheel: { $ref: "#/components/schemas/Wheel" } }
                  }
                }
              }
            }
          }
        },
        patch: {
          tags: ["Wheels"],
          summary: "Update wheel",
          security: [{ sessionCookie: [] }, { xApiKey: [] }, { bearerApiKey: [] }],
          parameters: [{ name: "wheelId", in: "path", required: true, schema: { type: "string" } }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    title: { type: "string" },
                    timezone: { type: "string" },
                    startDate: { type: "string", format: "date-time" },
                    durationMonths: { type: "integer", enum: [3, 6, 12] },
                    config: {}
                  }
                }
              }
            }
          },
          responses: {
            "200": {
              description: "Updated",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: { wheel: { $ref: "#/components/schemas/Wheel" } }
                  }
                }
              }
            }
          }
        },
        delete: {
          tags: ["Wheels"],
          summary: "Delete wheel",
          security: [{ sessionCookie: [] }, { xApiKey: [] }, { bearerApiKey: [] }],
          parameters: [{ name: "wheelId", in: "path", required: true, schema: { type: "string" } }],
          responses: {
            "200": {
              description: "Deleted",
              content: {
                "application/json": {
                  schema: { type: "object", properties: { removed: { type: "integer" } } }
                }
              }
            }
          }
        }
      },
      "/api/wheels/{wheelId}/activities": {
        get: {
          tags: ["Activities"],
          summary: "List activities in wheel",
          security: [{ sessionCookie: [] }, { xApiKey: [] }, { bearerApiKey: [] }],
          parameters: [{ name: "wheelId", in: "path", required: true, schema: { type: "string" } }],
          responses: {
            "200": {
              description: "Activity list",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: { activities: { type: "array", items: { $ref: "#/components/schemas/Activity" } } }
                  }
                }
              }
            }
          }
        },
        post: {
          tags: ["Activities"],
          summary: "Create activity",
          security: [{ sessionCookie: [] }, { xApiKey: [] }, { bearerApiKey: [] }],
          parameters: [{ name: "wheelId", in: "path", required: true, schema: { type: "string" } }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["ringId", "title", "startAt", "endAt"],
                  properties: {
                    ringId: { type: "string" },
                    title: { type: "string" },
                    description: { type: "string" },
                    color: { type: "string" },
                    startAt: { type: "string", format: "date-time" },
                    endAt: { type: "string", format: "date-time" },
                    tags: { type: "array", items: { type: "string" } }
                  }
                }
              }
            }
          },
          responses: {
            "201": {
              description: "Created",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: { activity: { $ref: "#/components/schemas/Activity" } }
                  }
                }
              }
            }
          }
        }
      },
      "/api/activities/{activityId}": {
        patch: {
          tags: ["Activities"],
          summary: "Update activity",
          security: [{ sessionCookie: [] }, { xApiKey: [] }, { bearerApiKey: [] }],
          parameters: [{ name: "activityId", in: "path", required: true, schema: { type: "string" } }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    ringId: { type: "string" },
                    title: { type: "string" },
                    description: { type: "string" },
                    color: { type: "string" },
                    startAt: { type: "string", format: "date-time" },
                    endAt: { type: "string", format: "date-time" },
                    tags: { type: "array", items: { type: "string" } }
                  }
                }
              }
            }
          },
          responses: { "200": { description: "Updated" } }
        },
        delete: {
          tags: ["Activities"],
          summary: "Delete activity",
          security: [{ sessionCookie: [] }, { xApiKey: [] }, { bearerApiKey: [] }],
          parameters: [{ name: "activityId", in: "path", required: true, schema: { type: "string" } }],
          responses: { "200": { description: "Deleted" } }
        }
      },
      "/api/activities/{activityId}/schedule": {
        get: {
          tags: ["Activities"],
          summary: "Get activity schedule",
          security: [{ sessionCookie: [] }, { xApiKey: [] }, { bearerApiKey: [] }],
          parameters: [{ name: "activityId", in: "path", required: true, schema: { type: "string" } }],
          responses: { "200": { description: "Schedule" } }
        },
        patch: {
          tags: ["Activities"],
          summary: "Update activity schedule",
          security: [{ sessionCookie: [] }, { xApiKey: [] }, { bearerApiKey: [] }],
          parameters: [{ name: "activityId", in: "path", required: true, schema: { type: "string" } }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ActivitySchedule" }
              }
            }
          },
          responses: { "200": { description: "Updated" } }
        }
      },
      "/api/wheels/{wheelId}/share": {
        get: {
          tags: ["Sharing"],
          summary: "List sharing entries for wheel",
          security: [{ sessionCookie: [] }, { xApiKey: [] }, { bearerApiKey: [] }],
          parameters: [{ name: "wheelId", in: "path", required: true, schema: { type: "string" } }],
          responses: {
            "200": {
              description: "Share list",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: { shares: { type: "array", items: { $ref: "#/components/schemas/ShareEntry" } } }
                  }
                }
              }
            }
          }
        },
        post: {
          tags: ["Sharing"],
          summary: "Create/update wheel share",
          security: [{ sessionCookie: [] }, { xApiKey: [] }, { bearerApiKey: [] }],
          parameters: [{ name: "wheelId", in: "path", required: true, schema: { type: "string" } }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["targetType", "role"],
                  properties: {
                    targetType: { type: "string", enum: ["USER", "AAD_GROUP"] },
                    role: { type: "string", enum: ["VIEWER", "EDITOR", "OWNER"] },
                    userEmail: { type: "string" },
                    tenantGroupId: { type: "string" },
                    groupDisplayName: { type: "string" }
                  }
                }
              }
            }
          },
          responses: { "201": { description: "Created/updated" } }
        },
        delete: {
          tags: ["Sharing"],
          summary: "Delete wheel share",
          security: [{ sessionCookie: [] }, { xApiKey: [] }, { bearerApiKey: [] }],
          parameters: [
            { name: "wheelId", in: "path", required: true, schema: { type: "string" } },
            { name: "targetType", in: "query", required: true, schema: { type: "string", enum: ["USER", "AAD_GROUP"] } },
            { name: "userEmail", in: "query", required: false, schema: { type: "string" } },
            { name: "tenantGroupId", in: "query", required: false, schema: { type: "string" } }
          ],
          responses: { "200": { description: "Deleted" } }
        }
      },
      "/api/admin/tenant/api-keys": {
        get: {
          tags: ["Tenant API keys"],
          summary: "List tenant API keys",
          security: [{ sessionCookie: [] }],
          parameters: [{ name: "tenantId", in: "query", required: false, schema: { type: "string" } }],
          responses: {
            "200": {
              description: "Tenant API key list",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      tenantId: { type: "string" },
                      apiKeys: { type: "array", items: { $ref: "#/components/schemas/ManagedApiKey" } }
                    }
                  }
                }
              }
            }
          }
        },
        post: {
          tags: ["Tenant API keys"],
          summary: "Create tenant API key",
          security: [{ sessionCookie: [] }],
          parameters: [{ name: "tenantId", in: "query", required: false, schema: { type: "string" } }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["name"],
                  properties: {
                    name: { type: "string" },
                    expiresAt: { type: "string", format: "date-time" }
                  }
                }
              }
            }
          },
          responses: {
            "201": {
              description: "Created",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      apiKey: { $ref: "#/components/schemas/ManagedApiKey" },
                      plainTextKey: { type: "string" }
                    }
                  }
                }
              }
            }
          }
        }
      },
      "/api/admin/tenant/api-keys/{keyId}": {
        patch: {
          tags: ["Tenant API keys"],
          summary: "Revoke or activate tenant API key",
          security: [{ sessionCookie: [] }],
          parameters: [
            { name: "keyId", in: "path", required: true, schema: { type: "string" } },
            { name: "tenantId", in: "query", required: false, schema: { type: "string" } }
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["action"],
                  properties: { action: { type: "string", enum: ["revoke", "activate"] } }
                }
              }
            }
          },
          responses: { "200": { description: "Updated" } }
        },
        delete: {
          tags: ["Tenant API keys"],
          summary: "Delete tenant API key",
          security: [{ sessionCookie: [] }],
          parameters: [
            { name: "keyId", in: "path", required: true, schema: { type: "string" } },
            { name: "tenantId", in: "query", required: false, schema: { type: "string" } }
          ],
          responses: { "200": { description: "Deleted" } }
        }
      },
      "/api/sysadmin/api-keys": {
        get: {
          tags: ["System API keys"],
          summary: "List system API keys",
          security: [{ sessionCookie: [] }],
          responses: { "200": { description: "System API key list" } }
        },
        post: {
          tags: ["System API keys"],
          summary: "Create system API key",
          security: [{ sessionCookie: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["name"],
                  properties: {
                    name: { type: "string" },
                    expiresAt: { type: "string", format: "date-time" }
                  }
                }
              }
            }
          },
          responses: { "201": { description: "Created" } }
        }
      },
      "/api/sysadmin/api-keys/{keyId}": {
        patch: {
          tags: ["System API keys"],
          summary: "Revoke or activate system API key",
          security: [{ sessionCookie: [] }],
          parameters: [{ name: "keyId", in: "path", required: true, schema: { type: "string" } }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["action"],
                  properties: { action: { type: "string", enum: ["revoke", "activate"] } }
                }
              }
            }
          },
          responses: { "200": { description: "Updated" } }
        },
        delete: {
          tags: ["System API keys"],
          summary: "Delete system API key",
          security: [{ sessionCookie: [] }],
          parameters: [{ name: "keyId", in: "path", required: true, schema: { type: "string" } }],
          responses: { "200": { description: "Deleted" } }
        }
      },
      "/api/jobs/reminders/dispatch": {
        post: {
          tags: ["Jobs"],
          summary: "Dispatch due reminder emails",
          description: "Authorize with either a system API key or x-job-secret.",
          security: [{ xApiKey: [] }, { bearerApiKey: [] }, { xJobSecret: [] }],
          responses: {
            "200": {
              description: "Dispatch result",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      scanned: { type: "integer" },
                      sent: { type: "integer" },
                      failed: { type: "integer" }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  };
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
  return NextResponse.json(buildOpenApi(origin));
}
