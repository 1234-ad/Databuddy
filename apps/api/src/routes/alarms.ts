import { auth, websitesApi } from "@databuddy/auth";
import { db, alarms, alarmLogs, eq, and, desc, isNull } from "@databuddy/db";
import { sendNotification } from "@databuddy/notifications";
import { Elysia, t } from "elysia";
import { captureError, record } from "../lib/tracing";
import { validateWebsite } from "../lib/website-utils";

// Schema definitions
const AlarmConfigSchema = t.Object({
	metric: t.Optional(t.String()),
	threshold: t.Optional(t.Number()),
	operator: t.Optional(t.Union([
		t.Literal("gt"),
		t.Literal("lt"),
		t.Literal("eq"),
		t.Literal("gte"),
		t.Literal("lte"),
	])),
	timeWindow: t.Optional(t.Number()),
	conditions: t.Optional(t.Any()),
});

const NotificationConfigSchema = t.Object({
	emails: t.Optional(t.Array(t.String())),
	slackWebhook: t.Optional(t.String()),
	webhookUrl: t.Optional(t.String()),
	smsNumbers: t.Optional(t.Array(t.String())),
});

const CreateAlarmSchema = t.Object({
	websiteId: t.String(),
	name: t.String(),
	description: t.Optional(t.String()),
	type: t.Union([
		t.Literal("metric_threshold"),
		t.Literal("anomaly_detection"),
		t.Literal("custom_event"),
		t.Literal("uptime"),
		t.Literal("error_rate"),
	]),
	severity: t.Optional(
		t.Union([
			t.Literal("low"),
			t.Literal("medium"),
			t.Literal("high"),
			t.Literal("critical"),
		])
	),
	config: AlarmConfigSchema,
	notificationChannels: t.Array(
		t.Union([
			t.Literal("email"),
			t.Literal("slack"),
			t.Literal("webhook"),
			t.Literal("sms"),
			t.Literal("push"),
		])
	),
	notificationConfig: t.Optional(NotificationConfigSchema),
	cooldownMinutes: t.Optional(t.Number()),
	isEnabled: t.Optional(t.Boolean()),
});

const UpdateAlarmSchema = t.Partial(CreateAlarmSchema);

const ListAlarmsQuerySchema = t.Object({
	websiteId: t.String(),
	status: t.Optional(
		t.Union([
			t.Literal("active"),
			t.Literal("triggered"),
			t.Literal("resolved"),
			t.Literal("paused"),
			t.Literal("archived"),
		])
	),
	type: t.Optional(t.String()),
	page: t.Optional(t.Number()),
	limit: t.Optional(t.Number()),
});

