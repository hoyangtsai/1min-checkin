# 1min.ai Auto Checkin GitHub Action

This is a GitHub Action for automatic daily check-in to 1min.ai, supporting email/password login and TOTP two-factor authentication.

## Features

- 🤖 Automatic daily check-in
- 🔐 TOTP two-factor authentication support
- 📊 Display account balance information
- ⏰ Customizable execution time
- 📝 Automatic execution log saving

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

# Run test
npm start
```

## Project Structure

```
├── .github/workflows/
│   └── daily-checkin.yml    # GitHub Action workflow
├── src/
│   └── index.js             # Main check-in logic
├── package.json             # Project configuration file
├── LICENSE                  # MIT License
└── README.md               # Documentation
```

## Important Notes

- Ensure your GitHub account has sufficient Actions usage quota
- Regularly check execution results
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

### View Execution Logs

1. Go to your project > Actions page
2. Click on the recent execution record
3. View detailed execution logs

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
