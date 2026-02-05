# Alarms System - Quick Start Guide

Get started with the Databuddy Alarms System in 5 minutes.

## 🚀 Setup

### 1. Apply Database Migration

```bash
# Generate migration files
bun run db:generate

# Apply to database
bun run db:push
```

### 2. Verify Installation

Check that the following tables exist in your database:
- `alarms`
- `alarm_logs`

## 📝 Create Your First Alarm

### Using the API

```javascript
const response = await fetch('http://localhost:3001/v1/alarms', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  credentials: 'include',
  body: JSON.stringify({
    websiteId: 'your-website-id',
    name: 'High Traffic Alert',
    description: 'Alert when page views exceed 10,000 per hour',
    type: 'metric_threshold',
    severity: 'medium',
    config: {
      metric: 'page_views',
      threshold: 10000,
      operator: 'gt',
      timeWindow: 3600 // 1 hour in seconds
    },
    notificationChannels: ['email'],
    notificationConfig: {
      emails: ['admin@example.com']
    },
    cooldownMinutes: 60,
    isEnabled: true
  })
});

const result = await response.json();
console.log('Alarm created:', result.data);
```

### Using the Dashboard

1. Navigate to `http://localhost:3000/[your-website-id]/alarms`
2. Click "Create Alarm" button
3. Fill in the form (coming soon)
4. Save and activate

## 🔔 Alarm Types

### 1. Metric Threshold
Monitor any metric and trigger when threshold is crossed.

```javascript
{
  type: 'metric_threshold',
  config: {
    metric: 'conversion_rate',
    threshold: 2.5,
    operator: 'lt', // less than
    timeWindow: 1800 // 30 minutes
  }
}
```

### 2. Error Rate
Track error rates over time.

```javascript
{
  type: 'error_rate',
  config: {
    threshold: 5, // 5% error rate
    operator: 'gt',
    timeWindow: 300 // 5 minutes
  }
}
```

### 3. Uptime
Monitor website availability.

```javascript
{
  type: 'uptime',
  config: {
    threshold: 99, // 99% uptime
    operator: 'lt',
    timeWindow: 3600 // 1 hour
  }
}
```

### 4. Custom Event
Track custom events.

```javascript
{
  type: 'custom_event',
  config: {
    eventName: 'checkout_abandoned',
    threshold: 10,
    operator: 'gt',
    timeWindow: 600 // 10 minutes
  }
}
```

## 📬 Notification Channels

### Email
```javascript
{
  notificationChannels: ['email'],
  notificationConfig: {
    emails: ['admin@example.com', 'team@example.com']
  }
}
```

### Slack
```javascript
{
  notificationChannels: ['slack'],
  notificationConfig: {
    slackWebhook: 'https://hooks.slack.com/services/YOUR/WEBHOOK/URL'
  }
}
```

### Webhook
```javascript
{
  notificationChannels: ['webhook'],
  notificationConfig: {
    webhookUrl: 'https://your-api.com/webhook'
  }
}
```

### Multiple Channels
```javascript
{
  notificationChannels: ['email', 'slack', 'webhook'],
  notificationConfig: {
    emails: ['admin@example.com'],
    slackWebhook: 'https://hooks.slack.com/services/...',
    webhookUrl: 'https://your-api.com/webhook'
  }
}
```

## 🎚️ Severity Levels

Choose the appropriate severity for your alarm:

- **low**: Informational alerts, non-urgent
- **medium**: Important but not critical (default)
- **high**: Requires attention soon
- **critical**: Immediate action required

```javascript
{
  severity: 'critical' // Will be highlighted in red in the dashboard
}
```

## ⏱️ Cooldown Period

Prevent notification spam with cooldown:

```javascript
{
  cooldownMinutes: 30 // Won't trigger again for 30 minutes
}
```

## 📊 List Alarms

```javascript
// Get all alarms for a website
const response = await fetch(
  'http://localhost:3001/v1/alarms?websiteId=your-website-id',
  { credentials: 'include' }
);

const result = await response.json();
console.log('Alarms:', result.data.alarms);
console.log('Pagination:', result.data.pagination);
```

### With Filters

