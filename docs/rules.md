# Code Writing Rules

## Comments

Keep comments to a minimum.

### General rule

**Do not add comments unless they provide information that cannot be reasonably understood from the code itself.**

Code should be self-explanatory through:
- Clear variable names
- Clear function names
- Small, focused functions
- Straightforward control flow
- Appropriate abstractions

### Do NOT comment

Do not add comments for obvious code.

Bad:

```python
# Get the user by ID
user = get_user(user_id)

# Check if the user exists
if user:
    ...

# Return the user
return user