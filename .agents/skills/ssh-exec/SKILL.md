---
name: "ssh-exec"
description: "Run a non-interactive command on a remote Linux server over SSH using preconfigured key-based authentication."
keywords: ["ssh exec", "ssh execute", "remote command", "linux server", "run over ssh"]
applyTo: ["ssh exec", "run on server", "execute over ssh", "ssh into server", "run remote command"]
stage: operations
domain: infrastructure
harnesses: ["copilot", "claude"]
---

# SSH Exec Skill

## Description

Run a command on a remote Linux server over SSH when key-based authentication is already configured.

This skill is for one-off remote command execution, quick diagnostics, and guided operator workflows. It does not provision SSH keys, manage bastions automatically, or assume password-based login.

Architecture reference: [Application Architecture](../../../docs/architecture/applications/README.md)
Infrastructure reference: [infra/README.md](../../../infra/README.md)

Audit log: [AUDIT-LOG.md](./AUDIT-LOG.md)

## Goal

- Execute a user-specified command on a remote Linux host via SSH.
- Show the exact command being run so the operator can verify target, user, and command payload.
- Return stdout, stderr, and exit status in a clean summary.
- Reduce operator mistakes by confirming risky commands before execution.
- Append every executed SSH command to a local audit log for traceability.

## Assumptions

- SSH key authentication is already configured and working.
- The target host is reachable from the current machine.
- The local environment has `ssh` available.
- The remote target is a Linux host with a shell available.

## Required Inputs

Collect these before execution unless the user already supplied them:

1. Hostname or IP
2. Remote username
3. Command to run

Optional inputs:

- Port
- Working directory on the remote host
- Whether `sudo` is required
- Whether the command is expected to be long-running
- Whether output should be truncated or fully captured

## Execution Policy

### Audit Logging

- Every command that is actually executed by this skill must be appended to [AUDIT-LOG.md](./AUDIT-LOG.md).
- Log the timestamp, target host, user, port, working directory, whether `sudo` was used, the exact remote command, the exact SSH invocation when practical, and the exit code.
- Mark commands that were confirmed as risky before execution.
- Do not log secrets, tokens, or private data embedded in commands; redact sensitive substrings before writing the log.
- If execution fails before the SSH command is sent, record the failure reason when useful.

### Safe Default Behavior

- Prefer a direct non-interactive SSH command.
- Quote the remote command safely.
- If a remote working directory is provided, run `cd <dir> && <command>`.
- Report the remote exit code.
- Preserve stderr in the returned output.

### Confirmation Required

Require explicit user confirmation before executing commands that:

- delete or overwrite data
- restart or stop services
- change firewall, network, or user access state
- run package upgrades or system-wide installs
- use `sudo`, `rm`, `mv`, `chmod`, `chown`, `systemctl`, `reboot`, or `shutdown`

### Out of Scope

- Interactive password entry
- Persistent SSH session management
- Key provisioning or agent forwarding setup
- Multi-host orchestration
- File transfer beyond simple command execution

## Decision Flow

### 1. Validate Inputs

- If host is missing, ask for it.
- If username is missing, ask for it.
- If command is missing, ask for it.
- If the user says "use defaults" and no username is supplied, suggest the current intended username rather than guessing.

### 2. Classify Command Risk

- If the command is read-only or diagnostic, proceed once inputs are complete.
- If the command mutates system state or data, present the exact command and ask for confirmation.
- If the command appears interactive, warn that the flow is intended for non-interactive SSH commands and ask whether to proceed anyway.

### 3. Build Remote Command

Use one of these patterns:

Direct:

```bash
ssh user@host 'command'
```

Custom port:

```bash
ssh -p 2222 user@host 'command'
```

Working directory:

```bash
ssh user@host 'cd /target/path && command'
```

With sudo:

```bash
ssh user@host 'sudo command'
```

### 4. Execute and Capture Results

- Run the SSH command.
- Capture stdout and stderr.
- Record exit status.
- If output is very large, summarize the top and bottom sections and note truncation.

### 5. Report Back

Always return:

- Target host
- Remote user
- Exact command executed
- Exit status
- Key output or error lines
- Recommended next step if the command failed
- Audit log entry written to `AUDIT-LOG.md`

## Execution Modes

### Autonomous Mode

Triggers:

```text
"Run df -h on prod-web-1 over ssh"
"SSH to 10.0.0.5 as ubuntu and check nginx status"
"Execute journalctl -u app.service -n 100 on staging"
```

Workflow:

1. Extract or ask for host, user, and command.
2. Detect risk level.
3. Ask for confirmation if the command is mutating or privileged.
4. Build the exact SSH invocation.
5. Execute it.
6. Return output and exit status.

### Instructional Mode

Triggers:

```text
"Show me how to run a command over ssh"
"Walk me through ssh exec"
"Give me the ssh command for checking disk on my server"
```

Output in this mode:

- The exact SSH command to run
- A short explanation of each argument
- Any quoting or working-directory adjustments needed
- Warnings if the command is risky

## Output Format

### Success

```markdown
# SSH Exec Result

- Host: example-host
- User: ubuntu
- Command: df -h
- Exit Code: 0
- Audit Log: updated

## Output

<stdout/stderr summary>
```

### Failure

```markdown
# SSH Exec Result

- Host: example-host
- User: ubuntu
- Command: systemctl status nginx
- Exit Code: 255
- Audit Log: updated

## Error Summary

- SSH connection failed or remote command returned an error.
- Include the most relevant stderr lines.

## Recommended Next Step

- Verify host reachability, SSH user, key configuration, and command permissions.
```

## Quality Checks

Before considering the task complete, verify:

- Inputs are complete and unambiguous.
- The exact target host and user are shown.
- The final SSH command matches the requested action.
- Risky commands were explicitly confirmed.
- Output includes exit status and enough detail to diagnose failure.

## Example Prompts

- "Run uname -a on 192.168.1.20 as root over ssh"
- "SSH to app@staging.example.com and tail the last 50 nginx log lines"
- "Show me the exact ssh command to restart docker on prod, but do not execute it yet"
- "Run cd /var/www/app && git rev-parse HEAD on web-2 as deploy"

## Related Skills

- [web-review](../web-review/SKILL.md) for browser-based review workflows
- [find-local-leads](../find-local-leads/SKILL.md) for sales discovery workflows