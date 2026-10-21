# 1min.ai Auto Checkin GitHub Action

[![1min.ai Daily Auto Checkin](https://github.com/7a6163/1min-checkin/actions/workflows/daily-checkin.yml/badge.svg)](https://github.com/7a6163/1min-checkin/actions/workflows/daily-checkin.yml)

This is a GitHub Action for automatic daily check-in to 1min.ai, supporting email/password login and TOTP two-factor authentication.

1min.ai gives every account **15,000 free credits per day** the first time it logs in (shown as `DAILY_FREE_CREDIT` in your credit history). This Action exists to claim that reward automatically: it logs in once a day, then reports your balance and how many credits were added. If you already logged in yourself that day, the run reports no reward, because the daily credit was already claimed.

## Features

- 🎁 Claims the 15,000 daily free credits automatically
- 🔐 TOTP two-factor authentication support
- 📊 Display account balance information
- ⏰ Customizable execution time
- 📨 Optional Telegram notification after every run

## Quick Start

### 1. Create a New Project Using This Template

Click the "Use this template" button to create your own project, or fork this project to your GitHub account.

### 2. Configure GitHub Secrets

In your GitHub project, go to `Settings` > `Secrets and variables` > `Actions`, and add the following secrets:

**Required Settings:**
- `EMAIL`: Your 1min.ai account email
- `PASSWORD`: Your 1min.ai account password

**Optional Settings:**
- `TOTP_SECRET`: Your TOTP secret key (only needed if two-factor authentication is enabled)
- `TELEGRAM_BOT_TOKEN`: Telegram bot token (from [@BotFather](https://t.me/BotFather)) — required for Telegram notifications
- `TELEGRAM_CHAT_ID`: Telegram chat ID to receive notifications
- `TELEGRAM_TOPIC_ID`: Forum topic ID, to post into a specific topic of a group with Topics enabled. Leave unset to post to the chat's General topic. The ID is the middle number in a topic message link (`https://t.me/c/<chat>/<topic>/<message>`)

If both `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` are set, the workflow sends an HTML-formatted message to that chat after every run — success (with balance + reward) or failure (with error). If either is missing, notifications are skipped silently.

### 3. Enable GitHub Actions

Make sure GitHub Actions is enabled for your project. The first execution will start automatically.

## Custom Configuration

### Modify Execution Time

Edit the cron expression in the `.github/workflows/daily-checkin.yml` file:

```yaml
schedule:
  - cron: '5 8 * * *'  # Daily at UTC 8:05 (Taipei time 16:05)
```

Common time settings:
- `0 0 * * *` - Daily at UTC 0:00 (Taipei time 8:00)
- `0 8 * * *` - Daily at UTC 8:00 (Taipei time 16:00)
- `0 12 * * *` - Daily at UTC 12:00 (Taipei time 20:00)

### Manual Execution

You can also manually trigger execution on the GitHub Actions page:
1. Go to your project > Actions page
2. Select the "1min.ai Daily Auto Checkin" workflow
3. Click the "Run workflow" button

## Local Testing

If you want to test the script locally:

```bash
# Install dependencies
npm install

# Set environment variables
export EMAIL="your-email@example.com"
export PASSWORD="your-password"
export TOTP_SECRET="your-totp-secret"  # Optional

# Run a live check-in
npm start
```

Offline unit tests (no credentials or network needed):

```bash
npm run unit-test
```

## Project Structure

```
├── .github/workflows/
│   ├── ci.yml               # Lint, unit tests, build on push/PR
│   ├── daily-checkin.yml    # Daily check-in workflow (cron + manual)
│   └── release.yml          # GitHub release on tag push
├── src/
│   ├── index.js             # Main check-in logic (OneMinAutoCheckin class)
│   ├── helpers.js           # Pure helpers shared by code and tests
│   ├── notifier.js          # Telegram notification sender
│   ├── test.js              # Local live runner
│   └── unit-test.js         # Offline unit tests
├── action.yml               # GitHub Action manifest (Node 24)
├── package.json             # Project configuration file
├── LICENSE                  # MIT License
└── README.md               # Documentation
```

## Requirements

- Node.js **24** or later (Active LTS; matches the GitHub Action runtime).

## Important Notes

- Ensure your GitHub account has sufficient Actions usage quota
- Regularly check execution results
- GitHub automatically disables scheduled workflows in public repositories after 60 days without repository activity. The daily workflow includes a keepalive step that re-enables itself through the GitHub API on every run to prevent this. If check-ins still stop, re-enable the workflow on the Actions page.
- If consecutive failures occur, check if account credentials are correct
- TOTP secret key is only needed when two-factor authentication is enabled

## Security

- All sensitive information is stored in GitHub Secrets
- Complete account/password information is not displayed in logs
- Uses official GitHub Actions to ensure security

## Troubleshooting

### Common Issues

1. **Login Failed 401 Error**
   - Check if EMAIL and PASSWORD are correct
   - Confirm the account is not locked

2. **TOTP Verification Failed**
   - Check if TOTP_SECRET is correct
   - Ensure time synchronization is correct

3. **GitHub Action Not Executing**
   - Check if the cron expression is correct
   - Confirm GitHub Actions is enabled
   - Check whether GitHub disabled the schedule after 60 days of inactivity

### View Execution Logs

1. Go to your project > Actions page
2. Click on the recent execution record
3. View detailed execution logs

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
