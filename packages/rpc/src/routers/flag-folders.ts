import { websitesApi } from "@databuddy/auth";
import {
	and,
	desc,
	eq,
	flagFolders,
	flags,
	isNull,
	sql,
} from "@databuddy/db";
import { createDrizzleCache, redis } from "@databuddy/redis";
import { ORPCError } from "@orpc/server";
import { randomUUIDv7 } from "bun";
import { z } from "zod";
import type { Context } from "../orpc";
import { protectedProcedure } from "../orpc";
import { authorizeWebsiteAccess } from "../utils/auth";

const foldersCache = createDrizzleCache({ redis, namespace: "flag-folders" });
const CACHE_DURATION = 60;

const authorizeScope = async (
	context: Context,
	websiteId?: string,
	organizationId?: string,
	permission: "read" | "update" | "delete" = "read"
) => {
	if (websiteId) {
		await authorizeWebsiteAccess(context, websiteId, permission);
	} else if (organizationId) {
		const headersObj: Record<string, string> = {};
		context.headers.forEach((value, key) => {
			headersObj[key] = value;
		});
		const perm = permission === "read" ? "read" : "create";
		const { success } = await websitesApi.hasPermission({
			headers: headersObj,
			body: { permissions: { website: [perm] } },
		});
		if (!success) {
			throw new ORPCError("FORBIDDEN", {
				message: "Missing organization permissions.",
			});
		}
	}
};

const listFoldersSchema = z
	.object({
		websiteId: z.string().optional(),
		organizationId: z.string().optional(),
	})
	.refine((data) => data.websiteId || data.organizationId, {
		message: "Either websiteId or organizationId must be provided",
		path: ["websiteId"],
	});

const createFolderSchema = z
	.object({
		name: z.string().min(1).max(100),
		description: z.string().optional(),
		color: z.string().default("#6366f1"),
		websiteId: z.string().optional(),
		organizationId: z.string().optional(),
	})
	.refine((data) => data.websiteId || data.organizationId, {
		message: "Either websiteId or organizationId must be provided",
		path: ["websiteId"],
	});

const updateFolderSchema = z.object({
	id: z.string(),
	name: z.string().min(1).max(100).optional(),
	description: z.string().optional(),
	color: z.string().optional(),
});

const deleteFolderSchema = z.object({
	id: z.string(),
});

const getFolderSchema = z.object({
	id: z.string(),
});

