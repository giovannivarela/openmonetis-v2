import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { ok } from "@openmonetis/shared/api";
import {
  DebtDetailOutputSchema,
  DebtOutputSchema,
  DebtParamsSchema,
  ImportDebtStatementInputSchema,
  UpdateDebtInputSchema,
} from "@openmonetis/validators/debts";
import type { DebtsService } from "../services/debts.service";
import type { ApiVariables } from "../types/context";
import { ErrorResponseSchema as ErrorSchema, validationHook } from "../utils/openapi";

const DebtResponseSchema = z.object({ data: DebtOutputSchema, error: z.null() });
const DebtDetailResponseSchema = z.object({ data: DebtDetailOutputSchema, error: z.null() });
const DebtsResponseSchema = z.object({ data: z.array(DebtOutputSchema), error: z.null() });
const DeleteResponseSchema = z.object({ data: z.object({ id: z.uuid() }), error: z.null() });

const unauthorized = {
  description: "Authentication required",
  content: { "application/json": { schema: ErrorSchema } },
};
const debtNotFound = {
  description: "Debt not found",
  content: { "application/json": { schema: ErrorSchema } },
};

export function createDebtsRoute(service: DebtsService) {
  const route = new OpenAPIHono<{ Variables: ApiVariables }>({ defaultHook: validationHook });

  route.openapi(
    createRoute({
      method: "get",
      path: "/",
      tags: ["Debts"],
      responses: {
        200: {
          description: "Debts of the authenticated user, with their summaries",
          content: { "application/json": { schema: DebtsResponseSchema } },
        },
        401: unauthorized,
      },
    }),
    async (context) => context.json(ok(await service.list(context.get("userId"))), 200),
  );

  route.openapi(
    createRoute({
      method: "post",
      path: "/imports",
      tags: ["Debts"],
      request: {
        body: {
          required: true,
          content: { "application/json": { schema: ImportDebtStatementInputSchema } },
        },
      },
      responses: {
        201: {
          description: "Debt created or updated from the imported statement",
          content: { "application/json": { schema: DebtDetailResponseSchema } },
        },
        400: {
          description: "Unreadable, unsupported or unverifiable statement",
          content: { "application/json": { schema: ErrorSchema } },
        },
        401: unauthorized,
      },
    }),
    async (context) =>
      context.json(
        ok(await service.importStatement(context.req.valid("json"), context.get("userId"))),
        201,
      ),
  );

  route.openapi(
    createRoute({
      method: "get",
      path: "/{id}",
      tags: ["Debts"],
      request: { params: DebtParamsSchema },
      responses: {
        200: {
          description: "Debt with its schedule and extra amortizations",
          content: { "application/json": { schema: DebtDetailResponseSchema } },
        },
        401: unauthorized,
        404: debtNotFound,
      },
    }),
    async (context) =>
      context.json(
        ok(await service.get(context.req.valid("param").id, context.get("userId"))),
        200,
      ),
  );

  route.openapi(
    createRoute({
      method: "patch",
      path: "/{id}",
      tags: ["Debts"],
      request: {
        params: DebtParamsSchema,
        body: {
          required: true,
          content: { "application/json": { schema: UpdateDebtInputSchema } },
        },
      },
      responses: {
        200: {
          description: "Updated debt",
          content: { "application/json": { schema: DebtResponseSchema } },
        },
        400: {
          description: "Invalid debt update",
          content: { "application/json": { schema: ErrorSchema } },
        },
        401: unauthorized,
        404: debtNotFound,
      },
    }),
    async (context) =>
      context.json(
        ok(
          await service.update(
            context.req.valid("param").id,
            context.get("userId"),
            context.req.valid("json"),
          ),
        ),
        200,
      ),
  );

  route.openapi(
    createRoute({
      method: "delete",
      path: "/{id}",
      tags: ["Debts"],
      request: { params: DebtParamsSchema },
      responses: {
        200: {
          description: "Deleted debt and its statements",
          content: { "application/json": { schema: DeleteResponseSchema } },
        },
        401: unauthorized,
        404: debtNotFound,
      },
    }),
    async (context) =>
      context.json(
        ok(await service.remove(context.req.valid("param").id, context.get("userId"))),
        200,
      ),
  );

  return route;
}