export const alarmsRoute = new Elysia({ prefix: "/v1/alarms" })
	.derive(async ({ request }) => {
		const session = await auth.api.getSession({ headers: request.headers });
		return { user: session?.user ?? null };
	})
	.onBeforeHandle(({ user, set }) => {
		if (!user) {
			set.status = 401;
			return {
				success: false,
				error: "Authentication required",
				code: "AUTH_REQUIRED",
			};
		}
	})
	// Create alarm
	.post(
		"/",
		async function createAlarm({ body, user, request, set }) {
			return record("createAlarm", async () => {
				try {
					// Validate website access
					const websiteValidation = await validateWebsite(body.websiteId);
					if (!(websiteValidation.success && websiteValidation.website)) {
						set.status = 404;
						return {
							success: false,
							error: websiteValidation.error ?? "Website not found",
							code: "WEBSITE_NOT_FOUND",
						};
					}

					const { website } = websiteValidation;

					// Check permissions
					let authorized = website.isPublic;
					if (!authorized && website.organizationId) {
						const { success } = await websitesApi.hasPermission({
							headers: request.headers,
							body: { permissions: { website: ["write"] } },
						});
						authorized = success;
					}

					if (!authorized) {
						set.status = 403;
						return {
							success: false,
							error: "Access denied to this website",
							code: "ACCESS_DENIED",
						};
					}

					// Create alarm
					const alarmId = crypto.randomUUID();
					const [alarm] = await db
						.insert(alarms)
						.values({
							id: alarmId,
							websiteId: body.websiteId,
							createdBy: user!.id,
							name: body.name,
							description: body.description,
							type: body.type,
							severity: body.severity ?? "medium",
							status: "active",
							config: body.config,
							notificationChannels: body.notificationChannels,
							notificationConfig: body.notificationConfig,
							cooldownMinutes: body.cooldownMinutes ?? 60,
							isEnabled: body.isEnabled ?? true,
							triggerCount: 0,
						})
						.returning();

					return {
						success: true,
						data: alarm,
					};
				} catch (error) {
					captureError(error, {
						alarm_error: true,
						alarm_operation: "create",
						user_id: user?.id ?? "unknown",
					});
					set.status = 500;
					return {
						success: false,
						error: error instanceof Error ? error.message : "Unknown error",
						code: "INTERNAL_ERROR",
					};
				}
			});
		},
		{ body: CreateAlarmSchema }
	)
	// List alarms
	.get(
		"/",
		async function listAlarms({ query, user, request, set }) {
			return record("listAlarms", async () => {
				try {
					const { websiteId, status, type, page = 1, limit = 20 } = query;

					// Validate website access
					const websiteValidation = await validateWebsite(websiteId);
					if (!(websiteValidation.success && websiteValidation.website)) {
						set.status = 404;
						return {
							success: false,
							error: websiteValidation.error ?? "Website not found",
							code: "WEBSITE_NOT_FOUND",
						};
					}

					const { website } = websiteValidation;

					// Check permissions
					let authorized = website.isPublic;
					if (!authorized && website.organizationId) {
						const { success } = await websitesApi.hasPermission({
							headers: request.headers,
							body: { permissions: { website: ["read"] } },
						});
						authorized = success;
					}

					if (!authorized) {
						set.status = 403;
						return {
							success: false,
							error: "Access denied to this website",
							code: "ACCESS_DENIED",
						};
					}

					// Build query conditions
					const conditions = [
						eq(alarms.websiteId, websiteId),
						isNull(alarms.deletedAt),
					];

					if (status) {
						conditions.push(eq(alarms.status, status));
					}

					if (type) {
						conditions.push(eq(alarms.type, type as any));
					}

					// Fetch alarms with pagination
					const offset = (page - 1) * limit;
					const alarmsList = await db
						.select()
						.from(alarms)
						.where(and(...conditions))
						.orderBy(desc(alarms.createdAt))
						.limit(limit)
						.offset(offset);

					// Get total count
					const [{ count }] = await db
						.select({ count: db.fn.count() })
						.from(alarms)
						.where(and(...conditions));

					return {
						success: true,
						data: {
							alarms: alarmsList,
							pagination: {
								page,
								limit,
								total: Number(count),
								totalPages: Math.ceil(Number(count) / limit),
							},
						},
					};
				} catch (error) {
					captureError(error, {
						alarm_error: true,
						alarm_operation: "list",
						user_id: user?.id ?? "unknown",
					});
					set.status = 500;
					return {
						success: false,
						error: error instanceof Error ? error.message : "Unknown error",
						code: "INTERNAL_ERROR",
					};
				}
			});
		},
		{ query: ListAlarmsQuerySchema }
	)
	// Get alarm by ID
	.get(
		"/:id",
		async function getAlarm({ params, user, request, set }) {
			return record("getAlarm", async () => {
				try {
					const [alarm] = await db
						.select()
						.from(alarms)
						.where(and(eq(alarms.id, params.id), isNull(alarms.deletedAt)));

					if (!alarm) {
						set.status = 404;
						return {
							success: false,
							error: "Alarm not found",
							code: "ALARM_NOT_FOUND",
						};
					}

					// Validate website access
					const websiteValidation = await validateWebsite(alarm.websiteId);
					if (!(websiteValidation.success && websiteValidation.website)) {
						set.status = 404;
						return {
							success: false,
							error: "Website not found",
							code: "WEBSITE_NOT_FOUND",
						};
					}

					const { website } = websiteValidation;

					// Check permissions
					let authorized = website.isPublic;
					if (!authorized && website.organizationId) {
						const { success } = await websitesApi.hasPermission({
							headers: request.headers,
							body: { permissions: { website: ["read"] } },
						});
						authorized = success;
					}

					if (!authorized) {
						set.status = 403;
						return {
							success: false,
							error: "Access denied",
							code: "ACCESS_DENIED",
						};
					}

					return {
						success: true,
						data: alarm,
					};
				} catch (error) {
					captureError(error, {
						alarm_error: true,
						alarm_operation: "get",
						user_id: user?.id ?? "unknown",
					});
					set.status = 500;
					return {
						success: false,
						error: error instanceof Error ? error.message : "Unknown error",
						code: "INTERNAL_ERROR",
					};
				}
			});
		},
		{ params: t.Object({ id: t.String() }) }
	)
	// Update alarm
	.patch(
		"/:id",
		async function updateAlarm({ params, body, user, request, set }) {
			return record("updateAlarm", async () => {
				try {
					const [existingAlarm] = await db
						.select()
						.from(alarms)
						.where(and(eq(alarms.id, params.id), isNull(alarms.deletedAt)));

					if (!existingAlarm) {
						set.status = 404;
						return {
							success: false,
							error: "Alarm not found",
							code: "ALARM_NOT_FOUND",
						};
					}

					// Validate website access
					const websiteValidation = await validateWebsite(
						existingAlarm.websiteId
					);
					if (!(websiteValidation.success && websiteValidation.website)) {
						set.status = 404;
						return {
							success: false,
							error: "Website not found",
							code: "WEBSITE_NOT_FOUND",
						};
					}

					const { website } = websiteValidation;

					// Check permissions
					let authorized = false;
					if (website.organizationId) {
						const { success } = await websitesApi.hasPermission({
							headers: request.headers,
							body: { permissions: { website: ["write"] } },
						});
						authorized = success;
					}

					if (!authorized) {
						set.status = 403;
						return {
							success: false,
							error: "Access denied",
							code: "ACCESS_DENIED",
						};
					}

					// Update alarm
					const updateData: any = {
						updatedAt: new Date(),
					};

					if (body.name !== undefined) updateData.name = body.name;
					if (body.description !== undefined)
						updateData.description = body.description;
					if (body.type !== undefined) updateData.type = body.type;
					if (body.severity !== undefined) updateData.severity = body.severity;
					if (body.config !== undefined) updateData.config = body.config;
					if (body.notificationChannels !== undefined)
						updateData.notificationChannels = body.notificationChannels;
					if (body.notificationConfig !== undefined)
						updateData.notificationConfig = body.notificationConfig;
					if (body.cooldownMinutes !== undefined)
						updateData.cooldownMinutes = body.cooldownMinutes;
					if (body.isEnabled !== undefined)
						updateData.isEnabled = body.isEnabled;

					const [updatedAlarm] = await db
						.update(alarms)
						.set(updateData)
						.where(eq(alarms.id, params.id))
						.returning();

					return {
						success: true,
						data: updatedAlarm,
					};
				} catch (error) {
					captureError(error, {
						alarm_error: true,
						alarm_operation: "update",
						user_id: user?.id ?? "unknown",
					});
					set.status = 500;
					return {
						success: false,
						error: error instanceof Error ? error.message : "Unknown error",
						code: "INTERNAL_ERROR",
					};
				}
			});
		},
		{ params: t.Object({ id: t.String() }), body: UpdateAlarmSchema }
	)
	// Delete alarm
	.delete(
		"/:id",
		async function deleteAlarm({ params, user, request, set }) {
			return record("deleteAlarm", async () => {
				try {
					const [existingAlarm] = await db
						.select()
						.from(alarms)
						.where(and(eq(alarms.id, params.id), isNull(alarms.deletedAt)));

					if (!existingAlarm) {
						set.status = 404;
						return {
							success: false,
							error: "Alarm not found",
							code: "ALARM_NOT_FOUND",
						};
					}

					// Validate website access
					const websiteValidation = await validateWebsite(
						existingAlarm.websiteId
					);
					if (!(websiteValidation.success && websiteValidation.website)) {
						set.status = 404;
						return {
							success: false,
							error: "Website not found",
							code: "WEBSITE_NOT_FOUND",
						};
					}

					const { website } = websiteValidation;

					// Check permissions
					let authorized = false;
					if (website.organizationId) {
						const { success } = await websitesApi.hasPermission({
							headers: request.headers,
							body: { permissions: { website: ["write"] } },
						});
						authorized = success;
					}

					if (!authorized) {
						set.status = 403;
						return {
							success: false,
							error: "Access denied",
							code: "ACCESS_DENIED",
						};
					}

					// Soft delete
					await db
						.update(alarms)
						.set({ deletedAt: new Date() })
						.where(eq(alarms.id, params.id));

					return {
						success: true,
						message: "Alarm deleted successfully",
					};
				} catch (error) {
					captureError(error, {
						alarm_error: true,
						alarm_operation: "delete",
						user_id: user?.id ?? "unknown",
					});
					set.status = 500;
					return {
						success: false,
						error: error instanceof Error ? error.message : "Unknown error",
						code: "INTERNAL_ERROR",
					};
				}
			});
		},
		{ params: t.Object({ id: t.String() }) }
	)
	// Get alarm logs
	.get(
		"/:id/logs",
		async function getAlarmLogs({ params, query, user, request, set }) {
			return record("getAlarmLogs", async () => {
				try {
					const page = query.page ?? 1;
					const limit = query.limit ?? 20;

					const [alarm] = await db
						.select()
						.from(alarms)
						.where(and(eq(alarms.id, params.id), isNull(alarms.deletedAt)));

					if (!alarm) {
						set.status = 404;
						return {
							success: false,
							error: "Alarm not found",
							code: "ALARM_NOT_FOUND",
						};
					}

					// Validate website access
					const websiteValidation = await validateWebsite(alarm.websiteId);
					if (!(websiteValidation.success && websiteValidation.website)) {
						set.status = 404;
						return {
							success: false,
							error: "Website not found",
							code: "WEBSITE_NOT_FOUND",
						};
					}

					const { website } = websiteValidation;

					// Check permissions
					let authorized = website.isPublic;
					if (!authorized && website.organizationId) {
						const { success } = await websitesApi.hasPermission({
							headers: request.headers,
							body: { permissions: { website: ["read"] } },
						});
						authorized = success;
					}

					if (!authorized) {
						set.status = 403;
						return {
							success: false,
							error: "Access denied",
							code: "ACCESS_DENIED",
						};
					}

					// Fetch logs
					const offset = (page - 1) * limit;
					const logs = await db
						.select()
						.from(alarmLogs)
						.where(eq(alarmLogs.alarmId, params.id))
						.orderBy(desc(alarmLogs.triggeredAt))
						.limit(limit)
						.offset(offset);

					// Get total count
					const [{ count }] = await db
						.select({ count: db.fn.count() })
						.from(alarmLogs)
						.where(eq(alarmLogs.alarmId, params.id));

					return {
						success: true,
						data: {
							logs,
							pagination: {
								page,
								limit,
								total: Number(count),
								totalPages: Math.ceil(Number(count) / limit),
							},
						},
					};
				} catch (error) {
					captureError(error, {
						alarm_error: true,
						alarm_operation: "get_logs",
						user_id: user?.id ?? "unknown",
					});
					set.status = 500;
					return {
						success: false,
						error: error instanceof Error ? error.message : "Unknown error",
						code: "INTERNAL_ERROR",
					};
				}
			});
		},
		{
			params: t.Object({ id: t.String() }),
			query: t.Object({
				page: t.Optional(t.Number()),
				limit: t.Optional(t.Number()),
			}),
		}
	);