export const flagFoldersRouter = {
	list: protectedProcedure
		.input(listFoldersSchema)
		.handler(async ({ context, input }) => {
			await authorizeScope(
				context,
				input.websiteId,
				input.organizationId,
				"read"
			);

			const scope = input.websiteId
				? `website:${input.websiteId}`
				: `org:${input.organizationId}`;
			const cacheKey = `list:${scope}`;

			return foldersCache.withCache({
				key: cacheKey,
				ttl: CACHE_DURATION,
				tables: ["flag_folders", "flags"],
				queryFn: async () => {
					const conditions = [];

					if (input.websiteId) {
						conditions.push(eq(flagFolders.websiteId, input.websiteId));
					} else if (input.organizationId) {
						conditions.push(eq(flagFolders.organizationId, input.organizationId));
					}

					conditions.push(isNull(flagFolders.deletedAt));

					const folders = await context.db
						.select({
							id: flagFolders.id,
							name: flagFolders.name,
							description: flagFolders.description,
							color: flagFolders.color,
							websiteId: flagFolders.websiteId,
							organizationId: flagFolders.organizationId,
							createdBy: flagFolders.createdBy,
							createdAt: flagFolders.createdAt,
							updatedAt: flagFolders.updatedAt,
							flagCount: sql<number>`(
								SELECT COUNT(*)::int
								FROM ${flags}
								WHERE ${flags.folderId} = ${flagFolders.id}
								AND ${flags.deletedAt} IS NULL
							)`,
						})
						.from(flagFolders)
						.where(and(...conditions))
						.orderBy(desc(flagFolders.createdAt));

					return folders;
				},
			});
		}),

	get: protectedProcedure
		.input(getFolderSchema)
		.handler(async ({ context, input }) => {
			const folder = await context.db.query.flagFolders.findFirst({
				where: and(
					eq(flagFolders.id, input.id),
					isNull(flagFolders.deletedAt)
				),
			});

			if (!folder) {
				throw new ORPCError("NOT_FOUND", {
					message: "Folder not found",
				});
			}

			await authorizeScope(
				context,
				folder.websiteId ?? undefined,
				folder.organizationId ?? undefined,
				"read"
			);

			// Get flag count
			const flagCountResult = await context.db
				.select({
					count: sql<number>`COUNT(*)::int`,
				})
				.from(flags)
				.where(
					and(eq(flags.folderId, input.id), isNull(flags.deletedAt))
				);

			return {
				...folder,
				flagCount: flagCountResult[0]?.count ?? 0,
			};
		}),

	create: protectedProcedure
		.input(createFolderSchema)
		.handler(async ({ context, input }) => {
			await authorizeScope(
				context,
				input.websiteId,
				input.organizationId,
				"update"
			);

			if (!context.user?.id) {
				throw new ORPCError("UNAUTHORIZED", {
					message: "User not authenticated",
				});
			}

			const folderId = randomUUIDv7();

			const [folder] = await context.db
				.insert(flagFolders)
				.values({
					id: folderId,
					name: input.name,
					description: input.description,
					color: input.color,
					websiteId: input.websiteId,
					organizationId: input.organizationId,
					createdBy: context.user.id,
				})
				.returning();

			// Invalidate cache
			const scope = input.websiteId
				? `website:${input.websiteId}`
				: `org:${input.organizationId}`;
			await foldersCache.invalidate({
				tables: ["flag_folders"],
				keys: [`list:${scope}`],
			});

			return folder;
		}),

	update: protectedProcedure
		.input(updateFolderSchema)
		.handler(async ({ context, input }) => {
			const existingFolder = await context.db.query.flagFolders.findFirst({
				where: and(
					eq(flagFolders.id, input.id),
					isNull(flagFolders.deletedAt)
				),
			});

			if (!existingFolder) {
				throw new ORPCError("NOT_FOUND", {
					message: "Folder not found",
				});
			}

			await authorizeScope(
				context,
				existingFolder.websiteId ?? undefined,
				existingFolder.organizationId ?? undefined,
				"update"
			);

			const updateData: Record<string, unknown> = {
				updatedAt: new Date(),
			};

			if (input.name !== undefined) updateData.name = input.name;
			if (input.description !== undefined)
				updateData.description = input.description;
			if (input.color !== undefined) updateData.color = input.color;

			const [updatedFolder] = await context.db
				.update(flagFolders)
				.set(updateData)
				.where(eq(flagFolders.id, input.id))
				.returning();

			// Invalidate cache
			const scope = existingFolder.websiteId
				? `website:${existingFolder.websiteId}`
				: `org:${existingFolder.organizationId}`;
			await foldersCache.invalidate({
				tables: ["flag_folders"],
				keys: [`list:${scope}`],
			});

			return updatedFolder;
		}),

	delete: protectedProcedure
		.input(deleteFolderSchema)
		.handler(async ({ context, input }) => {
			const existingFolder = await context.db.query.flagFolders.findFirst({
				where: and(
					eq(flagFolders.id, input.id),
					isNull(flagFolders.deletedAt)
				),
			});

			if (!existingFolder) {
				throw new ORPCError("NOT_FOUND", {
					message: "Folder not found",
				});
			}

			await authorizeScope(
				context,
				existingFolder.websiteId ?? undefined,
				existingFolder.organizationId ?? undefined,
				"delete"
			);

			// Soft delete the folder
			await context.db
				.update(flagFolders)
				.set({
					deletedAt: new Date(),
					updatedAt: new Date(),
				})
				.where(eq(flagFolders.id, input.id));

			// Flags with this folderId will have their folderId set to null due to ON DELETE SET NULL

			// Invalidate cache
			const scope = existingFolder.websiteId
				? `website:${existingFolder.websiteId}`
				: `org:${existingFolder.organizationId}`;
			await foldersCache.invalidate({
				tables: ["flag_folders", "flags"],
				keys: [`list:${scope}`],
			});

			return { success: true };
		}),
};
