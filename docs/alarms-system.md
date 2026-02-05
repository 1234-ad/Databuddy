# Alarms System Documentation

## Overview

The Alarms System allows users to create custom notification alarms for their websites. Users can configure alarms to monitor various metrics and receive notifications through multiple channels when thresholds are exceeded.

## Features

### Database Schema

The system uses two main tables:

#### `alarms` Table
- **id**: Unique identifier
- **websiteId**: Associated website
- **createdBy**: User who created the alarm
- **name**: Alarm name
- **description**: Optional description
- **type**: Alarm type (metric_threshold, anomaly_detection, custom_event, uptime, error_rate)
- **severity**: Severity level (low, medium, high, critical)
- **status**: Current status (active, triggered, resolved, paused, archived)
- **config**: JSON configuration for thresholds, metrics, and conditions
- **notificationChannels**: Array of notification channels (email, slack, webhook, sms, push)
- **notificationConfig**: Channel-specific configuration
- **cooldownMinutes**: Cooldown period to prevent spam (default: 60 minutes)
- **lastTriggeredAt**: Timestamp of last trigger
- **isEnabled**: Whether the alarm is active
- **triggerCount**: Number of times the alarm has been triggered
- **createdAt/updatedAt/deletedAt**: Timestamps

#### `alarm_logs` Table
- **id**: Unique identifier
- **alarmId**: Reference to the alarm
- **triggeredAt**: When the alarm was triggered
- **resolvedAt**: When the alarm was resolved (optional)
- **triggerValue**: The actual value that triggered the alarm
- **threshold**: The threshold that was exceeded
- **notificationsSent**: Track which notifications were sent
- **notificationErrors**: Track any notification errors
- **metadata**: Additional context
- **createdAt**: Timestamp

### API Endpoints

All endpoints are prefixed with `/v1/alarms` and require authentication.

#### Create Alarm
```
POST /v1/alarms
```

**Request Body:**
```json
{
  "websiteId": "string",
  "name": "string",
  "description": "string (optional)",
  "type": "metric_threshold | anomaly_detection | custom_event | uptime | error_rate",
  "severity": "low | medium | high | critical (optional, default: medium)",
  "config": {
    "metric": "string (optional)",
    "threshold": "number (optional)",
    "operator": "gt | lt | eq | gte | lte (optional)",
    "timeWindow": "number (optional)",
    "conditions": "any (optional)"
  },
  "notificationChannels": ["email", "slack", "webhook", "sms", "push"],
  "notificationConfig": {
    "emails": ["string"] (optional),
    "slackWebhook": "string (optional)",
    "webhookUrl": "string (optional)",
    "smsNumbers": ["string"] (optional)
  },
  "cooldownMinutes": "number (optional, default: 60)",
  "isEnabled": "boolean (optional, default: true)"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "alarm-id",
    "websiteId": "website-id",
    "name": "High Error Rate",
    ...
  }
}
```

#### List Alarms
```
GET /v1/alarms?websiteId={websiteId}&status={status}&type={type}&page={page}&limit={limit}
```

**Query Parameters:**
- `websiteId` (required): Website ID
- `status` (optional): Filter by status
- `type` (optional): Filter by type
- `page` (optional): Page number (default: 1)
- `limit` (optional): Items per page (default: 20)

**Response:**
```json
{
  "success": true,
  "data": {
    "alarms": [...],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 50,
      "totalPages": 3
    }
  }
}
```

#### Get Alarm by ID
```
GET /v1/alarms/:id
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "alarm-id",
    "websiteId": "website-id",
    "name": "High Error Rate",
    ...
  }
}
```

#### Update Alarm
```
PATCH /v1/alarms/:id
```

**Request Body:** (All fields optional)
```json
{
  "name": "string",
  "description": "string",
  "type": "string",
  "severity": "string",
  "config": {},
  "notificationChannels": [],
  "notificationConfig": {},
  "cooldownMinutes": "number",
  "isEnabled": "boolean"
}
```

#### Delete Alarm
```
DELETE /v1/alarms/:id
```

**Response:**
```json
{
  "success": true,
  "message": "Alarm deleted successfully"
}
```

#### Get Alarm Logs
```
GET /v1/alarms/:id/logs?page={page}&limit={limit}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "logs": [...],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 100,
      "totalPages": 5
    }
  }
}
```

### Dashboard UI

The dashboard UI is located at `/[websiteId]/alarms` and provides:

- **Alarm List View**: Display all alarms with their status, severity, and trigger count
- **Create Alarm Modal**: Form to create new alarms (placeholder for now)
- **Alarm Details**: View individual alarm configuration and history
- **Edit/Delete Actions**: Manage existing alarms

#### Features:
- Color-coded severity badges (critical, high, medium, low)
- Status indicators (active, triggered, paused, resolved)
- Trigger count and last triggered timestamp
- Empty state with call-to-action
- Loading and error states

### Notification Integration

The system integrates with `@databuddy/notifications` package to send notifications through various channels:

- **Email**: Send email notifications to configured addresses
- **Slack**: Post to Slack channels via webhooks
- **Webhook**: POST to custom webhook URLs
- **SMS**: Send SMS notifications (requires SMS provider integration)
- **Push**: Send push notifications to mobile devices

### Cooldown Mechanism

To prevent notification spam, alarms have a configurable cooldown period (default: 60 minutes). Once an alarm is triggered, it won't trigger again until the cooldown period has elapsed, even if the condition continues to be met.

## Usage Example

### Creating a High Error Rate Alarm

```javascript
const response = await fetch('/v1/alarms', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  credentials: 'include',
  body: JSON.stringify({
    websiteId: 'my-website-id',
    name: 'High Error Rate Alert',
    description: 'Alert when error rate exceeds 5% in 5 minutes',
    type: 'error_rate',
    severity: 'high',
    config: {
      metric: 'error_rate',
      threshold: 5,
      operator: 'gt',
      timeWindow: 300 // 5 minutes in seconds
    },
    notificationChannels: ['email', 'slack'],
    notificationConfig: {
      emails: ['admin@example.com'],
      slackWebhook: 'https://hooks.slack.com/services/...'
    },
    cooldownMinutes: 30
  })
});
```

## Database Migration

To apply the schema changes, run:

```bash
bun run db:generate
bun run db:push
```

## Future Enhancements

- [ ] Implement alarm creation form in dashboard
- [ ] Add alarm editing functionality
- [ ] Implement alarm deletion with confirmation
- [ ] Add alarm history/logs view
- [ ] Implement notification testing
- [ ] Add alarm templates for common use cases
- [ ] Implement anomaly detection algorithms
- [ ] Add alarm grouping and tagging
- [ ] Implement alarm escalation policies
- [ ] Add alarm analytics and reporting

## Security Considerations

- All endpoints require authentication
- Website access is validated before any alarm operations
- Permissions are checked using the `websitesApi.hasPermission` method
- Soft deletes are used to maintain audit trail
- Notification configurations are stored securely

## Performance Considerations

- Indexes on `websiteId`, `createdBy`, `status`, and `type` for fast queries
- Pagination support for large alarm lists
- Efficient query building with Drizzle ORM
- Cooldown mechanism prevents excessive notifications

## Contributing

When contributing to the alarms system:

1. Follow the existing code patterns
2. Add appropriate error handling
3. Include proper TypeScript types
4. Update documentation
5. Add tests for new functionality
6. Ensure database migrations are reversible
