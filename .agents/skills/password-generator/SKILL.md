---
name: password-generator
description: >
  Generate secure random passwords with configurable length and 
  character sets. Use when asked to create, generate, or make 
  a password, passphrase, or secure string.
---

# Password Generator

## How to generate a password

Use the following command to generate a secure random password:

```bash
# Generate a random password of specified length
# Replace <length> with the desired number of characters (default: 16)
LC_ALL=C tr -dc 'A-Za-z0-9!@#$%^&*' < /dev/urandom | head -c <length>
echo  # Add newline
```

```powershell
# PowerShell version
-join ((65..90) + (97..122) + (48..57) + (33,64,35,36,37,94,38,42) |
  Get-Random -Count <length> | ForEach-Object {[char]$_})
```

## Options

- Default length: 16 characters
- Include: uppercase, lowercase, digits, special characters
- If the user specifies requirements (e.g., "no special characters"),
  adjust the character set accordingly

## Examples

- "Generate a password" → 16 character password with all character types
- "Make a 32 character password" → 32 character password
- "Create a password with only letters and numbers" → Alphanumeric only