```javascript
// Get only active critical alarms
const response = await fetch(
  'http://localhost:3001/v1/alarms?websiteId=your-website-id&status=active&severity=critical',
  { credentials: 'include' }
);
```

## 🔍 View Alarm Details

```javascript
const response = await fetch(
  'http://localhost:3001/v1/alarms/alarm-id',
  { credentials: 'include' }
);

const result = await response.json();
console.log('Alarm:', result.data);
```

## ✏️ Update Alarm

```javascript
const response = await fetch('http://localhost:3001/v1/alarms/alarm-id', {
  method: 'PATCH',
  headers: { 'Content-Type': 'application/json' },
  credentials: 'include',
  body: JSON.stringify({
    isEnabled: false, // Pause the alarm
    severity: 'high'  // Increase severity
  })
});
```

## 🗑️ Delete Alarm

```javascript
const response = await fetch('http://localhost:3001/v1/alarms/alarm-id', {
  method: 'DELETE',
  credentials: 'include'
});

const result = await response.json();
console.log(result.message); // "Alarm deleted successfully"
```

## 📜 View Alarm History

```javascript
const response = await fetch(
  'http://localhost:3001/v1/alarms/alarm-id/logs?page=1&limit=20',
  { credentials: 'include' }
);

const result = await response.json();
console.log('Trigger history:', result.data.logs);
```

## 🎯 Common Use Cases

### 1. High Error Rate Alert
```javascript
{
  name: 'Critical Error Rate',
  type: 'error_rate',
  severity: 'critical',
  config: {
    threshold: 10,
    operator: 'gt',
    timeWindow: 300
  },
  notificationChannels: ['email', 'slack'],
  cooldownMinutes: 15
}
```

### 2. Low Conversion Rate
```javascript
{
  name: 'Low Conversion Alert',
  type: 'metric_threshold',
  severity: 'high',
  config: {
    metric: 'conversion_rate',
    threshold: 1.5,
    operator: 'lt',
    timeWindow: 3600
  },
  notificationChannels: ['email'],
  cooldownMinutes: 120
}
```

### 3. Website Down
```javascript
{
  name: 'Website Downtime',
  type: 'uptime',
  severity: 'critical',
  config: {
    threshold: 95,
    operator: 'lt',
    timeWindow: 300
  },
  notificationChannels: ['email', 'slack', 'sms'],
  cooldownMinutes: 5
}
```

### 4. Unusual Traffic Spike
```javascript
{
  name: 'Traffic Spike Detection',
  type: 'anomaly_detection',
  severity: 'medium',
  config: {
    metric: 'page_views',
    threshold: 200, // 200% of normal
    operator: 'gt',
    timeWindow: 600
  },
  notificationChannels: ['slack'],
  cooldownMinutes: 60
}
```

## 🔧 Troubleshooting

### Alarm Not Triggering
1. Check `isEnabled` is `true`
2. Verify cooldown period hasn't been exceeded
3. Check alarm configuration is correct
4. Review alarm logs for errors

### Notifications Not Sending
1. Verify notification channels are configured
2. Check notification config has correct values
3. Review alarm logs for notification errors
4. Test notification endpoints separately

### Permission Errors
1. Ensure you're authenticated
2. Verify you have access to the website
3. Check your role has appropriate permissions

## 📚 Next Steps

- Read the [full documentation](./alarms-system.md)
- Review the [implementation summary](../ALARMS_IMPLEMENTATION_SUMMARY.md)
- Check out [PR #2](https://github.com/1234-ad/Databuddy/pull/2) for code details
- Explore the dashboard UI at `/[websiteId]/alarms`

## 💡 Tips

1. **Start Simple**: Begin with basic metric threshold alarms
2. **Test First**: Use low severity and long cooldowns while testing
3. **Monitor Logs**: Check alarm logs regularly to tune thresholds
4. **Use Cooldowns**: Prevent notification fatigue with appropriate cooldowns
5. **Multiple Channels**: Use different channels for different severities

## 🆘 Need Help?

- Check the [full documentation](./alarms-system.md)
- Review API responses for error messages
- Check server logs for detailed errors
- Open an issue on GitHub

---

Happy monitoring! 🎉
