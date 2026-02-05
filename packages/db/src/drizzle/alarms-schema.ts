import {
	boolean,
	foreignKey,
	index,
	integer,
	jsonb,
	pgEnum,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
} from "drizzle-orm/pg-core";
import { user, websites } from "./schema";

// Alarm-related enums
export const alarmType = pgEnum("alarm_type", [
	"metric_threshold",
	"anomaly_detection",
	"custom_event",
	"uptime",
	"error_rate",
]);

export const alarmSeverity = pgEnum("alarm_severity", [
	"low",
	"medium",
	"high",
	"critical",
]);

export const alarmStatus = pgEnum("alarm_status", [
	"active",
	"triggered",
	"resolved",
	"paused",
	"archived",
]);

export const notificationChannel = pgEnum("notification_channel", [
	"email",
	"slack",
	"webhook",
	"sms",
	"push",
]);

// Alarms table
export const alarms = pgTable(
	"alarms",
	{
		id: text().primaryKey().notNull(),
		websiteId: text("website_id").notNull(),
		createdBy: text("created_by").notNull(),
		name: text().notNull(),
		description: text(),
		type: alarmType().notNull(),
		severity: alarmSeverity().default("medium").notNull(),
		status: alarmStatus().default("active").notNull(),
		
		// Alarm configuration
		config: jsonb().notNull(), // Stores threshold values, metrics, conditions, etc.
		
		// Notification settings
		notificationChannels: notificationChannel("notification_channels")
			.array()
			.notNull()
			.default([]),
		notificationConfig: jsonb("notification_config"), // Channel-specific configs (emails, webhook URLs, etc.)
		
		// Cooldown and throttling
		cooldownMinutes: integer("cooldown_minutes").default(60).notNull(), // Prevent spam
		lastTriggeredAt: timestamp("last_triggered_at", { withTimezone: true }),
		
		// Metadata
		isEnabled: boolean("is_enabled").default(true).notNull(),
		triggerCount: integer("trigger_count").default(0).notNull(),
		
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		deletedAt: timestamp("deleted_at", { withTimezone: true }),
	},
	(table) => [
		index("alarms_website_id_idx").using(
			"btree",
			table.websiteId.asc().nullsLast().op("text_ops")
		),
		index("alarms_created_by_idx").using(
			"btree",
			table.createdBy.asc().nullsLast().op("text_ops")
		),
		index("alarms_status_idx").using(
			"btree",
			table.status.asc().nullsLast()
		),
		index("alarms_type_idx").using(
			"btree",
			table.type.asc().nullsLast()
		),
		foreignKey({
			columns: [table.websiteId],
			foreignColumns: [websites.id],
			name: "alarms_website_id_fkey",
		})
			.onUpdate("cascade")
			.onDelete("cascade"),
		foreignKey({
			columns: [table.createdBy],
			foreignColumns: [user.id],
			name: "alarms_created_by_fkey",
		})
			.onUpdate("cascade")
			.onDelete("restrict"),
	]
);

// Alarm history/logs table
export const alarmLogs = pgTable(
	"alarm_logs",
	{
		id: text().primaryKey().notNull(),
		alarmId: text("alarm_id").notNull(),
		triggeredAt: timestamp("triggered_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		resolvedAt: timestamp("resolved_at", { withTimezone: true }),
		
		// Trigger details
		triggerValue: jsonb("trigger_value").notNull(), // The actual value that triggered the alarm
		threshold: jsonb().notNull(), // The threshold that was exceeded
		
		// Notification status
		notificationsSent: jsonb("notifications_sent"), // Track which notifications were sent
		notificationErrors: jsonb("notification_errors"), // Track any errors
		
		// Additional context
		metadata: jsonb(),
		
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		index("alarm_logs_alarm_id_idx").using(
			"btree",
			table.alarmId.asc().nullsLast().op("text_ops")
		),
		index("alarm_logs_triggered_at_idx").using(
			"btree",
			table.triggeredAt.asc().nullsLast()
		),
		foreignKey({
			columns: [table.alarmId],
			foreignColumns: [alarms.id],
			name: "alarm_logs_alarm_id_fkey",
		}).onDelete("cascade"),
	]
);
