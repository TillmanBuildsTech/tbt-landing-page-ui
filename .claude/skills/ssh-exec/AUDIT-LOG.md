# SSH Exec Audit Log

Append one entry for every SSH command this skill actually executes.

## Rules

- Append-only file.
- Record only executed commands, not abandoned drafts.
- Redact secrets, tokens, passwords, and other sensitive values.
- Keep the log concise and structured.

## Entry Template

### YYYY-MM-DD HH:MM:SS UTC

- Host: host
- User: user
- Port: 22
- Working Dir: /opt/app
- sudo: no
- Remote Command: df -h
- SSH Invocation: ssh user@host 'df -h'
- Exit Code: 0
- Risk: read-only
- Notes: command completed successfully
